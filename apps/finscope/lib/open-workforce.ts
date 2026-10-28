import type { EmployeeObservation } from "./types";

const record = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const cikKey = (value: unknown): string | undefined => typeof value === "string" && /^\d{1,10}$/.test(value) && Number(value) > 0 ? value.padStart(10,"0") : undefined;
const active = (claim: Record<string,unknown>) => claim.rank === "normal" || claim.rank === "preferred";
function date(value: unknown): string | undefined {
  if(typeof value!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))return;
  const time=Date.parse(value+"T00:00:00Z");
  return Number.isFinite(time) && new Date(time).toISOString().slice(0,10)===value ? value : undefined;
}
function snakValue(value: unknown, property:string, datatype:string): unknown {
  const snak=record(value);
  return snak?.snaktype==="value" && snak.property===property && snak.datatype===datatype ? record(snak.datavalue)?.value : undefined;
}
function observationDate(value:unknown):string|undefined {
  const time=record(snakValue(value,"P585","time"));
  if(!time || !Number.isInteger(time.precision) || Number(time.precision)<11 || Number(time.precision)>14 || time.before!==0 || time.after!==0 || time.timezone!==0 || time.calendarmodel!=="http://www.wikidata.org/entity/Q1985727")return;
  const matched=typeof time.time==="string" && /^\+(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}Z$/.exec(time.time);
  if(!matched || !Number.isFinite(Date.parse((time.time as string).slice(1))))return;
  return date(matched[1]);
}

/** Read a dated public workforce series only after the entity's SEC identity
 * matches. Directory counts retain unknown scope; no headcount/FTE inference.
 */
export function parseOpenWorkforce(payload:unknown, options:{cik:string;asOf?:string}):EmployeeObservation[] {
  const expected=cikKey(options.cik), now=date(options.asOf??new Date().toISOString().slice(0,10));
  const entities=record(record(payload)?.entities);
  if(!expected || !now || !entities || Object.keys(entities).length>20)return [];
  const matching=Object.entries(entities).flatMap(([id,raw])=>{
    const entity=record(raw),claims=record(entity?.claims);
    if(!/^Q[1-9]\d*$/.test(id) || entity?.id!==id || !claims || !Array.isArray(claims.P5531) || claims.P5531.length>100)return [];
    const identities=claims.P5531.map(record).filter(claim=>claim && active(claim)).map(claim=>cikKey(snakValue(claim!.mainsnak,"P5531","external-id")));
    return identities.length && identities.every(cik=>cik===expected) ? [{id,claims}] : [];
  });
  if(matching.length!==1)return [];
  const {id,claims}=matching[0];
  if(!Array.isArray(claims.P1128) || claims.P1128.length>5000)return [];
  const cutoff=new Date(now+"T00:00:00Z");cutoff.setUTCFullYear(cutoff.getUTCFullYear()-6);
  const earliest=cutoff.toISOString().slice(0,10), observations=new Map<string,Set<number>>();
  for(const raw of claims.P1128){
    const claim=record(raw), qualifiers=record(claim?.qualifiers);
    if(!claim || !active(claim) || !qualifiers || Object.keys(qualifiers).some(key=>key!=="P585") || !Array.isArray(qualifiers.P585) || !qualifiers.P585.length || qualifiers.P585.length>10)continue;
    const dates=qualifiers.P585.map(observationDate);
    if(dates.some(value=>!value) || new Set(dates).size!==1)continue;
    const asOf=dates[0]!;
    if(asOf>now || asOf<earliest)continue;
    const quantity=record(snakValue(claim.mainsnak,"P1128","quantity"));
    if(quantity?.unit!=="1" || typeof quantity.amount!=="string" || !/^\+?\d+$/.test(quantity.amount) || quantity.lowerBound!==undefined || quantity.upperBound!==undefined)continue;
    const value=Number(quantity.amount);
    if(!Number.isSafeInteger(value) || value<0 || value>100_000_000)continue;
    const counts=observations.get(asOf)??new Set<number>();counts.add(value);observations.set(asOf,counts);
  }
  return [...observations].filter(([,counts])=>counts.size===1).sort(([a],[b])=>b.localeCompare(a)).slice(0,5).map(([asOf,counts])=>({
    value:[...counts][0],asOf,source:`https://www.wikidata.org/wiki/${id}#P1128`,basis:"secondary-unspecified",method:"public-directory",sourceLabel:"Wikidata",
  }));
}
