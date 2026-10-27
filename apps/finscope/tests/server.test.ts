import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { stripTypeScriptTypes } from "node:module";
import { z } from "zod";
import type { Report, Viewer } from "../lib/types";

// Exercise the actual production SQL against SQLite, with only platform/provider
// boundaries injected. In particular, quota tests do not mock SQL decisions.
type Server = typeof import("../lib/server");
type Identity = { userId: string; displayName: string; email: string; emailVerified: true } | null;
const migrations = readdirSync(new URL("../drizzle/", import.meta.url)).filter((name) => name.endsWith(".sql")).sort();
assert.ok(migrations.length, "Generate the D1 migration before running backend tests.");

async function fixture() {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys=ON");
  for (const migration of migrations) sql.exec(readFileSync(new URL(`../drizzle/${migration}`, import.meta.url), "utf8"));
  function statement(query: string, params: unknown[] = []) {
    const bindable = params as (string | number | null)[];
    return {
      bind: (...values: unknown[]) => statement(query, values),
      first: async () => sql.prepare(query).get(...bindable) ?? null,
      all: async () => ({ results: sql.prepare(query).all(...bindable) }),
      run: async () => sql.prepare(query).run(...bindable),
    };
  }
  const db = { prepare: statement, batch: async (statements: ReturnType<typeof statement>[]) => {
    sql.exec("BEGIN");
    try { const results = []; for (const item of statements) results.push(await item.run()); sql.exec("COMMIT"); return results; }
    catch (error) { sql.exec("ROLLBACK"); throw error; }
  } };
  const runtimeEnv: Record<string, unknown> = { DB: db };
  let user: Identity = { userId: "alice", displayName: "Alice", email: "alice@example.test", emailVerified: true };
  let providerFails = false;
  const makeReport = (symbol: string, mode: "demo" | "live" = "demo"): Report => ({
    id: "provider-id", symbol, company: { symbol, name: symbol, nameEn: symbol, exchange: "NASDAQ", sector: "Technology", color: "#123456", mark: symbol[0] },
    generatedAt: new Date().toISOString(), dataAsOf: "2025-12-31", mode, currency: "USD", periods: [],
    metrics: { revenueGrowth: null, netMargin: null, freeCashFlow: null, debtToEquity: null, roe: null, cashRatio: null }, insights: [], sources: [],
    ...(mode === "live" ? { provider:"Test issuer", retrievedAt:"2026-10-26T12:00:00.000Z", statements:[{kind:"income" as const,title:"Income statement",rows:[{key:"revenue",label:"Revenue",unit:"million-currency" as const,values:{"2025":100}}]}] } : {}),
  });
  const injected = {
    env: runtimeEnv, z,
    getUser: async () => user,
    getDemoReport: (symbol: string) => makeReport(symbol),
    generateReport: async (symbol: string) => { if (providerFails) throw new Error("secret-bearing-provider-url"); return makeReport(symbol, "live"); },
    searchCompanies: async () => [],
    generateMeteredAnalysis: async () => ({ status: "ready", summary: "Test analysis", insights: [], sources: [] }),
    aiStatus: async () => ({ canUse: Boolean(runtimeEnv.OPENAI_API_KEY) }),
    getCaseStudy: (symbol: string) => symbol === "MSFT" ? { ...makeReport("MSFT", "live"), id: "case-MSFT", dataAsOf: "2025-06-30", note: "Frozen FY2025 annual-report figures." } : undefined,
  };
  const token = `fixture${crypto.randomUUID().replaceAll("-", "")}`;
  const injectionStore = globalThis as unknown as Record<string, unknown>;
  injectionStore[token] = injected;
  const source = readFileSync(new URL("../lib/server.ts", import.meta.url), "utf8").replace(/^import .*;\r?\n/gm, "");
  const compiled = stripTypeScriptTypes(source, { mode: "transform" });
  const code = `const {env,z,getUser,getDemoReport,generateReport,searchCompanies,generateMeteredAnalysis,aiStatus,getCaseStudy}=globalThis[${JSON.stringify(token)}];\n${compiled}`;
  const server = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`) as Server;
  delete injectionStore[token];
  return {
    server, sql, env: runtimeEnv,
    setUser: (id: string | null) => { user = id ? { userId: id, displayName: id, email: `${id}@example.test`, emailVerified: true } : null; },
    failProvider: () => { providerFails = true; },
    close: () => sql.close(),
  };
}

function request(path: string, method = "GET", value?: unknown, origin = "https://finscope.test") {
  return new Request(`https://finscope.test${path}`, { method, headers: { Origin: origin, "Content-Type": "application/json" }, ...(value !== undefined ? { body: JSON.stringify(value) } : {}) });
}

