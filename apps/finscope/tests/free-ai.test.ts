import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import type { Report } from "../lib/types";

const source=stripTypeScriptTypes(await readFile(new URL('../lib/free-ai.ts',import.meta.url),'utf8'));
const adapter=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64')) as typeof import('../lib/free-ai');
const key='gsk_'+'x'.repeat(40);
const dimensions=['growth','profitability','cashflow','balance-sheet','risks-and-gaps'];
const report=():Report=>({
  id:'private-report-id',symbol:'TEST',company:{symbol:'TEST',name:'Example',nameEn:'Example Company',sector:'Technology',exchange:'NYSE',mark:'E',color:'#fff'},generatedAt:'2026-10-28T00:00:00Z',dataAsOf:'2025-12-31',mode:'live',currency:'USD',
  periods:[{year:'2024',revenue:100,netIncome:10,operatingCashFlow:15,capex:5,assets:150,liabilities:70,cash:20,debt:40,grossProfit:40,operatingIncome:20,equity:80},{year:'2025',revenue:120,netIncome:12,operatingCashFlow:18,capex:6,assets:170,liabilities:75,cash:25,debt:null,grossProfit:48,operatingIncome:24,equity:95}],
  metrics:{revenueGrowth:20,netMargin:10,freeCashFlow:12,debtToEquity:null,roe:13.7,cashRatio:0.33},insights:[],
  sources:[{label:'Original annual filing',url:'https://www.sec.gov/Archives/edgar/data/123/annual.htm',asOf:'2025-12-31'},{label:'Original cash flow filing',url:'https://example.com/cashflow.htm',asOf:'2025-12-31'}],
  profile:{employeeHistory:[{value:1000,asOf:'2025-12-31',source:'https://example.com/workforce',basis:'full-time-equivalent'}]},
});
const answer=()=>({summary:'Revenue expanded, while debt information remains unavailable.',insights:dimensions.map(dimension=>({dimension,title:dimension,stance:'neutral',summary:'The reported figures provide a dated perspective.',detail:'Verify the missing evidence before drawing a stronger conclusion.',citations:[1]}))});
const payload=(value:unknown=answer())=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}],usage:{prompt_tokens:900,completion_tokens:450}});
const geminiKey = 'AIza' + 'x'.repeat(35);
const geminiPayload = (value: unknown = answer()) => ({candidates:[{finishReason:'STOP',content:{role:'model',parts:[{text:JSON.stringify(value)}]}}],usageMetadata:{promptTokenCount:900,candidatesTokenCount:450,thoughtsTokenCount:120}});
function network(result:unknown=payload()) {
  const calls:{url:string;init:RequestInit}[]=[];
  const fetcher=(async(url:string|URL|Request,init?:RequestInit)=>{calls.push({url:String(url),init:init??{}});return Response.json(result);}) as typeof fetch;
  return {calls,fetcher};
}
const code=(expected:string)=>(error:unknown)=>error instanceof adapter.FreeAIError && error.code===expected;

test('free analysis uses only Groq, a fixed model and strict structured output without tools',async()=>{
  const net=network(),usage:unknown[]=[];
  const result=await adapter.generateFreeAIAnalysis(report(),{apiKey:key,fetcher:net.fetcher,onUsage:value=>usage.push(value)});
  assert.equal(result.status,'ready');assert.equal(result.insights.length,5);assert.equal(result.model,adapter.FREE_AI_MODEL);
  assert.deepEqual(result.sources,[report().sources[0]]);assert.deepEqual(usage,[{inputTokens:900,outputTokens:450}]);
  assert.equal(net.calls.length,1);assert.equal(net.calls[0].url,'https://api.groq.com/openai/v1/chat/completions');assert.equal(net.calls[0].init.redirect,'manual');
  const request=JSON.parse(String(net.calls[0].init.body));
  assert.equal(request.model,'openai/gpt-oss-20b');assert.equal(request.response_format.json_schema.strict,true);assert.equal(request.reasoning_effort,'low');assert.equal(request.include_reasoning,false);assert.equal(request.tools,undefined);assert.equal(request.stream,false);assert.equal(request.max_completion_tokens,2400);
  assert.ok(String(net.calls[0].init.body).length<12_000);assert.ok(!String(net.calls[0].init.body).includes(key));assert.ok(net.calls[0].init.signal instanceof AbortSignal);
});

