import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import type { GuestEnvironment } from '../lib/guest-core';
import type { AuthUser } from '../lib/auth-core';
import type { Report, Viewer } from '../lib/types';

type GuestModule = typeof import('../lib/guest-core');
type ServerModule = typeof import('../lib/server') & typeof import('../lib/ai-access');
async function load(files: string[], injected: Record<string, unknown> = {}) {
  const key = `guestFixture${crypto.randomUUID().replaceAll('-', '')}`;
  const store = globalThis as unknown as Record<string, unknown>;
  store[key] = injected;
  const source = files.map(file => readFileSync(new URL(`../lib/${file}`, import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '')).join('\n');
  const code = `const {${Object.keys(injected).join(',')}}=globalThis[${JSON.stringify(key)}];\n${stripTypeScriptTypes(source, { mode: 'transform' })}`;
  const result = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  delete store[key];
  return result;
}
const guestModule = await load(['auth-crypto.ts', 'guest-core.ts']) as GuestModule;

async function fixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys=ON');
  for (const file of readdirSync(new URL('../drizzle/', import.meta.url)).filter(file => file.endsWith('.sql')).sort()) sql.exec(readFileSync(new URL(`../drizzle/${file}`, import.meta.url), 'utf8'));
  function statement(query: string, params: unknown[] = []) {
    const values = params as (string | number | null)[];
    return { bind: (...args: unknown[]) => statement(query, args), first: async () => sql.prepare(query).get(...values) ?? null, all: async () => ({ results: sql.prepare(query).all(...values) }), run: async () => sql.prepare(query).run(...values) };
  }
  const db = { prepare: statement, batch: async (items: ReturnType<typeof statement>[]) => {
    sql.exec('BEGIN');
    try { const results = []; for (const item of items) results.push(await item.run()); sql.exec('COMMIT'); return results; }
    catch (error) { sql.exec('ROLLBACK'); throw error; }
  } } as unknown as D1Database;
  const env: GuestEnvironment & Record<string, unknown> = { DB: db, AUTH_SECRET: 'test-secret-'.repeat(5), OPENAI_API_KEY: 'sk-test-sponsor-' + 'a'.repeat(40), SCHEDULER_ENABLED: 'true', CRON_SECRET: 'c'.repeat(32), ADMIN_EMAIL: 'owner@example.test', CREDENTIAL_ENCRYPTION_KEY: 'a'.repeat(64) };
  let time = Date.now();
  let user: AuthUser | null = null;
  let currentCookie = '';
  let providerCalls = 0;
  let aiCalls = 0;
  let providerFails = false;
  let providerGate: Promise<void> | null = null;
  const service = guestModule.createGuestService({ env, now: () => time, signedIn: async () => Boolean(user) });
  function request(path = '/api/guest/session', method = 'POST', input?: unknown, extra: { cookie?: string; ip?: string; origin?: string | null; base?: string; headers?: Record<string, string> } = {}) {
    const base = extra.base || 'https://finscope.test';
    return new Request(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(extra.origin === null ? {} : { Origin: extra.origin || base }), Cookie: extra.cookie ?? currentCookie, 'CF-Connecting-IP': extra.ip ?? '192.0.2.1', ...extra.headers }, ...(input === undefined ? {} : { body: JSON.stringify(input) }) });
  }
  const makeReport = (symbol: string, mode: 'live' | 'demo' = 'live'): Report => ({ id: 'provider-id', symbol, mode, company: { symbol, name: symbol, nameEn: symbol, exchange: 'NASDAQ', sector: 'Technology', color: '#123456', mark: symbol[0] }, generatedAt: new Date(time).toISOString(), dataAsOf: '2026-06-30', currency: 'USD', periods: [], metrics: { revenueGrowth: null, netMargin: null, freeCashFlow: null, debtToEquity: null, roe: null, cashRatio: null }, insights: [], sources: [], ai: { status: 'ready', summary: 'Must never enter guest evidence', insights: [], sources: [] } });
  const server = await load(['credential-vault.ts', 'market-storage.ts', 'server.ts', 'ai-access.ts'], {
    env, z, GuestError: guestModule.GuestError,
    getUser: async () => user,
    getGuest: () => service.getGuest(request()),
    guestUsage: service.usage, guestView: service.publicGuest, claimGuestJob: service.claim, releaseGuestJob: service.release,
    generateReport: async (symbol: string) => { providerCalls++; if (providerGate) await providerGate; if (providerFails) throw new Error('provider secret detail'); return makeReport(symbol); },
    getDemoReport: (symbol: string) => makeReport(symbol, 'demo'), searchCompanies: async () => [],
    getCaseStudy: (symbol: string) => symbol === 'MSFT' ? makeReport(symbol) : undefined,
    generateAIAnalysis: async () => { aiCalls++; return { status: 'ready', summary: 'unexpected', insights: [], sources: [] }; },
  }) as ServerModule;
  async function start(extra: Parameters<typeof request>[3] = {}) {
    const result = await service.handler(request('/api/guest/session', 'POST', undefined, extra));
    const body = await result.clone().json() as { guest: { id: string; expiresAt: string } };
    assert.equal(result.status, 200, JSON.stringify(body));
    const cookie = result.headers.get('Set-Cookie')?.split(';')[0] || extra.cookie || currentCookie;
    currentCookie = cookie;
    return { result, cookie, ...body.guest };
  }
  return { sql, env, service, server, request, start,
    setCookie: (value: string) => { currentCookie = value; }, setUser: (id: string | null) => { user = id ? { userId: id, displayName: id, email: `${id}@example.test`, emailVerified: true } : null; },
    advance: (ms: number) => { time += ms; }, now: () => time, failProvider: () => { providerFails = true; }, gateProvider: (value: Promise<void> | null) => { providerGate = value; },
    providerCalls: () => providerCalls, aiCalls: () => aiCalls, close: () => sql.close() };
}