test("anonymous visitors can inspect capabilities but cannot create reports", async () => {
  const f = await fixture();
  try {
    f.setUser(null);
    const viewer = await (await f.server.handleMe()).json() as Viewer;
    assert.equal(viewer.user, null);
    const response = await f.server.handleReports(request("/api/reports", "POST", { symbols: ["AAPL"], mode: "demo" }));
    assert.equal(response.status, 401);
    assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM reports").get()!.n, 0);
  } finally { f.close(); }
});

test("cross-origin writes are rejected before creating account state", async () => {
  const f = await fixture();
  try {
    const response = await f.server.handleFavorites(request("/api/favorites", "POST", { symbol: "AAPL" }, "https://attacker.test"));
    assert.equal(response.status, 403);
    assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM profiles").get()!.n, 0);
  } finally { f.close(); }
});

test("direct-issuer report generation preserves statement rows and provenance when reopened", async () => {
  const f = await fixture();
  try {
    const capabilities = (await f.server.getViewer()).capabilities;
    assert.equal(capabilities.liveData,true);
    assert.equal(capabilities.broadCoverage,false);
    assert.deepEqual(capabilities.directIssuers,["MSFT"]);
    const response = await f.server.handleReports(request("/api/reports","POST",{symbols:["MSFT"],mode:"live"}));
    assert.equal(response.status,201);
    const created = (await response.json() as {reports:Report[]}).reports[0];
    assert.notEqual(created.id,"provider-id");
    const reopened = (await (await f.server.handleReport(created.id)).json() as {report:Report}).report;
    assert.deepEqual(reopened,created);
    assert.equal(reopened.statements![0].rows[0].values["2025"],100);
    assert.equal(reopened.retrievedAt,"2026-10-26T12:00:00.000Z");
    const archive = await (await f.server.handleReports(request("/api/reports"))).json() as {reports:Report[]};
    assert.equal(archive.reports[0].id,created.id);
    f.setUser("bob");
    assert.equal((await f.server.handleReport(created.id)).status,404);
  } finally { f.close(); }
});

test("unsupported live coverage fails before quota use and issuer errors remain safely informative", async () => {
  const f = await fixture();
  try {
    const response=await f.server.handleReports(request("/api/reports","POST",{symbols:["AAPL"],mode:"live"}));
    assert.equal(response.status,503);
    assert.equal((await response.json() as {code:string}).code,"DATA_COVERAGE_UNAVAILABLE");
    assert.equal((await f.server.getViewer()).usage.used,0);
    assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM reports").get()!.n,0);
    const failure=await f.server.apiHandler(async()=>{throw Object.assign(new Error("secret-bearing-provider-url"),{name:"MarketDataError",code:"ISSUER_FORMAT_CHANGED"});});
    const safe=await failure.json() as {code:string;error:string};
    assert.equal(failure.status,422);
    assert.equal(safe.code,"ISSUER_FORMAT_CHANGED");
    assert.match(safe.error,/format/);
    assert.ok(!safe.error.includes("secret-bearing"));
  } finally { f.close(); }
});

test("report input limits are enforced on the server before consuming credits", async () => {
  const f = await fixture();
  try {
    for (const symbols of [["AAPL", "MSFT", "NVDA", "AMZN"], ["aapl", "AAPL"], ["AAPL/../../"]]) {
      assert.equal((await f.server.handleReports(request("/api/reports", "POST", { symbols, mode: "demo" }))).status, 400);
    }
    const oversized = "x".repeat(17_000);
    assert.equal((await f.server.handleFavorites(request("/api/favorites", "POST", { symbol: oversized }))).status, 413);
    assert.equal((await f.server.getViewer()).usage.used, 0);
  } finally { f.close(); }
});

