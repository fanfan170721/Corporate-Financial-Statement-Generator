import type { Company, EmployeeResearch } from "./types";
import type { EvidenceCache } from "./market-storage";
import { normalizeCik, parseEmployeeDisclosure, parseEmployeeFact, parseEmployeeTable, type CompanyContext } from "./company-context";
import { parsePublicCompanyProfile, parsePublicWorkforce } from "./public-workforce";
import { parseOpenWorkforce } from "./open-workforce";

type Options = { fetcher?: typeof fetch; cache?: EvidenceCache; secUserAgent: string; now?: Date; allowDirectory?: boolean };
type Step = EmployeeResearch["steps"][number];
const BOT = "FinscopeBot/1.0 (+https://finscopehq.com/methodology)";
const MAX_REQUESTS = 6, MAX_BYTES = 20_000_000, MAX_PAGE = 2_000_000;
class CrawlError extends Error {
  readonly status: Step["status"];
  constructor(status: Step["status"]) { super(status); this.status = status; }
}

/** Respect the most-specific applicable robots group and longest path rule. */
export function robotsAllows(body: string, path: string): boolean {
  const groups: {agents:string[];rules:{allow:boolean;path:string}[];hasRules:boolean}[] = [];
  let group: typeof groups[number] | undefined;
  for (const raw of body.split(/\r?\n/)) {
    const line=raw.split('#')[0].trim(), colon=line.indexOf(':'); if(colon<0)continue;
    const name=line.slice(0,colon).trim().toLowerCase(), value=line.slice(colon+1).trim();
    if(name==='user-agent') { if(!group || group.hasRules){group={agents:[],rules:[],hasRules:false};groups.push(group);} group.agents.push(value.toLowerCase()); }
    else if(group && (name==='allow'||name==='disallow')){group.hasRules=true;if(value)group.rules.push({allow:name==='allow',path:value});}
  }
  const specific=groups.filter(g=>g.agents.some(a=>a!=='*'&&'finscopebot'.startsWith(a)));
  const specificity=(g:typeof groups[number])=>Math.max(...g.agents.filter(a=>a!=='*'&&'finscopebot'.startsWith(a)).map(a=>a.length),0);
  const longest=Math.max(...specific.map(specificity),0);
  const selected=specific.length?specific.filter(g=>specificity(g)===longest):groups.filter(g=>g.agents.includes('*'));
  const matches=selected.flatMap(g=>g.rules).filter(rule=>{
    const pattern=rule.path.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replaceAll('*','.*').replace(/\\\$$/,'$');
    return new RegExp('^'+pattern).test(path);
  }).sort((a,b)=>b.path.length-a.path.length||Number(b.allow)-Number(a.allow));
  return matches[0]?.allow ?? true;
}

