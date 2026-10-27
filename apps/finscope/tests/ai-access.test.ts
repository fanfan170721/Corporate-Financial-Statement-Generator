import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { Report } from "../lib/types";

type AI = typeof import("../lib/ai-access") & typeof import("../lib/credential-vault") & typeof import("../lib/server");
type Provider = (report: Report, options: { env: { OPENAI_API_KEY?: string }; onUsage: (usage: { inputTokens: number; outputTokens: number }) => void }) => Promise<unknown>;
const report = { symbol: "MSFT", mode: "live" } as Report;

async function fixture() {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys=ON");
  for (const name of readdirSync(new URL("../drizzle/", import.meta.url)).filter((name) => name.endsWith(".sql")).sort()) sql.exec(readFileSync(new URL(`../drizzle/${name}`, import.meta.url), "utf8"));
  function statement(query: string, params: unknown[] = []) {
    const bindings = params as (string | number | null)[];
    return { bind: (...values: unknown[]) => statement(query, values), first: async () => sql.prepare(query).get(...bindings) ?? null, all: async () => ({ results: sql.prepare(query).all(...bindings) }), run: async () => sql.prepare(query).run(...bindings) };
  }
  const db = { prepare: statement, batch: async (statements: ReturnType<typeof statement>[]) => {
    sql.exec("BEGIN");
    try { const results = []; for (const statement of statements) results.push(await statement.run()); sql.exec("COMMIT"); return results; }
    catch (error) { sql.exec("ROLLBACK"); throw error; }
  } };
  const env: Record<string, unknown> = { DB: db, ADMIN_EMAIL: "owner@example.test", OPENAI_API_KEY: "sk-test-sponsor-" + "a".repeat(30), CREDENTIAL_ENCRYPTION_KEY: "a".repeat(64) };
  let userId: string | null = "owner";
  let calls = 0;
  let provider: Provider = async (_report, options) => { options.onUsage({ inputTokens: 1000, outputTokens: 100 }); return { status: "ready", summary: "Test output", insights: [], sources: [] }; };
  const injected = {
    env, z,
    getUser: async () => userId ? { userId, displayName: userId, email: `${userId}@example.test`, emailVerified: true } : null,
    getGuest: async () => null,
    GuestError: class extends Error {},
    generateAIAnalysis: async (input: Report, options: Parameters<Provider>[1]) => { calls++; return provider(input, options); },
    generateReport: async () => report, getDemoReport: () => report, searchCompanies: async () => [], getCaseStudy: () => report,
  };
  const token = `aiFixture${crypto.randomUUID().replaceAll("-", "")}`;
  const store = globalThis as unknown as Record<string, unknown>;
  store[token] = injected;
  const combined = ["credential-vault.ts", "server.ts", "ai-access.ts"].map((file) => readFileSync(new URL(`../lib/${file}`, import.meta.url), "utf8").replace(/^import .*;\r?\n/gm, "")).join("\n");
  const code = `const {env,z,getUser,getGuest,GuestError,generateAIAnalysis,generateReport,getDemoReport,searchCompanies,getCaseStudy}=globalThis[${JSON.stringify(token)}];\n${stripTypeScriptTypes(combined, { mode: "transform" })}`;
  const ai = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`) as AI;
  delete store[token];
  function request(path: string, method = "GET", input?: unknown, origin = "https://finscope.test") { return new Request(`https://finscope.test${path}`, { method, headers: { Origin: origin, "Content-Type": "application/json" }, ...(input === undefined ? {} : { body: JSON.stringify(input) }) }); }
  async function pass(maxClaims = 1) {
    userId = "owner";
    const response = await ai.handleAdminAI(request("/api/admin/ai", "POST", { label: "Test access", maxClaims, redeemDays: 1 }));
    assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
    const body = await response.json() as { code: string; passes: { id: string }[] };
    return { code: body.code, id: body.passes[0].id };
  }
  async function redeem(code: string, id = "alice") { userId = id; return ai.handleRedeem(request("/api/ai/redeem", "POST", { code })); }
  return { sql, env, ai, request, pass, redeem, setUser: (id: string | null) => { userId = id; }, setProvider: (value: Provider) => { provider = value; }, calls: () => calls, close: () => sql.close() };
}

