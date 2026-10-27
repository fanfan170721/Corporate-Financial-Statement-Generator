import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { ApiError, apiHandler, assertSameOrigin, body, database, isAdmin, json, requireUser } from './server';
import { hashAccessCode, newAccessCode, openCredential, sealCredential } from './credential-vault';
import { generateAIAnalysis } from './ai';
import type { AIAnalysis, Report } from './types';

const SPONSOR = '__site_sponsor__';
const RESERVATION = 20_000;
const DAY = 86_400_000;
type Config = { dailyTokens: number; dailyRequests: number; globalDailyTokens: number; globalDailyRequests: number };
const defaults: Config = { dailyTokens: 100_000, dailyRequests: 5, globalDailyTokens: 500_000, globalDailyRequests: 25 };
type KeyRow = { ciphertext: string; suffix: string; updated_at: string };
type Grant = { id: string; pass_id: string; expires_at: number; token_limit: number; request_limit: number };
const keySchema = z.object({ apiKey: z.string().trim().min(30).max(512).regex(/^sk-[A-Za-z0-9_-]+$/) }).strict();
const configSchema = z.object({ dailyTokens: z.number().int().min(20_000).max(1_000_000), dailyRequests: z.number().int().min(1).max(30), globalDailyTokens: z.number().int().min(20_000).max(5_000_000), globalDailyRequests: z.number().int().min(1).max(300) }).strict();

