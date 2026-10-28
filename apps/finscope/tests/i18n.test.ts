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

test('free AI availability and provider disclosure use curated Canadian French',()=>{
  for(const label of ['Free AI analysis','Free AI connection','Generate free AI analysis','No personal API key','Google may use free-tier inputs and outputs to improve its products. Only the report’s public company evidence is included.','Google data-use terms','Gemini free analysis is not available in the EEA, United Kingdom or Switzerland. Existing AI options remain available.','Your region could not be verified for Gemini free analysis. Existing AI options remain available.']) assert.notEqual(tr('fr-CA',label),label,label);
  assert.equal(tr('fr-CA','{used} of {limit} free requests started today · UTC',{used:1,limit:3}),'1 requêtes gratuites lancées sur 3 aujourd’hui · UTC');
  assert.equal(tr('fr-CA','Available again in {seconds} seconds.',{seconds:30}),'De nouveau disponible dans 30 secondes.');
  for(const provider of ['Gemini','Groq']) {
    assert.equal(tr('fr-CA','Powered by {provider} · Analyses this saved report. Does not search the web.',{provider}),`Propulsée par ${provider} · Analyse ce rapport enregistré, sans recherche sur le Web.`);
    assert.equal(tr('fr-CA','I am using the {provider} free tier with paid billing disabled.',{provider}),`J’utilise l’offre gratuite de ${provider} et la facturation payante est désactivée.`);
    assert.equal(tr('fr-CA','These controls apply to the saved {provider} connection.',{provider}),`Ces commandes s’appliquent à la connexion ${provider} enregistrée.`);
  }
  assert.equal(tr('fr-CA','Saving will switch the active free AI provider from {current} to {next}. Nothing changes until you save.',{current:'Groq',next:'Gemini'}),'L’enregistrement remplacera Groq par Gemini comme fournisseur actif de l’IA gratuite. Aucune modification n’est appliquée avant l’enregistrement.');
});

test('free AI country declaration explains its limited scope in French',()=>{
  assert.equal(tr('fr-CA','United States'),'États-Unis');
  assert.equal(tr('fr-CA','Choose your current country'),'Sélectionnez le pays où vous vous trouvez');
  for(const label of ['Confirm where you are currently using Finscope. This location is self-declared; this fallback currently supports Canada and the United States.','Your choice applies only to this analysis request and is not saved.','Choose your current country to use Gemini free analysis. This declaration applies only to this request.']) assert.notEqual(tr('fr-CA',label),label,label);
});