test("AI keys require identity and Origin, stay encrypted, and are isolated by owner", async () => {
  const f = await fixture();
  try {
    const key = "sk-test-personal-" + "b".repeat(32);
    f.setUser(null);
    assert.equal((await f.ai.handleAISettings(f.request("/api/ai/settings", "PUT", { apiKey: key }))).status, 401);
    f.setUser("alice");
    assert.equal((await f.ai.handleAISettings(f.request("/api/ai/settings", "PUT", { apiKey: key }, "https://attacker.test"))).status, 403);
    const stored = await f.ai.handleAISettings(f.request("/api/ai/settings", "PUT", { apiKey: key }));
    assert.equal(stored.status, 200);
    assert.ok(!(await stored.text()).includes(key));
    const row = f.sql.prepare("SELECT ciphertext FROM ai_credentials WHERE scope='alice'").get()!;
    assert.ok(!String(row.ciphertext).includes(key));
    f.setUser("bob");
    const bob = await f.ai.aiStatus("bob");
    assert.equal(bob.personalKey, null);
    assert.equal(bob.canUse, false);
    await f.ai.handleAISettings(f.request("/api/ai/settings", "DELETE"));
    assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM ai_credentials WHERE scope='alice'").get()!.n, 1);
    assert.equal((await f.ai.handleAdminAI(f.request("/api/admin/ai"))).status, 403);
  } finally { f.close(); }
});

test("admin sponsor status reflects the readable vault key, including corruption and environment precedence", async () => {
  const f = await fixture();
  try {
    delete f.env.OPENAI_API_KEY;
    assert.equal(await f.ai.sponsorReady(), false);
    const key = "sk-test-saved-sponsor-" + "a".repeat(32);
    const ciphertext = await f.ai.sealCredential(key, "__site_sponsor__", String(f.env.CREDENTIAL_ENCRYPTION_KEY));
    f.sql.prepare("INSERT INTO ai_credentials(scope,ciphertext,suffix,updated_at) VALUES (?,?,?,?)").run("__site_sponsor__", ciphertext, key.slice(-4), new Date().toISOString());
    assert.equal(await f.ai.sponsorReady(), true);
    const admin = await f.ai.handleAdmin();
    assert.equal(admin.status, 200);
    const body = await admin.json() as { services: { ai: string }; capabilities: { ai: boolean } };
    assert.equal(body.services.ai, "configured");
    assert.equal(body.capabilities.ai, true);
    assert.ok(!JSON.stringify(body).includes(key));
    f.env.OPENAI_API_KEY = "sk-test-environment-" + "b".repeat(32);
    f.sql.prepare("UPDATE ai_credentials SET ciphertext='corrupt' WHERE scope='__site_sponsor__'").run();
    assert.equal(await f.ai.sponsorReady(), false, "The actual execution path prefers a saved key; metadata must not hide a corrupt override.");
    const invalid = await (await f.ai.handleAdmin()).json() as typeof body;
    assert.equal(invalid.services.ai, "missing");
    assert.equal(invalid.capabilities.ai, false);
    assert.equal(f.calls(), 0);
  } finally { f.close(); }
});

test("AES-GCM binds ciphertext to the exact user and rejects corruption or the wrong master key", async () => {
  const f = await fixture();
  try {
    const secret = "a".repeat(64);
    const first = await f.ai.sealCredential("private credential", "alice", secret);
    const second = await f.ai.sealCredential("private credential", "alice", secret);
    assert.notEqual(first, second);
    assert.equal(await f.ai.openCredential(first, "alice", secret), "private credential");
    await assert.rejects(f.ai.openCredential(first, "bob", secret));
    await assert.rejects(f.ai.openCredential(first, "alice", "b".repeat(64)));
    const parts = first.split(".");
    parts[2] = (parts[2][0] === "A" ? "B" : "A") + parts[2].slice(1);
    await assert.rejects(f.ai.openCredential(parts.join("."), "alice", secret));
  } finally { f.close(); }
});

test("a one-claim pass cannot be redeemed twice under concurrent requests", async () => {
  const f = await fixture();
  try {
    const pass = await f.pass(1);
    assert.ok(!String(f.sql.prepare("SELECT code_hash FROM ai_passes").get()!.code_hash).includes(pass.code));
    const results = await Promise.all([f.redeem(pass.code, "alice"), f.redeem(pass.code, "bob")]);
    assert.deepEqual(results.map((response) => response.status).sort(), [200, 400]);
    assert.equal(f.sql.prepare("SELECT claims FROM ai_passes WHERE id=?").get(pass.id)!.claims, 1);
    assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM ai_grants").get()!.n, 1);
  } finally { f.close(); }
});