test("favorites and report IDs are isolated between signed-in users", async () => {
  const f = await fixture();
  try {
    assert.equal((await f.server.handleFavorites(request("/api/favorites", "POST", { symbol: "aapl" }))).status, 200);
    const generated = await (await f.server.handleReports(request("/api/reports", "POST", { symbols: ["AAPL"], mode: "demo" }))).json() as { reports: Report[] };
    const id = generated.reports[0].id;
    f.setUser("bob");
    assert.equal((await f.server.handleReport(id)).status, 404);
    await f.server.handleFavorites(request("/api/favorites", "DELETE", { symbol: "AAPL" }));
    assert.deepEqual((await f.server.getViewer()).favorites, []);
    f.setUser("alice");
    assert.deepEqual((await f.server.getViewer()).favorites, ["AAPL"]);
    assert.equal((await f.server.handleReport(id)).status, 200);
  } finally { f.close(); }
});

test("atomic leases reject the fourth concurrent job, expire safely, and retain usage", async () => {
  const f = await fixture();
  try {
    await f.server.getViewer();
    const now = new Date("2026-10-26T12:00:00Z");
    const claims = await Promise.allSettled(Array.from({ length: 4 }, () => f.server.claimJob("alice", 1, 1, "report", now)));
    assert.equal(claims.filter((item) => item.status === "fulfilled").length, 3);
    assert.equal(claims.filter((item) => item.status === "rejected").length, 1);
    assert.deepEqual(await f.server.getUsage("alice", now), { used: 3, active: 3, limit: 18 });
    const next = new Date("2026-10-26T12:11:00Z");
    const lease = await f.server.claimJob("alice", 3, 6, "report_ai", next);
    assert.deepEqual(await f.server.getUsage("alice", next), { used: 9, active: 3, limit: 18 });
    await f.server.releaseJob("bob", lease);
    assert.equal((await f.server.getUsage("alice", next)).active, 3);
    await f.server.releaseJob("alice", lease);
    assert.equal((await f.server.getUsage("alice", next)).active, 0);
  } finally { f.close(); }
});

test("history pagination retains reports created at the same instant", async () => {
  const f = await fixture();
  try {
    await f.server.handleReports(request("/api/reports", "POST", { symbols: ["AAPL", "MSFT", "NVDA"], mode: "demo" }));
    f.sql.prepare("UPDATE reports SET created_at=? WHERE user_id=?").run("2026-10-26T12:00:00.000Z", "alice");
    const seen = new Set<string>();
    let cursor: string | null = null;
    for (let i = 0; i < 3; i++) {
      const page = await (await f.server.handleReports(request(`/api/reports?limit=1${cursor ? `&before=${encodeURIComponent(cursor)}` : ""}`))).json() as { reports: Report[]; nextCursor: string | null };
      assert.equal(page.reports.length, 1);
      seen.add(page.reports[0].id);
      cursor = page.nextCursor;
    }
    assert.equal(seen.size, 3);
    assert.equal(cursor, null);
  } finally { f.close(); }
});

test("daily quota covers AI costs and resets only at the UTC date boundary", async () => {
  const f = await fixture();
  try {
    await f.server.getViewer();
    const now = new Date("2026-10-26T23:59:00Z");
    for (let i = 0; i < 3; i++) { const lease = await f.server.claimJob("alice", 3, 6, "report_ai", now); await f.server.releaseJob("alice", lease); }
    await assert.rejects(f.server.claimJob("alice", 1, 1, "ai", now), /research allowance/);
    assert.equal((await f.server.getUsage("alice", now)).used, 18);
    await f.server.claimJob("alice", 1, 1, "ai", new Date("2026-10-27T00:00:00Z"));
  } finally { f.close(); }
});

