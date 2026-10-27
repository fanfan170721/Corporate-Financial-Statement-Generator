import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import type { FinancialPeriod, Report } from "../lib/types";

// Native Node >=22.13 test harness: resolve this project's extensionless TS imports
// without adding a transpiler dependency or changing production module resolution.
async function moduleUrl(name: string, dependencies: Record<string, string> = {}): Promise<string> {
  let source = stripTypeScriptTypes(await readFile(new URL(`../lib/${name}.ts`, import.meta.url), "utf8"));
  for (const [dependency, url] of Object.entries(dependencies)) source = source.replaceAll(`"./${dependency}"`, `"${url}"`);
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}
const companiesUrl = await moduleUrl("companies");
const issuerUrl = await moduleUrl("issuer-financials");
const marketUrl = await moduleUrl("market", { companies: companiesUrl, "issuer-financials": issuerUrl });
const aiUrl = await moduleUrl("ai", { market: marketUrl });
const companies = await import(companiesUrl) as typeof import("../lib/companies");
const market = await import(marketUrl) as typeof import("../lib/market");
const ai = await import(aiUrl) as typeof import("../lib/ai");
const caseStudies = await import(await moduleUrl("case-studies", { companies: companiesUrl, market: marketUrl })) as typeof import("../lib/case-studies");

const fact = (val: number, end: string, start?: string, filed = "2025-02-01") => ({ val, end, ...(start ? { start } : {}), filed, form: "10-K", fy: 2024, fp: "FY" });
const concept = (...facts: ReturnType<typeof fact>[]) => ({ units: { USD: facts } });
const blankPeriod: FinancialPeriod = { year: "2024", revenue: null, netIncome: null, operatingCashFlow: null, capex: null, assets: null, liabilities: null, cash: null, debt: null, grossProfit: null, operatingIncome: null, equity: null };

test("company discovery supports Chinese aliases, symbols and English typos without rankings", () => {
  assert.equal(companies.searchLocalCompanies("腾讯")[0].symbol, "0700.HK");
  assert.equal(companies.searchLocalCompanies("brk.b")[0].symbol, "BRK-B");
  assert.equal(companies.searchLocalCompanies("nvdia")[0].symbol, "NVDA");
  assert.equal(companies.searchLocalCompanies("b站")[0].symbol, "BILI");
  assert.ok(companies.COMPANIES.length >= 30);
  assert.equal(new Set(companies.COMPANIES.map((company) => company.symbol)).size, companies.COMPANIES.length);
  assert.ok(companies.recommendCompanies(["NVDA"], 3).every((company) => company.sector === "Semiconductors" && company.symbol !== "NVDA"));
});

test("SEC joins exact fiscal periods, retains latest restatements, ignores quarter facts and never uses filing fy for the year", () => {
  const payload = { facts: { "us-gaap": {
    RevenueFromContractWithCustomerExcludingAssessedTax: concept(
      fact(100_000_000, "2023-09-30", "2022-10-01", "2023-11-01"),
      fact(110_000_000, "2023-09-30", "2022-10-01", "2024-11-01"),
      fact(150_000_000, "2024-09-30", "2023-10-01"),
      fact(99_000_000, "2024-09-30", "2024-07-01"),
    ),
    NetIncomeLoss: concept(fact(30_000_000, "2024-09-30", "2023-10-01"), fact(999_000_000, "2024-09-30", "2024-01-01")),
    Assets: concept(fact(400_000_000, "2024-09-30"), fact(999_000_000, "2024-12-31")),
    StockholdersEquity: concept(fact(180_000_000, "2023-09-30"), fact(200_000_000, "2024-09-30")),
    PaymentsToAcquirePropertyPlantAndEquipment: concept(fact(0, "2024-09-30", "2023-10-01")),
    LongTermDebtCurrentPlusNoncurrent: concept(fact(30_000_000, "2024-09-30")),
  } } };
  const report = market.parseSecCompanyFacts(payload);
  assert.deepEqual(report.periods.map((period) => period.year), ["2023", "2024"]);
  assert.deepEqual(report.periods.map((period) => period.revenue), [110, 150]);
  assert.equal(report.periods[1].netIncome, 30);
  assert.equal(report.periods[1].assets, 400);
  assert.equal(report.periods[1].grossProfit, null);
  assert.equal(report.periods[1].capex, 0);
  assert.equal(report.periods[1].debt, null, "Missing short-term debt is not guessed to be zero");
  assert.equal(report.dataAsOf, "2024-09-30");
  assert.equal(market.calculateMetrics(report.periods).roe, 15.789);
});

test("SEC handles changed taxonomy across years and rejects non-USD values", () => {
  const report = market.parseSecCompanyFacts({ facts: { "us-gaap": {
    Revenues: concept(fact(50_000_000, "2022-12-31", "2022-01-01")),
    RevenueFromContractWithCustomerExcludingAssessedTax: concept(fact(60_000_000, "2023-12-31", "2023-01-01")),
    GrossProfit: { units: { EUR: [fact(999_000_000, "2023-12-31", "2023-01-01")] } },
  } } });
  assert.deepEqual(report.periods.map((period) => period.revenue), [50, 60]);
  assert.equal(report.periods[1].grossProfit, null);
});