test('guest sessions use opaque hashed tokens, secure cookies, expiry and revocation without creating accounts', async () => {
  const f = await fixture();
  try {
    const first = await f.start();
    const header = first.result.headers.get('Set-Cookie')!;
    assert.match(header, /^__Host-finscope_guest=[a-f0-9]{64};/);
    for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=86400']) assert.ok(header.includes(flag));
    const stored = f.sql.prepare('SELECT * FROM guest_sessions').get()!;
    assert.ok(!JSON.stringify(stored).includes(first.cookie.split('=')[1]));
    assert.ok(!JSON.stringify(stored).includes('192.0.2.1'));
    const retry = await f.start();
    assert.equal(retry.id, first.id);
    assert.equal(retry.expiresAt, first.expiresAt);
    assert.equal(retry.result.headers.get('Set-Cookie'), null);
    for (const table of ['profiles', 'auth_accounts', 'auth_sessions']) assert.equal(f.sql.prepare(`SELECT COUNT(*) n FROM ${table}`).get()!.n, 0);
    f.setCookie(first.cookie + '; ' + first.cookie);
    assert.equal(await f.service.getGuest(f.request()), null);
    f.setCookie('__Host-finscope_guest=' + 'f'.repeat(64));
    assert.equal(await f.service.getGuest(f.request()), null);
    f.setCookie(first.cookie);
    const deleted = await f.service.handler(f.request('/api/guest/session', 'DELETE'));
    assert.equal(deleted.status, 200);
    assert.match(deleted.headers.get('Set-Cookie')!, /Max-Age=0/);
    assert.equal(await f.service.getGuest(f.request()), null);
    const second = await f.start({ cookie: '' });
    assert.notEqual(second.id, first.id);
    f.advance(86_400_001);
    assert.equal(await f.service.getGuest(f.request()), null);
    assert.equal((await f.server.handleReports(f.request('/api/reports', 'GET'))).status, 401);
  } finally { f.close(); }
});