test("provider failures release leases, persist no partial batch, and redact details", async () => {
  const f = await fixture();
  try {
    f.env.SEC_USER_AGENT = "FinScope owner@example.test";
    f.failProvider();
    const response = await f.server.handleReports(request("/api/reports", "POST", { symbols: ["AAPL", "MSFT"], mode: "live" }));
    assert.equal(response.status, 502);
    assert.ok(!(await response.text()).includes("secret-bearing"));
    assert.equal((await f.server.getViewer()).usage.active, 0);
    assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM reports").get()!.n, 0);
  } finally { f.close(); }
});

test("schedule drafts persist, unavailable enable is honest, and timezones respect DST", async () => {
  const f = await fixture();
  try {
    const input = { symbols: ["AAPL"], time: "08:00", timezone: "America/New_York", enabled: false };
    assert.equal((await f.server.handleSchedule(request("/api/schedule", "PUT", input))).status, 200);
    assert.equal((await f.server.handleSchedule(request("/api/schedule", "PUT", { ...input, enabled: true }))).status, 503);
    assert.equal((await f.server.getViewer()).schedule.enabled, false);
    assert.equal(f.server.localClock(new Date("2026-01-01T13:00:00Z"), input.timezone).time, "08:00");
    assert.equal(f.server.localClock(new Date("2026-07-01T12:00:00Z"), input.timezone).time, "08:00");
    assert.equal(f.server.localClock(new Date("2026-07-01T04:00:00Z"), input.timezone).time, "00:00");
    assert.equal(f.server.validTimezone("Invented/Zone"), false);
  } finally { f.close(); }
});

test("daily runner requires a secret and generates at most once per local day", async () => {
  const f = await fixture();
  try {
    Object.assign(f.env, { SEC_USER_AGENT: "FinScope owner@example.test", CRON_SECRET: "test-secret-with-at-least-thirty-two-characters", SCHEDULER_ENABLED: "true" });
    await f.server.handleSchedule(request("/api/schedule", "PUT", { symbols: ["AAPL"], time: "00:00", timezone: "UTC", enabled: true }));
    assert.equal((await f.server.handleDailyJob(request("/api/jobs/daily", "POST"))).status, 401);
    const invoke = () => f.server.handleDailyJob(new Request("https://finscope.test/api/jobs/daily", { method: "POST", headers: { Authorization: `Bearer ${f.env.CRON_SECRET}` } }));
    const first = await (await invoke()).json() as { generated: number };
    const second = await (await invoke()).json() as { generated: number; skipped: number };
    assert.equal(first.generated, 1);
    assert.equal(second.generated, 0);
    assert.equal(second.skipped, 1);
    assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM reports").get()!.n, 1);
  } finally { f.close(); }
});

test("admin requires an exact identity and never returns configuration secret values", async () => {
  const f = await fixture();
  try {
    f.env.ADMIN_USER_ID = "alice";
    f.env.OPENAI_API_KEY = "private-key-never-output";
    f.setUser("bob");
    assert.equal((await f.server.handleAdmin()).status, 403);
    f.setUser("alice");
    const response = await f.server.handleAdmin();
    assert.equal(response.status, 200);
    assert.ok(!(await response.text()).includes("private-key-never-output"));
  } finally { f.close(); }
});

test("investment memos persist analyst fields and enforce ownership for reads, edits and deletion", async () => {
  const f = await fixture();
  try {
    const input = { title: "Apple investment memo", symbol: "aapl", thesis: "Test thesis", catalysts: "Product cycle", valuation: "Scenario range", risks: "Concentration", disconfirming: "Margin decline", evidence: "Annual filing" };
    const created = await f.server.handleMemos(request("/api/memos", "POST", input));
    assert.equal(created.status, 201);
    const { memo } = await created.json() as { memo: { id: string; symbol: string; thesis: string; risks: string } };
    assert.equal(memo.symbol, "AAPL");
    const id = memo.id;
    f.setUser("bob");
    assert.equal((await f.server.handleMemo(request(`/api/memos/${id}`), id)).status, 404);
    assert.equal((await f.server.handleMemo(request(`/api/memos/${id}`, "PATCH", { thesis: "tampered" }), id)).status, 404);
    assert.equal((await f.server.handleMemo(request(`/api/memos/${id}`, "DELETE"), id)).status, 404);
    assert.deepEqual(await (await f.server.handleMemos(request("/api/memos"))).json(), { memos: [] });
    f.setUser("alice");
    const updated = await (await f.server.handleMemo(request(`/api/memos/${id}`, "PATCH", { risks: "Updated risk", symbol: "" }), id)).json() as { memo: { thesis: string; risks: string; symbol: null } };
    assert.equal(updated.memo.thesis, input.thesis);
    assert.equal(updated.memo.risks, "Updated risk");
    assert.equal(updated.memo.symbol, null);
    assert.equal((await f.server.handleMemo(request(`/api/memos/${id}`, "DELETE"), id)).status, 200);
    assert.equal((await f.server.handleMemo(request(`/api/memos/${id}`), id)).status, 404);
  } finally { f.close(); }
});