test('public projection omits account data, notes, prior AI output, IDs and arbitrary properties',async()=>{
  const input=report() as Report & Record<string,unknown>;
  input.email='PRIVATE_EMAIL';input.apiKey='PRIVATE_API_KEY';input.note='PRIVATE_NOTE';input.owner='PRIVATE_OWNER';input.insights=[{title:'PRIVATE_INSIGHT',stance:'neutral',summary:'PRIVATE_SUMMARY'}];
  input.ai={status:'ready',summary:'PRIVATE_PRIOR_AI',insights:[],sources:[]};
  Object.assign(input.company,{email:'PRIVATE_COMPANY_FIELD',credentials:'PRIVATE_CREDENTIAL'});
  input.sources.push({label:'Bad credential source',url:'https://example.com/?api_key=PRIVATE_QUERY'});
  const net=network();await adapter.generateFreeAIAnalysis(input,{apiKey:key,fetcher:net.fetcher});
  const body=String(net.calls[0].init.body);
  assert.ok(!body.includes('PRIVATE_'));assert.ok(!body.includes('private-report-id'));
  const evidence=JSON.parse(JSON.parse(body).messages[1].content);
  assert.equal(evidence.periods[1].debt,null);assert.equal(evidence.metrics.interestBearingDebtToEquity,null);assert.equal(evidence.amountUnit,'millions of the stated reporting currency');assert.equal(evidence.workforce[0].basis,'full-time-equivalent');assert.equal(evidence.workforce[0].sourceUrl,undefined);
  assert.ok(evidence.sources.every((source:Record<string,unknown>)=>!('url' in source)));
});

test('bounded prompt keeps at most five annual periods and French output instructions',async()=>{
  const input=report();input.periods=Array.from({length:100},(_,i)=>({...input.periods[0],year:String(1926+i)}));
  input.sources=Array.from({length:100},(_,i)=>({label:'A'.repeat(5000),url:`https://example.com/${i}`}));
  const net=network();await adapter.generateFreeAIAnalysis(input,{apiKey:key,locale:'fr-CA',fetcher:net.fetcher});
  const request=JSON.parse(String(net.calls[0].init.body)), evidence=JSON.parse(request.messages[1].content);
  assert.equal(evidence.periods.length,5);assert.equal(evidence.periods[0].year,'2021');assert.ok(request.messages[0].content.includes('natural Canadian French'));assert.ok(String(net.calls[0].init.body).length<12_000);
});

test('missing configuration, malformed keys and unsupported reports fail before a provider call',async()=>{
  const net=network();
  await assert.rejects(adapter.generateFreeAIAnalysis(report(),{apiKey:'',fetcher:net.fetcher}),code('FREE_AI_NOT_CONFIGURED'));
  await assert.rejects(adapter.generateFreeAIAnalysis(report(),{apiKey:'sk-'+'x'.repeat(40),fetcher:net.fetcher}),code('FREE_AI_INVALID_KEY'));
  for(const input of [{...report(),mode:'demo' as const},{...report(),periods:[]},{...report(),sources:[]}])await assert.rejects(adapter.generateFreeAIAnalysis(input,{apiKey:key,fetcher:net.fetcher}),code('FREE_AI_UNSUPPORTED_REPORT'));
  assert.equal(net.calls.length,0);
});

test('every required dimension needs a valid citation and duplicate dimensions are rejected',async()=>{
  for(const change of [(data:ReturnType<typeof answer>)=>{data.insights[0].citations=[99];},(data:ReturnType<typeof answer>)=>{data.insights[0].citations=[];},(data:ReturnType<typeof answer>)=>{data.insights[0].dimension='profitability';},(data:ReturnType<typeof answer>)=>{data.insights.pop();}]){
    const data=answer();change(data);const net=network(payload(data));
    await assert.rejects(adapter.generateFreeAIAnalysis(report(),{apiKey:key,fetcher:net.fetcher}),code('FREE_AI_INVALID_RESPONSE'));
    assert.equal(net.calls.length,1);
  }
});

