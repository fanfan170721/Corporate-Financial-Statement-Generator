import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { ApiError, apiHandler, assertSameOrigin, assertFinancialAnalysisScope, body, database, isAdmin, isAdminAccount, json, requireUser } from './server';
import { openCredential, sealCredential } from './credential-vault';
import { FREE_AI_MODELS, FreeAIError, generateFreeAIAnalysis } from './free-ai';
import { getRequestCountry } from './request-region';
import type { AIAnalysis, Report } from './types';

type FreeProvider = 'gemini' | 'groq';
const FREE_KEY_SCOPES = {gemini:'__gemini_free__',groq:'__groq_free__'} as const;
const FREE_PROVIDER_NAMES = {gemini:'Gemini',groq:'Groq'} as const;
const FREE_CONFIG_ID = 'free_ai';
const FREE_COOLDOWN = 'free-ai:provider-cooldown';
const FREE_LEGACY_COOLDOWN = 'free-ai:groq-cooldown';
const FREE_DAY = 86_400_000;
const FREE_RESERVATION = 8000;
const FREE_LIMITS = { dailyRequests: 3, globalDailyRequests: 20, cooldownSeconds: 60 };
const freeKeyPatterns = {gemini:/^(?:AIza[A-Za-z0-9_-]{30,252}|AQ\.[A-Za-z0-9_.-]{20,252})$/,groq:/^gsk_[A-Za-z0-9_-]{20,252}$/};
const freeKeySchema = z.object({provider:z.enum(['gemini','groq']).optional().default('gemini'),apiKey:z.string().trim().min(24).max(256),confirmedFreePlan:z.literal(true)}).strict().refine(input=>freeKeyPatterns[input.provider].test(input.apiKey),{path:['apiKey'],message:'Check the selected provider and API key.'});
type FreeKeyRow = { ciphertext: string; suffix: string; updated_at: string };
type FreeUsage = { requests: number; globalRequests: number; nextAllowed: number };

