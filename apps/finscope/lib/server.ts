import { env } from "cloudflare:workers";
import { z } from "zod";
import { getUser, type AuthUser } from "@/lib/auth";
import { generateReport, getDemoReport, searchCompanies } from "@/lib/market";
import { aiStatus, generateMeteredAnalysis, sponsorReady } from "@/lib/ai-access";
import { getCaseStudy } from "@/lib/case-studies";
import type { Preferences, Report, Schedule, Viewer } from "@/lib/types";

export const DAILY_LIMIT = 18;
export const CONCURRENT_LIMIT = 3;
export function isAdmin(user: AuthUser | null): boolean {
  if (!user?.emailVerified) return false;
  return Boolean((env.ADMIN_USER_ID && user.userId === env.ADMIN_USER_ID) || (env.ADMIN_EMAIL && user.email.toLowerCase() === env.ADMIN_EMAIL.trim().toLowerCase()));
}
const LEASE_MS = 10 * 60_000;
const DEFAULT_PREFERENCES: Preferences = { theme: "light", interests: [], defaultMode: "live", reducedMotion: false };
const DEFAULT_SCHEDULE: Schedule = { symbols: [], time: "08:00", timezone: "America/Toronto", enabled: false, lastRun: null };
const symbolSchema = z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9.^-]+$/).transform((value) => value.toUpperCase());
const symbolsSchema = z.array(symbolSchema).max(3).refine((items) => new Set(items).size === items.length, "Choose each company only once.");
const preferencesSchema = z.object({
  theme: z.enum(["light", "dark", "system"]).optional(),
  interests: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  defaultMode: z.enum(["live", "demo"]).optional(),
  reducedMotion: z.boolean().optional(),
}).strict();

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

export function database(): D1Database {
  if (!env.DB) throw new ApiError(503, "DATABASE_UNAVAILABLE", "Account storage is temporarily unavailable. Please try again shortly.");
  return env.DB;
}

function providerEnv(): Record<string, string | undefined> {
  return { OPENAI_API_KEY: env.OPENAI_API_KEY, OPENAI_MODEL: env.OPENAI_MODEL, FMP_API_KEY: env.FMP_API_KEY, SEC_USER_AGENT: env.SEC_USER_AGENT };
}

export function capabilities(): Viewer["capabilities"] {
  const broadCoverage = Boolean((env.SEC_USER_AGENT && /[^\s@]+@[^\s@]+\.[^\s@]+/.test(env.SEC_USER_AGENT)) || env.FMP_API_KEY?.trim());
  const directIssuers = ["MSFT"];
  const liveData = directIssuers.length > 0 || broadCoverage;
  return { liveData, broadCoverage, directIssuers, ai: Boolean(env.OPENAI_API_KEY?.trim()), scheduler: env.SCHEDULER_ENABLED === "true" && Boolean(env.CRON_SECRET && env.CRON_SECRET.length >= 32) && liveData };
}

export function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

