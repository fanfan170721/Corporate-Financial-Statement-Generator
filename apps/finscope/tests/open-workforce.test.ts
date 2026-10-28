import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import test from 'node:test';
const source=stripTypeScriptTypes(await readFile(new URL('../lib/open-workforce.ts',import.meta.url),'utf8'));
const {parseOpenWorkforce}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64')) as typeof import('../lib/open-workforce');
const options={cik:'320193',asOf:'2026-10-28'};
const snak=(property:string,datatype:string,value:unknown)=>({snaktype:'value',property,datatype,datavalue:{value}});
const when=(day='2025-09-27',precision=11)=>snak('P585','time',{time:`+${day}T00:00:00Z`,precision,before:0,after:0,timezone:0,calendarmodel:'http://www.wikidata.org/entity/Q1985727'});
const claim=(amount='+166000',day='2025-09-27')=>({rank:'normal',mainsnak:snak('P1128','quantity',{amount,unit:'1'}),qualifiers:{P585:[when(day)]}});
const payload=(counts:unknown[]=[claim()],cik='0000320193')=>({entities:{Q312:{id:'Q312',claims:{P5531:[{rank:'normal',mainsnak:snak('P5531','external-id',cik)}],P1128:counts}}}});

test('exact SEC identity and dated observations keep unspecified scope and stable citations',()=>{
 const result=parseOpenWorkforce(payload([claim(),claim('+164000','2024-09-28')]),options);
 assert.deepEqual(result.map(item=>[item.value,item.asOf]),[[166000,'2025-09-27'],[164000,'2024-09-28']]);
 assert.ok(result.every(item=>item.basis==='secondary-unspecified' && item.method==='public-directory' && item.sourceLabel==='Wikidata' && item.source==='https://www.wikidata.org/wiki/Q312#P1128'));
 assert.deepEqual(parseOpenWorkforce(payload([], '789019'),options),[]);
 const mismatch=payload();mismatch.entities.Q312.claims.P5531.push({rank:'preferred',mainsnak:snak('P5531','external-id','789019')});
 assert.deepEqual(parseOpenWorkforce(mismatch,options),[]);
});
test('year/month precision, uncertain dates and restricted populations are excluded',()=>{
 const year=claim();year.qualifiers.P585=[when('2025-01-01',9)];
 const month=claim();month.qualifiers.P585=[when('2025-09-01',10)];
 const restricted={...claim(),qualifiers:{P585:[when()],P518:[snak('P518','wikibase-item',{id:'Q123'})]}};
 const uncertain=claim();(uncertain.qualifiers.P585[0].datavalue.value as Record<string,unknown>).after=1;
 assert.deepEqual(parseOpenWorkforce(payload([year,month,restricted,uncertain]),options),[]);
});
test('deprecated, scaled, bounded, negative and invalid quantities are excluded',()=>{
 const deprecated={...claim(),rank:'deprecated'};
 const unit={...claim(),mainsnak:snak('P1128','quantity',{amount:'+166',unit:'http://www.wikidata.org/entity/Q199'})};
 const bounded={...claim(),mainsnak:snak('P1128','quantity',{amount:'+166000',unit:'1',lowerBound:'+165000',upperBound:'+167000'})};
 assert.deepEqual(parseOpenWorkforce(payload([deprecated,unit,bounded,claim('+1.6e5'),claim('-1'),claim('+166000.0'),claim('+9007199254740992')]),options),[]);
});
test('future, impossible, stale and conflicting observations cannot enter the series',()=>{
 const claims=[claim('+10','2027-01-01'),claim('+10','2025-02-30'),claim('+10','2019-12-31'),claim('+10','2024-12-31'),claim('+11','2024-12-31'),claim('+12','2023-12-31')];
 assert.deepEqual(parseOpenWorkforce(payload(claims),options).map(item=>item.value),[12]);
 assert.deepEqual(parseOpenWorkforce(payload(),{...options,asOf:'2026-02-30'}),[]);
});
test('secondary quarter dates are preserved, duplicate values collapse and output is capped',()=>{
 const claims=[2026,2025,2024,2023,2022,2021].map(year=>claim(`+${year}`,`${year}-06-30`));
 claims.push(claim('+2026','2026-06-30'));claims[0].rank='preferred';
 const result=parseOpenWorkforce(payload(claims),options);
 assert.equal(result.length,5);assert.equal(result[0].asOf,'2026-06-30');assert.equal(result[0].value,2026);
});
test('ambiguous entities, missing identities, and redirected entity IDs fail closed',()=>{
 const original=payload();
 assert.deepEqual(parseOpenWorkforce({entities:{...original.entities,Q999:{...original.entities.Q312,id:'Q999'}}},options),[]);
 const missing=payload();missing.entities.Q312.claims.P5531=[];assert.deepEqual(parseOpenWorkforce(missing,options),[]);
 const wrongId=payload();wrongId.entities.Q312.id='Q999';assert.deepEqual(parseOpenWorkforce(wrongId,options),[]);
});