test("memo edits reject cross-origin writes, oversized fields and unknown ownership columns", async () => {
  const f = await fixture();
  try {
    const created = await (await f.server.handleMemos(request("/api/memos", "POST", { title: "Draft" }))).json() as { memo: { id: string } };
    const id = created.memo.id;
    assert.equal((await f.server.handleMemo(request(`/api/memos/${id}`, "PATCH", { title: "Cross origin" }, "https://attacker.test"), id)).status, 403);
    assert.equal((await f.server.handleMemo(request(`/api/memos/${id}`, "PATCH", { thesis: "x".repeat(2001) }), id)).status, 400);
    assert.equal((await f.server.handleMemo(request(`/api/memos/${id}`, "PATCH", { user_id: "bob" }), id)).status, 400);
    assert.equal(f.sql.prepare("SELECT title FROM memos WHERE id=?").get(id)!.title, "Draft");
  } finally { f.close(); }
});

test("live autocomplete is rate limited without consuming research credits", async () => {
  const f = await fixture();
  try {
    f.env.SEC_USER_AGENT = "FinScope owner@example.test";
    for (let i = 0; i < 30; i++) assert.equal((await f.server.handleCompanies(request("/api/companies?q=AAPL"))).status, 200);
    assert.equal((await f.server.handleCompanies(request("/api/companies?q=MSFT"))).status, 429);
    assert.equal((await f.server.getViewer()).usage.used, 0);
    f.setUser(null);
    assert.equal((await f.server.handleCompanies(request("/api/companies?q=AAPL"))).status, 200);
    assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM report_jobs WHERE kind='search'").get()!.n, 30);
  } finally { f.close(); }
});

test("allocation and liquidity plans persist separately with owner-only access", async () => {
  const f = await fixture();
  try {
    const config = { version: 1, weights: [30, 20, 15, 15, 10, 10], shocks: [-20, -10, 5, 0, -5, 0], assets: 100, liabilities: 85 };
    const created = await f.server.handleScenarios(request("/api/scenarios", "POST", { kind: "allocation", name: "Base allocation", config }));
    assert.equal(created.status, 201);
    const { scenario } = await created.json() as { scenario: { id: string; config: typeof config; revision: number } };
    assert.deepEqual(scenario.config, config);
    assert.equal(scenario.revision, 1);
    const id = scenario.id;
    assert.deepEqual(await (await f.server.handleScenarios(request("/api/scenarios?kind=liquidity"))).json(), { scenarios: [] });
    f.setUser("bob");
    assert.equal((await f.server.handleScenario(request(`/api/scenarios/${id}`), id)).status, 404);
    assert.equal((await f.server.handleScenario(request(`/api/scenarios/${id}`, "PATCH", { name: "tampered" }), id)).status, 404);
    assert.equal((await f.server.handleScenario(request(`/api/scenarios/${id}`, "DELETE"), id)).status, 404);
    f.setUser("alice");
    const updated = await (await f.server.handleScenario(request(`/api/scenarios/${id}`, "PATCH", { name: "Revised allocation", revision: 1 }), id)).json() as { scenario: { revision: number; config: typeof config } };
    assert.equal(updated.scenario.revision, 2);
    assert.deepEqual(updated.scenario.config, config);
    assert.equal((await f.server.handleScenario(request(`/api/scenarios/${id}`, "PATCH", { name: "stale", revision: 1 }), id)).status, 409);
    assert.equal((await f.server.handleScenario(request(`/api/scenarios/${id}`, "DELETE"), id)).status, 200);
  } finally { f.close(); }
});

