import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,readdirSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {AsyncLocalStorage} from 'node:async_hooks';
import {z} from 'zod';
import type {AIAnalysis,Report} from '../lib/types';

type API = typeof import('../lib/free-ai-access') & typeof import('../lib/server') & typeof import('../lib/credential-vault') & typeof import('../lib/request-region');
type Provider=(report:Report,options:{provider?:'gemini'|'groq';apiKey:string;locale?:string;onUsage?:(value:{inputTokens:number;outputTokens:number})=>void})=>Promise<AIAnalysis>;
const paid={status:'ready' as const,summary:'Existing paid analysis',insights:[],sources:[]};
const ready={status:'ready' as const,summary:'Free provider analysis',insights:[],sources:[]};
const report={id:'report-a',symbol:'TEST',mode:'live',company:{symbol:'TEST',name:'Test issuer'},periods:[{year:'2025',revenue:100}],scope:{level:'full',available:[],missing:[],limitations:[]},ai:paid,generatedAt:'2026-10-28T00:00:00Z'} as unknown as Report;
const fakeKey='gsk_'+ 'a'.repeat(48);
const fakeGeminiKey='AIza'+'a'.repeat(35);
const geminiModel={name:'models/gemini-3.8-flash',supportedGenerationMethods:['generateContent']};

