import type { EmployeeObservation } from "./types";

const MAX_HTML = 2_000_000;
const symbolKey = (value: string) => value.toUpperCase().replaceAll(".", "-");
const validSymbol = (value: string) => /^[A-Za-z0-9][A-Za-z0-9.-]{0,19}$/.test(value);
const normalizedCik = (value: string) => /^\d{1,10}$/.test(value) && Number(value) > 0 ? value.padStart(10, "0") : undefined;

function decode(value: string): string {
  return value.replace(/&#(x[\da-f]+|\d+);/gi, (_, entity: string) => {
    const point = entity[0].toLowerCase() === "x" ? parseInt(entity.slice(1), 16) : Number(entity);
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : "";
  }).replace(/&(nbsp|amp|quot|apos|lt|gt);/gi, (_, name: string) => ({nbsp:" ",amp:"&",quot:'"',apos:"'",lt:"<",gt:">"})[name.toLowerCase()]!);
}
const plain = (html: string) => decode(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
function document(html: string): string | undefined {
  if (!html || html.length > MAX_HTML) return;
  return html.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
}
function titleIdentity(html: string, symbol: string): {name:string; title:string} | undefined {
  const title = plain(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html)?.[1] ?? "");
  if (/captcha|access denied|verify (?:you|your)|sign in|log in|login|just a moment/i.test(title)) return;
  const match = /^(.+?)\s*\(([A-Za-z0-9.-]+)\)\s+(.+)$/.exec(title);
  if (!match || symbolKey(match[2]) !== symbolKey(symbol)) return;
  return {name:match[1].trim(), title};
}
function rows(html: string, cellTag = "td"): string[][] {
  return [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)].map(row =>
    [...row[1].matchAll(new RegExp(`<${cellTag}\\b[^>]*>([\\s\\S]*?)<\\/${cellTag}\\s*>`, "gi"))].map(cell=>cell[1]));
}
function safeWebsite(value: string): string | undefined {
  try {
    const url=new URL(decode(value));
    if(url.protocol!=="https:" || url.username || url.password || url.port || !/^[a-z0-9.-]+$/i.test(url.hostname) || !url.hostname.includes(".") || /^\d[\d.]*$/.test(url.hostname) || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/i.test(url.hostname))return;
    return url.href;
  } catch { return; }
}

/** Confirm a directory page describes the selected SEC issuer and security. */
export function parsePublicCompanyProfile(html: string, expected: {symbol:string;cik:string}): {name:string;website?:string} | undefined {
  const cik=normalizedCik(expected.cik);
  if(!cik || !validSymbol(expected.symbol))return;
  const body=document(html);if(!body)return;
  const identity=titleIdentity(body,expected.symbol);if(!identity)return;
  const values=rows(body).filter(row=>row.length===2);
  const ciks=values.filter(row=>plain(row[0])==="CIK Code").map(row=>normalizedCik(plain(row[1])));
  const symbols=values.filter(row=>/^(?:Ticker|Stock) Symbol$/.test(plain(row[0]))).map(row=>symbolKey(plain(row[1])));
  if(!ciks.length || ciks.some(value=>value!==cik) || !symbols.length || symbols.some(value=>value!==symbolKey(expected.symbol)))return;
  const websiteRow=values.find(row=>plain(row[0])==="Website");
  const href=websiteRow && /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(websiteRow[1]);
  const website=href && safeWebsite(href[1]??href[2]);
  return {name:identity.name,...(website?{website}:{})};
}

function isoDate(value:string):string|undefined {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return;
  const parsed=Date.parse(value+"T00:00:00Z");
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0,10)===value ? value : undefined;
}
function tableDate(value:string):string|undefined {
  if(isoDate(value))return value;
  const match=/^([A-Za-z]{3}) (\d{1,2}), (\d{4})$/.exec(value);
  if(!match)return;
  const month=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].indexOf(match[1]);
  return month<0?undefined:isoDate(`${match[3]}-${String(month+1).padStart(2,"0")}-${match[2].padStart(2,"0")}`);
}

/** Secondary directories do not establish whether counts mean FTE or people.
 * Keep their exact dates and explicit unspecified basis, including quarter dates.
 */
export function parsePublicWorkforce(html:string, options:{symbol:string;source:string;asOf?:string}):EmployeeObservation[] {
  if(!validSymbol(options.symbol))return [];
  const source=`https://stockanalysis.com/stocks/${symbolKey(options.symbol).toLowerCase()}/employees/`;
  if(options.source!==source)return [];
  const now=isoDate(options.asOf??new Date().toISOString().slice(0,10));if(!now)return [];
  const cutoff=new Date(now+"T00:00:00Z");cutoff.setUTCFullYear(cutoff.getUTCFullYear()-6);
  const earliest=cutoff.toISOString().slice(0,10);
  const body=document(html);if(!body)return [];
  const identity=titleIdentity(body,options.symbol);
  if(!identity || !/\bEmployees\b/i.test(identity.title))return [];
  const observations=new Map<string,Set<number>>();
  for(const table of body.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table\s*>/gi)){
    const headings=rows(table[1],"th").find(row=>row.length)?.map(plain);
    if(!headings)continue;
    const dateIndex=headings.indexOf("Date"),employeeIndex=headings.indexOf("Employees");
    if(dateIndex<0 || employeeIndex<0 || headings.filter(x=>x==="Employees").length!==1)continue;
    for(const row of rows(table[1])){
      if(row.length!==headings.length)continue;
      const asOf=tableDate(plain(row[dateIndex]));const text=plain(row[employeeIndex]);
      if(!asOf || asOf>now || asOf<earliest || !/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(text))continue;
      const value=Number(text.replaceAll(",",""));
      if(!Number.isSafeInteger(value) || value<0 || value>100_000_000)continue;
      const counts=observations.get(asOf)??new Set<number>();counts.add(value);observations.set(asOf,counts);
    }
  }
  return [...observations].filter(([,counts])=>counts.size===1).sort(([a],[b])=>b.localeCompare(a)).slice(0,5).map(([asOf,counts])=>({
    value:[...counts][0],asOf,source,basis:"secondary-unspecified",method:"public-directory",sourceLabel:"StockAnalysis",
  }));
}