test('guest session admission requires same-origin HTTPS and cannot be bypassed by X-Forwarded-For or cookie churn', async () => {
  const f = await fixture();
  try {
    for (const origin of [null, 'https://attacker.test']) assert.equal((await f.service.handler(f.request(undefined, undefined, undefined, { origin }))).status, 403);
    assert.equal((await f.service.handler(f.request(undefined, undefined, undefined, { base: 'http://finscope.test' }))).status, 400);
    for (let n = 0; n < 4; n++) {
      await f.start({ cookie: '', headers: { 'X-Forwarded-For': `198.51.100.${n}` } });
      await f.service.handler(f.request('/api/guest/session', 'DELETE'));
    }
    assert.equal((await f.service.handler(f.request(undefined, undefined, undefined, { cookie: '', headers: { 'X-Forwarded-For': '203.0.113.10' } }))).status, 429);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM guest_sessions').get()!.n, 4);
    f.env.AUTH_ALLOW_LOCAL_HTTP = 'true';
    const local = await f.service.handler(f.request(undefined, undefined, undefined, { base: 'http://127.0.0.1:5173', cookie: '', ip: '192.0.2.2' }));
    assert.equal(local.status, 200);
    assert.match(local.headers.get('Set-Cookie')!, /^finscope_dev_guest=/);
    assert.equal((await f.service.handler(f.request(undefined, undefined, undefined, { base: 'http://other.test' }))).status, 400);
  } finally { f.close(); }
});

test('guest reports and case studies save and reopen only within their session with no AI payload', async () => {
  const f = await fixture();
  try {
    const alice = await f.start();
    const generated = await f.server.handleReports(f.request('/api/reports', 'POST', { symbols: ['MSFT'], mode: 'live' }));
    assert.equal(generated.status, 201);
    const report = (await generated.json() as { reports: Report[] }).reports[0];
    assert.equal(report.ai, undefined);
    assert.equal((await f.server.handleReport(report.id)).status, 200);
    const savedCase = await f.server.handleSaveCaseStudy(f.request('/api/case-studies/MSFT'), 'MSFT');
    assert.equal(savedCase.status, 201);
    assert.equal((await savedCase.json() as { report: Report }).report.ai, undefined);
    const own = await (await f.server.handleReports(f.request('/api/reports', 'GET'))).json() as { reports: Report[] };
    assert.equal(own.reports.length, 2);
    await f.start({ cookie: '', ip: '192.0.2.2' });
    assert.equal((await f.server.handleReport(report.id)).status, 404);
    assert.equal((await (await f.server.handleReports(f.request('/api/reports', 'GET'))).json() as { reports: Report[] }).reports.length, 0);
    f.setUser('member');
    assert.equal((await f.server.handleReport(report.id)).status, 404);
    f.setUser(null); f.setCookie(alice.cookie);
    assert.equal((await f.server.handleReport(report.id)).status, 200);
    f.advance(86_400_001);
    assert.equal((await f.server.handleReport(report.id)).status, 401);
    assert.equal(f.aiCalls(), 0);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM reports').get()!.n, 0);
  } finally { f.close(); }
});

