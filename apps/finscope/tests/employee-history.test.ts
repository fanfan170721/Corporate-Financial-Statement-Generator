import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {stripTypeScriptTypes} from "node:module";
import test from "node:test";
const source=stripTypeScriptTypes(await readFile(new URL('../lib/company-context.ts',import.meta.url),'utf8'));
const {getCompanyContext,parseSecSubmissions,parseEmployeeDisclosure}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64')) as typeof import('../lib/company-context');
const rows=(years:number[])=>({form:years.map(()=>"10-K"),accessionNumber:years.map(y=>`0000000123-${String(y+1).slice(-2)}-000001`),primaryDocument:years.map(y=>`annual-${y}.htm`),filingDate:years.map(y=>`${y+1}-02-15`),reportDate:years.map(y=>`${y}-12-31`)});
const body=(years:number[])=>({cik:123,name:"NORTH STAR & CO",filings:{recent:rows(years)}});
const html=(year:number)=>`<p>As of December 31, ${year}, we had ${year} employees.</p>`;
test("five annual documents are processed sequentially with truthful gaps and no invented zero",async()=>{
 const calls:string[]=[];let active=0,maxActive=0;
 const result=await getCompanyContext('123',{fetchJson:async()=>body([2025,2024,2023,2022,2021,2020]),fetchText:async url=>{
  calls.push(url);active++;maxActive=Math.max(maxActive,active);await Promise.resolve();active--;
  const year=Number(/annual-(\d{4})/.exec(url)![1]);if(year===2023)throw new Error('unavailable');return year===2022?'No verified count':html(year);
 }});
 assert.equal(calls.length,5);assert.equal(maxActive,1);
 assert.deepEqual(result.profile?.employeeHistory?.map(x=>x.value),[2021,2024,2025]);
 assert.equal(result.profile?.employees?.value,2025);
 assert.deepEqual(result.profile?.employeeCoverage,{annualFilings:5,extracted:3,unavailablePeriods:['2023-12-31','2022-12-31'],retrievalFailures:1});
});
test("historical lookup follows validated manifest dates and never arbitrary URLs",async()=>{
 const main={...body([2025]),filings:{recent:rows([2025]),files:[...[2024,2023,2022,2021].map((year,i)=>({name:`CIK0000000123-submissions-00${i+1}.json`,filingFrom:`${year+1}-02-01`,filingTo:`${year+1}-03-01`})),{name:'https://evil.test/private',filingFrom:'2025-02-01',filingTo:'2025-03-01'}]}};
 const calls:string[]=[];
 const result=await getCompanyContext('123',{fetchJson:async url=>{calls.push(url);const index=/submissions-00(\d)\.json$/.exec(url);return index?rows([2025-Number(index[1])]):main;},fetchText:async url=>html(Number(/annual-(\d{4})/.exec(url)![1]))});
 assert.equal(result.profile?.employeeHistory?.length,5);assert.equal(calls.length,5);
 assert.ok(calls.every(url=>url.startsWith('https://data.sec.gov/submissions/CIK0000000123')));
});
test("frequent issuer annual documents beyond the first three thousand rows remain discoverable",()=>{
 const data=body([2025]);const r=data.filings.recent;
 for(const key of Object.keys(r) as (keyof typeof r)[])r[key].unshift(...Array(4000).fill(key==='form'?'8-K':r[key][0]));
 assert.equal(parseSecSubmissions(data,'123').latestAnnual?.reportDate,'2025-12-31');
});
test("trusted corporate suffix normalization cannot match another subsidiary",()=>{
 const options={periodEnd:'2025-12-31',legalName:'NORTH STAR & CO'};
 assert.equal(parseEmployeeDisclosure('As of December 31, 2025, NorthStar had 123 employees globally.',options)?.value,123);
 assert.equal(parseEmployeeDisclosure('As of December 31, 2025, NorthStar Services had 123 employees globally.',options),undefined);
});
test("verified annual observations are reused and failed downloads receive a short cooldown",async()=>{
 const values=new Map<string,unknown>();const ttls:number[]=[];let downloads=0;
 const cache={get:async(key:string)=>values.get(key),set:async(key:string,value:unknown,ttl:number)=>{values.set(key,value);ttls.push(ttl);}};
 const options={cache,fetchJson:async()=>body([2025]),fetchText:async()=>{downloads++;return html(2025);}};
 const first=await getCompanyContext('123',options);const second=await getCompanyContext('123',options);
 assert.deepEqual(second.profile?.employeeHistory,first.profile?.employeeHistory);assert.equal(downloads,1);assert.equal(ttls[0],30*86400000);
 values.clear();const fail={...options,fetchText:async()=>{downloads++;throw Error('outage');}};
 await getCompanyContext('123',fail);const cachedFailure=await getCompanyContext('123',fail);
 assert.equal(downloads,2);assert.equal(ttls.at(-1),60000);assert.equal(cachedFailure.profile?.employeeCoverage?.retrievalFailures,1);
});