export async function aiConfig(): Promise<Config> {
  const row = await database().prepare("SELECT payload FROM ai_config WHERE id='limits'").first<{ payload: string }>();
  return row ? configSchema.parse(JSON.parse(row.payload)) : { ...defaults };
}
async function savedKey(scope: string) { return database().prepare('SELECT ciphertext,suffix,updated_at FROM ai_credentials WHERE scope=?').bind(scope).first<KeyRow>(); }
async function sponsorReady() { return Boolean(env.OPENAI_API_KEY || await savedKey(SPONSOR)); }
async function activeGrant(userId: string, now = Date.now()) {
  return database().prepare(`SELECT g.id,g.pass_id,g.expires_at,g.token_limit,g.request_limit FROM ai_grants g JOIN ai_passes p ON p.id=g.pass_id
    WHERE g.user_id=? AND g.expires_at>? AND p.revoked=0 ORDER BY g.expires_at DESC LIMIT 1`).bind(userId, now).first<Grant>();
}
async function usage(scope: string) {
  return await database().prepare('SELECT COALESCE(SUM(charged_tokens),0) AS tokens,COUNT(*) AS requests FROM ai_usage WHERE budget_scope=?').bind(scope).first<{ tokens: number; requests: number }>() ?? { tokens: 0, requests: 0 };
}
export async function aiStatus(userId: string) {
  const [own, grant, config, sponsored] = await Promise.all([savedKey(userId), activeGrant(userId), aiConfig(), sponsorReady()]);
  const mode = own ? 'personal' : grant && sponsored ? 'sponsored' : 'locked';
  const scope = own ? `personal:${userId}:${new Date().toISOString().slice(0, 10)}` : grant ? `grant:${grant.id}` : '';
  const spent = scope ? await usage(scope) : { tokens: 0, requests: 0 };
  return { mode, canUse: mode !== 'locked', storageReady: /^[a-f0-9]{64}$/i.test(env.CREDENTIAL_ENCRYPTION_KEY || ''), sponsorReady: sponsored,
    personalKey: own ? { suffix: own.suffix, updatedAt: own.updated_at } : null,
    passExpiresAt: grant ? new Date(grant.expires_at).toISOString() : null,
    limits: own || !grant ? { tokens: config.dailyTokens, requests: config.dailyRequests } : { tokens: grant.token_limit, requests: grant.request_limit },
    usage: spent, reservation: RESERVATION, resetsAt: own ? new Date(Date.now() - Date.now() % DAY + DAY).toISOString() : grant ? new Date(grant.expires_at).toISOString() : null };
}
async function storeKey(scope: string, key: string) {
  if (!env.CREDENTIAL_ENCRYPTION_KEY) throw new ApiError(503, 'VAULT_UNAVAILABLE', 'Secure key storage is not connected yet. Please contact the site owner.');
  const ciphertext = await sealCredential(key, scope, env.CREDENTIAL_ENCRYPTION_KEY);
  await database().prepare(`INSERT INTO ai_credentials (scope,ciphertext,suffix,updated_at) VALUES (?,?,?,?)
    ON CONFLICT(scope) DO UPDATE SET ciphertext=excluded.ciphertext,suffix=excluded.suffix,updated_at=excluded.updated_at`).bind(scope, ciphertext, key.slice(-4), new Date().toISOString()).run();
}
export function handleAISettings(request: Request) { return apiHandler(async () => {
  if (request.method !== 'GET') assertSameOrigin(request);
  const user = await requireUser();
  if (request.method === 'PUT') { const input = await body(request, keySchema); await storeKey(user.userId, input.apiKey); }
  if (request.method === 'DELETE') await database().prepare('DELETE FROM ai_credentials WHERE scope=?').bind(user.userId).run();
  return json(await aiStatus(user.userId));
}); }
export function handleRedeem(request: Request) { return apiHandler(async () => {
  assertSameOrigin(request); const user = await requireUser();
  const input = await body(request, z.object({ code: z.string().trim().min(10).max(100) }).strict());
  const now = Date.now(); const id = crypto.randomUUID();
  // Attempt ledger is durable and independent of whether a code is valid.
  const admitted = await database().prepare(`INSERT INTO ai_redemption_attempts (id,user_id,created_at) SELECT ?,?,?
    WHERE (SELECT COUNT(*) FROM ai_redemption_attempts WHERE user_id=? AND created_at>?)<10 RETURNING id`).bind(crypto.randomUUID(), user.userId, now, user.userId, now - 3_600_000).first();
  if (!admitted) throw new ApiError(429, 'CODE_RATE_LIMIT', 'Too many code attempts. Please try again in an hour.');
  if (await activeGrant(user.userId)) throw new ApiError(409, 'PASS_ACTIVE', 'Your current pass is still active. It does not need to be renewed.');
  if (!await sponsorReady()) throw new ApiError(503, 'SPONSOR_UNAVAILABLE', 'Sponsored AI is awaiting the site owner’s API connection. Your code has not been used.');
  const hash = await hashAccessCode(input.code);
  // One atomic INSERT and the database trigger enforce redemption capacity under races.
  const grant = await database().prepare(`INSERT INTO ai_grants (id,pass_id,user_id,expires_at,token_limit,request_limit,created_at)
    SELECT ?,p.id,?,?,p.token_limit,p.request_limit,? FROM ai_passes p
    WHERE p.code_hash=? AND p.revoked=0 AND p.redeem_before>? AND p.claims<p.max_claims
    AND NOT EXISTS (SELECT 1 FROM ai_grants WHERE user_id=? AND pass_id=p.id)
    AND NOT EXISTS (SELECT 1 FROM ai_grants g JOIN ai_passes ap ON ap.id=g.pass_id WHERE g.user_id=? AND g.expires_at>? AND ap.revoked=0)
    RETURNING id`).bind(id, user.userId, now + DAY, now, hash, now, user.userId, user.userId, now).first();
  if (!grant) throw new ApiError(400, 'INVALID_CODE', 'This code is invalid, expired, already used by your account, or fully claimed.');
  return json(await aiStatus(user.userId));
}); }
async function admin() { const user = await requireUser(); if (!isAdmin(user)) throw new ApiError(403, 'ADMIN_REQUIRED', 'Owner access is required.'); return user; }
export function handleAdminAI(request: Request) { return apiHandler(async () => {
  if (request.method !== 'GET') assertSameOrigin(request);
  await admin();
  if (request.method === 'PATCH') {
    const input = await body(request, configSchema);
    await database().prepare("INSERT INTO ai_config (id,payload) VALUES ('limits',?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload").bind(JSON.stringify(input)).run();
  }
  if (request.method === 'DELETE') {
    const { id } = await body(request, z.object({ id: z.string().uuid() }).strict());
    await database().prepare('UPDATE ai_passes SET revoked=1 WHERE id=?').bind(id).run();
  }
  let code: string | undefined;
  if (request.method === 'POST') {
    const input = await body(request, z.object({ label: z.string().trim().min(1).max(80), maxClaims: z.number().int().min(1).max(100), redeemDays: z.number().int().min(1).max(90) }).strict());
    if (!await sponsorReady()) throw new ApiError(503, 'SPONSOR_UNAVAILABLE', 'Connect the sponsored OpenAI API key before issuing passes.');
    const config = await aiConfig(); code = newAccessCode();
    await database().prepare('INSERT INTO ai_passes (id,code_hash,label,max_claims,claims,token_limit,request_limit,redeem_before,revoked,created_at) VALUES (?,?,?,?,0,?,?,?,0,?)')
      .bind(crypto.randomUUID(), await hashAccessCode(code), input.label, input.maxClaims, config.dailyTokens, config.dailyRequests, Date.now() + input.redeemDays * DAY, Date.now()).run();
  }
  const { results } = await database().prepare('SELECT id,label,max_claims,claims,token_limit,request_limit,redeem_before,revoked,created_at FROM ai_passes ORDER BY created_at DESC LIMIT 100').all();
  const key = await savedKey(SPONSOR);
  return json({ config: await aiConfig(), passes: results, code, sponsorReady: await sponsorReady(), key: key ? { suffix: key.suffix, updatedAt: key.updated_at } : null, environmentKey: Boolean(env.OPENAI_API_KEY) });
}); }
export function handleSponsorKey(request: Request) { return apiHandler(async () => {
  assertSameOrigin(request); await admin();
  if (request.method === 'DELETE') await database().prepare('DELETE FROM ai_credentials WHERE scope=?').bind(SPONSOR).run();
  else { const input = await body(request, keySchema); await storeKey(SPONSOR, input.apiKey); }
  return json({ saved: request.method !== 'DELETE' });
}); }