async function freeSavedKey(provider:FreeProvider): Promise<FreeKeyRow | null> {
  return database().prepare('SELECT ciphertext,suffix,updated_at FROM ai_credentials WHERE scope=?').bind(FREE_KEY_SCOPES[provider]).first<FreeKeyRow>();
}
async function freeConfig(): Promise<{provider:FreeProvider;enabled:boolean}> {
  const row = await database().prepare('SELECT payload FROM ai_config WHERE id=?').bind(FREE_CONFIG_ID).first<{payload:string}>();
  if(!row)return {provider:'gemini',enabled:false};
  try { const config=JSON.parse(row.payload);return {provider:config.provider==='gemini'?'gemini':'groq',enabled:config.enabled===true}; }
  catch { return {provider:'gemini',enabled:false}; }
}
async function freeReadableKey(provider:FreeProvider): Promise<string | undefined> {
  const row = await freeSavedKey(provider);
  if (!row) return;
  try {
    const key = await openCredential(row.ciphertext, FREE_KEY_SCOPES[provider], env.CREDENTIAL_ENCRYPTION_KEY || '');
    return freeKeyPatterns[provider].test(key) ? key : undefined;
  } catch { return; }
}
const FREE_GEMINI_RESTRICTED = new Set(['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IS','IE','IT','LV','LI','LT','LU','MT','NL','NO','PL','PT','RO','SK','SI','ES','SE','GB','CH']);
function freeRegion(provider:FreeProvider,request?:Request,declaredCountry?:'CA'|'US'):{regionEligible:boolean;regionReason:string|null;regionNeedsConfirmation:boolean} {
  if(provider==='groq')return {regionEligible:true,regionReason:null,regionNeedsConfirmation:false};
  // Runtime geolocation always takes priority over a location declaration.
  // Headers and browser locale are never treated as runtime geolocation.
  const country=getRequestCountry(request);
  if(typeof country!=='string'||!/^[A-Z]{2}$/.test(country)||country==='XX'){
    // The explicit declaration is used only when runtime geolocation is missing.
    // It is never stored or represented as a verified location.
    if(declaredCountry==='CA'||declaredCountry==='US')return {regionEligible:true,regionReason:null,regionNeedsConfirmation:false};
    return {regionEligible:false,regionReason:'Choose your current country to use Gemini free analysis. This declaration applies only to this request.',regionNeedsConfirmation:true};
  }
  if(FREE_GEMINI_RESTRICTED.has(country))return {regionEligible:false,regionReason:'Gemini free analysis is not available in the EEA, United Kingdom or Switzerland. Existing AI options remain available.',regionNeedsConfirmation:false};
  return {regionEligible:true,regionReason:null,regionNeedsConfirmation:false};
}
async function freeUsage(userId:string, now=Date.now()):Promise<FreeUsage> {
  const day = new Date(now).toISOString().slice(0,10);
  const row = await database().prepare(`SELECT
    (SELECT COUNT(*) FROM ai_usage WHERE budget_scope LIKE 'free:%' AND user_id=? AND quota_day=?) AS requests,
    (SELECT COUNT(*) FROM ai_usage WHERE budget_scope LIKE 'free:%' AND quota_day=?) AS globalRequests,
    MAX(COALESCE((SELECT MAX(created_at)+60000 FROM ai_usage WHERE budget_scope LIKE 'free:%'),0),
        COALESCE((SELECT MAX(expires_at) FROM ai_usage WHERE budget_scope LIKE 'free:%' AND state='reserved' AND expires_at>?),0),
        COALESCE((SELECT MAX(expires_at) FROM market_request_limits WHERE bucket IN (?,?)),0)) AS nextAllowed`).bind(userId,day,day,now,FREE_COOLDOWN,FREE_LEGACY_COOLDOWN).first<FreeUsage>();
  return row ?? {requests:0,globalRequests:0,nextAllowed:0};
}
export async function freeAIStatus(userId:string,request?:Request) {
  const {provider,enabled}=await freeConfig();
  const [key,usage,unlimited] = await Promise.all([freeReadableKey(provider),freeUsage(userId),isAdminAccount(userId)]);
  const region=freeRegion(provider,request);
  const configured = enabled && Boolean(key), now = Date.now();
  const capped = !unlimited && (usage.requests >= FREE_LIMITS.dailyRequests || usage.globalRequests >= FREE_LIMITS.globalDailyRequests);
  const retry = capped ? now-now%FREE_DAY+FREE_DAY : usage.nextAllowed;
  return {configured,canUse:configured&&region.regionEligible&&!capped&&usage.nextAllowed<=now,canUseWithRegionConfirmation:configured&&region.regionNeedsConfirmation&&!capped&&usage.nextAllowed<=now,unlimited,limits:{...FREE_LIMITS},usage:{requests:usage.requests,globalRequests:usage.globalRequests},retryAt:retry>now?new Date(retry).toISOString():null,provider:FREE_PROVIDER_NAMES[provider],providerId:provider,model:FREE_AI_MODELS[provider],...region};
}
export function handleFreeAIStatus(request:Request):Promise<Response> {
  return apiHandler(async()=>{
    if(request.method!=='GET')throw new ApiError(405,'METHOD_NOT_ALLOWED','This method is not supported.');
    const user=await requireUser();
    return json(await freeAIStatus(user.userId,request));
  });
}
async function freeAdmin() {
  const user = await requireUser();
  if(!isAdmin(user))throw new ApiError(403,'ADMIN_REQUIRED','Owner access is required.');
  return user;
}
async function freeAdminStatus() {
  const {provider,enabled}=await freeConfig();
  const [key,readable]=await Promise.all([freeSavedKey(provider),freeReadableKey(provider)]);
  return {configured:Boolean(readable),enabled,storageReady:/^[a-f0-9]{64}$/i.test(env.CREDENTIAL_ENCRYPTION_KEY||''),key:key?{suffix:key.suffix,updatedAt:key.updated_at}:null,provider:FREE_PROVIDER_NAMES[provider],providerId:provider,model:FREE_AI_MODELS[provider]};
}
async function verifyFreeKey(provider:FreeProvider,apiKey:string):Promise<void> {
  let response:Response;
  const url=provider==='gemini'?`https://generativelanguage.googleapis.com/v1beta/models/${FREE_AI_MODELS.gemini}`:'https://api.groq.com/openai/v1/models';
  const headers:Record<string,string>=provider==='gemini'?{'x-goog-api-key':apiKey,Accept:'application/json'}:{Authorization:`Bearer ${apiKey}`,Accept:'application/json'};
  try { response=await fetch(url,{headers,redirect:'manual',signal:AbortSignal.timeout(10_000)}); }
  catch { throw new ApiError(503,'FREE_AI_CONNECTION_FAILED','The free AI provider could not be reached. Your saved connection has not changed.'); }
  if(!response.ok || !response.body){await response.body?.cancel().catch(()=>undefined);throw new ApiError(response.status===401?400:503,'FREE_AI_KEY_REJECTED','The provider could not verify this key and model. Your saved connection has not changed.');}
  if(Number(response.headers.get('content-length')||0)>128_000){await response.body.cancel();throw new ApiError(503,'FREE_AI_CONNECTION_FAILED','The free AI provider could not be verified. Your saved connection has not changed.');}
  const reader=response.body.getReader();let size=0,text='';const decoder=new TextDecoder();
  try { while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>128_000)throw new Error('limit');text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode(); }
  catch { throw new ApiError(503,'FREE_AI_CONNECTION_FAILED','The free AI provider could not be verified. Your saved connection has not changed.'); }
  finally { await reader.cancel().catch(()=>undefined); }
  let supported=false;
  try { const data=JSON.parse(text);supported=provider==='gemini'?data.name===`models/${FREE_AI_MODELS.gemini}`&&Array.isArray(data.supportedGenerationMethods)&&data.supportedGenerationMethods.includes('generateContent'):Array.isArray(data.data)&&data.data.some((model:unknown)=>model!==null&&typeof model==='object'&&'id' in model&&model.id===FREE_AI_MODELS.groq); } catch { /* Fail closed without exposing provider content. */ }
  if(!supported)throw new ApiError(400,'FREE_AI_MODEL_UNAVAILABLE','This key does not provide access to the configured free AI model. Your saved connection has not changed.');
}
export function handleAdminFreeAI(request:Request):Promise<Response> {
  return apiHandler(async()=>{
    if(!['GET','PUT','PATCH','DELETE'].includes(request.method))throw new ApiError(405,'METHOD_NOT_ALLOWED','This method is not supported.');
    if(request.method!=='GET')assertSameOrigin(request);
    await freeAdmin();
    if(request.method==='PUT'){
      const input=await body(request,freeKeySchema);
      if(!/^[a-f0-9]{64}$/i.test(env.CREDENTIAL_ENCRYPTION_KEY||''))throw new ApiError(503,'VAULT_UNAVAILABLE','Secure key storage is not connected yet.');
      await verifyFreeKey(input.provider,input.apiKey);
      const ciphertext=await sealCredential(input.apiKey,FREE_KEY_SCOPES[input.provider],env.CREDENTIAL_ENCRYPTION_KEY!);
      await database().batch([
        database().prepare(`INSERT INTO ai_credentials(scope,ciphertext,suffix,updated_at) VALUES(?,?,?,?) ON CONFLICT(scope) DO UPDATE SET ciphertext=excluded.ciphertext,suffix=excluded.suffix,updated_at=excluded.updated_at`).bind(FREE_KEY_SCOPES[input.provider],ciphertext,input.apiKey.slice(-4),new Date().toISOString()),
        database().prepare('INSERT INTO ai_config(id,payload) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').bind(FREE_CONFIG_ID,JSON.stringify({enabled:true,provider:input.provider})),
      ]);
    } else if(request.method==='PATCH'){
      const input=await body(request,z.object({enabled:z.boolean()}).strict());
      const {provider}=await freeConfig();
      if(input.enabled&&!await freeReadableKey(provider))throw new ApiError(503,'FREE_AI_NOT_CONFIGURED','Connect a valid free-plan provider key first.');
      await database().prepare('INSERT INTO ai_config(id,payload) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').bind(FREE_CONFIG_ID,JSON.stringify({...input,provider})).run();
    } else if(request.method==='DELETE'){
      const {provider}=await freeConfig();
      await database().batch([
        database().prepare('DELETE FROM ai_credentials WHERE scope=?').bind(FREE_KEY_SCOPES[provider]),
        database().prepare('INSERT INTO ai_config(id,payload) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').bind(FREE_CONFIG_ID,JSON.stringify({enabled:false,provider})),
      ]);
    }
    return json(await freeAdminStatus());
  });
}