test("expired and revoked passes cannot authorize sponsored AI or be reclaimed by the same account", async () => {
  const f = await fixture();
  try {
    const pass = await f.pass(3);
    assert.equal((await f.redeem(pass.code)).status, 200);
    assert.equal((await f.ai.aiStatus("alice")).mode, "sponsored");
    assert.equal((await f.redeem(pass.code)).status, 409);
    f.sql.prepare("UPDATE ai_grants SET expires_at=? WHERE user_id='alice'").run(Date.now() - 1);
    assert.equal((await f.ai.aiStatus("alice")).canUse, false);
    await assert.rejects(f.ai.generateMeteredAnalysis("alice", report), /API key|pass/);
    assert.equal((await f.redeem(pass.code)).status, 400);
    assert.equal((await f.redeem(pass.code, "bob")).status, 200);
    f.setUser("owner");
    assert.equal((await f.ai.handleAdminAI(f.request("/api/admin/ai", "DELETE", { id: pass.id }))).status, 200);
    assert.equal((await f.ai.aiStatus("bob")).canUse, false);
    await assert.rejects(f.ai.generateMeteredAnalysis("bob", report));
    assert.equal(f.calls(), 0);
  } finally { f.close(); }
});

test("per-user in-flight admission is atomic and successful usage settles the reservation", async () => {
  const f = await fixture();
  try {
    const pass = await f.pass();
    await f.redeem(pass.code);
    let release: () => void = () => {};
    let entered: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const ready = new Promise<void>((resolve) => { entered = resolve; });
    f.setProvider(async (_report, options) => { entered(); await gate; options.onUsage({ inputTokens: 900, outputTokens: 100 }); return { status: "ready" }; });
    const first = f.ai.generateMeteredAnalysis("alice", report);
    await ready;
    assert.equal(f.sql.prepare("SELECT charged_tokens FROM ai_usage").get()!.charged_tokens, 20_000);
    await assert.rejects(f.ai.generateMeteredAnalysis("alice", report), /running|allowance/);
    release();
    await first;
    assert.equal(f.sql.prepare("SELECT charged_tokens FROM ai_usage").get()!.charged_tokens, 1000);
    assert.equal(f.sql.prepare("SELECT state FROM ai_usage").get()!.state, "settled");
    assert.equal(f.calls(), 1);
  } finally { f.close(); }
});

test("request ceilings and unknown failures retain budget instead of creating unlimited retries", async () => {
  const f = await fixture();
  try {
    const pass = await f.pass();
    await f.redeem(pass.code);
    f.setProvider(async () => { throw new Error("provider failed"); });
    for (let i = 0; i < 5; i++) await assert.rejects(f.ai.generateMeteredAnalysis("alice", report), /provider failed/);
    await assert.rejects(f.ai.generateMeteredAnalysis("alice", report), /allowance/);
    const row = f.sql.prepare("SELECT SUM(charged_tokens) total,COUNT(*) n FROM ai_usage").get()!;
    assert.equal(row.total, 100_000);
    assert.equal(row.n, 5);
    assert.equal(f.calls(), 5);
  } finally { f.close(); }
});

test("global sponsored budget prevents another account from bypassing the reservation ceiling", async () => {
  const f = await fixture();
  try {
    await f.ai.handleAdminAI(f.request("/api/admin/ai", "PATCH", { dailyTokens: 100_000, dailyRequests: 5, globalDailyTokens: 20_000, globalDailyRequests: 25 }));
    const pass = await f.pass(2);
    await f.redeem(pass.code, "alice");
    await f.redeem(pass.code, "bob");
    let release: () => void = () => {};
    let entered: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const ready = new Promise<void>((resolve) => { entered = resolve; });
    f.setProvider(async () => { entered(); await gate; return { status: "unavailable" }; });
    const first = f.ai.generateMeteredAnalysis("alice", report);
    await ready;
    await assert.rejects(f.ai.generateMeteredAnalysis("bob", report), /allowance/);
    release();
    await first;
    assert.equal(f.calls(), 1);
    assert.equal(f.sql.prepare("SELECT charged_tokens FROM ai_usage").get()!.charged_tokens, 20_000);
  } finally { f.close(); }
});

test("personal credentials use the owner's scope and cannot spend sponsored funds", async () => {
  const f = await fixture();
  try {
    f.setUser("alice");
    const key = "sk-personal-test-" + "b".repeat(32);
    await f.ai.handleAISettings(f.request("/api/ai/settings", "PUT", { apiKey: key }));
    f.setProvider(async (_report, options) => { assert.equal(options.env.OPENAI_API_KEY, key); options.onUsage({ inputTokens: 100, outputTokens: 50 }); return { status: "ready" }; });
    await f.ai.generateMeteredAnalysis("alice", report);
    const row = f.sql.prepare("SELECT budget_scope,sponsored FROM ai_usage").get()!;
    assert.match(String(row.budget_scope), /^personal:alice:/);
    assert.equal(row.sponsored, 0);
    await assert.rejects(f.ai.generateMeteredAnalysis("bob", report));
    assert.equal(f.calls(), 1);
  } finally { f.close(); }
});