/** Bounded cross-source verification runs only for missing workforce periods. */
export async function supplementWorkforce(company: Company, context: CompanyContext, options: Options): Promise<CompanyContext> {
  const cik=normalizeCik(company.cik??'');
  const original=context.profile?.employeeHistory ?? (context.profile?.employees?[context.profile.employees]:[]);
  if(!cik || !context.profile || context.profile.cik!==cik || !/^[A-Za-z0-9][A-Za-z0-9.-]{0,19}$/.test(company.symbol) || (original.length>=5 && !context.profile.employeeCoverage?.unavailablePeriods.length))return context;
  const stamp=(options.now??new Date()).toISOString();
  const signature=JSON.stringify([original.map(item=>`${item.asOf}:${item.value}:${item.basis}`).sort(),context.profile.employeeCoverage?.unavailablePeriods,context.employeeCandidates]);
  const key=`workforce:discovery:v2:${cik}:${company.symbol}:${Boolean(options.allowDirectory)}:${signature}`;
  const cached=await options.cache?.get(key).catch(()=>undefined) as CompanyContext|undefined;
  if(cached?.profile?.cik===cik && cached.profile.employeeResearch?.checkedAt){
    const extraSources=cached.sources.filter(source=>!context.sources.some(current=>current.url===source.url));
    return {...context,profile:{...context.profile,employeeHistory:cached.profile.employeeHistory,employees:cached.profile.employees,employeeResearch:cached.profile.employeeResearch,employeeCoverage:cached.profile.employeeCoverage,...(!context.profile.website&&cached.profile.website?{website:cached.profile.website}:{})},sources:[...context.sources,...extraSources]};
  }
  const research: EmployeeResearch={checkedAt:stamp,requests:0,bytes:0,addedObservations:0,steps:[]};
  const profile={...context.profile};
  let observations=[...original];
  const sources=[...context.sources];
  const deadline=Date.now()+25_000;
  let retryDelay=60_000;
  const allowed=new Set<string>();
  const request=async(url:string,kind:'public'|'sec'|'robots'='public'):Promise<string>=>{
    if(!allowed.has(url) || research.requests>=MAX_REQUESTS || research.bytes>=MAX_BYTES || Date.now()>=deadline)throw new CrawlError('skipped');
    const cooldownKey=`workforce:cooldown:${new URL(url).hostname}`;
    const cooldown=await options.cache?.get(cooldownKey).catch(()=>undefined);
    if(typeof cooldown==='number'&&cooldown>Date.now()){retryDelay=Math.max(retryDelay,cooldown-Date.now());throw new CrawlError('blocked');}
    if(kind==='sec')await options.cache?.reserveSec(deadline);else await options.cache?.reservePublic?.(deadline);
    if(Date.now()>=deadline)throw new CrawlError('skipped');
    research.requests++;
    const remaining=Math.min(5000,Math.max(1,deadline-Date.now()));
    const response=await (options.fetcher??fetch)(url,{headers:{'User-Agent':kind==='sec'?options.secUserAgent:BOT,Accept:kind==='robots'?'text/plain':'application/json, text/html'},redirect:'manual',signal:AbortSignal.timeout(remaining)});
    if(response.status===429 || response.status===503){
      const after=response.headers.get('retry-after');
      const requested=after&&/^\d+$/.test(after)?Number(after)*1000:after?Date.parse(after)-Date.now():0;
      const wait=Number.isFinite(requested)?Math.max(60_000,requested):60_000;
      retryDelay=Math.max(retryDelay,wait);
      await options.cache?.set(cooldownKey,Date.now()+wait,wait).catch(()=>undefined);
    }
    if([401,403,429].includes(response.status)){await response.body?.cancel().catch(()=>undefined);throw new CrawlError('blocked');}
    if(!response.ok || !response.body || (response.headers.get('content-type')?.includes('application/pdf'))){await response.body?.cancel().catch(()=>undefined);throw new CrawlError('unavailable');}
    const limit=Math.min(kind==='robots'?32000:kind==='sec'?17_000_000:MAX_PAGE,MAX_BYTES-research.bytes);
    if(Number(response.headers.get('content-length')??0)>limit){await response.body.cancel();throw new CrawlError('skipped');}
    const reader=response.body.getReader(), decoder=new TextDecoder();let size=0,text='';
    try {while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;research.bytes+=chunk.value.length;if(size>limit)throw new CrawlError('skipped');text+=decoder.decode(chunk.value,{stream:true});}text+=decoder.decode();}
    finally{await reader.cancel().catch(()=>undefined);}
    return text;
  };
  const recordFailure=(label:string,url:string,error:unknown)=>research.steps.push({label,url,status:error instanceof CrawlError?error.status:'unavailable'});
  // First follow only issuer annual-report exhibits already linked by a SEC
  // filing. An arbitrary website or user-supplied URL can never enter this set.
  const candidates=(context.employeeCandidates??[]).filter(candidate=>{
    try {const url=new URL(candidate.url);return url.origin==='https://www.sec.gov' && !url.search && !url.hash && new RegExp(`^/Archives/edgar/data/${Number(cik)}/\\d{18}/[A-Za-z0-9_-][A-Za-z0-9_.-]*\\.html?$`,'i').test(url.pathname) && !url.pathname.includes('..');}catch{return false;}
  });
  let exhibitAttempts=0;
  for(const candidate of candidates){
    if(observations.some(item=>item.asOf===candidate.periodEnd))continue;
    if(exhibitAttempts++>=2)break;
    const label='Issuer annual-report exhibit';allowed.add(candidate.url);
    try {
      const html=await request(candidate.url,'sec');
      const fact=parseEmployeeFact(html,{cik,periodEnd:candidate.periodEnd});
      const narrative=parseEmployeeDisclosure(html,{cik,periodEnd:candidate.periodEnd,legalName:profile.legalName})??parseEmployeeTable(html,{cik,periodEnd:candidate.periodEnd,legalName:profile.legalName,source:candidate.url});
      const conflict=fact&&narrative&&(narrative.basis==='total'||narrative.basis==='full-and-part-time')&&fact.value!==narrative.value;
      const value=conflict?undefined:fact?{...fact,basis:'total' as const,...(narrative?.value===fact.value?narrative:{}),method:'inline-xbrl' as const}:narrative;
      if(!value){research.steps.push({label,url:candidate.url,status:conflict?'conflict':'no-data'});continue;}
      observations.push({...value,source:candidate.url,sourceLabel:label,retrievedAt:stamp});research.addedObservations++;
      sources.push({label,url:candidate.url,asOf:value.asOf});research.steps.push({label,url:candidate.url,status:'used',observations:1});
      if(profile.employeeCoverage?.unavailablePeriods.includes(value.asOf))profile.employeeCoverage={...profile.employeeCoverage,extracted:profile.employeeCoverage.extracted+1,unavailablePeriods:profile.employeeCoverage.unavailablePeriods.filter(date=>date!==value.asOf)};
    }catch(error){recordFailure(label,candidate.url,error);}
  }
  // This directory adapter requires separate operator permission; it is never
  // enabled by default or implicitly through a visitor's report request.
  if(options.allowDirectory && (observations.length<5 || profile.employeeCoverage?.unavailablePeriods.length)){
    const slug=company.symbol.toLowerCase().replaceAll('.','-');
    const profileUrl=`https://stockanalysis.com/stocks/${slug}/company/`, employeesUrl=`https://stockanalysis.com/stocks/${slug}/employees/`, robotsUrl='https://stockanalysis.com/robots.txt';
    for(const url of [profileUrl,employeesUrl,robotsUrl])allowed.add(url);
    let robots: string|undefined;
    try{
      const stored=await options.cache?.get('workforce:robots:stockanalysis:v1').catch(()=>undefined);
      robots=typeof stored==='string'?stored:await request(robotsUrl,'robots');
      if(typeof stored!=='string')await options.cache?.set('workforce:robots:stockanalysis:v1',robots,86400000).catch(()=>undefined);
    }catch(error){recordFailure('Source crawl permissions',robotsUrl,error);}
    if(robots!==undefined){
      if(!robotsAllows(robots,new URL(profileUrl).pathname)||!robotsAllows(robots,new URL(employeesUrl).pathname))research.steps.push({label:'StockAnalysis',url:employeesUrl,status:'blocked'});
      else try{
        const identity=parsePublicCompanyProfile(await request(profileUrl),{symbol:company.symbol,cik});
        if(!identity)research.steps.push({label:'Company identity check',url:profileUrl,status:'identity-mismatch'});
        else {
          research.steps.push({label:'Company identity check',url:profileUrl,status:'used'});
          // Website is metadata only. Following arbitrary domains would expand
          // the crawl and SSRF surface beyond this explicitly bounded adapter.
          if(!profile.website && identity.website)profile.website=identity.website;
          const found=parsePublicWorkforce(await request(employeesUrl),{symbol:company.symbol,source:employeesUrl,asOf:stamp.slice(0,10)});
          let accepted=0,conflicts=0;
          for(const item of found){
            const primary=observations.find(value=>value.asOf===item.asOf);
            if(primary){if(primary.basis===item.basis && primary.value!==item.value)conflicts++;continue;}
            observations.push({...item,retrievedAt:stamp});accepted++;
          }
          research.addedObservations+=accepted;
          research.steps.push({label:'StockAnalysis workforce history',url:employeesUrl,status:accepted?'used':conflicts?'conflict':'no-data',observations:accepted});
          if(accepted)sources.push({label:'StockAnalysis · Workforce figures (scope unspecified)',url:employeesUrl,asOf:found[0]?.asOf});
        }
      }catch(error){recordFailure('StockAnalysis workforce history',employeesUrl,error);}
    }
  }
  if(!options.allowDirectory && (observations.length<5 || profile.employeeCoverage?.unavailablePeriods.length)){
    // Wikidata structured facts are CC0. Identity is resolved by the public SEC
    // identifier, not a fuzzy name match. External references are links only.
    const query=`SELECT DISTINCT ?item WHERE { VALUES ?cik { "${cik}" "${Number(cik)}" } ?item wdt:P5531 ?cik . } LIMIT 2`;
    const queryUrl=`https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}&format=json`;
    allowed.add(queryUrl);
    let evidenceUrl=queryUrl;
    try{
      const lookup=JSON.parse(await request(queryUrl));
      const bindings=lookup?.results?.bindings;
      const entity=Array.isArray(bindings)&&bindings.length===1?bindings[0]?.item?.value:undefined;
      const id=typeof entity==='string'?/^https?:\/\/www\.wikidata\.org\/entity\/(Q[1-9]\d*)$/.exec(entity)?.[1]:undefined;
      if(!id)research.steps.push({label:'Wikidata company identity',url:queryUrl,status:'identity-mismatch'});
      else{
        const entityUrl=`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${id}&props=claims&format=json`;
        allowed.add(entityUrl);evidenceUrl=`https://www.wikidata.org/wiki/${id}#P1128`;
        const found=parseOpenWorkforce(JSON.parse(await request(entityUrl)),{cik,asOf:stamp.slice(0,10)});
        let accepted=0;
        for(const item of found){
          if(observations.some(value=>value.asOf===item.asOf))continue;
          observations.push({...item,retrievedAt:stamp});accepted++;
        }
        research.addedObservations+=accepted;
        research.steps.push({label:'Wikidata workforce observations',url:evidenceUrl,status:accepted?'used':'no-data',observations:accepted});
        if(accepted)sources.push({label:'Wikidata · Workforce figures (scope unspecified)',url:evidenceUrl,asOf:found[0]?.asOf});
      }
    }catch(error){recordFailure('Wikidata workforce observations',evidenceUrl,error);}
  }
  observations=observations.sort((a,b)=>a.asOf.localeCompare(b.asOf));
  profile.employeeHistory=observations;profile.employeeResearch=research;
  if(observations.length)profile.employees=observations.at(-1);
  const result={...context,profile,sources};
  const failed=research.steps.some(step=>['blocked','unavailable','skipped'].includes(step.status));
  await options.cache?.set(key,result,failed?retryDelay:86400000).catch(()=>undefined);
  return result;
}
