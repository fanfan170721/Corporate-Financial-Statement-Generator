import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import type { FinancialPeriod, Report } from "../lib/types";

async function moduleUrl(name: string, dependencies: Record<string, string> = {}): Promise<string> {
  let source = stripTypeScriptTypes(await readFile(new URL(`../lib/${name}.ts`, import.meta.url), "utf8"));
  for (const match of [...source.matchAll(/from "\.\/([a-z-]+)"/g)]) if (!dependencies[match[1]]) dependencies[match[1]] = await moduleUrl(match[1], dependencies);
  for (const [dependency, url] of Object.entries(dependencies)) source = source.replaceAll(`"./${dependency}"`, `"${url}"`);
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}
const market = await import(await moduleUrl("market")) as typeof import("../lib/market");
const scope = await import(await moduleUrl("report-scope")) as typeof import("../lib/report-scope");
const env = { SEC_USER_AGENT: "Finscope test contact@example.test", FMP_API_KEY: "" };
const entries = ["PART", "BASIC", "MISMATCH", "EMPTY", "CACHE"].map((symbol, i) => ({ symbol, cik: 900001 + i }));
const directory = { fields: ["cik", "name", "ticker", "exchange"], data: entries.map(entry => [entry.cik, `${entry.symbol} Example Corporation`, entry.symbol, "Nasdaq"]) };
function submissions(cik: number) {
  return { cik, name: "Example Corporation", sic: "3571", sicDescription: "Electronic computers", fiscalYearEnd: "1231", addresses: { business: { stateOrCountryDescription: "CANADA" } }, filings: { recent: { form: ["S-1"], filingDate: ["2026-01-10"], reportDate: [""], accessionNumber: [`${String(cik).padStart(10, "0")}-26-000001`], primaryDocument: ["registration.htm"] } } };
}
function fetcherFor(symbol: string, options: { partial?: boolean; mismatch?: boolean; empty?: boolean } = {}) {
  const cik = entries.find(entry => entry.symbol === symbol)!.cik;
  return (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("company_tickers_exchange.json")) return Response.json(directory);
    if (url.includes("companyfacts")) {
      if (!options.partial) return new Response("not found", { status: 404 });
      return Response.json({ cik, facts: { "us-gaap": { Revenues: { units: { USD: [{ val: 100000000, start: "2025-01-01", end: "2025-12-31", filed: "2026-02-01", form: "10-K", fp: "FY", accn: `${String(cik).padStart(10, "0")}-26-000001` }] } } } } });
    }
    if (url.includes("submissions")) {
      const body = submissions(options.mismatch ? cik + 100 : cik);
      if (options.empty) body.filings.recent.form = [];
      return Response.json(body);
    }
    throw new Error("Unexpected endpoint");
  }) as typeof fetch;
}

test("sparse annual facts produce a partial report and selectable search result without fabricated fields", async () => {
  const fetcher = fetcherFor("PART", { partial: true });
  const report = await market.generateReport("PART", { env, fetcher });
  assert.equal(report.coverage?.status, "limited");
  assert.equal(report.coverage?.reportAvailable, true);
  assert.equal(report.scope?.level, "partial");
  assert.equal(report.periods[0].revenue, 100);
  assert.equal(report.periods[0].assets, null);
  assert.equal(report.metrics.roe, null);
  assert.ok(report.scope?.available.includes("Income and profitability"));
  assert.ok(report.scope?.missing.includes("Cash flow"));
  const search = await market.searchCompanies("PART", { env, fetcher });
  assert.equal(scope.canGenerateCompany(search[0]), true);
  assert.equal(search[0].discoveryOnly, true);
  assert.equal(search[0].coverage, undefined, "Discovery does not hydrate or advertise report coverage");
});

test("unavailable company facts fall back to validated identity and original registration filings", async () => {
  const fetcher = fetcherFor("BASIC");
  const report = await market.generateReport("BASIC", { env, fetcher });
  assert.equal(report.mode, "live");
  assert.equal(report.scope?.level, "basic");
  assert.equal(report.coverage?.status, "unavailable", "basic evidence must not claim financial coverage");
  assert.equal(report.coverage?.reportAvailable, true);
  assert.equal(report.coverage?.completeness, 0);
  assert.deepEqual(report.periods, []);
  assert.deepEqual(report.insights, []);
  assert.ok(Object.values(report.metrics).every(value => value === null));
  assert.equal(report.profile?.legalName, "Example Corporation");
  assert.equal(report.profile?.sic, "3571");
  assert.equal(report.profile?.country, "CANADA");
  assert.equal(report.filings?.[0].form, "S-1");
  assert.equal(report.dataAsOf, "2026-01-10");
  assert.equal(report.coverage?.dataAsOf, "2026-01-10", "basic scope dates the latest filing rather than an invented financial period");
  assert.ok(report.scope?.limitations.some(value => value.includes("could not be retrieved or normalized")));
  const search = await market.searchCompanies("BASIC", { env, fetcher });
  assert.equal(scope.canGenerateCompany(search[0]), true);
  assert.equal(search[0].discoveryOnly, true);
  assert.equal(search[0].coverage, undefined);
});