async function fixture(){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(x=>x.endsWith('.sql')).sort())sql.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
 function statement(query:string,params:unknown[]=[]){const values=params as (string|number|null)[];return {bind:(...args:unknown[])=>statement(query,args),first:async()=>sql.prepare(query).get(...values)??null,all:async()=>({results:sql.prepare(query).all(...values)}),run:async()=>sql.prepare(query).run(...values)};}
 const db={prepare:statement,batch:async(statements:ReturnType<typeof statement>[])=>{sql.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());sql.exec('COMMIT');return result;}catch(error){sql.exec('ROLLBACK');throw error;}}};
 for(const id of ['owner','alice','bob']){
   sql.prepare('INSERT INTO profiles(user_id,name,email,preferences,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,id,id+'@example.test','{}','2026-10-28','2026-10-28');
   sql.prepare('INSERT INTO auth_accounts(user_id,email,password_hash,verified_at,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,id+'@example.test','unused',1,1,1);
 }
 sql.prepare('INSERT INTO reports(id,user_id,symbol,mode,payload,created_at) VALUES(?,?,?,?,?,?)').run(report.id,'alice',report.symbol,report.mode,JSON.stringify(report),report.generatedAt);
 const env:Record<string,unknown>={DB:db,ADMIN_EMAIL:'owner@example.test',CREDENTIAL_ENCRYPTION_KEY:'a'.repeat(64),OPENAI_API_KEY:'sk-never-use-paid-key'};
 let userId:string|null='owner',calls=0,paidCalls=0;
 let provider:Provider=async(_r,o)=>{o.onUsage?.({inputTokens:1000,outputTokens:300});return ready;};
 let paidProvider:()=>Promise<AIAnalysis>=async()=>paid;
 let fetcher:typeof fetch=async(input)=>Response.json(String(input).includes('generativelanguage.googleapis.com')?geminiModel:{data:[{id:'openai/gpt-oss-20b'}]});
 class FreeAIError extends Error{code:string;retryAfterSeconds?:number;constructor(code:string,retryAfterSeconds?:number){super('untrusted provider error '+fakeKey);this.code=code;this.retryAfterSeconds=retryAfterSeconds;}}
 const injected={env,z,AsyncLocalStorage,FREE_AI_MODELS:{gemini:'gemini-3.8-flash',groq:'openai/gpt-oss-20b'},FreeAIError,
  getUser:async()=>userId?{userId,displayName:userId,email:userId+'@example.test',emailVerified:true}:null,
  getGuest:async()=>({id:'guest-session'}),GuestError:class extends Error{},
  generateFreeAIAnalysis:async(r:Report,o:Parameters<Provider>[1])=>{calls++;return provider(r,o);},
  generateAIAnalysis:async()=>{paidCalls++;return paidProvider();},
  generateReport:async()=>report,getDemoReport:()=>report,searchCompanies:async()=>[],getCaseStudy:()=>report,
  fetch:(...args:Parameters<typeof fetch>)=>fetcher(...args),
 };
 const token='freeFixture'+crypto.randomUUID().replaceAll('-','');
 const store=globalThis as unknown as Record<string,unknown>;store[token]=injected;
 const combined=['credential-vault.ts','market-storage.ts','request-region.ts','server.ts','ai-access.ts','free-ai-access.ts'].map(name=>readFileSync(new URL('../lib/'+name,import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'')).join('\n');
 const code=`const {env,z,AsyncLocalStorage,FREE_AI_MODELS,FreeAIError,getUser,getGuest,GuestError,generateFreeAIAnalysis,generateAIAnalysis,generateReport,getDemoReport,searchCompanies,getCaseStudy,fetch}=globalThis[${JSON.stringify(token)}];\n${stripTypeScriptTypes(combined,{mode:'transform'})}`;
 const api=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64')) as API;delete store[token];
 function request(path:string,method='GET',input?:unknown,origin='https://finscope.test',country?:string){const request=new Request('https://finscope.test'+path,{method,headers:{Origin:origin,'Content-Type':'application/json'},...(input===undefined?{}:{body:JSON.stringify(input)})});if(country)Object.defineProperty(request,'cf',{value:{country}});return request;}
 async function configure(provider:'gemini'|'groq'='groq'){userId='owner';const response=await api.handleAdminFreeAI(request('/api/admin/ai/free','PUT',{provider,apiKey:provider==='gemini'?fakeGeminiKey:fakeKey,confirmedFreePlan:true}));assert.equal(response.status,200,await response.clone().text());}
 const advance=()=>{sql.prepare("UPDATE ai_usage SET created_at=created_at-61000 WHERE budget_scope LIKE 'free:%'").run();};
 return {sql,env,api,request,configure,advance,FreeAIError,setUser:(id:string|null)=>{userId=id;},setProvider:(value:Provider)=>{provider=value;},setPaidProvider:(value:()=>Promise<AIAnalysis>)=>{paidProvider=value;},setFetch:(value:typeof fetch)=>{fetcher=value;},calls:()=>calls,paidCalls:()=>paidCalls,close:()=>sql.close()};
}

test('free provider setup requires owner, origin and explicit free-plan confirmation; key stays encrypted',async()=>{
 const f=await fixture();try{
  f.setUser('alice');assert.equal((await f.api.handleAdminFreeAI(f.request('/api/admin/ai/free','PUT',{apiKey:fakeKey,confirmedFreePlan:true}))).status,403);
  f.setUser('owner');assert.equal((await f.api.handleAdminFreeAI(f.request('/api/admin/ai/free','PUT',{apiKey:fakeKey,confirmedFreePlan:true},'https://evil.test'))).status,403);
  assert.equal((await f.api.handleAdminFreeAI(f.request('/api/admin/ai/free','PUT',{apiKey:fakeKey}))).status,400);
  let seen=false;f.setFetch(async(input,init)=>{assert.equal(String(input),'https://api.groq.com/openai/v1/models');assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer '+fakeKey);assert.equal(init?.redirect,'manual');seen=true;return Response.json({data:[{id:'openai/gpt-oss-20b'}]});});
  await f.configure();assert.ok(seen);const stored=String(f.sql.prepare("SELECT ciphertext FROM ai_credentials WHERE scope='__groq_free__'").get()!.ciphertext);assert.ok(!stored.includes(fakeKey));
  const response=await f.api.handleAdminFreeAI(f.request('/api/admin/ai/free'));const text=await response.text();assert.ok(!text.includes(fakeKey));assert.ok(text.includes('aaaa'));assert.equal(f.calls(),0);assert.equal(f.paidCalls(),0);
 }finally{f.close();}
});

test('rejected key validation never overwrites a working key or reveals upstream details',async()=>{
 const f=await fixture();try{await f.configure();const before=f.sql.prepare("SELECT ciphertext FROM ai_credentials WHERE scope='__groq_free__'").get()!.ciphertext;
  f.setFetch(async()=>new Response(fakeKey,{status:401}));const response=await f.api.handleAdminFreeAI(f.request('/api/admin/ai/free','PUT',{provider:'groq',apiKey:'gsk_'+ 'b'.repeat(48),confirmedFreePlan:true}));assert.equal(response.status,400);assert.ok(!(await response.text()).includes(fakeKey));assert.equal(f.sql.prepare("SELECT ciphertext FROM ai_credentials WHERE scope='__groq_free__'").get()!.ciphertext,before);
 }finally{f.close();}
});

test('guest, ownership and CSRF guards run before any free analysis call',async()=>{
 const f=await fixture();try{await f.configure();f.setUser(null);assert.equal((await f.api.handleReportFreeAI(f.request('/api/reports/report-a/free-ai','POST',{}),'report-a')).status,401);assert.equal((await f.api.handleFreeAIStatus(f.request('/api/ai/free'))).status,401);
  f.setUser('bob');assert.equal((await f.api.handleReportFreeAI(f.request('/api/reports/report-a/free-ai','POST',{}),'report-a')).status,404);
  f.setUser('alice');assert.equal((await f.api.handleReportFreeAI(f.request('/api/reports/report-a/free-ai','POST',{},'https://evil.test'),'report-a')).status,403);assert.equal(f.calls(),0);
 }finally{f.close();}
});

test('free analysis persists separately, is isolated from paid budgets, and has no automatic paid fallback',async()=>{
 const f=await fixture();try{await f.configure();f.setUser('alice');let keySeen='';f.setProvider(async(_r,o)=>{keySeen=o.apiKey;assert.equal(o.locale,'fr-CA');o.onUsage?.({inputTokens:1000,outputTokens:300});return ready;});
  const response=await f.api.handleReportFreeAI(f.request('/api/reports/report-a/free-ai','POST',{locale:'fr-CA'}),'report-a');assert.equal(response.status,200);const result=await response.json() as {report:Report&{freeAi:AIAnalysis}};assert.deepEqual(result.report.ai,paid);assert.deepEqual(result.report.freeAi,ready);assert.equal(keySeen,fakeKey);assert.equal(f.paidCalls(),0);
  const row=f.sql.prepare('SELECT sponsored,charged_tokens,state,budget_scope FROM ai_usage').get()!;assert.equal(row.sponsored,0);assert.equal(row.charged_tokens,1300);assert.equal(row.state,'settled');assert.match(String(row.budget_scope),/^free:groq:alice:/);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM report_jobs').get()!.n,0);
 }finally{f.close();}
});

test('atomic admission permits one provider request globally and enforces start spacing',async()=>{
 const f=await fixture();try{await f.configure();let release=()=>{},entered=()=>{};const gate=new Promise<void>(r=>{release=r;}),readyPromise=new Promise<void>(r=>{entered=r;});f.setProvider(async()=>{entered();await gate;return ready;});
  const first=f.api.generateMeteredFreeAnalysis('alice',report);await readyPromise;
  await assert.rejects(f.api.generateMeteredFreeAnalysis('bob',report),(error:unknown)=>(error as {code?:string}).code==='FREE_AI_LIMIT');release();await first;
  await assert.rejects(f.api.generateMeteredFreeAnalysis('bob',report),(error:unknown)=>(error as {code?:string}).code==='FREE_AI_LIMIT');assert.equal(f.calls(),1);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM ai_usage').get()!.n,1);
  f.advance();await f.api.generateMeteredFreeAnalysis('bob',report);assert.equal(f.calls(),2);
 }finally{f.close();}
});

test('user and global daily allowances stop normal users; verified owner skips daily caps but not spacing',async()=>{
 const f=await fixture();try{await f.configure();for(let n=0;n<3;n++){await f.api.generateMeteredFreeAnalysis('alice',report);f.advance();}
  await assert.rejects(f.api.generateMeteredFreeAnalysis('alice',report),(error:unknown)=>(error as {code?:string}).code==='FREE_AI_LIMIT');
  const now=Date.now(),day=new Date(now).toISOString().slice(0,10);
  for(let n=0;n<17;n++)f.sql.prepare("INSERT INTO ai_usage(id,user_id,budget_scope,quota_day,sponsored,charged_tokens,input_tokens,output_tokens,state,expires_at,created_at) VALUES(?,?,?,?,0,1,1,0,'settled',?,?)").run(crypto.randomUUID(),'bob',`free:groq:bob:${day}`,day,now-120000,now-61000);
  await assert.rejects(f.api.generateMeteredFreeAnalysis('bob',report),(error:unknown)=>(error as {code?:string}).code==='FREE_AI_LIMIT');
  await f.api.generateMeteredFreeAnalysis('owner',report);assert.equal((await f.api.freeAIStatus('owner')).unlimited,true);
  await assert.rejects(f.api.generateMeteredFreeAnalysis('owner',report),(error:unknown)=>(error as {code?:string}).code==='FREE_AI_LIMIT');
  f.advance();assert.equal((await f.api.freeAIStatus('owner')).canUse,true);assert.equal((await f.api.freeAIStatus('alice')).canUse,false);
 }finally{f.close();}
});

test('provider rate limits persist cooldown and failed calls keep a reservation without replacing existing results',async()=>{
 const f=await fixture();try{await f.configure();f.setUser('alice');f.setProvider(async()=>{throw new f.FreeAIError('FREE_AI_RATE_LIMIT',300);});
  const response=await f.api.handleReportFreeAI(f.request('/api/reports/report-a/free-ai','POST',{}),'report-a');assert.equal(response.status,429);assert.equal(response.headers.get('Retry-After'),'300');assert.ok(!(await response.text()).includes(fakeKey));assert.equal(f.paidCalls(),0);
  const saved=JSON.parse(String(f.sql.prepare('SELECT payload FROM reports WHERE id=?').get(report.id)!.payload));assert.deepEqual(saved.ai,paid);assert.equal(saved.freeAi,undefined);
  const usage=f.sql.prepare('SELECT charged_tokens,state FROM ai_usage').get()!;assert.equal(usage.charged_tokens,8000);assert.equal(usage.state,'unconfirmed');f.advance();await assert.rejects(f.api.generateMeteredFreeAnalysis('bob',report));assert.equal(f.calls(),1);assert.ok((await f.api.freeAIStatus('alice')).retryAt);
 }finally{f.close();}
});

test('disabling or deleting Groq leaves existing OpenAI credentials and configuration untouched',async()=>{
 const f=await fixture();try{await f.configure();f.sql.prepare('INSERT INTO ai_credentials(scope,ciphertext,suffix,updated_at) VALUES(?,?,?,?)').run('__site_sponsor__','preserved','test','now');f.sql.prepare('INSERT INTO ai_config(id,payload) VALUES(?,?)').run('limits','{"dailyRequests":5}');
  await f.api.handleAdminFreeAI(f.request('/api/admin/ai/free','PATCH',{enabled:false}));assert.equal((await f.api.freeAIStatus('alice')).configured,false);
  await assert.rejects(f.api.generateMeteredFreeAnalysis('alice',report));assert.equal(f.calls(),0);
  await f.api.handleAdminFreeAI(f.request('/api/admin/ai/free','DELETE'));assert.equal(f.sql.prepare("SELECT ciphertext FROM ai_credentials WHERE scope='__site_sponsor__'").get()!.ciphertext,'preserved');assert.equal(f.sql.prepare("SELECT payload FROM ai_config WHERE id='limits'").get()!.payload,'{"dailyRequests":5}');
 }finally{f.close();}
});

test('paid completion preserves a free result saved while its request was in flight',async()=>{
 const f=await fixture();try{
  f.setUser('alice');
  const key='sk-'+ 'a'.repeat(48);const ciphertext=await f.api.sealCredential(key,'alice',String(f.env.CREDENTIAL_ENCRYPTION_KEY));
  f.sql.prepare('INSERT INTO ai_credentials(scope,ciphertext,suffix,updated_at) VALUES(?,?,?,?)').run('alice',ciphertext,'aaaa','now');
  f.setPaidProvider(async()=>{f.sql.prepare("UPDATE reports SET payload=json_set(payload,'$.freeAi',json(?)) WHERE id=?").run(JSON.stringify(ready),report.id);return {...paid,summary:'Updated paid result'};});
  const response=await f.api.handleReportAI(f.request('/api/reports/report-a/ai','POST',{}),report.id);
  assert.equal(response.status,200,await response.clone().text());const payload=await response.json() as {report:Report&{freeAi:AIAnalysis}};
  assert.equal(payload.report.ai?.summary,'Updated paid result');assert.deepEqual(payload.report.freeAi,ready);assert.equal(f.paidCalls(),1);assert.equal(f.calls(),0);
 }finally{f.close();}
});

test('basic and demonstration reports stop before reserving free-provider capacity',async()=>{
 const f=await fixture();try{await f.configure();
  await assert.rejects(f.api.generateMeteredFreeAnalysis('alice',{...report,mode:'demo'}),(error:unknown)=>(error as {code?:string}).code==='AI_REQUIRES_LIVE_DATA');
  await assert.rejects(f.api.generateMeteredFreeAnalysis('alice',{...report,scope:{level:'basic',available:[],missing:[],limitations:[]}}),(error:unknown)=>(error as {code?:string}).code==='AI_REQUIRES_FINANCIAL_DATA');
  assert.equal(f.calls(),0);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM ai_usage').get()!.n,0);
 }finally{f.close();}
});

test('an unconfigured installation selects Gemini and rejects generation without a key',async()=>{
 const f=await fixture();try{
  const state=await (await f.api.handleAdminFreeAI(f.request('/api/admin/ai/free'))).json() as {providerId:string;provider:string;model:string;configured:boolean};
  assert.equal(state.providerId,'gemini');assert.equal(state.provider,'Gemini');assert.equal(state.model,'gemini-3.8-flash');assert.equal(state.configured,false);
  await assert.rejects(f.api.generateMeteredFreeAnalysis('alice',report,'en-CA',f.request('/','GET',undefined,undefined,'CA')),(error:unknown)=>(error as {code?:string}).code==='FREE_AI_NOT_CONFIGURED');
  assert.equal(f.calls(),0);assert.equal(f.paidCalls(),0);
 }finally{f.close();}
});

test('Gemini setup validates the fixed model using a header and stores only an encrypted credential',async()=>{
 const f=await fixture();try{
  const authKey='AQ.'+'b'.repeat(48);let seen=false;
  f.setFetch(async(input,init)=>{assert.equal(String(input),'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash');const headers=new Headers(init?.headers);assert.equal(headers.get('x-goog-api-key'),authKey);assert.equal(headers.get('Authorization'),null);assert.ok(!String(input).includes(authKey));assert.equal(init?.redirect,'manual');assert.equal(init?.method,undefined);seen=true;return Response.json(geminiModel);});
  const response=await f.api.handleAdminFreeAI(f.request('/api/admin/ai/free','PUT',{apiKey:authKey,confirmedFreePlan:true}));assert.equal(response.status,200,await response.clone().text());assert.ok(seen);
  const state=await response.json() as {providerId:string;configured:boolean;key:{suffix:string}};assert.equal(state.providerId,'gemini');assert.equal(state.configured,true);assert.equal(state.key.suffix,'bbbb');
  const stored=String(f.sql.prepare("SELECT ciphertext FROM ai_credentials WHERE scope='__gemini_free__'").get()!.ciphertext);assert.ok(!stored.includes(authKey));assert.equal(await f.api.openCredential(stored,'__gemini_free__',String(f.env.CREDENTIAL_ENCRYPTION_KEY)),authKey);
  const output=await (await f.api.handleAdminFreeAI(f.request('/api/admin/ai/free'))).text();assert.ok(!output.includes(authKey));assert.equal(f.calls(),0);assert.equal(f.paidCalls(),0);
 }finally{f.close();}
});

test('invalid Gemini keys or unsupported model methods never replace the active provider',async()=>{
 const f=await fixture();try{await f.configure();const before=f.sql.prepare("SELECT payload FROM ai_config WHERE id='free_ai'").get()!.payload;
  let checked=0;f.setFetch(async()=>{checked++;return Response.json({...geminiModel,supportedGenerationMethods:['countTokens']});});
  for(const apiKey of [fakeKey,'AIza'+ 'a'.repeat(8),'AQ.'+'a'.repeat(30)+'\nsecret']){
   assert.equal((await f.api.handleAdminFreeAI(f.request('/api/admin/ai/free','PUT',{provider:'gemini',apiKey,confirmedFreePlan:true}))).status,400);
  }
  assert.equal(checked,0);
  assert.equal((await f.api.handleAdminFreeAI(f.request('/api/admin/ai/free','PUT',{provider:'gemini',apiKey:fakeGeminiKey,confirmedFreePlan:true}))).status,400);
  assert.equal(checked,1);assert.equal(f.sql.prepare("SELECT payload FROM ai_config WHERE id='free_ai'").get()!.payload,before);assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM ai_credentials WHERE scope='__gemini_free__'").get()!.n,0);
 }finally{f.close();}
});

test('Gemini region eligibility trusts runtime country only and denies restricted or unknown regions before quota',async()=>{
 const f=await fixture();try{await f.configure('gemini');f.setUser('alice');
  for(const country of [undefined,'GB','DE','CH','FR','XX','T1']){
   const request=f.request('/api/reports/report-a/free-ai','POST',{},undefined,country);request.headers.set('CF-IPCountry','CA');
   const response=await f.api.handleReportFreeAI(request,report.id);assert.equal(response.status,403);assert.equal((await response.json() as {code:string}).code,'FREE_AI_REGION_UNAVAILABLE');
   const status=await f.api.freeAIStatus('alice',f.request('/api/ai/free','GET',undefined,undefined,country));assert.equal(status.regionEligible,false);assert.equal(status.canUse,false);assert.ok(status.regionReason);
  }
  assert.equal(f.calls(),0);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM ai_usage').get()!.n,0);
  const request=f.request('/api/ai/free','GET',undefined,undefined,'CA');const allowed=await (await f.api.handleFreeAIStatus(request)).json() as {regionEligible:boolean;canUse:boolean;providerId:string};assert.equal(allowed.regionEligible,true);assert.equal(allowed.canUse,true);assert.equal(allowed.providerId,'gemini');
  f.setProvider(async(_r,o)=>{assert.equal(o.provider,'gemini');assert.equal(o.apiKey,fakeGeminiKey);o.onUsage?.({inputTokens:100,outputTokens:50});return ready;});
  const response=await f.api.handleReportFreeAI(f.request('/api/reports/report-a/free-ai','POST',{},undefined,'CA'),report.id);assert.equal(response.status,200);assert.equal(f.calls(),1);assert.equal(f.paidCalls(),0);
  const saved=await response.json() as {report:Report};assert.deepEqual(saved.report.ai,paid);assert.deepEqual(saved.report.freeAi,ready);
 }finally{f.close();}
});

test('selected provider persists when paused; deleting Gemini preserves Groq and OpenAI credentials',async()=>{
 const f=await fixture();try{await f.configure();await f.configure('gemini');f.sql.prepare('INSERT INTO ai_credentials(scope,ciphertext,suffix,updated_at) VALUES(?,?,?,?)').run('__site_sponsor__','preserved','test','now');
  const paused=await (await f.api.handleAdminFreeAI(f.request('/api/admin/ai/free','PATCH',{enabled:false}))).json() as {enabled:boolean;providerId:string};assert.equal(paused.enabled,false);assert.equal(paused.providerId,'gemini');
  const resumed=await (await f.api.handleAdminFreeAI(f.request('/api/admin/ai/free','PATCH',{enabled:true}))).json() as {enabled:boolean;providerId:string};assert.equal(resumed.enabled,true);assert.equal(resumed.providerId,'gemini');
  await f.api.handleAdminFreeAI(f.request('/api/admin/ai/free','DELETE'));assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM ai_credentials WHERE scope='__gemini_free__'").get()!.n,0);assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM ai_credentials WHERE scope='__groq_free__'").get()!.n,1);assert.equal(f.sql.prepare("SELECT ciphertext FROM ai_credentials WHERE scope='__site_sponsor__'").get()!.ciphertext,'preserved');
 }finally{f.close();}
});

test('switching free providers cannot reset user daily allowance or global start spacing',async()=>{
 const f=await fixture();try{await f.configure();await f.api.generateMeteredFreeAnalysis('alice',report);await f.configure('gemini');const request=f.request('/','GET',undefined,undefined,'CA');
  await assert.rejects(f.api.generateMeteredFreeAnalysis('bob',report,'en-CA',request),(error:unknown)=>(error as {code?:string}).code==='FREE_AI_LIMIT');
  f.advance();await f.api.generateMeteredFreeAnalysis('alice',report,'en-CA',request);f.advance();await f.api.generateMeteredFreeAnalysis('alice',report,'en-CA',request);f.advance();
  await f.configure();await assert.rejects(f.api.generateMeteredFreeAnalysis('alice',report),(error:unknown)=>(error as {code?:string}).code==='FREE_AI_LIMIT');assert.equal((await f.api.freeAIStatus('alice')).usage.requests,3);assert.equal(f.calls(),3);assert.equal(f.paidCalls(),0);
 }finally{f.close();}
});

test('Gemini failures never expose provider text or trigger a paid fallback',async()=>{
 const f=await fixture();try{await f.configure('gemini');f.setUser('alice');f.setProvider(async()=>{throw new Error('provider response '+fakeGeminiKey);});
  const response=await f.api.handleReportFreeAI(f.request('/api/reports/report-a/free-ai','POST',{},undefined,'CA'),report.id);assert.equal(response.status,503);const text=await response.text();assert.ok(!text.includes(fakeGeminiKey));assert.ok(text.includes('No paid fallback'));assert.equal(f.calls(),1);assert.equal(f.paidCalls(),0);
  const saved=JSON.parse(String(f.sql.prepare('SELECT payload FROM reports WHERE id=?').get(report.id)!.payload));assert.deepEqual(saved.ai,paid);assert.equal(saved.freeAi,undefined);
 }finally{f.close();}
});

test('Gemini eligibility uses the original Worker region after framework request reconstruction',async()=>{
 const f=await fixture();try{await f.configure('gemini');f.setUser('alice');
  const native=f.request('/api/ai/free','GET',undefined,undefined,'CA');
  await f.api.runWithRequestRegion(native,async()=>{
   const reconstructed=f.request('/api/ai/free');
   const status=await (await f.api.handleFreeAIStatus(reconstructed)).json() as {regionEligible:boolean;canUse:boolean};assert.equal(status.regionEligible,true);assert.equal(status.canUse,true);
   const response=await f.api.handleReportFreeAI(f.request('/api/reports/report-a/free-ai','POST',{}),report.id);assert.equal(response.status,200);
  });
  await f.api.runWithRequestRegion(f.request('/','GET',undefined,undefined,'GB'),async()=>{
   const response=await f.api.handleReportFreeAI(f.request('/api/reports/report-a/free-ai','POST',{}),report.id);assert.equal(response.status,403);assert.equal((await response.json() as {code:string}).code,'FREE_AI_REGION_UNAVAILABLE');
  });
  assert.equal(f.calls(),1);assert.equal((await f.api.freeAIStatus('alice',f.request('/api/ai/free'))).regionEligible,false);
 }finally{f.close();}
});

test('unknown Gemini location requires an explicit per-request declaration without persisting it',async()=>{
 const f=await fixture();try{await f.configure('gemini');f.setUser('alice');
  const initial=await f.api.freeAIStatus('alice',f.request('/api/ai/free'));assert.equal(initial.canUse,false);assert.equal(initial.regionNeedsConfirmation,true);assert.equal(initial.canUseWithRegionConfirmation,true);
  const missing=await f.api.handleReportFreeAI(f.request('/api/reports/report-a/free-ai','POST',{}),report.id);assert.equal(missing.status,403);assert.equal(f.calls(),0);
  for(const country of ['CA','US']){
   const response=await f.api.handleReportFreeAI(f.request('/api/reports/report-a/free-ai','POST',{country}),report.id);assert.equal(response.status,200,await response.clone().text());f.advance();
   const state=await f.api.freeAIStatus('alice',f.request('/api/ai/free'));assert.equal(state.canUse,false);assert.equal(state.regionNeedsConfirmation,true);
  }
  const missingAgain=await f.api.handleReportFreeAI(f.request('/api/reports/report-a/free-ai','POST',{}),report.id);assert.equal(missingAgain.status,403);assert.equal(f.calls(),2);assert.equal(f.paidCalls(),0);
  const saved=String(f.sql.prepare('SELECT payload FROM reports WHERE id=?').get(report.id)!.payload);assert.ok(!saved.includes('"country"'));assert.equal(f.sql.prepare('SELECT preferences FROM profiles WHERE user_id=?').get('alice')!.preferences,'{}');
 }finally{f.close();}
});

test('a declaration cannot override a known restricted runtime region and invalid declarations are rejected',async()=>{
 const f=await fixture();try{await f.configure('gemini');f.setUser('alice');
  for(const country of ['GB','DE','CH']){
   const native=f.request('/','GET',undefined,undefined,country);
   await f.api.runWithRequestRegion(native,async()=>{
    const response=await f.api.handleReportFreeAI(f.request('/api/reports/report-a/free-ai','POST',{country:'CA'}),report.id);assert.equal(response.status,403);const status=await f.api.freeAIStatus('alice');assert.equal(status.regionNeedsConfirmation,false);assert.equal(status.canUseWithRegionConfirmation,false);
   });
  }
  for(const country of ['GB','FR','ca','Canada','',null,123])assert.equal((await f.api.handleReportFreeAI(f.request('/api/reports/report-a/free-ai','POST',{country}),report.id)).status,400);
  assert.equal(f.calls(),0);assert.equal(f.paidCalls(),0);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM ai_usage').get()!.n,0);
 }finally{f.close();}
});

test('location declarations do not bypass quota, cooldown or normal ownership protections',async()=>{
 const f=await fixture();try{await f.configure('gemini');f.setUser(null);assert.equal((await f.api.handleReportFreeAI(f.request('/api/reports/report-a/free-ai','POST',{country:'CA'}),report.id)).status,401);
  f.setUser('bob');assert.equal((await f.api.handleReportFreeAI(f.request('/api/reports/report-a/free-ai','POST',{country:'CA'}),report.id)).status,404);f.setUser('alice');
  assert.equal((await f.api.handleReportFreeAI(f.request('/api/reports/report-a/free-ai','POST',{country:'CA'}),report.id)).status,200);
  assert.equal((await f.api.freeAIStatus('alice')).canUseWithRegionConfirmation,false);
  assert.equal((await f.api.handleReportFreeAI(f.request('/api/reports/report-a/free-ai','POST',{country:'US'}),report.id)).status,429);f.advance();
  for(let n=0;n<2;n++){assert.equal((await f.api.handleReportFreeAI(f.request('/api/reports/report-a/free-ai','POST',{country:'CA'}),report.id)).status,200);f.advance();}
  assert.equal((await f.api.freeAIStatus('alice')).canUseWithRegionConfirmation,false);assert.equal((await f.api.handleReportFreeAI(f.request('/api/reports/report-a/free-ai','POST',{country:'US'}),report.id)).status,429);assert.equal(f.calls(),3);assert.equal(f.paidCalls(),0);
 }finally{f.close();}
});
