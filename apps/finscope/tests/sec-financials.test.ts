import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import type { SecCompanyFacts, SecFact } from "../lib/sec-financials";

const source = stripTypeScriptTypes(await readFile(new URL("../lib/sec-financials.ts", import.meta.url), "utf8"));
const { parseSecFinancials, SEC_CORE_FIELDS } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`) as typeof import("../lib/sec-financials");
const fact = (val: number, end = "2025-09-27", start?: string, accn = "0000000001-25-000001", filed = "2025-11-01"): SecFact => ({ val: val * 1000000, end, ...(start ? { start } : {}), form: "10-K", fy: 2025, fp: "FY", filed, accn });
const concept = (...facts: SecFact[]) => ({ units: { USD: facts } });
const annual = (value: number) => fact(value, "2025-09-27", "2024-09-29");

test("SEC normalized financials preserve exact fiscal joins, latest restatements and explicit missing facts", () => {
  const payload: SecCompanyFacts = { cik: 1, facts: { "us-gaap": {
    Revenues: concept(annual(100), fact(1000, "2025-09-27", "2025-06-29")),
    RevenueFromContractWithCustomerExcludingAssessedTax: concept(fact(110, "2025-09-27", "2024-09-29", "0000000001-26-000001", "2026-11-01")),
    NetIncomeLoss: concept(annual(20), fact(900, "2025-09-27", "2025-01-01")),
    Assets: concept(fact(300)), StockholdersEquity: concept(fact(100)),
  } } };
  const parsed = parseSecFinancials(payload);
  assert.equal(parsed.periods[0].revenue, 110);
  assert.equal(parsed.periods[0].netIncome, 20);
  assert.equal(parsed.periods[0].liabilities, null, "shareholder equity alone does not prove total equity including NCI");
  assert.equal(parsed.periods[0].debt, null);
  assert.equal(parsed.coverage.expected, 11);
  assert.equal(parsed.coverage.present, 4);
  assert.equal(parsed.coverage.percent, 36.4);
  assert.equal(parsed.filedAt, "2026-11-01");
});

test("arithmetic derivations use complete matching disclosures and retain their basis", () => {
  const payload: SecCompanyFacts = { cik: 1, facts: { "us-gaap": {
    Revenues: concept(annual(100)), NetIncomeLoss: concept(annual(12)),
    CostOfRevenue: concept(annual(60)), OperatingExpenses: concept(annual(20)),
    Assets: concept(fact(300)), StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest: concept(fact(130)),
    MinorityInterest: concept(fact(10)),
    DebtCurrent: concept(fact(10)), LongTermDebtNoncurrent: concept(fact(50)),
    NetCashProvidedByUsedInOperatingActivities: concept(annual(25)), PaymentsToAcquirePropertyPlantAndEquipment: concept(annual(5)),
    Cash: concept(fact(5)), CashEquivalentsAtCarryingValue: concept(fact(7)),
  } } };
  const parsed = parseSecFinancials(payload);
  assert.equal(parsed.periods[0].grossProfit, 40);
  assert.equal(parsed.periods[0].operatingIncome, 20);
  assert.equal(parsed.periods[0].liabilities, 170);
  assert.equal(parsed.periods[0].debt, 60);
  assert.equal(parsed.periods[0].cash, 12);
  assert.equal(parsed.periods[0].equity, 120);
  assert.equal(parsed.coverage.percent, 100);
  assert.equal(parsed.statements[2].rows.find(row => row.key === "freeCashFlow")?.values["2025"], 20);
  const derived = parsed.provenance.find(item => item.field === "grossProfit");
  assert.equal(derived?.derived, true);
  assert.deepEqual(derived?.concepts, ["us-gaap:Revenues", "us-gaap:CostOfRevenue"]);
  assert.match(derived?.basis ?? "", /same fiscal period/);
  assert.equal(derived?.sourceUrl, "https://www.sec.gov/Archives/edgar/data/1/000000000125000001/0000000001-25-000001-index.html");
});

test("mismatched filing versions and temporary equity block unsafe balance and earnings derivations", () => {
  const payload: SecCompanyFacts = { facts: { "us-gaap": {
    Revenues: concept(annual(100)),
    CostOfRevenue: concept(fact(60, "2025-09-27", "2024-09-29", "0000000001-26-000002", "2026-11-01")),
    Assets: concept(fact(300)), StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest: concept(fact(130)),
    TemporaryEquityCarryingAmountIncludingPortionAttributableToNoncontrollingInterests: concept(fact(10)),
    LongTermDebtNoncurrent: concept(fact(50)),
  } } };
  const parsed = parseSecFinancials(payload);
  assert.equal(parsed.periods[0].grossProfit, null);
  assert.equal(parsed.periods[0].liabilities, null);
  assert.equal(parsed.periods[0].debt, null, "a missing current debt observation is never an assumed zero");
});

test("redeemable common non-controlling interests are not misclassified as liabilities", () => {
  const payload: SecCompanyFacts = { facts: { "us-gaap": {
    Revenues: concept(annual(100)), Assets: concept(fact(100000)),
    StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest: concept(fact(15900)),
    RedeemableNoncontrollingInterestEquityCommonCarryingAmount: concept(fact(943)),
  } } };
  assert.equal(parseSecFinancials(payload).periods[0].liabilities, null, "84,100 would wrongly include 943 of mezzanine equity");
  payload.facts!["us-gaap"].Liabilities = concept(fact(83157));
  assert.equal(parseSecFinancials(payload).periods[0].liabilities, 83157, "an explicit reported total remains valid");
});

test("parent earnings cannot be divided by NCI-inclusive equity", () => {
  const payload: SecCompanyFacts = { facts: { "us-gaap": {
    Revenues: concept(annual(75100)), NetIncomeLoss: concept(annual(1307)),
    StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest: concept(fact(166194)),
  } } };
  assert.equal(parseSecFinancials(payload).periods[0].equity, null);
  payload.facts!["us-gaap"].MinorityInterest = concept(fact(109832));
  assert.equal(parseSecFinancials(payload).periods[0].equity, 56362);
  delete payload.facts!["us-gaap"].NetIncomeLoss;
  payload.facts!["us-gaap"].ProfitLoss = concept(annual(5000));
  assert.equal(parseSecFinancials(payload).periods[0].netIncome, null);
  payload.facts!["us-gaap"].NetIncomeLossAttributableToNoncontrollingInterest = concept(annual(3693));
  assert.equal(parseSecFinancials(payload).periods[0].netIncome, 1307);
});

test("IFRS native currency is preserved and never merged with USD facts", () => {
  const euroFact = (value: number, duration = false) => ({ units: { EUR: [duration ? annual(value) : fact(value)] } });
  const payload: SecCompanyFacts = { facts: { "ifrs-full": {
    Revenue: euroFact(100, true), ProfitLoss: euroFact(20, true), Assets: euroFact(200), Equity: euroFact(90),
    CashAndCashEquivalents: euroFact(30), CashFlowsFromUsedInOperatingActivities: euroFact(40, true),
  }, "us-gaap": { Assets: concept(fact(999)) } } };
  const parsed = parseSecFinancials(payload);
  assert.equal(parsed.currency, "EUR");
  assert.equal(parsed.periods[0].assets, 200);
  assert.equal(parsed.periods[0].liabilities, 110);
  assert.equal(parsed.periods[0].cash, 30);
});

test("IFRS operating expenses including cost of sales cannot be subtracted from gross profit", () => {
  const payload: SecCompanyFacts = { facts: { "ifrs-full": {
    Revenue: concept(annual(75100)), CostOfSales: concept(annual(28351)), OperatingExpense: concept(annual(56973)),
    ProfitLoss: concept(annual(5000)),
  } } };
  const parsed = parseSecFinancials(payload);
  assert.equal(parsed.periods[0].grossProfit, 46749);
  assert.equal(parsed.periods[0].operatingIncome, null, "total direct operating costs already include cost of sales");
  payload.facts!["ifrs-full"].OperatingExpenseExcludingCostOfSales = concept(annual(10000));
  assert.equal(parseSecFinancials(payload).periods[0].operatingIncome, 36749);
});

test("goods-only revenue and cost components are not silently treated as consolidated totals", () => {
  const payload: SecCompanyFacts = { facts: { "us-gaap": {
    SalesRevenueGoodsNet: concept(annual(100)), SalesRevenueServicesNet: concept(annual(50)),
    NetIncomeLoss: concept(annual(20)), CostOfGoodsSold: concept(annual(60)),
  } } };
  const partial = parseSecFinancials(payload);
  assert.equal(partial.periods[0].revenue, null);
  payload.facts!["us-gaap"].Revenues = concept(annual(150));
  const totalRevenue = parseSecFinancials(payload);
  assert.equal(totalRevenue.periods[0].revenue, 150);
  assert.equal(totalRevenue.periods[0].grossProfit, null, "goods costs do not include service costs");
});

test("banks keep their true revenue definition and missing comparable fields in the fixed denominator", () => {
  const payload: SecCompanyFacts = { facts: { "us-gaap": {
    RevenuesNetOfInterestExpense: concept(annual(100)), Revenues: concept(annual(150)),
    NetIncomeLoss: concept(annual(25)), CostOfRevenue: concept(annual(40)),
    Assets: concept(fact(1000)), Liabilities: concept(fact(900)), StockholdersEquity: concept(fact(100)),
  } } };
  const parsed = parseSecFinancials(payload);
  assert.equal(parsed.periods[0].revenue, 100);
  assert.equal(parsed.periods[0].grossProfit, null);
  assert.equal(parsed.coverage.financialInstitution, true);
  assert.equal(parsed.coverage.latestExpected, SEC_CORE_FIELDS.length);
  assert.ok(parsed.coverage.missingLatest.includes("grossProfit"));
});

test("zero remains zero, and no synthetic rows are created when no annual data exists", () => {
  const zero = parseSecFinancials({ facts: { "us-gaap": { Revenues: concept(annual(100)), NetIncomeLoss: concept(annual(0)), DebtAndCapitalLeaseObligations: concept(fact(0)) } } });
  assert.equal(zero.periods[0].netIncome, 0);
  assert.equal(zero.periods[0].debt, 0);
  assert.ok(!zero.coverage.missingLatest.includes("debt"));
  const empty = parseSecFinancials({ facts: {} });
  assert.equal(empty.periods.length, 0);
  assert.equal(empty.coverage.percent, 0);
  assert.equal(empty.coverage.latestPresent, 0);
});

test("period labels consistently describe the year ending and never use a comparative filing's fy", () => {
  const original = { ...fact(100, "2025-02-01", "2024-02-04", "0000000001-25-000001", "2025-03-20"), fy: 2024 };
  const comparative = { ...original, fy: 2025, accn: "0000000001-26-000001", filed: "2026-03-20", val: 105000000 };
  const parsed = parseSecFinancials({ facts: { "us-gaap": { Revenues: concept(original, comparative) } } });
  assert.equal(parsed.periods[0].year, "2025");
  assert.equal(parsed.periods[0].revenue, 105);
  assert.equal(parsed.dataAsOf, "2025-02-01");
  assert.equal(parsed.provenance[0].period, "2025-02-01");
});