test("mismatched issuer identity or missing original filings cannot produce a basic report", async () => {
  for (const [symbol, options] of [["MISMATCH", { mismatch: true }], ["EMPTY", { empty: true }]] as const) {
    const fetcher = fetcherFor(symbol, options);
    await assert.rejects(() => market.generateReport(symbol, { env, fetcher }), { code: "PROVIDER_ERROR" });
    const search = await market.searchCompanies(symbol, { env, fetcher });
    assert.equal(scope.canGenerateCompany(search[0]), true, "A directory entry permits requesting a report; retrieval still fails closed above");
    assert.equal(search[0].discoveryOnly, true);
    assert.equal(search[0].coverage, undefined);
  }
  await assert.rejects(() => market.generateReport("DOESNOTEXIST", { env, fetcher: fetcherFor("BASIC") }), { code: "UNKNOWN_SYMBOL" });
});

test("metadata discovery permits valid issuer requests without certifying coverage", () => {
  const company = { symbol: "FXVALID", cik: "123456", name: "Valid Issuer", nameEn: "Valid Issuer", exchange: "NYSE", sector: "Test", color: "#000", mark: "V", discoveryOnly: true };
  assert.equal(scope.canGenerateCompany(company), true);
  assert.equal(scope.canGenerateCompany({ ...company, cik: undefined }), false);
  assert.equal(scope.canGenerateCompany({ ...company, cik: "../../../internal" }), false);
  assert.equal(scope.canGenerateCompany({ ...company, symbol: "A/B" }), false);
  assert.equal(scope.canGenerateCompany({ ...company, cik: undefined, discoveryProvider: "fmp" }), true);
  assert.equal(scope.canGenerateCompany({ ...company, cik: undefined, discoveryProvider: "fmp", symbol: "../internal" }), false);
  assert.equal(scope.canGenerateCompany({ ...company, discoveryOnly: false }), false);
});

test("the full-report threshold remains strict and legacy cached evidence receives explicit scope", async () => {
  const period: FinancialPeriod = { year: "2025", revenue: 100, netIncome: 20, operatingCashFlow: 30, capex: 10, assets: 300, liabilities: 100, cash: 50, debt: 60, grossProfit: 70, operatingIncome: 40, equity: 200 };
  const periods = [{ ...period, year: "2024" }, period];
  const full = market.assessCoverage(periods, "2025-12-31", "2026-10-27T00:00:00Z");
  assert.equal(full.status, "available");
  assert.equal(full.reportLevel, "full");
  assert.equal(full.reportAvailable, true);
  assert.equal(market.assessCoverage([{ ...period, revenue: null }], "2025-12-31", full.checkedAt).status, "limited");
  const company = { symbol: "CACHE", cik: "900005", name: "Cache Corp", nameEn: "Cache Corp", exchange: "NASDAQ", sector: "Test", color: "#000", mark: "C" };
  const old: Report = { id: "legacy", company, symbol: "CACHE", generatedAt: full.checkedAt, retrievedAt: full.checkedAt, dataAsOf: "2025-12-31", mode: "live", currency: "USD", provider: "SEC EDGAR", periods, metrics: market.calculateMetrics(periods), insights: [], sources: [{ label: "Annual filing", url: "https://www.sec.gov/Archives/edgar/data/900005/000090000526000001/annual.htm" }] };
  const cache = { get: async (key: string) => key === "sec:financials:v5:900005" ? old : undefined, set: async () => undefined, reserveSec: async () => undefined };
  const report = await market.generateReport("CACHE", { env, fetcher: fetcherFor("CACHE"), cache });
  assert.equal(report.scope?.level, "full");
  assert.equal(report.coverage?.reportAvailable, true);
  assert.equal(report.coverage?.completeness, 100);
});
