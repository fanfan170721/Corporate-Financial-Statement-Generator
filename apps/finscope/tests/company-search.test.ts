import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
const helperSource=stripTypeScriptTypes(await readFile(new URL('../lib/company-search.ts',import.meta.url),'utf8'));
const helperUrl=`data:text/javascript;base64,${Buffer.from(helperSource).toString('base64')}`;
const source=stripTypeScriptTypes(await readFile(new URL('../lib/companies.ts',import.meta.url),'utf8')).replaceAll('"./company-search"',`"${helperUrl}"`);
const helper=await import(helperUrl) as typeof import('../lib/company-search');
const {searchLocalCompanies}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`) as typeof import('../lib/companies');

test('French company searches normalize accents and common request phrases without translating brands',()=>{
  assert.equal(helper.companySearchTerm('états financiers de Microsoft'),'microsoft');
  assert.equal(helper.companySearchTerm('actions d’Apple'),'apple');
  assert.equal(searchLocalCompanies('société Microsoft')[0].symbol,'MSFT');
  assert.equal(searchLocalCompanies('rapport financier de Tesla')[0].symbol,'TSLA');
  assert.ok(helper.frenchAliasSymbols('Banque de Montréal').has('BMO'));
  assert.ok(helper.frenchAliasSymbols('banque de montreal').has('BMO'));
  assert.ok(helper.frenchAliasSymbols('Banque de Nouvelle-Écosse').has('BNS'));
  assert.ok(helper.frenchAliasSymbols('Banque de Nouvelle‑Écosse').has('BNS'));
  assert.equal(helper.frenchAliasSymbols('pomme').size,0,'Literal dictionary translations are not company aliases');
});
test('French industry terms find existing catalogue companies and preserve tickers',()=>{
  for(const term of ['semi-conducteurs','santé','infonuagique','transition énergétique']) {
    const sectors=helper.frenchSearchSectors(term);
    const results=searchLocalCompanies(term);
    assert.ok(results.length>0);
    assert.ok(results.every(company=>sectors.has(company.sector)),term);
  }
  assert.equal(searchLocalCompanies('NVDA')[0].symbol,'NVDA');
  assert.equal(searchLocalCompanies('苹果')[0].symbol,'AAPL');
});
