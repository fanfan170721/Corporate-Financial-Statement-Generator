import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

async function moduleUrl(path: URL): Promise<string> {
  let source=stripTypeScriptTypes(await readFile(path,'utf8'));
  const matches=[...source.matchAll(/from ['"](\.\/[^'"]+)['"]/g)];
  for(const match of matches) source=source.replace(match[0],`from '${await moduleUrl(new URL(match[1]+'.ts',path))}'`);
  return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
}
const {tr,resolveLocale,frenchMessages}=await import(await moduleUrl(new URL('../lib/i18n.ts',import.meta.url))) as typeof import('../lib/i18n');

test('locale selection only accepts supported Canadian locales',()=>{
  assert.equal(resolveLocale('fr-CA'),'fr-CA');
  assert.equal(resolveLocale(undefined,'fr-CA'),'fr-CA');
  assert.equal(resolveLocale('javascript:bad','unknown'),'en-CA');
});

test('curated translations preserve all named values and leave unknown evidence intact',()=>{
  const names=(value:string)=>[...new Set([...value.matchAll(/\{(\w+)\}/g)].map(match=>match[1]))].sort();
  for(const [source,translation] of Object.entries(frenchMessages)) {
    assert.deepEqual(names(translation),names(source),`Placeholder mismatch: ${source}`);
    assert.ok(translation.trim(),`Empty translation: ${source}`);
  }
  assert.equal(tr('fr-CA','Sign in'),'Se connecter');
  assert.equal(tr('fr-CA','  Sign in  '),'  Se connecter  ');
  assert.equal(tr('en-CA','Company {symbol}',{symbol:'AAPL'}),'Company AAPL');
  assert.equal(tr('fr-CA','Original filing quotation from Apple Inc.'),'Original filing quotation from Apple Inc.');
  assert.equal(tr('fr-CA','Custom note: {symbol}',{symbol:'SHOP'}),'Custom note: SHOP');
});

test('saved deterministic summaries translate by whole templates without altering values',()=>{
  const source='{remaining} of {limit} report credits remaining';
  const expected=tr('fr-CA',source,{remaining:2,limit:3});
  assert.notEqual(expected,'2 of 3 report credits remaining');
  assert.equal(tr('fr-CA','2 of 3 report credits remaining'),expected);
  assert.equal(tr('fr-CA','Quoted: 2 of 3 report credits remaining'),'Quoted: 2 of 3 report credits remaining');
});

test('workforce source checks and evidence distinctions are available in French',()=>{
  for(const label of ['Issuer annual-report exhibit','Wikidata company identity','Wikidata workforce observations','Source crawl permissions','StockAnalysis workforce history','Company identity check','Company identity confirmed','Publicly reported workforce','Community-maintained public data']) assert.notEqual(tr('fr-CA',label),label,label);
});
