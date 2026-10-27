import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import type { EvidenceCache } from "../lib/market-storage";

async function moduleUrl(name: string, fresh = false): Promise<string> {
  let source = stripTypeScriptTypes(await readFile(new URL(`../lib/${name}.ts`, import.meta.url), "utf8"));
  for (const dependency of new Set([...source.matchAll(/from "\.\/([a-z-]+)"/g)].map(match => match[1]))) source = source.replaceAll(`"./${dependency}"`, `"${await moduleUrl(dependency)}"`);
  // Each test has independent in-memory caches as a new Worker instance would.
  if (fresh) source += `\n// fixture ${crypto.randomUUID()}`;
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}
type Market = typeof import("../lib/market");
const load = async () => await import(await moduleUrl("market", true)) as Market;
const agent = "Finscope test contact@example.test";
const env = { SEC_USER_AGENT: agent, FMP_API_KEY: "" };
// All company values are invented for adapter tests, never production fixtures.
const directory = { fields: ["cik", "name", "ticker", "exchange"], data: [[111, "Fixture Alpha Corporation", "FXALPHA", "Nasdaq"], [222, "Fixture Without Financials", "FXNONE", "NYSE"], [333, "Fixture Dual Class", "FXD-A", "NYSE"], [333, "Fixture Dual Class", "FXD-B", "NYSE"], [444, "ROYAL BANK OF CANADA", "RY", "NYSE"], [555, "Québec Manufacturing Fixture", "FXQC", "NYSE"]] };
function financials(cik: number) {
  const tags = ["Revenues", "NetIncomeLoss", "NetCashProvidedByUsedInOperatingActivities", "PaymentsToAcquirePropertyPlantAndEquipment", "Assets", "Liabilities", "CashAndCashEquivalentsAtCarryingValue", "DebtAndFinanceLeaseObligations", "GrossProfit", "OperatingIncomeLoss", "StockholdersEquity"];
  const durations = new Set(["Revenues", "NetIncomeLoss", "NetCashProvidedByUsedInOperatingActivities", "PaymentsToAcquirePropertyPlantAndEquipment", "GrossProfit", "OperatingIncomeLoss"]);
  return { cik, facts: { "us-gaap": Object.fromEntries(tags.map(tag => [tag, { units: { USD: [2024, 2025].map(year => ({ ...(durations.has(tag) ? { start: `${year}-01-01` } : {}), end: `${year}-12-31`, val: tag === "Assets" ? 200_000_000 : tag === "Liabilities" ? 80_000_000 : tag === "StockholdersEquity" ? 120_000_000 : 20_000_000, form: "10-K", filed: `${year + 1}-02-15`, accn: `000000${cik}-26-000001` })) } }])) } };
}
function transport(options: { empty?: boolean; status?: number } = {}) {
  const requested: string[] = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input); requested.push(url);
    assert.equal(init?.redirect, "manual");
    assert.equal(new Headers(init?.headers).get("User-Agent"), agent);
    const parsed = new URL(url);
    assert.ok(["www.sec.gov", "data.sec.gov"].includes(parsed.hostname), "Only fixed SEC origins can be requested");
    if (parsed.pathname === "/files/company_tickers_exchange.json") return Response.json(directory);
    if (parsed.pathname.startsWith("/submissions/")) return Response.json({});
    const cik = /^\/api\/xbrl\/companyfacts\/CIK(\d{10})\.json$/.exec(parsed.pathname)?.[1];
    assert.ok(cik, `Unexpected request: ${url}`);
    if (options.status) return new Response("upstream unavailable", { status: options.status });
    return Response.json(options.empty || Number(cik) === 222 ? { cik: Number(cik), facts: {} } : financials(Number(cik)));
  }) as typeof fetch;
  return { fetcher, requested };
}

test("directory discovery searches issuers outside the curated catalogue and verifies actual financials", async () => {
  const market = await load();
  const f = transport();
  const results = await market.searchCompanies("Fixture Alpha", { env, fetcher: f.fetcher, live: true });
  assert.equal(results.length, 1);
  assert.equal(results[0].symbol, "FXALPHA");
  assert.equal(results[0].exchange, "NASDAQ");
  assert.equal(results[0].coverage?.status, "available");
  assert.equal(results[0].coverage?.completeness, 100);
  assert.ok(f.requested.some(url => url.endsWith("CIK0000000111.json")));
  assert.equal(f.requested.some(url => url.includes("submissions")), false, "Autocomplete must not fetch optional company context");
});

