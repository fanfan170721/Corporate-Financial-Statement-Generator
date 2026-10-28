import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import test from 'node:test';
import type {Company,EmployeeObservation} from '../lib/types';
import type {CompanyContext} from '../lib/company-context';
import type {EvidenceCache} from '../lib/market-storage';
async function moduleUrl(name:string):Promise<string>{
 let source=stripTypeScriptTypes(await readFile(new URL(`../lib/${name}.ts`,import.meta.url),'utf8'));
 for(const match of [...source.matchAll(/from ["']\.\/([a-z-]+)["']/g)])source=source.replaceAll(match[0],`from "${await moduleUrl(match[1])}"`);
 return 'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
}
const {supplementWorkforce}=await import(await moduleUrl('workforce-discovery')) as typeof import('../lib/workforce-discovery');
const company:Company={symbol:'TEST',name:'Example Company',nameEn:'Example Company',exchange:'NYSE',sector:'Other',color:'#abc',mark:'E',cik:'123'};
const now=new Date('2026-10-28T12:00:00Z');
const primary:EmployeeObservation={value:100,asOf:'2024-12-31',source:'https://www.sec.gov/Archives/annual.htm',basis:'full-time-equivalent',method:'annual-disclosure'};
const context=(observations:EmployeeObservation[]=[]):CompanyContext=>({profile:{cik:'0000000123',legalName:'Example Company',description:'Original profile',employees:observations.at(-1),employeeHistory:observations,employeeCoverage:{annualFilings:5,extracted:observations.length,unavailablePeriods:['2025-12-31'],retrievalFailures:0}},sources:[{label:'Annual report',url:primary.source}]});
const snak=(property:string,datatype:string,value:unknown)=>({snaktype:'value',property,datatype,datavalue:{value}});
const claim=(value:number,asOf:string)=>({rank:'normal',mainsnak:snak('P1128','quantity',{amount:`+${value}`,unit:'1'}),qualifiers:{P585:[snak('P585','time',{time:`+${asOf}T00:00:00Z`,precision:11,before:0,after:0,timezone:0,calendarmodel:'http://www.wikidata.org/entity/Q1985727'})]}});
const entity=(cik='123',values=[claim(120,'2025-12-31'),claim(90,'2023-12-31')])=>({entities:{Q312:{id:'Q312',claims:{P5531:[{rank:'normal',mainsnak:snak('P5531','external-id',cik)}],P1128:values}}}});
function network(settings:{cik?:string;empty?:boolean;status?:number;values?:ReturnType<typeof claim>[]}={}){
 const calls:{url:string;options?:RequestInit}[]=[];
 const fetcher:typeof fetch=async(input,options)=>{
  const url=new URL(String(input));calls.push({url:url.href,options});
  assert.ok(['query.wikidata.org','www.wikidata.org'].includes(url.hostname),`Unexpected provider ${url.hostname}`);
  if(settings.status)return new Response('Unavailable',{status:settings.status});
  if(url.hostname==='query.wikidata.org'){
   assert.match(url.searchParams.get('query')??'',/wdt:P5531/);
   assert.match(url.searchParams.get('query')??'',/"0000000123" "123"/);
   return Response.json({results:{bindings:settings.empty?[]:[{item:{type:'uri',value:'http://www.wikidata.org/entity/Q312'}}]}});
  }
  assert.equal(url.pathname,'/w/api.php');assert.equal(url.searchParams.get('action'),'wbgetentities');assert.equal(url.searchParams.get('ids'),'Q312');
  return Response.json(entity(settings.cik,settings.values));
 };
 return {calls,fetcher};
}
function memoryCache(){
 const values=new Map<string,unknown>();const ttls:number[]=[];
 const cache:EvidenceCache={get:async key=>values.get(key),set:async(key,value,ttl)=>{values.set(key,value);ttls.push(ttl);},reserveSec:async()=>{},reservePublic:async()=>{}};
 return {cache,ttls};
}

test('default fallback resolves exact CIK and adds dated Wikidata observations without directory calls',async()=>{
 const net=network(), original=context([primary]);
 const result=await supplementWorkforce(company,original,{fetcher:net.fetcher,secUserAgent:'test',now});
 assert.deepEqual(result.profile?.employeeHistory?.map(item=>[item.value,item.asOf]),[[90,'2023-12-31'],[100,'2024-12-31'],[120,'2025-12-31']]);
 assert.deepEqual(result.profile?.employeeHistory?.find(item=>item.asOf===primary.asOf),primary);
 assert.ok(result.profile?.employeeHistory?.filter(item=>item.method==='public-directory').every(item=>item.basis==='secondary-unspecified'&&item.sourceLabel==='Wikidata'));
 assert.equal(result.profile?.employeeResearch?.requests,2);assert.equal(result.profile?.employeeResearch?.addedObservations,2);
 assert.equal(net.calls.length,2);assert.ok(net.calls.every(call=>!call.url.includes('stockanalysis.com')&&call.options?.redirect==='manual'));
 assert.equal(original.profile?.employeeHistory?.length,1);
});
test('entity response with a different SEC issuer cannot add workforce data',async()=>{
 const net=network({cik:'456'}), original=context([primary]);
 const result=await supplementWorkforce(company,original,{fetcher:net.fetcher,secUserAgent:'test',now});
 assert.deepEqual(result.profile?.employeeHistory,[primary]);assert.equal(result.profile?.employeeResearch?.addedObservations,0);assert.equal(net.calls.length,2);
 assert.ok(!result.sources.some(source=>source.url.includes('wikidata.org/wiki/')));
});
test('empty identity lookup stops before entity fetching and records the mismatch',async()=>{
 const net=network({empty:true});
 const result=await supplementWorkforce(company,context(),{fetcher:net.fetcher,secUserAgent:'test',now});
 assert.equal(net.calls.length,1);assert.equal(result.profile?.employeeResearch?.steps[0].status,'identity-mismatch');assert.deepEqual(result.profile?.employeeHistory,[]);
});
test('warm evidence cache preserves fresh company metadata and filings without requests',async()=>{
 const net=network(),{cache}=memoryCache();
 await supplementWorkforce(company,context([primary]),{fetcher:net.fetcher,cache,secUserAgent:'test',now});
 const fresh=context([primary]);fresh.profile!.description='Updated business description';fresh.profile!.website='https://example.com/new';fresh.filings=[{title:'New filing',form:'8-K',filedAt:'2026-10-28',url:'https://www.sec.gov/Archives/new.htm'}];fresh.sources.push({label:'Fresh filing',url:'https://www.sec.gov/Archives/new.htm'});
 const callsBefore=net.calls.length;
 const result=await supplementWorkforce(company,fresh,{fetcher:net.fetcher,cache,secUserAgent:'test',now});
 assert.equal(net.calls.length,callsBefore);assert.equal(result.profile?.description,'Updated business description');assert.equal(result.profile?.website,'https://example.com/new');assert.deepEqual(result.filings,fresh.filings);
 assert.ok(result.sources.some(source=>source.label==='Fresh filing'));assert.ok(result.sources.some(source=>source.url==='https://www.wikidata.org/wiki/Q312#P1128'));assert.equal(result.profile?.employeeHistory?.length,3);
});
test('blocked public service preserves primary evidence and uses a short failure cache',async()=>{
 const net=network({status:403}),{cache,ttls}=memoryCache();
 const result=await supplementWorkforce(company,context([primary]),{fetcher:net.fetcher,cache,secUserAgent:'test',now});
 assert.deepEqual(result.profile?.employeeHistory,[primary]);assert.deepEqual(result.profile?.employees,primary);assert.equal(result.profile?.employeeResearch?.steps[0].status,'blocked');assert.equal(net.calls.length,1);assert.equal(ttls.at(-1),60000);
});
test('same-date primary FTE remains authoritative while a later quarter retains secondary scope',async()=>{
 const net=network({values:[claim(999,'2024-12-31'),claim(125,'2025-09-30')]});
 const result=await supplementWorkforce(company,context([primary]),{fetcher:net.fetcher,secUserAgent:'test',now});
 assert.deepEqual(result.profile?.employeeHistory?.map(item=>[item.value,item.asOf,item.basis]),[[100,'2024-12-31','full-time-equivalent'],[125,'2025-09-30','secondary-unspecified']]);
 assert.ok(!result.profile?.employeeResearch?.steps.some(step=>step.status==='conflict'));
});