export async function apiHandler(work: () => Promise<Response>): Promise<Response> {
  try { return await work(); }
  catch (error) {
    if (error instanceof ApiError) return json({ error: error.message, code: error.code }, error.status);
    if (error instanceof z.ZodError) return json({ error: "Please check the highlighted fields and try again.", code: "INVALID_INPUT", fields: error.issues.map((issue) => issue.path.join(".")) }, 400);
    if (error instanceof Error && error.name === "MarketDataError" && "code" in error) {
      const safeMessages: Record<string, string> = {
        NO_DATA: "Comparable annual financials are unavailable for this company. Check the data provider or select another issuer. No substitute figures were generated.",
        DATA_COVERAGE_UNAVAILABLE: "Direct financial-statement retrieval supports Microsoft (MSFT). Other issuers require configured SEC access or a financial-data provider.",
        ISSUER_UNAVAILABLE: "Microsoft's official financial statements could not be retrieved. Please retry shortly. No older or synthetic figures were substituted.",
        ISSUER_FORMAT_CHANGED: "The issuer changed its published statement format. Extraction stopped to avoid reporting incorrect financial figures.",
        ISSUER_INCOMPLETE: "The official statements did not provide the required five-year financial comparison. No estimated values were inserted.",
        ISSUER_RECONCILIATION: "The retrieved balance sheet did not reconcile. Report generation stopped so the source can be checked.",
        PROVIDER_UNAVAILABLE: "The financial-data provider is unavailable. Please retry shortly. No substitute financial figures were generated.",
        SERVER_ONLY: "Financial retrieval could not run in the server environment. Please contact the workspace administrator.",
        UNKNOWN_SYMBOL: "Company not found. Search again and check the exchange and ticker.",
        INVALID_SYMBOL: "The ticker is invalid. Please select a company from search.",
        INVALID_CURRENCY: "The reporting currency could not be verified. No report has been generated.",
        RATE_LIMITED: "The data provider is temporarily limiting requests. Please try again shortly.",
      };
      const code = String(error.code);
      if (safeMessages[code]) return json({ error: safeMessages[code], code }, 422);
    }
    // Provider exceptions can contain credential-bearing URLs. Never return or log them.
    return json({ error: "This request could not be completed. Please try again shortly.", code: "REQUEST_FAILED" }, 502);
  }
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("Origin");
  const fetchSite = request.headers.get("Sec-Fetch-Site");
  if (!origin || origin !== new URL(request.url).origin || (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none")) {
    throw new ApiError(403, "ORIGIN_REJECTED", "Please submit this request from Finscope.");
  }
}

export async function body<T extends z.ZodTypeAny>(request: Request, schema: T): Promise<z.infer<T>> {
  if (!request.headers.get("Content-Type")?.toLowerCase().includes("application/json")) throw new ApiError(415, "JSON_REQUIRED", "This endpoint requires a JSON request.");
  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > 16_384) throw new ApiError(413, "BODY_TOO_LARGE", "This submission is too large. Please shorten the content.");
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "INVALID_JSON", "The request body could not be read.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 16_384) { await reader.cancel(); throw new ApiError(413, "BODY_TOO_LARGE", "This submission is too large. Please shorten the content."); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const raw = new TextDecoder().decode(bytes);
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new ApiError(400, "INVALID_JSON", "The request body could not be read."); }
  return schema.parse(parsed);
}

async function ensureProfile(user: AuthUser): Promise<void> {
  const now = new Date().toISOString();
  await database().prepare(`INSERT INTO profiles (user_id,name,email,preferences,created_at,updated_at) VALUES (?,?,?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET name=excluded.name,email=excluded.email`).bind(user.userId, user.displayName, user.email, JSON.stringify(DEFAULT_PREFERENCES), now, now).run();
}

export async function requireUser(): Promise<AuthUser> {
  const user = await getUser();
  if (!user) throw new ApiError(401, "SIGN_IN_REQUIRED", "Sign in to generate reports and save your research.");
  await ensureProfile(user);
  return user;
}

async function getPreferences(userId: string): Promise<Preferences> {
  const row = await database().prepare("SELECT preferences FROM profiles WHERE user_id=?").bind(userId).first<{ preferences: string }>();
  return row ? { ...DEFAULT_PREFERENCES, ...JSON.parse(row.preferences) } : { ...DEFAULT_PREFERENCES };
}

async function getFavorites(userId: string): Promise<string[]> {
  const { results } = await database().prepare("SELECT symbol FROM favorites WHERE user_id=? ORDER BY created_at DESC").bind(userId).all<{ symbol: string }>();
  return results.map((row) => row.symbol);
}

type ScheduleRow = { user_id: string; symbols: string; time: string; timezone: string; enabled: number; last_run: string | null };
function deserializeSchedule(row: ScheduleRow): Schedule {
  return { symbols: JSON.parse(row.symbols), time: row.time, timezone: row.timezone, enabled: Boolean(row.enabled), lastRun: row.last_run };
}
async function getSchedule(userId: string): Promise<Schedule> {
  const row = await database().prepare("SELECT * FROM schedules WHERE user_id=?").bind(userId).first<ScheduleRow>();
  return row ? deserializeSchedule(row) : { ...DEFAULT_SCHEDULE };
}

export async function getUsage(userId: string, now = new Date()): Promise<Viewer["usage"]> {
  const row = await database().prepare(`SELECT COALESCE(SUM(CASE WHEN quota_day=? THEN cost ELSE 0 END),0) AS used,
    COALESCE(SUM(CASE WHEN state='active' AND expires_at>? THEN units ELSE 0 END),0) AS active
    FROM report_jobs WHERE user_id=? AND (quota_day=? OR (state='active' AND expires_at>?))`).bind(now.toISOString().slice(0, 10), now.getTime(), userId, now.toISOString().slice(0, 10), now.getTime()).first<{ used: number; active: number }>();
  return { used: row?.used ?? 0, active: row?.active ?? 0, limit: DAILY_LIMIT };
}