test("scenario structures reject prototype keys, excessive depth, size, keys, and nonfinite numbers", async () => {
  const f = await fixture();
  try {
    assert.equal(f.server.validScenarioConfig({ value: Infinity }), false);
    assert.equal(f.server.validScenarioConfig(JSON.parse('{"__proto__":{"polluted":true}}')), false);
    assert.equal(f.server.validScenarioConfig({ a: { b: { c: { d: { e: { f: 1 } } } } } }), false);
    assert.equal(f.server.validScenarioConfig(Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`k${i}`, i]))), false);
    assert.equal(f.server.validScenarioConfig({ text: "x".repeat(1001) }), false);
    assert.equal(f.server.validScenarioConfig(Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`k${i}`, "字".repeat(1000)]))), false);
    for (const config of [[], "not an object", { weights: Array.from({ length: 51 }, () => 1) }, JSON.parse('{"constructor":{"prototype":{}}}')]) {
      const response = await f.server.handleScenarios(request("/api/scenarios", "POST", { kind: "liquidity", name: "invalid", config }));
      assert.equal(response.status, 400);
    }
    assert.equal((await f.server.handleScenarios(request("/api/scenarios", "POST", { kind: "liquidity", name: "test", config: {} }, "https://attacker.test"))).status, 403);
  } finally { f.close(); }
});

test("curated financial cases save server evidence privately without a live provider", async () => {
  const f = await fixture();
  try {
    assert.equal((await f.server.getViewer()).capabilities.broadCoverage, false);
    const result = await f.server.handleSaveCaseStudy(request("/api/case-studies/MSFT", "POST", { report: { note: "attacker evidence", userId: "bob" } }), "msft");
    assert.equal(result.status, 201);
    const { report } = await result.json() as { report: Report };
    assert.notEqual(report.id, "case-MSFT");
    assert.equal(report.symbol, "MSFT");
    assert.equal(report.mode, "live");
    assert.equal(report.dataAsOf, "2025-06-30");
    assert.equal(report.note, "Frozen FY2025 annual-report figures.");
    assert.equal((await f.server.getViewer()).usage.used, 1);
    assert.equal((await f.server.getViewer()).usage.active, 0);
    f.setUser("bob");
    assert.equal((await f.server.handleReport(report.id)).status, 404);
    assert.equal((await f.server.handleReportAI(request(`/api/reports/${report.id}/ai`, "POST"), report.id)).status, 404);
    f.setUser("alice");
    f.env.OPENAI_API_KEY = "test-key";
    assert.equal((await f.server.handleReportAI(request(`/api/reports/${report.id}/ai`, "POST"), report.id)).status, 200);
  } finally { f.close(); }
});

test("curated case saves enforce sign-in, origin, known symbols, and research quota", async () => {
  const f = await fixture();
  try {
    f.setUser(null);
    assert.equal((await f.server.handleSaveCaseStudy(request("/api/case-studies/MSFT", "POST"), "MSFT")).status, 401);
    f.setUser("alice");
    assert.equal((await f.server.handleSaveCaseStudy(request("/api/case-studies/MSFT", "POST", undefined, "https://attacker.test"), "MSFT")).status, 403);
    assert.equal((await f.server.handleSaveCaseStudy(request("/api/case-studies/UNKNOWN", "POST"), "UNKNOWN")).status, 404);
    assert.equal((await f.server.getViewer()).usage.used, 0);
    for (let i = 0; i < 18; i++) assert.equal((await f.server.handleSaveCaseStudy(request("/api/case-studies/MSFT", "POST"), "MSFT")).status, 201);
    const exhausted = await f.server.handleSaveCaseStudy(request("/api/case-studies/MSFT", "POST"), "MSFT");
    assert.equal(exhausted.status, 429);
    assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM reports WHERE user_id='alice'").get()!.n, 18);
  } finally { f.close(); }
});