test("FMP joins fiscal dates and currencies rather than index position", () => {
  const income = [{ date: "2023-12-31", period: "FY", reportedCurrency: "USD", revenue: 100_000_000, netIncome: 20_000_000 }, { date: "2024-12-31", period: "FY", reportedCurrency: "USD", revenue: 120_000_000, netIncome: 25_000_000 }];
  const balance = [{ date: "2024-12-31", period: "FY", reportedCurrency: "EUR", totalAssets: 999_000_000 }, { date: "2023-12-31", period: "FY", reportedCurrency: "USD", totalAssets: 200_000_000 }];
  const cash = [{ date: "2024-12-31", period: "FY", reportedCurrency: "USD", operatingCashFlow: 40_000_000, capitalExpenditure: -10_000_000 }];
  const result = market.parseFmpStatements(income, balance, cash);
  assert.equal(result.periods[0].assets, 200);
  assert.equal(result.periods[1].assets, null);
  assert.equal(result.periods[1].capex, 10);
  assert.equal(market.calculateMetrics(result.periods).freeCashFlow, 30);
  assert.equal(result.currency, "USD");
});

test("undefined and negative denominators do not produce invented ratios or infinity", () => {
  const result = market.calculateMetrics([{ ...blankPeriod, revenue: 0, equity: -2, liabilities: 0, netIncome: 5, debt: 20, cash: 0 }]);
  assert.equal(result.revenueGrowth, null);
  assert.equal(result.netMargin, null);
  assert.equal(result.debtToEquity, null);
  assert.equal(result.roe, null);
  assert.equal(result.cashRatio, null);
});

test("demo fixtures are deterministic, explicitly synthetic, and never cite real company filings", () => {
  const first = market.getDemoReport("NVDA");
  const second = market.getDemoReport("NVDA");
  assert.deepEqual(first.periods, second.periods);
  assert.equal(first.mode, "demo");
  assert.match(first.note!, /Synthetic illustration/);
  assert.equal(first.sources.length, 0);
  assert.equal(first.periods.length, 5);
  assert.ok(first.insights.length >= 5);
});

test("provider failures never silently yield a live report", async () => {
  const env = { SEC_USER_AGENT: "", FMP_API_KEY: "" };
  await assert.rejects(() => market.generateReport("NVDA", { env }), { code: "DATA_COVERAGE_UNAVAILABLE" });
  const fallback = await market.generateReport("NVDA", { env, allowDemoFallback: true });
  assert.equal(fallback.mode, "demo");
  assert.match(fallback.note!, /Provider retrieval failed/);
});

test("AI never runs on synthetic data and missing credentials remain unavailable", async () => {
  const report = market.getDemoReport("NVDA");
  let called = false;
  const fetcher = (async () => { called = true; throw Error("must not call"); }) as typeof fetch;
  assert.equal((await ai.generateAIAnalysis(report, { env: { OPENAI_API_KEY: "" }, fetcher })).status, "unavailable");
  assert.equal((await ai.generateAIAnalysis(report, { env: { OPENAI_API_KEY: "test-value" }, fetcher })).status, "unavailable");
  assert.equal(called, false);
});

test("AI citations must be verified against actual tool evidence", () => {
  const report = { ...market.getDemoReport("NVDA"), mode: "live" } as Report;
  const insight = { title: "Growth durability", stance: "neutral", summary: "Order trends need verification", detail: "A conditional research inference", citations: ["https://example.com/verified", "https://attacker.invalid/fabricated"] };
  const payload = { status: "completed", output: [
    { type: "web_search_call", action: { sources: [{ type: "url", url: "https://example.com/verified", title: "Actual source" }] } },
    { type: "message", content: [{ type: "output_text", text: JSON.stringify({ summary: "A conditional analytical conclusion", insights: Array.from({ length: 5 }, () => insight) }) }] },
  ] };
  const result = ai.parseAIResponse(payload, report, "test-model");
  assert.equal(result.status, "ready");
  assert.deepEqual(result.sources, [{ label: "Actual source", url: "https://example.com/verified" }]);
  assert.match(result.insights[0].detail!, /Sources 1/);
  const hallucinated = structuredClone(payload);
  hallucinated.output[0] = { type: "web_search_call", action: { sources: [] } };
  assert.equal(ai.parseAIResponse(hallucinated, report, "test-model").status, "unavailable");
});


test("published Microsoft case reconciles annual statements and retains its fixed cutoff", () => {
  const report = caseStudies.getCaseStudy("MSFT")!;
  assert.equal(report.id, "case-MSFT");
  assert.equal(report.dataAsOf, "2025-06-30");
  assert.equal(report.generatedAt, caseStudies.getCaseStudy("msft")!.generatedAt);
  assert.deepEqual(report.periods.map((period) => period.year), ["2021", "2022", "2023", "2024", "2025"]);
  for (const period of report.periods) {
    assert.equal(period.assets, period.liabilities! + period.equity!);
    assert.equal(Object.values(period).filter((value) => typeof value === "number").length, 11);
  }
  assert.equal(report.metrics.freeCashFlow, 71611);
  assert.equal(report.periods[3].operatingCashFlow! - report.periods[3].capex!, 74071);
  assert.equal(report.periods[4].debt, 43151);
  assert.match(report.note!, /Frozen annual-report figures/);
  assert.ok(report.sources.every((source) => new URL(source.url).hostname === "www.microsoft.com"));
  assert.equal(caseStudies.getCaseStudy("UNKNOWN"), undefined);
  report.periods[0].revenue = 0;
  assert.equal(caseStudies.getCaseStudy("MSFT")!.periods[0].revenue, 168088);
});
