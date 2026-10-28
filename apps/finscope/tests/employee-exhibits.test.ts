import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import test from 'node:test';
const source=stripTypeScriptTypes(await readFile(new URL('../lib/company-context.ts',import.meta.url),'utf8'));
const {findEmployeeExhibits,getCompanyContext}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64')) as typeof import('../lib/company-context');
const directory='https://www.sec.gov/Archives/edgar/data/123/000000012326000001/';
const annual={url:directory+'annual.htm',periodEnd:'2025-12-31',form:'40-F'};
const link=(href:string,label='Annual report')=>`<a href="${href}">${label}</a>`;
const body={cik:123,name:'NORTH STAR',filings:{recent:{form:['40-F'],accessionNumber:['0000000123-26-000001'],primaryDocument:['annual.htm'],filingDate:['2026-02-01'],reportDate:['2025-12-31']}}};

test('exhibit candidates remain inside the exact issuer with a two-link cap',()=>{
 const html=[link('annual.htm'),link('report.htm'),link('./report.htm'),link(directory+'aif.html','Annual information form'),link('ex99.htm','Exhibit 99.1')].join('');
 assert.deepEqual(findEmployeeExhibits(html,annual),[
  {url:directory+'report.htm',periodEnd:annual.periodEnd,form:annual.form},
  {url:directory+'aif.html',periodEnd:annual.periodEnd,form:annual.form}
 ]);
});
test('unsafe, unrelated, non-HTML and script-only anchors never become candidates',()=>{
 const unsafe=['https://example.com/annual.htm','https://www.sec.gov/Archives/edgar/data/456/000000012326000001/report.htm','javascript:alert(1)','../000000012325000001/annual.htm','https://user:pass@www.sec.gov/Archives/edgar/data/123/000000012326000001/report.htm','report.htm?secret=x','report%2ehtm','report.pdf','/private/annual.htm','https://www.sec.gov:444/Archives/edgar/data/123/000000012326000001/report.htm','report\\annual.htm'];
 const html=unsafe.map(x=>link(x)).join('')+`<script>${link('report.htm')}</script><!--${link('report.htm')}-->`+link('other.htm','Contact us');
 assert.deepEqual(findEmployeeExhibits(html,annual),[]);
});

test('same-issuer annual documents incorporated from another accession precede generic exhibits',()=>{
 const incorporated='http://www.sec.gov/Archives/edgar/data/123/000000012325000001/annualstats.htm';
 const html=link('ex99-3.htm','Exhibit 99.3')+link('ex99-4.htm','Exhibit 99.4')+link(incorporated,'Annual report');
 const found=findEmployeeExhibits(html,annual);
 assert.equal(found.length,2);
 assert.equal(found[0].url,incorporated.replace('http:','https:'));
});
test('missing-result caches retain candidates without fetching exhibits or reusing legacy misses',async()=>{
 const values=new Map<string,unknown>([[`sec:employees:v1:${annual.url}`,{missing:true}]]);
 const calls:string[]=[];
 const cache={get:async(key:string)=>values.get(key),set:async(key:string,value:unknown)=>{values.set(key,value);}};
 const options={cache,fetchJson:async()=>body,fetchText:async(url:string)=>{calls.push(url);return link('report.htm');}};
 const first=await getCompanyContext('123',options), second=await getCompanyContext('123',options);
 assert.deepEqual(first.employeeCandidates,[{url:directory+'report.htm',periodEnd:annual.periodEnd,form:annual.form}]);
 assert.deepEqual(second.employeeCandidates,first.employeeCandidates);
 assert.deepEqual(calls,[annual.url]);
 assert.ok(values.has(`sec:employees:v2:${annual.url}`));
});
test('verified annual counts skip candidate discovery and legacy successful observations are reusable',async()=>{
 const observation={value:123,asOf:annual.periodEnd,source:annual.url,basis:'total',method:'annual-disclosure'};
 let downloads=0;
 const cache={get:async(key:string)=>key===`sec:employees:v1:${annual.url}`?{observation}:undefined,set:async()=>{}};
 const reused=await getCompanyContext('123',{cache,fetchJson:async()=>body,fetchText:async()=>{downloads++;return '';}});
 assert.equal(downloads,0);assert.equal(reused.employeeCandidates,undefined);assert.equal(reused.profile?.employees?.value,123);
 const parsed=await getCompanyContext('123',{fetchJson:async()=>body,fetchText:async()=>`As of December 31, 2025, we had 321 employees. ${link('report.htm')}`});
 assert.equal(parsed.employeeCandidates,undefined);assert.equal(parsed.profile?.employees?.value,321);
});