export async function getViewer(): Promise<Viewer> {
  const user = await getUser();
  const common = { capabilities: capabilities(), isAdmin: isAdmin(user) };
  if (!user) return { ...common, user: null, preferences: { ...DEFAULT_PREFERENCES }, favorites: [], schedule: { ...DEFAULT_SCHEDULE }, usage: { used: 0, active: 0, limit: DAILY_LIMIT } };
  await ensureProfile(user);
  const [preferences, favorites, schedule, usage] = await Promise.all([getPreferences(user.userId), getFavorites(user.userId), getSchedule(user.userId), getUsage(user.userId)]);
  const access = await aiStatus(user.userId);
  return { ...common, capabilities: { ...common.capabilities, ai: access.canUse }, user: { id: user.userId, name: user.displayName, email: user.email }, preferences, favorites, schedule, usage };
}

export function handleMe(): Promise<Response> { return apiHandler(async () => json(await getViewer())); }

export function handlePreferences(request: Request): Promise<Response> {
  return apiHandler(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const patch = await body(request, preferencesSchema);
    // SQLite json_patch prevents independent preference updates from overwriting one another.
    const row = await database().prepare("UPDATE profiles SET preferences=json_patch(preferences,?),updated_at=? WHERE user_id=? RETURNING preferences").bind(JSON.stringify(patch), new Date().toISOString(), user.userId).first<{ preferences: string }>();
    return json({ preferences: JSON.parse(row!.preferences) });
  });
}

export function handleFavorites(request: Request): Promise<Response> {
  return apiHandler(async () => {
    if (request.method !== "GET") assertSameOrigin(request);
    const user = await requireUser();
    if (request.method === "GET") return json({ favorites: await getFavorites(user.userId) });
    const { symbol } = await body(request, z.object({ symbol: symbolSchema }).strict());
    if (request.method === "DELETE") {
      await database().prepare("DELETE FROM favorites WHERE user_id=? AND symbol=?").bind(user.userId, symbol).run();
    } else {
      await database().prepare(`INSERT OR IGNORE INTO favorites (user_id,symbol,created_at)
        SELECT ?,?,? WHERE (SELECT COUNT(*) FROM favorites WHERE user_id=?)<50`).bind(user.userId, symbol, new Date().toISOString(), user.userId).run();
      const exists = await database().prepare("SELECT symbol FROM favorites WHERE user_id=? AND symbol=?").bind(user.userId, symbol).first();
      if (!exists) throw new ApiError(409, "FAVORITES_LIMIT", "Your watchlist can hold 50 companies. Remove one before adding another.");
    }
    return json({ favorites: await getFavorites(user.userId) });
  });
}

export async function claimJob(userId: string, units: number, cost: number, kind: string, now = new Date()): Promise<string> {
  if (!Number.isInteger(units) || units < 1 || units > CONCURRENT_LIMIT || !Number.isInteger(cost) || cost < units || cost > 6) throw new ApiError(400, "INVALID_JOB", "The number of requested jobs is invalid.");
  const id = crypto.randomUUID();
  const day = now.toISOString().slice(0, 10);
  // D1 executes this statement atomically. A separate count followed by insert would race.
  const row = await database().prepare(`INSERT INTO report_jobs (id,user_id,units,cost,kind,quota_day,state,expires_at,created_at)
    SELECT ?,?,?,?,?,?,'active',?,?
    WHERE COALESCE((SELECT SUM(units) FROM report_jobs WHERE user_id=? AND state='active' AND expires_at>?),0)+?<=?
    AND COALESCE((SELECT SUM(cost) FROM report_jobs WHERE user_id=? AND quota_day=?),0)+?<=?
    RETURNING id`).bind(id, userId, units, cost, kind, day, now.getTime() + LEASE_MS, now.toISOString(), userId, now.getTime(), units, CONCURRENT_LIMIT, userId, day, cost, DAILY_LIMIT).first<{ id: string }>();
  if (row) return row.id;
  const usage = await getUsage(userId, now);
  if (usage.used + cost > DAILY_LIMIT) throw new ApiError(429, "DAILY_LIMIT", "Your daily research allowance has been used. It resets at midnight UTC.");
  throw new ApiError(429, "CONCURRENT_LIMIT", "You can research up to three companies at a time. Wait for the current jobs to finish.");
}

export async function releaseJob(userId: string, id: string): Promise<void> {
  await database().prepare("UPDATE report_jobs SET state='released' WHERE user_id=? AND id=?").bind(userId, id).run();
}

async function recordActivity(userId: string, action: string, symbols: string[]): Promise<void> {
  await database().prepare("INSERT INTO activity (id,user_id,action,symbols,created_at) VALUES (?,?,?,?,?)").bind(crypto.randomUUID(), userId, action, JSON.stringify(symbols), new Date().toISOString()).run();
}

