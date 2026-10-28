import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import test from 'node:test';
const source=stripTypeScriptTypes(await readFile(new URL('../lib/company-context.ts',import.meta.url),'utf8'));
const {parseEmployeeTable}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64')) as typeof import('../lib/company-context');
const options={cik:'16868',periodEnd:'2025-12-31',legalName:'CANADIAN NATIONAL RAILWAY CO',source:'https://www.sec.gov/Archives/edgar/data/16868/000001686826000011/annual.htm'};
const row=(label:string,values:string[])=>`<tr><td colspan="3">${label}</td>${values.map(value=>`<td colspan="2">${value}</td><td></td>`).join('')}</tr>`;
const html=(body:string)=>`<p>Canadian National Railway Company, year ended December 31, 2025.</p><table>${row('',['2025','2024','2023'])}${body}</table>`;
test('exact year columns select closing employees and exclude a neighbouring annual average',()=>{
 const result=parseEmployeeTable(html(row('Employees (end of year)',['23,839','24,671','24,987'])+row('Employees (average for the year)',['24,507','25,304','24,920'])),options);
 assert.equal(result?.value,23839);assert.equal(result?.basis,'total');assert.equal(result?.asOf,'2025-12-31');
});
test('wrong issuer, missing annual date, wrong legal name and mismatched header fail closed',()=>{
 const input=html(row('Employees (end of year)',['23,839','24,671','24,987']));
 assert.equal(parseEmployeeTable(input,{...options,cik:'123'}),undefined);
 assert.equal(parseEmployeeTable(input,{...options,legalName:'Other Railway Company'}),undefined);
 assert.equal(parseEmployeeTable(input.replace('year ended December 31, 2025','operating statistics'),options),undefined);
 assert.equal(parseEmployeeTable(input.replace('>2025<','>2022<'),options),undefined);
});
test('scoped, averaged, scaled and contradictory rows are not closing headcounts',()=>{
 for(const label of ['Employees (average for the year)','Employees in Canada (end of year)','Employees (end of year, thousands)','Contractors (end of year)'])assert.equal(parseEmployeeTable(html(row(label,['1','2','3'])),options),undefined);
 assert.equal(parseEmployeeTable(html(row('Employees (end of year)',['23.8K','2','3'])),options),undefined);
 assert.equal(parseEmployeeTable(html(row('Employees (end of year)',['100','2','3'])+row('Employees (end of year)',['101','2','3'])),options),undefined);
 assert.equal(parseEmployeeTable(html(row('Employees (end of year)',['100','2','3'])).replace('<table>','<table><tr><td>Subsidiary segment</td></tr>'),options),undefined);
});