test('crafted guest AI requests and every account-only service reject before provider or account work', async () => {
  const f = await fixture();
  try {
    await f.start();
    const denied = await f.server.handleReports(f.request('/api/reports', 'POST', { symbols: ['MSFT'], mode: 'live', ai: true }));
    assert.equal(denied.status, 403);
    assert.equal((await denied.json() as { code: string }).code, 'GUEST_AI_DISABLED');
    assert.equal(f.providerCalls(), 0);
    const caseResult = await f.server.handleSaveCaseStudy(f.request('/api/case-studies/MSFT'), 'MSFT');
    const id = (await caseResult.json() as { report: Report }).report.id;
    const routes = [
      f.server.handleReportAI(f.request(`/api/reports/${id}/ai`), id),
      f.server.handleAISettings(f.request('/api/ai/settings', 'GET')),
      f.server.handleAISettings(f.request('/api/ai/settings', 'PUT', { apiKey: 'sk-test-' + 'a'.repeat(40) })),
      f.server.handleRedeem(f.request('/api/ai/redeem', 'POST', { code: 'FS-invalid' })),
      f.server.handleAdmin(), f.server.handleAdminAI(f.request('/api/admin/ai', 'GET')),
      f.server.handleSponsorKey(f.request('/api/admin/ai/key', 'PUT', { apiKey: 'sk-test-' + 'a'.repeat(40) })),
      f.server.handleSchedule(f.request('/api/schedule', 'GET')),
      f.server.handleSchedule(f.request('/api/schedule', 'PUT', { symbols: ['MSFT'], enabled: true, time: '08:00', timezone: 'America/Toronto' })),
      f.server.handleFavorites(f.request('/api/favorites', 'GET')),
      f.server.handleMemos(f.request('/api/memos', 'GET')),
      f.server.handleScenarios(f.request('/api/scenarios', 'GET')),
      f.server.handlePreferences(f.request('/api/preferences', 'PATCH', { theme: 'dark' })),
      f.server.handleDailyJob(f.request('/api/jobs/daily')),
    ];
    for (const response of await Promise.all(routes)) assert.equal(response.status, 401);
    assert.equal(f.aiCalls(), 0); assert.equal(f.providerCalls(), 0);
    for (const table of ['profiles', 'auth_accounts', 'ai_usage', 'ai_credentials', 'schedules']) assert.equal(f.sql.prepare(`SELECT COUNT(*) n FROM ${table}`).get()!.n, 0);
    const viewer = await f.server.getViewer();
    assert.equal(viewer.user, null); assert.ok(viewer.guest); assert.equal(viewer.capabilities.ai, false); assert.equal(viewer.capabilities.scheduler, false); assert.equal(viewer.isAdmin, false); assert.equal(viewer.usage.limit, 3);
  } finally { f.close(); }
});

test('guest quotas are atomic, retain failures, and enforce a shared-IP rolling budget across sessions', async () => {
  const f = await fixture();
  try {
    await f.start();
    const actor = (await f.service.getGuest(f.request()))!;
    const admitted = await Promise.allSettled([f.service.claim(actor, 2), f.service.claim(actor, 2)]);
    assert.equal(admitted.filter(value => value.status === 'fulfilled').length, 1);
    for (const item of admitted) if (item.status === 'fulfilled') await f.service.release(actor, item.value);
    const last = await f.service.claim(actor, 1); await f.service.release(actor, last);
    await assert.rejects(f.service.claim(actor, 1), (error: unknown) => error instanceof guestModule.GuestError && error.status === 429);
    assert.deepEqual(await f.service.usage(actor), { used: 3, active: 0, limit: 3 });
    await f.service.handler(f.request('/api/guest/session', 'DELETE'));
    await f.start({ cookie: '' });
    const second = (await f.service.getGuest(f.request()))!;
    const secondJob = await f.service.claim(second, 3); await f.service.release(second, secondJob);
    await f.start({ cookie: '' });
    const third = (await f.service.getGuest(f.request()))!;
    await assert.rejects(f.service.claim(third, 1), (error: unknown) => error instanceof guestModule.GuestError && error.code === 'GUEST_LIMIT');
    await f.start({ cookie: '', ip: '192.0.2.2' });
    f.failProvider();
    const failed = await f.server.handleReports(f.request('/api/reports', 'POST', { symbols: ['MSFT'], mode: 'live' }));
    assert.equal(failed.status, 502);
    assert.ok(!(await failed.text()).includes('provider secret detail'));
    assert.deepEqual((await f.server.getViewer()).usage, { used: 1, active: 0, limit: 3 });
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM guest_reports').get()!.n, 0);
  } finally { f.close(); }
});

test('signed-in identity takes precedence without merging guest archives and retains normal schedules', async () => {
  const f = await fixture();
  try {
    const guest = await f.start();
    const response = await f.server.handleSaveCaseStudy(f.request('/api/case-studies/MSFT'), 'MSFT');
    const id = (await response.json() as { report: Report }).report.id;
    f.setUser('member');
    const viewer = await f.server.getViewer() as Viewer;
    assert.equal(viewer.user?.id, 'member'); assert.equal(viewer.guest, null); assert.equal(viewer.usage.limit, 18); assert.equal(viewer.capabilities.scheduler, true);
    assert.equal((await f.service.handler(f.request())).status, 409);
    assert.equal((await f.server.handleReport(id)).status, 404);
    const schedule = await f.server.handleSchedule(f.request('/api/schedule', 'PUT', { symbols: ['MSFT'], time: '08:00', timezone: 'America/Toronto', enabled: true }));
    assert.equal(schedule.status, 200);
    assert.equal(f.sql.prepare("SELECT enabled FROM schedules WHERE user_id='member'").get()!.enabled, 1);
    f.setUser(null); f.setCookie(guest.cookie);
    assert.equal((await f.server.handleReport(id)).status, 200);
    assert.equal((await f.server.handleSchedule(f.request('/api/schedule', 'GET'))).status, 401);
  } finally { f.close(); }
});