async function createReports(userId: string, symbols: string[], mode: "demo" | "live", ai: boolean): Promise<Report[]> {
  const available = capabilities();
  if (mode === "live" && !available.broadCoverage && symbols.some((symbol) => !available.directIssuers?.includes(symbol))) throw new ApiError(503, "DATA_COVERAGE_UNAVAILABLE", "Direct financial-statement retrieval currently supports Microsoft (MSFT). Other companies require a configured SEC or financial-data provider. No synthetic figures will be substituted.");
  if (ai && !(await aiStatus(userId)).canUse) throw new ApiError(403, "AI_ACCESS_REQUIRED", "Add an API key or activate a 24-hour pass in AI access first.");
  if (ai && mode === "demo") throw new ApiError(400, "AI_REQUIRES_LIVE_DATA", "AI research requires verified public financials. Generate a live-data report first.");
  const lease = await claimJob(userId, symbols.length, symbols.length * (ai ? 2 : 1), ai ? "report_ai" : "report");
  try {
    const settled = await Promise.allSettled(symbols.map(async (symbol) => {
      const base = mode === "demo" ? getDemoReport(symbol) : await generateReport(symbol, { allowDemoFallback: false, env: providerEnv() });
      const report: Report = { ...base, id: crypto.randomUUID(), generatedAt: new Date().toISOString() };
      return report;
    }));
    // Await every provider before releasing the shared lease, including on partial failures.
    const failure = settled.find((result) => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
    const generated = settled.map((result) => (result as PromiseFulfilledResult<Report>).value);
    // Save financial evidence first. An optional AI failure must never discard usable statements.
    await database().batch(generated.map((report) => database().prepare("INSERT INTO reports (id,user_id,symbol,mode,payload,created_at) VALUES (?,?,?,?,?,?)").bind(report.id, userId, report.symbol, report.mode, JSON.stringify(report), report.generatedAt)));
    if (ai) for (const report of generated) {
      try { report.ai = await generateMeteredAnalysis(userId, report); }
      catch (error) { report.ai = { status: "unavailable", summary: error instanceof ApiError ? error.message : "AI analysis could not be completed. Your financial report has been saved.", insights: [], sources: [] }; }
      await database().prepare("UPDATE reports SET payload=? WHERE user_id=? AND id=?").bind(JSON.stringify(report), userId, report.id).run();
    }
    await recordActivity(userId, "research", symbols);
    return generated;
  } finally { await releaseJob(userId, lease); }
}

export function handleReports(request: Request): Promise<Response> {
  return apiHandler(async () => {
    if (request.method !== "GET") assertSameOrigin(request);
    const user = await requireUser();
    if (request.method === "GET") {
      const params = new URL(request.url).searchParams;
      const before = params.get("before");
      const limit = z.coerce.number().int().min(1).max(100).parse(params.get("limit") || 50);
      if (before && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\|[a-f0-9-]{36}$/.test(before)) throw new ApiError(400, "INVALID_CURSOR", "The pagination cursor is invalid.");
      const [beforeDate, beforeId] = before?.split("|") || [];
      const query = before ? database().prepare("SELECT id,payload,created_at FROM reports WHERE user_id=? AND (created_at<? OR (created_at=? AND id<?)) ORDER BY created_at DESC,id DESC LIMIT ?").bind(user.userId, beforeDate, beforeDate, beforeId, limit + 1)
        : database().prepare("SELECT id,payload,created_at FROM reports WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT ?").bind(user.userId, limit + 1);
      const { results } = await query.all<{ id: string; payload: string; created_at: string }>();
      const tail = results[limit - 1];
      return json({ reports: results.slice(0, limit).map((row) => JSON.parse(row.payload)), hasMore: results.length > limit, nextCursor: results.length > limit ? `${tail.created_at}|${tail.id}` : null });
    }
    const input = await body(request, z.object({ symbols: symbolsSchema.refine((items) => items.length > 0), mode: z.enum(["demo", "live"]), ai: z.boolean().optional().default(false) }).strict());
    return json({ reports: await createReports(user.userId, input.symbols, input.mode, input.ai) }, 201);
  });
}

export function handleSaveCaseStudy(request: Request, symbol: string): Promise<Response> {
  return apiHandler(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const base = getCaseStudy(symbolSchema.parse(symbol));
    if (!base) throw new ApiError(404, "CASE_NOT_FOUND", "This published case study was not found.");
    // Financial evidence is copied exclusively from the server's curated case.
    // generatedAt records the save time; dataAsOf and the frozen-source note remain intact.
    const lease = await claimJob(user.userId, 1, 1, "case_study");
    try {
      const report: Report = { ...structuredClone(base), id: crypto.randomUUID(), generatedAt: new Date().toISOString() };
      await database().prepare("INSERT INTO reports (id,user_id,symbol,mode,payload,created_at) VALUES (?,?,?,?,?,?)").bind(report.id, user.userId, report.symbol, report.mode, JSON.stringify(report), report.generatedAt).run();
      await recordActivity(user.userId, "save_case_study", [report.symbol]);
      return json({ report }, 201);
    } finally { await releaseJob(user.userId, lease); }
  });
}