async function ownedFreeReport(userId:string,id:string):Promise<Report> {
  if(!id || id.length>100)throw new ApiError(404,'REPORT_NOT_FOUND','This report was not found.');
  const row=await database().prepare('SELECT payload FROM reports WHERE user_id=? AND id=?').bind(userId,id).first<{payload:string}>();
  if(!row)throw new ApiError(404,'REPORT_NOT_FOUND','This report was not found.');
  return JSON.parse(row.payload);
}
async function setFreeCooldown(seconds:number) {
  const until=Date.now()+Math.max(60,Number.isFinite(seconds)?seconds:60)*1000;
  await database().prepare(`INSERT INTO market_request_limits(bucket,count,expires_at) VALUES(?,1,?)
    ON CONFLICT(bucket) DO UPDATE SET expires_at=MAX(market_request_limits.expires_at,excluded.expires_at)`).bind(FREE_COOLDOWN,until).run();
}
export async function generateMeteredFreeAnalysis(userId:string,report:Report,locale:'en-CA'|'fr-CA'='en-CA',request?:Request,declaredCountry?:'CA'|'US'):Promise<AIAnalysis> {
  if(report.mode!=='live')throw new ApiError(400,'AI_REQUIRES_LIVE_DATA','Generate a live-data report before requesting AI analysis.');
  assertFinancialAnalysisScope(report);
  if(!report.periods?.length)throw new ApiError(400,'AI_REQUIRES_FINANCIAL_DATA','This report does not contain comparable financial figures.');
  const {provider,enabled}=await freeConfig();
  const [apiKey,unlimited]=await Promise.all([freeReadableKey(provider),isAdminAccount(userId)]);
  if(!enabled||!apiKey)throw new ApiError(503,'FREE_AI_NOT_CONFIGURED','Free AI is awaiting the site owner’s provider connection. Existing AI options remain available.');
  const region=freeRegion(provider,request,declaredCountry);
  if(!region.regionEligible)throw new ApiError(403,'FREE_AI_REGION_UNAVAILABLE',region.regionReason!);
  const now=Date.now(),day=new Date(now).toISOString().slice(0,10),scope=`free:${provider}:${userId}:${day}`,id=crypto.randomUUID();
  const admitted=await database().prepare(`INSERT INTO ai_usage(id,user_id,budget_scope,quota_day,sponsored,charged_tokens,input_tokens,output_tokens,state,expires_at,created_at)
    SELECT ?,?,?,?,0,?,0,0,'reserved',?,?
    WHERE (?=1 OR (SELECT COUNT(*) FROM ai_usage WHERE budget_scope LIKE 'free:%' AND user_id=? AND quota_day=?)<?)
      AND (?=1 OR (SELECT COUNT(*) FROM ai_usage WHERE budget_scope LIKE 'free:%' AND quota_day=?)<?)
      AND NOT EXISTS(SELECT 1 FROM ai_usage WHERE budget_scope LIKE 'free:%' AND ((state='reserved' AND expires_at>?) OR created_at>?))
      AND NOT EXISTS(SELECT 1 FROM ai_usage WHERE user_id=? AND state='reserved' AND expires_at>?)
      AND NOT EXISTS(SELECT 1 FROM market_request_limits WHERE bucket IN (?,?) AND expires_at>?) RETURNING id`)
    .bind(id,userId,scope,day,FREE_RESERVATION,now+120_000,now,unlimited?1:0,userId,day,FREE_LIMITS.dailyRequests,unlimited?1:0,day,FREE_LIMITS.globalDailyRequests,now,now-60_000,userId,now,FREE_COOLDOWN,FREE_LEGACY_COOLDOWN,now).first();
  if(!admitted)throw new ApiError(429,'FREE_AI_LIMIT','The free AI allowance is temporarily unavailable. Check the remaining allowance and try again later. No paid fallback was used.');
  let metered:{inputTokens:number;outputTokens:number}|null=null;
  try {
    return await generateFreeAIAnalysis(report,{provider,apiKey,locale,onUsage:value=>{metered=value;}});
  } catch(error) {
    if(error instanceof FreeAIError){
      if(error.retryAfterSeconds)await setFreeCooldown(error.retryAfterSeconds);
      throw error;
    }
    throw new ApiError(503,'FREE_AI_UNAVAILABLE','The free AI provider could not complete this analysis. No paid fallback was used.');
  } finally {
    const recorded=metered as {inputTokens:number;outputTokens:number}|null;
    await database().prepare('UPDATE ai_usage SET charged_tokens=?,input_tokens=?,output_tokens=?,state=? WHERE id=? AND user_id=?')
      .bind(recorded?recorded.inputTokens+recorded.outputTokens:FREE_RESERVATION,recorded?.inputTokens??0,recorded?.outputTokens??0,recorded?'settled':'unconfirmed',id,userId).run();
  }
}
export function handleReportFreeAI(request:Request,id:string):Promise<Response> {
  return apiHandler(async()=>{
    if(request.method!=='POST')throw new ApiError(405,'METHOD_NOT_ALLOWED','This method is not supported.');
    assertSameOrigin(request);
    const user=await requireUser();
    const input=await body(request,z.object({locale:z.enum(['en-CA','fr-CA']).optional().default('en-CA'),country:z.enum(['CA','US']).optional()}).strict());
    const report=await ownedFreeReport(user.userId,id);
    try {
      const freeAi=await generateMeteredFreeAnalysis(user.userId,report,input.locale,request,input.country);
      // Patch only this field, preserving any independent paid analysis update.
      const row=await database().prepare("UPDATE reports SET payload=json_set(payload,'$.freeAi',json(?)) WHERE user_id=? AND id=? RETURNING payload")
        .bind(JSON.stringify(freeAi),user.userId,id).first<{payload:string}>();
      if(!row)throw new ApiError(404,'REPORT_NOT_FOUND','This report was not found.');
      return json({report:JSON.parse(row.payload)});
    } catch(error) {
      if(error instanceof FreeAIError){
        const limited=Boolean(error.retryAfterSeconds);
        const response=json({code:limited?'FREE_AI_PROVIDER_LIMIT':'FREE_AI_UNAVAILABLE',error:limited?'The free AI provider has reached its temporary allowance. Please try again later. No paid fallback was used.':'The free AI provider could not complete a valid analysis. Your report and existing AI analysis are unchanged.'},limited?429:503);
        if(limited)response.headers.set('Retry-After',String(Math.max(1,Math.ceil(error.retryAfterSeconds!))));
        return response;
      }
      throw error;
    }
  });
}