export async function generateMeteredAnalysis(userId: string, report: Report): Promise<AIAnalysis> {
  const now = Date.now(); const day = new Date(now).toISOString().slice(0, 10);
  const [own, grant, config] = await Promise.all([savedKey(userId), activeGrant(userId, now), aiConfig()]);
  if (!own && !grant) throw new ApiError(403, 'AI_ACCESS_REQUIRED', 'Add your own API key or redeem a 24-hour AI pass in AI access. All other tools remain available.');
  const sponsor = own ? null : await savedKey(SPONSOR);
  const scope = own ? `personal:${userId}:${day}` : `grant:${grant!.id}`;
  const keyRow = own || sponsor;
  const apiKey = keyRow ? await openCredential(keyRow.ciphertext, own ? userId : SPONSOR, env.CREDENTIAL_ENCRYPTION_KEY || '') : env.OPENAI_API_KEY;
  if (!apiKey) throw new ApiError(503, 'AI_UNAVAILABLE', 'The sponsored API connection is not available. You can use your own API key instead.');
  const tokenLimit = own ? config.dailyTokens : grant!.token_limit;
  const requestLimit = own ? config.dailyRequests : grant!.request_limit;
  const id = crypto.randomUUID();
  const row = await database().prepare(`INSERT INTO ai_usage (id,user_id,budget_scope,quota_day,sponsored,charged_tokens,input_tokens,output_tokens,state,expires_at,created_at)
    SELECT ?,?,?,?,?,?,0,0,'reserved',?,?
    WHERE (SELECT COUNT(*) FROM ai_usage WHERE user_id=? AND state='reserved' AND expires_at>?)=0
    AND (SELECT COUNT(*) FROM ai_usage WHERE budget_scope=?)<?
    AND COALESCE((SELECT SUM(charged_tokens) FROM ai_usage WHERE budget_scope=?),0)+?<=?
    AND (?=0 OR ((SELECT COUNT(*) FROM ai_usage WHERE sponsored=1 AND quota_day=?)<?
      AND COALESCE((SELECT SUM(charged_tokens) FROM ai_usage WHERE sponsored=1 AND quota_day=?),0)+?<=?))
    AND (?=0 OR EXISTS(SELECT 1 FROM ai_grants g JOIN ai_passes p ON p.id=g.pass_id WHERE g.id=? AND g.user_id=? AND g.expires_at>? AND p.revoked=0)) RETURNING id`)
    .bind(id, userId, scope, day, own ? 0 : 1, RESERVATION, now + 120_000, now, userId, now, scope, requestLimit, scope, RESERVATION, tokenLimit,
      own ? 0 : 1, day, config.globalDailyRequests, day, RESERVATION, config.globalDailyTokens, own ? 0 : 1, grant?.id ?? '', userId, now).first();
  if (!row) throw new ApiError(429, 'AI_LIMIT', 'An AI request is running, or the available token/request allowance has been reached. Check AI access for your limits.');
  let metered: { inputTokens: number; outputTokens: number } | null = null;
  try {
    return await generateAIAnalysis(report, { env: { OPENAI_API_KEY: apiKey, OPENAI_MODEL: env.OPENAI_MODEL }, onUsage: value => { metered = value; } });
  } finally {
    // Unknown/failed calls retain their reservation; crashing cannot reset allowance.
    const recorded = metered as { inputTokens: number; outputTokens: number } | null;
    await database().prepare('UPDATE ai_usage SET charged_tokens=?,input_tokens=?,output_tokens=?,state=? WHERE id=? AND user_id=?')
      .bind(recorded ? recorded.inputTokens + recorded.outputTokens : RESERVATION, recorded?.inputTokens ?? 0, recorded?.outputTokens ?? 0, recorded ? 'settled' : 'unconfirmed', id, userId).run();
  }
}