async function ownedReport(userId: string, id: string): Promise<Report> {
  if (id.length > 100) throw new ApiError(404, "REPORT_NOT_FOUND", "This report was not found.");
  const row = await database().prepare("SELECT payload FROM reports WHERE user_id=? AND id=?").bind(userId, id).first<{ payload: string }>();
  if (!row) throw new ApiError(404, "REPORT_NOT_FOUND", "This report was not found.");
  return JSON.parse(row.payload);
}

export function handleReport(id: string): Promise<Response> {
  return apiHandler(async () => { const user = await requireUser(); return json({ report: await ownedReport(user.userId, id) }); });
}

export function handleReportAI(request: Request, id: string): Promise<Response> {
  return apiHandler(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const report = await ownedReport(user.userId, id);
    if (report.mode !== "live") throw new ApiError(400, "AI_REQUIRES_LIVE_DATA", "AI research requires verified public financials. Generate a live-data report first.");
    const lease = await claimJob(user.userId, 1, 1, "ai");
    try {
      const updated = { ...report, ai: await generateMeteredAnalysis(user.userId, report) };
      await database().prepare("UPDATE reports SET payload=? WHERE user_id=? AND id=?").bind(JSON.stringify(updated), user.userId, id).run();
      await recordActivity(user.userId, "ai_analysis", [report.symbol]);
      return json({ report: updated });
    } finally { await releaseJob(user.userId, lease); }
  });
}

export function handleCompanies(request: Request): Promise<Response> {
  return apiHandler(async () => {
    const query = z.string().max(80).parse(new URL(request.url).searchParams.get("q") || "");
    const user = await getUser();
    const live = capabilities().liveData && Boolean(user);
    if (live && user && query.trim()) {
      await ensureProfile(user);
      const now = new Date();
      const day = now.toISOString().slice(0, 10);
      // Search has its own zero-credit rate ledger, protecting paid provider autocomplete.
      const admitted = await database().prepare(`INSERT INTO report_jobs (id,user_id,units,cost,kind,quota_day,state,expires_at,created_at)
        SELECT ?,?,0,0,'search',?,'released',?,?
        WHERE (SELECT COUNT(*) FROM report_jobs WHERE user_id=? AND kind='search' AND quota_day=? AND created_at>?)<30
        AND (SELECT COUNT(*) FROM report_jobs WHERE user_id=? AND kind='search' AND quota_day=?)<300 RETURNING id`).bind(crypto.randomUUID(), user.userId, day, now.getTime(), now.toISOString(), user.userId, day, new Date(now.getTime() - 60_000).toISOString(), user.userId, day).first();
      if (!admitted) throw new ApiError(429, "SEARCH_RATE_LIMIT", "Please slow down your searches. Live company lookup is limited to 30 requests per minute and 300 per day.");
    }
    const companies = await searchCompanies(query, { limit: 12, live, env: providerEnv() });
    return json({ companies });
  });
}

export function validTimezone(value: string): boolean {
  try { new Intl.DateTimeFormat("en", { timeZone: value }).format(); return true; } catch { return false; }
}

export function handleSchedule(request: Request): Promise<Response> {
  return apiHandler(async () => {
    if (request.method !== "GET") assertSameOrigin(request);
    const user = await requireUser();
    if (request.method === "GET") return json({ schedule: await getSchedule(user.userId), available: capabilities().scheduler });
    const input = await body(request, z.object({ symbols: symbolsSchema, time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/), timezone: z.string().min(1).max(100).refine(validTimezone), enabled: z.boolean() }).strict());
    if (input.enabled && !input.symbols.length) throw new ApiError(400, "SCHEDULE_EMPTY", "Choose at least one company first.");
    if (input.enabled && !capabilities().scheduler) throw new ApiError(503, "SCHEDULER_UNAVAILABLE", "Scheduled delivery is not configured yet. You can save a disabled schedule as a draft.");
    await database().prepare(`INSERT INTO schedules (user_id,symbols,time,timezone,enabled,updated_at) VALUES (?,?,?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET symbols=excluded.symbols,time=excluded.time,timezone=excluded.timezone,enabled=excluded.enabled,updated_at=excluded.updated_at`).bind(user.userId, JSON.stringify(input.symbols), input.time, input.timezone, input.enabled ? 1 : 0, new Date().toISOString()).run();
    return json({ schedule: await getSchedule(user.userId), available: capabilities().scheduler });
  });
}