test('invented URLs, HTML and unrecognized output fields are rejected instead of rendered',async()=>{
  for(const data of [{...answer(),summary:'See https://invented.example for evidence.'},{...answer(),summary:'<script>alert(1)</script>'},{...answer(),url:'https://invented.example'}]){
    await assert.rejects(adapter.generateFreeAIAnalysis(report(),{apiKey:key,fetcher:network(payload(data)).fetcher}),code('FREE_AI_INVALID_RESPONSE'));
  }
});

test('malformed, refused and truncated responses fail but still account for actual usage',async()=>{
  const base=payload(), malformed={...base,choices:[{finish_reason:'stop',message:{content:'not json'}}]}, truncated={...base,choices:[{finish_reason:'length',message:base.choices[0].message}]},refused={...base,choices:[{finish_reason:'stop',message:{refusal:'Cannot respond',content:null}}]};
  for(const result of [malformed,truncated,refused]){
    const usage:unknown[]=[];
    await assert.rejects(adapter.generateFreeAIAnalysis(report(),{apiKey:key,fetcher:network(result).fetcher,onUsage:value=>usage.push(value)}),code('FREE_AI_INVALID_RESPONSE'));
    assert.deepEqual(usage,[{inputTokens:900,outputTokens:450}]);
  }
});

test('provider rate limits retain Retry-After without reading or leaking upstream errors',async()=>{
  let calls=0;
  const fetcher=(async()=>{calls++;return new Response('PRIVATE_PROVIDER_ERROR '+key,{status:429,headers:{'Retry-After':'120'}});}) as typeof fetch;
  await assert.rejects(adapter.generateFreeAIAnalysis(report(),{apiKey:key,fetcher}),(error:unknown)=>error instanceof adapter.FreeAIError && error.code==='FREE_AI_RATE_LIMIT' && error.retryAfterSeconds===120 && !error.message.includes(key) && !error.message.includes('PRIVATE_PROVIDER_ERROR'));
  assert.equal(calls,1);
});

test('HTTP failures, redirects and transport exceptions never trigger fallback or expose secrets',async()=>{
  for(const status of [401,403,302,500]){
    let calls=0;const fetcher=(async()=>{calls++;return new Response(key,{status,headers:{Location:'https://api.openai.com/v1/responses'}});}) as typeof fetch;
    await assert.rejects(adapter.generateFreeAIAnalysis(report(),{apiKey:key,fetcher}),(error:unknown)=>error instanceof adapter.FreeAIError && error.code===(status===401||status===403?'FREE_AI_INVALID_KEY':'FREE_AI_UNAVAILABLE') && !error.message.includes(key));
    assert.equal(calls,1);
  }
  await assert.rejects(adapter.generateFreeAIAnalysis(report(),{apiKey:key,fetcher:(async()=>{throw new Error('Authorization: '+key);}) as typeof fetch}),(error:unknown)=>code('FREE_AI_UNAVAILABLE')(error) && !(error as Error).message.includes(key));
});

test('declared and streamed response bodies are bounded',async()=>{
  for(const response of [new Response('{}',{headers:{'Content-Length':'200000'}}),new Response('x'.repeat(128001))]){
    await assert.rejects(adapter.generateFreeAIAnalysis(report(),{apiKey:key,fetcher:(async()=>response) as typeof fetch}),code('FREE_AI_INVALID_RESPONSE'));
  }
});

test('citation numbers follow the rendered source order rather than provider-supplied URLs',async()=>{
  const value=answer();value.insights[0].citations=[2,1];value.insights[1].citations=[1];
  const result=await adapter.generateFreeAIAnalysis(report(),{apiKey:key,fetcher:network(payload(value)).fetcher});
  assert.deepEqual(result.sources,[report().sources[1],report().sources[0]]);
  assert.match(result.insights[0].detail!,/Sources 1, 2/);assert.match(result.insights[1].detail!,/Sources 2/);
});

