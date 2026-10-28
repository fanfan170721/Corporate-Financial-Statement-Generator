import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {stripTypeScriptTypes} from "node:module";
import test from "node:test";
const source=stripTypeScriptTypes(await readFile(new URL('../lib/public-workforce.ts',import.meta.url),'utf8'));
const parser=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64')) as typeof import('../lib/public-workforce');
const profile=(cik='123',ticker='TEST')=>`<title>Example Company (TEST) Company Profile &amp; Description</title><table><tr><td>CIK Code</td><td>${cik}</td></tr><tr><td>Ticker Symbol</td><td>${ticker}</td></tr><tr><td>Website</td><td><a href="https://www.example.com">Website</a></td></tr></table>`;
const page=(rows:string,title='Example Company (TEST) Number of Employees')=>`<title>${title}</title><table><thead><tr><th>Date</th><th>Employees</th><th>Change (1Y)</th></tr></thead><tbody>${rows}</tbody></table>`;
const row=(date:string,count:string)=>`<tr><td>${date}</td><td>${count}</td><td>20</td></tr>`;
const options={symbol:'TEST',source:'https://stockanalysis.com/stocks/test/employees/',asOf:'2026-10-28'};

test('directory company identity requires matching CIK, title ticker and table ticker',()=>{
 assert.deepEqual(parser.parsePublicCompanyProfile(profile(),{symbol:'TEST',cik:'0000000123'}),{name:'Example Company',website:'https://www.example.com/'});
 assert.equal(parser.parsePublicCompanyProfile(profile('456'),{symbol:'TEST',cik:'123'}),undefined);
 assert.equal(parser.parsePublicCompanyProfile(profile('123','OTHER'),{symbol:'TEST',cik:'123'}),undefined);
 assert.equal(parser.parsePublicCompanyProfile(profile(),{symbol:'OTHER',cik:'123'}),undefined);
 assert.equal(parser.parsePublicCompanyProfile(profile('0'),{symbol:'TEST',cik:'0'}),undefined);
});
test('scripts and comments cannot supply identity or workforce evidence',()=>{
 assert.equal(parser.parsePublicCompanyProfile(`<script>${profile()}</script>`,{symbol:'TEST',cik:'123'}),undefined);
 assert.equal(parser.parsePublicCompanyProfile(`<!--${profile()}-->`,{symbol:'TEST',cik:'123'}),undefined);
 assert.deepEqual(parser.parsePublicWorkforce(`<script>${page(row('Jun 30, 2026','123'))}</script>`,options),[]);
 assert.equal(parser.parsePublicCompanyProfile(profile().replace('https://www.example.com','https://127.0.0.1'),{symbol:'TEST',cik:'123'})?.website,undefined);
});
test('secondary dated values preserve quarterly dates and never infer headcount or FTE',()=>{
 const result=parser.parsePublicWorkforce(page(row('Jun 30, 2026','23,825')+row('Dec 31, 2022','23,971')),options);
 assert.deepEqual(result.map(x=>({value:x.value,date:x.asOf,basis:x.basis,method:x.method})),[
  {value:23825,date:'2026-06-30',basis:'secondary-unspecified',method:'public-directory'},
  {value:23971,date:'2022-12-31',basis:'secondary-unspecified',method:'public-directory'},
 ]);
 assert.ok(result.every(x=>x.source===options.source));
});
test('future, invalid, stale, scaled and ambiguous observations are excluded',()=>{
 const html=page(row('Oct 29, 2026','100')+row('Feb 30, 2025','100')+row('Dec 31, 2019','100')+row('Dec 31, 2024','1.2K')+row('Dec 31, 2023','12,34')+row('Dec 31, 2022','100')+row('Dec 31, 2022','101')+row('Dec 31, 2021','99'));
 assert.deepEqual(parser.parsePublicWorkforce(html,options).map(x=>x.value),[99]);
 assert.deepEqual(parser.parsePublicWorkforce(page(row('Dec 31, 2025','100')), {...options,asOf:'2026-02-30'}),[]);
});
test('lookup caps five observations and rejects another issuer, login page or source URL',()=>{
 const html=page([2026,2025,2024,2023,2022,2021].map(y=>row(`Jun 30, ${y}`,String(y))).join(''));
 assert.equal(parser.parsePublicWorkforce(html,options).length,5);
 assert.deepEqual(parser.parsePublicWorkforce(html,{...options,symbol:'OTHER'}),[]);
 assert.deepEqual(parser.parsePublicWorkforce(html,{...options,source:'https://evil.test/'}),[]);
 assert.deepEqual(parser.parsePublicWorkforce(page(row('Jun 30, 2026','123'),'Login (TEST) Employees'),options),[]);
 assert.deepEqual(parser.parsePublicWorkforce(page('',undefined),options),[]);
 assert.deepEqual(parser.parsePublicWorkforce(html.replace('<th>Employees</th>','<th>Revenue</th>'),options),[]);
});