test('expired guest leases release concurrency but not spent credits, and global budget cannot be bypassed', async () => {
  const f = await fixture();
  try {
    await f.start();
    const actor = (await f.service.getGuest(f.request()))!;
    await f.service.claim(actor, 1);
    f.advance(600_001);
    const next = await f.service.claim(actor, 1); await f.service.release(actor, next);
    assert.equal((await f.service.usage(actor)).used, 2);
    for (let n = 0; n < 66; n++) {
      const id = crypto.randomUUID();
      f.sql.prepare('INSERT INTO guest_sessions(id,token_hash,ip_hash,expires_at,created_at) VALUES(?,?,?,?,?)').run(id, 'fixture-token-' + n, 'fixture-ip-' + n, f.now() + 86_400_000, f.now());
      f.sql.prepare("INSERT INTO guest_report_jobs(id,session_id,ip_hash,units,state,expires_at,created_at) VALUES(?,?,?,3,'released',?,?)").run(crypto.randomUUID(), id, 'fixture-ip-' + n, f.now(), f.now());
    }
    await assert.rejects(f.service.claim(actor, 1), (error: unknown) => error instanceof guestModule.GuestError && error.status === 429);
    assert.equal(f.providerCalls(), 0);
  } finally { f.close(); }
});

test('bounded cleanup removes only expired guest payloads and preserves account data and rolling quota ledgers', async () => {
  const f = await fixture();
  try {
    const expired = await f.start();
    const actor = (await f.service.getGuest(f.request()))!;
    await f.service.claim(actor, 3);
    // An imported/backlogged session may contain more than today's three-report limit.
    for (let n = 0; n < 55; n++) f.sql.prepare('INSERT INTO guest_reports(id,session_id,symbol,mode,payload,created_at) VALUES(?,?,?,?,?,?)').run('expired-' + n, expired.id, 'MSFT', 'live', '{}', new Date(f.now()).toISOString());
    const active = await f.start({ cookie: '', ip: '192.0.2.2' });
    const saved = await f.server.handleSaveCaseStudy(f.request('/api/case-studies/MSFT'), 'MSFT');
    const activeReport = (await saved.json() as { report: Report }).report.id;
    f.setUser('member');
    await f.server.handleSaveCaseStudy(f.request('/api/case-studies/MSFT'), 'MSFT');
    f.setUser(null);
    f.sql.prepare('UPDATE guest_sessions SET expires_at=? WHERE id=?').run(f.now() - 1, expired.id);
    await f.start({ cookie: active.cookie });
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM guest_reports WHERE session_id=?').get(expired.id)!.n, 5);
    assert.equal((await f.server.handleReport(activeReport)).status, 200);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM reports').get()!.n, 1);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM profiles').get()!.n, 1);
    assert.equal(f.sql.prepare('SELECT SUM(units) n FROM guest_report_jobs WHERE session_id=?').get(expired.id)!.n, 3);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM guest_sessions').get()!.n, 2);
    await f.start({ cookie: active.cookie });
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM guest_reports WHERE session_id=?').get(expired.id)!.n, 0);
    await f.service.handler(f.request('/api/guest/session', 'DELETE'));
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM guest_reports WHERE session_id=?').get(active.id)!.n, 0);
    assert.equal(f.sql.prepare('SELECT SUM(units) n FROM guest_report_jobs').get()!.n, 4);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM reports').get()!.n, 1);
  } finally { f.close(); }
});