test("French aliases and accent-insensitive names retain current directory identities and verification", async () => {
  const market = await load();
  const f = transport();
  for (const query of ["Banque Royale du Canada", "société Banque Royale du Canada"]) {
    const result = await market.searchCompanies(query, { env, fetcher:f.fetcher, live:true });
    assert.equal(result[0]?.symbol,"RY");
    assert.equal(Number(result[0]?.cik),444);
    assert.equal(result[0]?.coverage?.status,"available");
  }
  const result = await market.searchCompanies("Quebec Manufacturing", { env, fetcher:f.fetcher, live:true });
  assert.equal(result[0]?.symbol,"FXQC");
  assert.ok(f.requested.some(url=>url.endsWith("CIK0000000555.json")));
});

test("a directory match and configured contact cannot falsely make missing or failing evidence ready", async () => {
  for (const fixture of [transport({ empty: true }), transport({ status: 503 })]) {
    const market = await load();
    const results = await market.searchCompanies("FXALPHA", { env, fetcher: fixture.fetcher, live: true });
    assert.equal(results.length, 1);
    assert.equal(results[0].coverage?.status, "unavailable");
    assert.equal(results[0].coverage?.completeness, 0);
    assert.ok(results[0].coverage?.reason);
  }
});

test("an exact security symbol selects its own class while shared issuer evidence keeps both identities", async () => {
  const market = await load();
  const f = transport();
  const stored = new Map<string, unknown>();
  const cache: EvidenceCache = { get: async key => stored.get(key), set: async (key, value) => { stored.set(key, structuredClone(value)); }, reserveSec: async () => {} };
  const first = await market.searchCompanies("FXD-A", { env, fetcher: f.fetcher, cache, live: true });
  const second = await market.searchCompanies("FXD-B", { env, fetcher: f.fetcher, cache, live: true });
  assert.deepEqual(first.map(company => company.symbol), ["FXD-A"]);
  assert.deepEqual(second.map(company => company.symbol), ["FXD-B"]);
  assert.equal(second[0].coverage?.status, "available");
  assert.equal(f.requested.filter(url => url.includes("companyfacts")).length, 1, "Financial statements are issuer-level public evidence");
  const report = await market.generateReport("FXD-B", { env, fetcher: f.fetcher, cache });
  assert.equal(report.symbol, "FXD-B");
  assert.equal(report.company.symbol, "FXD-B");
  assert.equal(report.provider, "SEC EDGAR");
  assert.equal(report.mode, "live");
  assert.equal(report.ai, undefined);
});

test("unknown names and hostile security strings never become arbitrary upstream URLs", async () => {
  const market = await load();
  const f = transport();
  assert.deepEqual(await market.searchCompanies("https://attacker.example/internal", { env, fetcher: f.fetcher, live: true }), []);
  for (const symbol of ["../metadata", "https://attacker.example", "A?apikey=secret", "A/B"]) await assert.rejects(market.generateReport(symbol, { env, fetcher: f.fetcher }), { code: "INVALID_SYMBOL" });
  assert.equal(f.requested.length, 1, "Only the fixed issuer directory is fetched for unmatched input");
});

test("SEC headlines and insights preserve withheld FCF when components come from different filings", async () => {
  const market = await load();
  const base = transport();
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const response = await base.fetcher(input, init);
    if (!String(input).includes("companyfacts")) return response;
    const payload = await response.json() as ReturnType<typeof financials>;
    for (const fact of payload.facts["us-gaap"].PaymentsToAcquirePropertyPlantAndEquipment.units.USD) fact.accn = "0000000111-25-000001";
    return Response.json(payload);
  }) as typeof fetch;
  const report = await market.generateReport("FXALPHA", { env, fetcher });
  assert.ok(report.periods.at(-1)?.operatingCashFlow != null);
  assert.ok(report.periods.at(-1)?.capex != null);
  assert.equal(report.metrics.freeCashFlow, null);
  assert.equal(report.statements?.find(statement => statement.kind === "cashflow")?.rows.find(row => row.key === "freeCashFlow")?.values["2025"], null);
  assert.match(report.insights.find(item => item.title === "Cash conversion")!.summary, /unavailable/);
});