test('Gemini uses its fixed endpoint and header key with bounded structured generation', async () => {
  const net = network(geminiPayload()), usage: unknown[] = [];
  const result = await adapter.generateFreeAIAnalysis(report(), {provider:'gemini',apiKey:geminiKey,fetcher:net.fetcher,onUsage:value=>usage.push(value)});
  assert.equal(result.model, 'gemini-3.8-flash');
  assert.equal(result.insights.length, 5);
  assert.deepEqual(result.sources, [report().sources[0]]);
  assert.deepEqual(usage, [{inputTokens:900,outputTokens:570}]);
  assert.equal(net.calls.length, 1);
  const request = net.calls[0], body = JSON.parse(String(request.init.body)), headers = new Headers(request.init.headers);
  assert.equal(request.url,'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');
  assert.equal(headers.get('x-goog-api-key'),geminiKey);
  assert.equal(headers.get('authorization'),null);
  assert.ok(!request.url.includes(geminiKey) && !String(request.init.body).includes(geminiKey));
  assert.equal(request.init.redirect,'manual');
  assert.ok(request.init.signal instanceof AbortSignal);
  assert.deepEqual(body.generationConfig.thinkingConfig,{thinkingLevel:'low',includeThoughts:false});
  assert.equal(body.generationConfig.maxOutputTokens,4096);
  assert.equal(body.generationConfig.responseFormat.text.mimeType,'APPLICATION_JSON');
  assert.equal(body.generationConfig.responseFormat.text.schema.additionalProperties,false);
  assert.equal(body.generationConfig.candidateCount,1);
  assert.equal(body.tools,undefined);
});

test('Gemini sends only the public projection and honours Canadian French', async () => {
  const input = report() as Report & Record<string,unknown>;
  input.email='PRIVATE_EMAIL';input.note='PRIVATE_NOTE';
  input.ai={status:'ready',summary:'PRIVATE_PRIOR_ANALYSIS',insights:[],sources:[]};
  input.freeAi={status:'ready',summary:'PRIVATE_FREE_ANALYSIS',insights:[],sources:[]};
  const net=network(geminiPayload());
  await adapter.generateFreeAIAnalysis(input,{provider:'gemini',apiKey:geminiKey,locale:'fr-CA',fetcher:net.fetcher});
  const raw=String(net.calls[0].init.body), body=JSON.parse(raw), evidence=JSON.parse(body.contents[0].parts[0].text);
  assert.ok(!raw.includes('PRIVATE_') && !raw.includes('private-report-id'));
  assert.match(body.systemInstruction.parts[0].text,/natural Canadian French/);
  assert.equal(evidence.periods[1].debt,null);
  assert.ok(evidence.sources.every((source:Record<string,unknown>)=>!('url' in source)));
});

test('provider keys are never sent to the other provider', async () => {
  const net=network();
  for (const options of [{provider:'gemini' as const,apiKey:key},{provider:'groq' as const,apiKey:geminiKey}]) {
    await assert.rejects(adapter.generateFreeAIAnalysis(report(),{...options,fetcher:net.fetcher}),code('FREE_AI_INVALID_KEY'));
  }
  assert.equal(net.calls.length,0);
});

test('Gemini authorization keys use the same private header and reject unsafe or oversized values',async()=>{
  const authKey='AQ.'+'a'.repeat(50)+'.'+'b'.repeat(30),net=network(geminiPayload());
  await adapter.generateFreeAIAnalysis(report(),{provider:'gemini',apiKey:authKey,fetcher:net.fetcher});
  assert.equal(new Headers(net.calls[0].init.headers).get('x-goog-api-key'),authKey);
  assert.ok(!net.calls[0].url.includes(authKey)&&!String(net.calls[0].init.body).includes(authKey));
  for(const apiKey of ['AQ.short','AQ.'+'a'.repeat(253),authKey+'\r\nX-Injected: true',authKey+' space',authKey+'?query=value']) {
    await assert.rejects(adapter.generateFreeAIAnalysis(report(),{provider:'gemini',apiKey,fetcher:net.fetcher}),code('FREE_AI_INVALID_KEY'));
  }
  assert.equal(net.calls.length,1);
});