export function localClock(now: Date, timezone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

async function secretMatches(value: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([crypto.subtle.digest("SHA-256", encoder.encode(value)), crypto.subtle.digest("SHA-256", encoder.encode(expected))]);
  const a = new Uint8Array(left), b = new Uint8Array(right);
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a[i] ^ b[i];
  return mismatch === 0;
}

export function handleDailyJob(request: Request): Promise<Response> {
  return apiHandler(async () => {
    const authorization = request.headers.get("Authorization") || "";
    if (!env.CRON_SECRET || env.CRON_SECRET.length < 32 || authorization.length > 512 || !await secretMatches(authorization, `Bearer ${env.CRON_SECRET}`)) throw new ApiError(401, "JOB_AUTH_REQUIRED", "Job authentication failed.");
    if (!capabilities().scheduler) throw new ApiError(503, "SCHEDULER_UNAVAILABLE", "The scheduling service is not enabled.");
    const cursor = new URL(request.url).searchParams.get("cursor") || "";
    if (cursor.length > 256) throw new ApiError(400, "INVALID_CURSOR", "The pagination cursor is invalid.");
    const now = new Date();
    // The caller follows nextCursor until null; bounded pages avoid unbounded Worker execution.
    const { results } = await database().prepare("SELECT * FROM schedules WHERE enabled=1 AND user_id>? ORDER BY user_id LIMIT 6").bind(cursor).all<ScheduleRow>();
    let generated = 0, skipped = 0, failed = 0;
    for (const row of results.slice(0, 5)) {
      const local = localClock(now, row.timezone);
      if (local.time < row.time) { skipped++; continue; }
      const claimed = await database().prepare("INSERT OR IGNORE INTO schedule_runs (user_id,local_date,state,created_at) VALUES (?,?,'running',?) RETURNING user_id").bind(row.user_id, local.date, now.toISOString()).first();
      if (!claimed) { skipped++; continue; }
      try {
        const symbols = symbolsSchema.refine((items) => items.length > 0).parse(JSON.parse(row.symbols));
        await createReports(row.user_id, symbols, "live", false);
        await database().batch([
          database().prepare("UPDATE schedules SET last_run=? WHERE user_id=?").bind(new Date().toISOString(), row.user_id),
          database().prepare("UPDATE schedule_runs SET state='complete',finished_at=? WHERE user_id=? AND local_date=?").bind(new Date().toISOString(), row.user_id, local.date),
        ]);
        generated++;
      } catch {
        await database().prepare("UPDATE schedule_runs SET state='failed',finished_at=? WHERE user_id=? AND local_date=?").bind(new Date().toISOString(), row.user_id, local.date).run();
        failed++;
      }
    }
    return json({ generated, skipped, failed, nextCursor: results.length > 5 ? results[4].user_id : null });
  });
}

export function handleAdmin(): Promise<Response> {
  return apiHandler(async () => {
    const user = await requireUser();
    if (!isAdmin(user)) throw new ApiError(403, "ADMIN_REQUIRED", "This page is restricted to the site administrator.");
    const row = await database().prepare(`SELECT (SELECT COUNT(*) FROM profiles) AS users,(SELECT COUNT(*) FROM reports) AS reports,
      (SELECT COUNT(*) FROM schedules WHERE enabled=1) AS schedules,(SELECT COUNT(*) FROM report_jobs WHERE state='active' AND expires_at>?) AS activeJobs,
      (SELECT COUNT(*) FROM schedule_runs WHERE state='failed') AS failedScheduledRuns`).bind(Date.now()).first();
    const configuredAI = await sponsorReady();
    return json({ counts: row, capabilities: { ...capabilities(), ai: configuredAI }, services: { database: "connected", ai: configuredAI ? "configured" : "missing", market: capabilities().liveData ? "configured" : "missing", scheduler: capabilities().scheduler ? "enabled" : "disabled" }, limits: { daily: DAILY_LIMIT, concurrent: CONCURRENT_LIMIT }, serverTime: new Date().toISOString() });
  });
}

const memoSchema = z.object({
  title: z.string().trim().min(1).max(160),
  symbol: z.union([symbolSchema, z.literal(""), z.null()]).optional().transform((value) => value || null),
  thesis: z.string().max(2000).default(""),
  catalysts: z.string().max(2000).default(""),
  valuation: z.string().max(2000).default(""),
  risks: z.string().max(2000).default(""),
  disconfirming: z.string().max(2000).default(""),
  evidence: z.string().max(2000).default(""),
}).strict();
type MemoRow = { id: string; title: string; symbol: string | null; thesis: string; catalysts: string; valuation: string; risks: string; disconfirming: string; evidence: string; created_at: string; updated_at: string };
function deserializeMemo(row: MemoRow) {
  return { id: row.id, title: row.title, symbol: row.symbol, thesis: row.thesis, catalysts: row.catalysts, valuation: row.valuation, risks: row.risks, disconfirming: row.disconfirming, evidence: row.evidence, createdAt: row.created_at, updatedAt: row.updated_at };
}
async function ownedMemo(userId: string, id: string): Promise<MemoRow> {
  if (id.length > 100) throw new ApiError(404, "MEMO_NOT_FOUND", "This investment memo was not found.");
  const row = await database().prepare("SELECT * FROM memos WHERE user_id=? AND id=?").bind(userId, id).first<MemoRow>();
  if (!row) throw new ApiError(404, "MEMO_NOT_FOUND", "This investment memo was not found.");
  return row;
}

export function handleMemos(request: Request): Promise<Response> {
  return apiHandler(async () => {
    if (request.method !== "GET") assertSameOrigin(request);
    const user = await requireUser();
    if (request.method === "GET") {
      const { results } = await database().prepare("SELECT * FROM memos WHERE user_id=? ORDER BY updated_at DESC,id DESC LIMIT 100").bind(user.userId).all<MemoRow>();
      return json({ memos: results.map(deserializeMemo) });
    }
    const input = await body(request, memoSchema);
    const now = new Date().toISOString();
    const row = await database().prepare(`INSERT INTO memos (id,user_id,title,symbol,thesis,catalysts,valuation,risks,disconfirming,evidence,created_at,updated_at)
      SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM memos WHERE user_id=?)<100 RETURNING *`).bind(crypto.randomUUID(), user.userId, input.title, input.symbol, input.thesis, input.catalysts, input.valuation, input.risks, input.disconfirming, input.evidence, now, now, user.userId).first<MemoRow>();
    if (!row) throw new ApiError(409, "MEMO_LIMIT", "You can save up to 100 investment memos. Remove an existing memo to make room.");
    return json({ memo: deserializeMemo(row) }, 201);
  });
}

export function handleMemo(request: Request, id: string): Promise<Response> {
  return apiHandler(async () => {
    if (request.method !== "GET") assertSameOrigin(request);
    const user = await requireUser();
    const existing = await ownedMemo(user.userId, id);
    if (request.method === "GET") return json({ memo: deserializeMemo(existing) });
    if (request.method === "DELETE") {
      await database().prepare("DELETE FROM memos WHERE user_id=? AND id=?").bind(user.userId, id).run();
      return json({ deleted: true, id });
    }
    const patch = await body(request, memoSchema.partial());
    // Only schema-approved literal column names can enter the statement; all values are bound.
    const fields = Object.entries(patch);
    if (!fields.length) return json({ memo: deserializeMemo(existing) });
    const updated = await database().prepare(`UPDATE memos SET ${fields.map(([name]) => `${name}=?`).join(",")},updated_at=? WHERE user_id=? AND id=? RETURNING *`).bind(...fields.map(([, value]) => value ?? null), new Date().toISOString(), user.userId, id).first<MemoRow>();
    if (!updated) throw new ApiError(404, "MEMO_NOT_FOUND", "This investment memo was not found.");
    return json({ memo: deserializeMemo(updated) });
  });
}

export function validScenarioConfig(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  let keys = 0, nodes = 0;
  const valid = (item: unknown, depth: number): boolean => {
    nodes++;
    if (nodes > 400 || depth > 5) return false;
    if (item === null || typeof item === "boolean") return true;
    if (typeof item === "number") return Number.isFinite(item);
    if (typeof item === "string") return item.length <= 1000;
    if (Array.isArray(item)) return item.length <= 50 && item.every((entry) => valid(entry, depth + 1));
    if (typeof item !== "object") return false;
    const entries = Object.entries(item);
    keys += entries.length;
    if (keys > 100) return false;
    return entries.every(([key, entry]) => key.length <= 100 && !["__proto__", "constructor", "prototype"].includes(key) && valid(entry, depth + 1));
  };
  return valid(value, 0) && new TextEncoder().encode(JSON.stringify(value)).byteLength <= 12_288;
}

const scenarioConfigSchema = z.custom<Record<string, unknown>>(validScenarioConfig, "The scenario exceeds the supported size or structure limits.");
const scenarioSchema = z.object({
  kind: z.enum(["allocation", "liquidity"]),
  name: z.string().trim().min(1).max(100),
  config: scenarioConfigSchema,
  revision: z.number().int().min(0).max(2_147_483_647).optional(),
}).strict();
type ScenarioRow = { id: string; kind: "allocation" | "liquidity"; name: string; config: string; revision: number; created_at: string; updated_at: string };
function deserializeScenario(row: ScenarioRow) {
  return { id: row.id, kind: row.kind, name: row.name, config: JSON.parse(row.config), revision: row.revision, createdAt: row.created_at, updatedAt: row.updated_at };
}
async function ownedScenario(userId: string, id: string): Promise<ScenarioRow> {
  if (id.length > 100) throw new ApiError(404, "SCENARIO_NOT_FOUND", "This scenario was not found.");
  const row = await database().prepare("SELECT * FROM scenarios WHERE user_id=? AND id=?").bind(userId, id).first<ScenarioRow>();
  if (!row) throw new ApiError(404, "SCENARIO_NOT_FOUND", "This scenario was not found.");
  return row;
}

export function handleScenarios(request: Request): Promise<Response> {
  return apiHandler(async () => {
    if (request.method !== "GET") assertSameOrigin(request);
    const user = await requireUser();
    if (request.method === "GET") {
      const kind = new URL(request.url).searchParams.get("kind");
      if (kind && !["allocation", "liquidity"].includes(kind)) throw new ApiError(400, "INVALID_INPUT", "The scenario type is invalid.");
      const query = kind ? database().prepare("SELECT * FROM scenarios WHERE user_id=? AND kind=? ORDER BY updated_at DESC,id DESC LIMIT 50").bind(user.userId, kind)
        : database().prepare("SELECT * FROM scenarios WHERE user_id=? ORDER BY updated_at DESC,id DESC LIMIT 50").bind(user.userId);
      const { results } = await query.all<ScenarioRow>();
      return json({ scenarios: results.map(deserializeScenario) });
    }
    const input = await body(request, scenarioSchema);
    const now = new Date().toISOString();
    const row = await database().prepare(`INSERT INTO scenarios (id,user_id,kind,name,config,revision,created_at,updated_at)
      SELECT ?,?,?,?,?,1,?,? WHERE (SELECT COUNT(*) FROM scenarios WHERE user_id=?)<50 RETURNING *`).bind(crypto.randomUUID(), user.userId, input.kind, input.name, JSON.stringify(input.config), now, now, user.userId).first<ScenarioRow>();
    if (!row) throw new ApiError(409, "SCENARIO_LIMIT", "You can save up to 50 scenarios. Remove an existing scenario to make room.");
    return json({ scenario: deserializeScenario(row) }, 201);
  });
}

export function handleScenario(request: Request, id: string): Promise<Response> {
  return apiHandler(async () => {
    if (request.method !== "GET") assertSameOrigin(request);
    const user = await requireUser();
    const existing = await ownedScenario(user.userId, id);
    if (request.method === "GET") return json({ scenario: deserializeScenario(existing) });
    if (request.method === "DELETE") {
      await database().prepare("DELETE FROM scenarios WHERE user_id=? AND id=?").bind(user.userId, id).run();
      return json({ deleted: true, id });
    }
    const patch = await body(request, scenarioSchema.omit({ kind: true }).partial());
    const expectedRevision = patch.revision ?? existing.revision;
    const row = await database().prepare(`UPDATE scenarios SET name=?,config=?,revision=revision+1,updated_at=?
      WHERE user_id=? AND id=? AND revision=? RETURNING *`).bind(patch.name ?? existing.name, patch.config ? JSON.stringify(patch.config) : existing.config, new Date().toISOString(), user.userId, id, expectedRevision).first<ScenarioRow>();
    if (!row) throw new ApiError(409, "SCENARIO_CONFLICT", "This scenario has changed in another session. Reload it before saving your changes.");
    return json({ scenario: deserializeScenario(row) });
  });
}
