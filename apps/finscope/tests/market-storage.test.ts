import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const source = stripTypeScriptTypes(readFileSync(new URL("../lib/market-storage.ts", import.meta.url), "utf8"));
const storage = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`) as typeof import("../lib/market-storage");

function fixture() {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys=ON");
  for (const file of readdirSync(new URL("../drizzle/", import.meta.url)).filter(file => file.endsWith(".sql")).sort()) sql.exec(readFileSync(new URL(`../drizzle/${file}`, import.meta.url), "utf8"));
  function statement(query: string, params: unknown[] = []) {
    const values = params as (string | number | null)[];
    return { bind: (...args: unknown[]) => statement(query, args), first: async () => sql.prepare(query).get(...values) ?? null, all: async () => ({ results: sql.prepare(query).all(...values) }), run: async () => sql.prepare(query).run(...values) };
  }
  return { sql, db: { prepare: statement } as unknown as D1Database, close: () => sql.close() };
}
const fixedNow = Date.parse("2026-10-27T15:00:00Z");
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

test("market migration supports exact cache expiry, replacement and evidence timestamps", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: fixedNow });
  const f = fixture();
  try {
    const first = storage.evidenceStorage(f.db);
    const other = storage.evidenceStorage(f.db);
    const evidence = { symbol: "TEST", retrievedAt: "2026-10-27T14:59:00Z", values: [1, null, 0], sources: [{ url: "https://www.sec.gov/" }] };
    assert.equal(await first.get("missing"), undefined);
    await first.set("sec:financials:TEST", evidence, 1000);
    assert.deepEqual(await other.get("sec:financials:TEST"), evidence, "Separate service instances share public evidence");
    t.mock.timers.tick(999);
    assert.deepEqual(await other.get("sec:financials:TEST"), evidence, "Cache access must not rewrite retrieval timestamps");
    t.mock.timers.tick(1);
    assert.equal(await other.get("sec:financials:TEST"), undefined, "The exact expiry boundary is stale");
    await other.set("sec:financials:TEST", { ...evidence, values: [2] }, 2000);
    assert.deepEqual((await first.get("sec:financials:TEST") as typeof evidence).values, [2]);
    assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM market_evidence_cache").get()!.n, 1);
  } finally { f.close(); }
});

test("cache keys remain bound SQL values and malformed payloads are ignored", async () => {
  const f = fixture();
  try {
    const cache = storage.evidenceStorage(f.db);
    const key = "'; DROP TABLE market_evidence_cache;--";
    await cache.set(key, { source: "public" }, 1000);
    assert.deepEqual(await cache.get(key), { source: "public" });
    assert.equal(await cache.get("another"), undefined);
    f.sql.prepare("UPDATE market_evidence_cache SET payload=? WHERE cache_key=?").run("{broken", key);
    assert.equal(await cache.get(key), undefined);
    assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM market_evidence_cache").get()!.n, 1);
  } finally { f.close(); }
});

test("concurrent anonymous searches admit exactly 30 per address and fixed window", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: fixedNow });
  const f = fixture();
  try {
    const admissions = await Promise.all(Array.from({ length: 50 }, () => storage.admitMarketSearch(f.db, "192.0.2.10")));
    assert.equal(admissions.filter(Boolean).length, 30);
    const row = f.sql.prepare("SELECT bucket,count FROM market_request_limits").get()!;
    assert.equal(row.count, 30, "Denied requests must not grow the counter");
    assert.equal(String(row.bucket).includes("192.0.2.10"), false, "Raw client addresses are not retained in the ledger");
    assert.equal(await storage.admitMarketSearch(f.db, "192.0.2.11"), true);
    t.mock.timers.tick(59_999);
    assert.equal(await storage.admitMarketSearch(f.db, "192.0.2.10"), false);
    t.mock.timers.tick(1);
    assert.equal(await storage.admitMarketSearch(f.db, "192.0.2.10"), true);
  } finally { f.close(); }
});

test("search ledger cleanup is bounded and retains live reservations", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: fixedNow });
  const f = fixture();
  try {
    const insert = f.sql.prepare("INSERT INTO market_request_limits(bucket,count,expires_at) VALUES(?,?,?)");
    for (let i = 0; i < 100; i++) insert.run(`expired-${i}`, 1, fixedNow - 300_000);
    insert.run("sec-outbound", 1, fixedNow + 500);
    await storage.admitMarketSearch(f.db, "192.0.2.20");
    assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM market_request_limits WHERE bucket LIKE 'expired-%'").get()!.n, 60);
    assert.ok(f.sql.prepare("SELECT bucket FROM market_request_limits WHERE bucket='sec-outbound'").get());
  } finally { f.close(); }
});

test("SEC admission is shared across service instances and waits for the exact global slot", async t => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: fixedNow });
  const f = fixture();
  try {
    const first = storage.evidenceStorage(f.db);
    const second = storage.evidenceStorage(f.db);
    await first.reserveSec();
    let admitted = false;
    const pending = second.reserveSec().then(() => { admitted = true; });
    await flush();
    assert.equal(admitted, false);
    t.mock.timers.tick(499); await flush();
    assert.equal(admitted, false);
    t.mock.timers.tick(1); await pending;
    assert.equal(admitted, true);
    assert.equal(f.sql.prepare("SELECT expires_at FROM market_request_limits WHERE bucket='sec-outbound'").get()!.expires_at, fixedNow + 1000);
    assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM market_request_limits").get()!.n, 1);
  } finally { f.close(); }
});

test("SEC saturation fails after a bounded wait without stealing an existing reservation", async t => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: fixedNow });
  const f = fixture();
  try {
    f.sql.prepare("INSERT INTO market_request_limits(bucket,count,expires_at) VALUES('sec-outbound',1,?)").run(fixedNow + 60_000);
    const pending = assert.rejects(storage.evidenceStorage(f.db).reserveSec(), /public filing service is busy/);
    for (let i = 0; i < 24; i++) { await flush(); t.mock.timers.tick(500); }
    await pending;
    assert.equal(f.sql.prepare("SELECT expires_at FROM market_request_limits WHERE bucket='sec-outbound'").get()!.expires_at, fixedNow + 60_000);
  } finally { f.close(); }
});