test('Gemini blocked, truncated and non-text responses fail while retaining usage', async () => {
  const base=geminiPayload();
  const cases=[
    {...base,promptFeedback:{blockReason:'SAFETY'}},
    {...base,candidates:[{...base.candidates[0],finishReason:'MAX_TOKENS'}]},
    {...base,candidates:[{...base.candidates[0],safetyRatings:[{blocked:true}]}]},
    {...base,candidates:[{...base.candidates[0],content:{parts:[{functionCall:{name:'browse'}}]}}]},
    {...base,candidates:[{...base.candidates[0],content:{parts:[{text:'not json'}]}}]},
  ];
  for (const value of cases) {
    const net=network(value), usage:unknown[]=[];
    await assert.rejects(adapter.generateFreeAIAnalysis(report(),{provider:'gemini',apiKey:geminiKey,fetcher:net.fetcher,onUsage:value=>usage.push(value)}),code('FREE_AI_INVALID_RESPONSE'));
    assert.deepEqual(usage,[{inputTokens:900,outputTokens:570}]);
    assert.equal(net.calls.length,1);
  }
});

test('Gemini applies the same citation and output checks as the other adapter',async()=>{
  const invalid=answer();invalid.insights[0].citations=[99];
  for(const value of [invalid,{...answer(),summary:'See https://invented.example'},{...answer(),summary:'<img src="x">'}]) {
    await assert.rejects(adapter.generateFreeAIAnalysis(report(),{provider:'gemini',apiKey:geminiKey,fetcher:network(geminiPayload(value)).fetcher}),code('FREE_AI_INVALID_RESPONSE'));
  }
});

test('Gemini thought parts are not rendered and omitted thought counts mean zero',async()=>{
  const value=geminiPayload();
  value.candidates[0].content.parts.unshift({text:'PRIVATE_THOUGHT',thought:true} as {text:string});
  const response={...value,usageMetadata:{promptTokenCount:900,candidatesTokenCount:450}}, usage:unknown[]=[];
  const result=await adapter.generateFreeAIAnalysis(report(),{provider:'gemini',apiKey:geminiKey,fetcher:network(response).fetcher,onUsage:value=>usage.push(value)});
  assert.ok(!JSON.stringify(result).includes('PRIVATE_THOUGHT'));
  assert.deepEqual(usage,[{inputTokens:900,outputTokens:450}]);
});

test('Gemini RetryInfo is bounded and cannot reveal upstream messages or trigger fallback',async()=>{
  for(const [delay,header,expected] of [['42.5s',undefined,43],['1s','120',120],['9999999s',undefined,86400],['not-a-duration',undefined,60]] as const){
    let calls=0;
    const fetcher=(async()=>{calls++;return Response.json({error:{message:'PRIVATE_PROVIDER_ERROR '+geminiKey,details:[{'@type':'type.googleapis.com/google.rpc.RetryInfo',retryDelay:delay}]}},{status:429,headers:header?{'Retry-After':header}:{}});}) as typeof fetch;
    await assert.rejects(adapter.generateFreeAIAnalysis(report(),{provider:'gemini',apiKey:geminiKey,fetcher}),(error:unknown)=>error instanceof adapter.FreeAIError && error.code==='FREE_AI_RATE_LIMIT' && error.retryAfterSeconds===expected && !error.message.includes('PRIVATE_') && !error.message.includes(geminiKey));
    assert.equal(calls,1);
  }
});

test('Gemini oversized errors remain rate limited, and HTTP/transport failures remain sanitized',async()=>{
  const fetcher=(async()=>new Response('x'.repeat(128001),{status:429})) as typeof fetch;
  await assert.rejects(adapter.generateFreeAIAnalysis(report(),{provider:'gemini',apiKey:geminiKey,fetcher}),code('FREE_AI_RATE_LIMIT'));
  for(const status of [400,401,403,302,503]){
    let calls=0;
    const request=(async()=>{calls++;return new Response(geminiKey,{status,headers:{Location:'https://api.openai.com/v1/responses'}});}) as typeof fetch;
    await assert.rejects(adapter.generateFreeAIAnalysis(report(),{provider:'gemini',apiKey:geminiKey,fetcher:request}),(error:unknown)=>error instanceof adapter.FreeAIError && error.code===([401,403].includes(status)?'FREE_AI_INVALID_KEY':'FREE_AI_UNAVAILABLE') && !error.message.includes(geminiKey));
    assert.equal(calls,1);
  }
});
