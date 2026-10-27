import type { FinancialPeriod, FinancialStatement, FinancialStatementRow } from "./types";

/** SEC Company Facts contains standardized, entity-wide concepts, not every issuer-defined line. */
export type SecFact = { start?: string; end: string; val: number; filed?: string; form?: string; fy?: number; fp?: string; accn?: string };
type Concept = { label?: string; description?: string; units?: Record<string, SecFact[]> };
export type SecCompanyFacts = { cik?: number; entityName?: string; facts?: Record<string, Record<string, Concept>> };
type CoreField = Exclude<keyof FinancialPeriod, "year">;
export const SEC_CORE_FIELDS: CoreField[] = ["revenue", "netIncome", "operatingCashFlow", "capex", "assets", "liabilities", "cash", "debt", "grossProfit", "operatingIncome", "equity"];
export type SecProvenance = { period: string; periodLabel: string; field: string; concepts: string[]; filedAt: string; accessions: string[]; sourceUrl: string; derived: boolean; basis?: string };
export type SecCoverage = { fields: string[]; present: number; expected: number; percent: number; latestPresent: number; latestExpected: number; latestPercent: number; missingLatest: string[]; financialInstitution: boolean; statementBasis: "standardized-sec-concepts" };
export type SecFinancials = { periods: FinancialPeriod[]; currency: string; dataAsOf: string; filedAt: string; statements: FinancialStatement[]; coverage: SecCoverage; provenance: SecProvenance[] };
type Observation = { value: number; facts: { concept: string; fact: SecFact }[]; basis?: string };
type Definition = { key: string; label: string; tags: string[]; duration?: boolean; total?: boolean; unit?: FinancialStatementRow["unit"] };
const FORMS = new Set(["10-K", "10-K/A", "20-F", "20-F/A", "40-F", "40-F/A"]);
const CORE_TAGS: Record<CoreField, string[]> = {
  revenue: ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "RevenueFromContractWithCustomerIncludingAssessedTax", "SalesRevenueNet", "Revenue", "RevenueFromContractsWithCustomers"],
  netIncome: ["NetIncomeLoss", "ProfitLossAttributableToOwnersOfParent"],
  operatingCashFlow: ["NetCashProvidedByUsedInOperatingActivities", "CashFlowsFromUsedInOperatingActivities"],
  capex: ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets", "PurchaseOfPropertyPlantAndEquipment", "PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities"],
  assets: ["Assets"], liabilities: ["Liabilities"],
  cash: ["CashAndCashEquivalentsAtCarryingValue", "CashAndCashEquivalents"],
  debt: ["DebtAndCapitalLeaseObligations", "DebtAndFinanceLeaseObligations"],
  grossProfit: ["GrossProfit"], operatingIncome: ["OperatingIncomeLoss", "ProfitLossFromOperatingActivities"],
  equity: ["StockholdersEquity", "EquityAttributableToOwnersOfParent"],
};
const DURATION = new Set<string>(["revenue", "netIncome", "operatingCashFlow", "capex", "grossProfit", "operatingIncome"]);
const income: Definition[] = [
  { key: "revenue", label: "Revenue", tags: CORE_TAGS.revenue, duration: true, total: true },
  { key: "costOfRevenue", label: "Cost of revenue", tags: ["CostOfRevenue", "CostOfGoodsAndServicesSold", "CostOfSales"], duration: true },
  { key: "grossProfit", label: "Gross profit", tags: CORE_TAGS.grossProfit, duration: true, total: true },
  { key: "researchDevelopment", label: "Research and development", tags: ["ResearchAndDevelopmentExpense", "ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost", "ResearchAndDevelopmentExpenseRecognisedInProfitOrLoss"], duration: true },
  { key: "sellingGeneralAdministrative", label: "Selling, general and administrative", tags: ["SellingGeneralAndAdministrativeExpense", "SellingGeneralAndAdministrativeExpenseExcludingDepreciationDepletionAndAmortization"], duration: true },
  { key: "operatingExpenses", label: "Operating expenses excluding cost of revenue", tags: ["OperatingExpenses", "OperatingExpenseExcludingCostOfSales"], duration: true },
  { key: "operatingIncome", label: "Operating income", tags: CORE_TAGS.operatingIncome, duration: true, total: true },
  { key: "pretaxIncome", label: "Income before tax", tags: ["IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest", "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments", "ProfitLossBeforeTax"], duration: true },
  { key: "incomeTax", label: "Income tax expense", tags: ["IncomeTaxExpenseBenefit", "IncomeTaxExpenseContinuingOperations"], duration: true },
  { key: "consolidatedNetIncome", label: "Consolidated net income including non-controlling interests", tags: ["ProfitLoss"], duration: true },
  { key: "netIncome", label: "Net income attributable to parent shareholders", tags: CORE_TAGS.netIncome, duration: true, total: true },
  { key: "basicEps", label: "Basic earnings per share", tags: ["EarningsPerShareBasic", "BasicEarningsLossPerShare"], duration: true, unit: "currency-per-share" },
  { key: "dilutedEps", label: "Diluted earnings per share", tags: ["EarningsPerShareDiluted", "DilutedEarningsLossPerShare"], duration: true, unit: "currency-per-share" },
];
const balance: Definition[] = [
  { key: "cash", label: "Cash and cash equivalents", tags: CORE_TAGS.cash },
  { key: "receivables", label: "Receivables, net", tags: ["AccountsReceivableNetCurrent", "ReceivablesNetCurrent", "TradeAndOtherCurrentReceivables"] },
  { key: "inventory", label: "Inventories", tags: ["InventoryNet", "Inventories"] },
  { key: "currentAssets", label: "Current assets", tags: ["AssetsCurrent", "CurrentAssets"], total: true },
  { key: "propertyPlantEquipment", label: "Property, plant and equipment, net", tags: ["PropertyPlantAndEquipmentNet", "PropertyPlantAndEquipment"] },
  { key: "goodwill", label: "Goodwill", tags: ["Goodwill"] },
  { key: "assets", label: "Total assets", tags: CORE_TAGS.assets, total: true },
  { key: "currentLiabilities", label: "Current liabilities", tags: ["LiabilitiesCurrent", "CurrentLiabilities"], total: true },
  { key: "noncurrentLiabilities", label: "Non-current liabilities", tags: ["LiabilitiesNoncurrent", "NoncurrentLiabilities"], total: true },
  { key: "liabilities", label: "Total liabilities", tags: CORE_TAGS.liabilities, total: true },
  { key: "debt", label: "Total debt and financing leases, where reported", tags: CORE_TAGS.debt },
  { key: "equity", label: "Equity attributable to shareholders", tags: CORE_TAGS.equity, total: true },
  { key: "totalEquity", label: "Total equity including non-controlling interests", tags: ["StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest", "Equity"], total: true },
];
const cashflow: Definition[] = [
  { key: "netIncome", label: "Net income", tags: CORE_TAGS.netIncome, duration: true },
  { key: "depreciation", label: "Depreciation and amortisation", tags: ["DepreciationDepletionAndAmortization", "DepreciationDepletionAndAmortizationPropertyPlantAndEquipment", "DepreciationAmortizationAndAccretionNet", "DepreciationAndAmortisationExpense"], duration: true },
  { key: "shareBasedCompensation", label: "Share-based compensation", tags: ["ShareBasedCompensation", "SharebasedPaymentExpense"], duration: true },
  { key: "operatingCashFlow", label: "Cash from operating activities", tags: CORE_TAGS.operatingCashFlow, duration: true, total: true },
  { key: "capex", label: "Capital expenditure (cash outflow)", tags: CORE_TAGS.capex, duration: true },
  { key: "freeCashFlow", label: "Free cash flow (operating cash flow less capital expenditure)", tags: [], duration: true, total: true },
  { key: "investingCashFlow", label: "Cash from investing activities", tags: ["NetCashProvidedByUsedInInvestingActivities", "CashFlowsFromUsedInInvestingActivities"], duration: true, total: true },
  { key: "financingCashFlow", label: "Cash from financing activities", tags: ["NetCashProvidedByUsedInFinancingActivities", "CashFlowsFromUsedInFinancingActivities"], duration: true, total: true },
  { key: "dividendsPaid", label: "Dividends paid", tags: ["PaymentsOfDividends", "PaymentsOfDividendsCommonStock", "DividendsPaidClassifiedAsFinancingActivities"], duration: true },
  { key: "shareRepurchases", label: "Repurchases of common shares", tags: ["PaymentsForRepurchaseOfCommonStock", "PurchaseOfTreasuryShares"], duration: true },
];

function annual(fact: SecFact): boolean {
  if (!fact.start || !FORMS.has(fact.form ?? "") || !Number.isFinite(fact.val)) return false;
  const days = (Date.parse(fact.end) - Date.parse(fact.start)) / 86400000;
  return days >= 330 && days <= 380;
}
function scaled(value: number, unit?: FinancialStatementRow["unit"]): number {
  return Number((unit === "currency-per-share" ? value : value / 1000000).toFixed(6));
}
function calculated(basis: string, parts: (Observation | undefined)[], operation: (...values: number[]) => number): Observation | undefined {
  if (parts.some((part) => !part)) return undefined;
  const present = parts as Observation[];
  // Derivations must reconcile disclosures from one filing, rather than mixing restatements.
  const filingIdentities = present.flatMap((part) => part.facts.map(({ fact }) => fact.accn ?? fact.filed));
  if (filingIdentities.some((identity) => !identity) || new Set(filingIdentities).size !== 1) return undefined;
  const value = operation(...present.map((part) => part.value));
  return Number.isFinite(value) ? { value, facts: present.flatMap((part) => part.facts), basis } : undefined;
}

export function parseSecFinancials(payload: SecCompanyFacts, options: { cik?: string; retrievedAt?: string } = {}): SecFinancials {
  const taxonomies = ["us-gaap", "ifrs-full"];
  const all = (tags: string[], unit: string): { concept: string; fact: SecFact }[] => tags.flatMap((tag) => taxonomies.flatMap((taxonomy) => (payload.facts?.[taxonomy]?.[tag]?.units?.[unit] ?? []).map((fact) => ({ concept: `${taxonomy}:${tag}`, fact }))));
  const anchorsTags = [...CORE_TAGS.revenue, "RevenuesNetOfInterestExpense", ...CORE_TAGS.netIncome, "ProfitLoss", ...CORE_TAGS.operatingCashFlow];
  const currencies = [...new Set(taxonomies.flatMap((taxonomy) => anchorsTags.flatMap((tag) => Object.keys(payload.facts?.[taxonomy]?.[tag]?.units ?? {}))))].filter((unit) => /^[A-Z]{3}$/.test(unit));
  const currency = currencies.map((unit) => ({ unit, facts: all(anchorsTags, unit).filter(({ fact }) => annual(fact)) })).sort((a, b) => {
    const last = (facts: typeof a.facts) => facts.map(({ fact }) => fact.end).sort().at(-1) ?? "";
    return last(b.facts).localeCompare(last(a.facts)) || b.facts.length - a.facts.length;
  })[0]?.unit ?? "USD";
  const annualFacts = all(anchorsTags, currency).filter(({ fact }) => annual(fact));
  const anchors = new Map<string, SecFact>();
  // Use the modal exact start/end combination across core statements. This prevents a
  // stray alternative-duration concept from defining the join for the entire year.
  for (const end of [...new Set(annualFacts.map(({ fact }) => fact.end))].sort()) {
    const groups = new Map<string, { count: number; fact: SecFact }>();
    for (const { fact } of annualFacts.filter((item) => item.fact.end === end)) {
      const key = fact.start!; const existing = groups.get(key);
      groups.set(key, { count: (existing?.count ?? 0) + 1, fact: existing && (existing.fact.filed ?? "") > (fact.filed ?? "") ? existing.fact : fact });
    }
    const chosen = [...groups.values()].sort((a, b) => b.count - a.count || (b.fact.filed ?? "").localeCompare(a.fact.filed ?? ""))[0];
    if (chosen) anchors.set(end, chosen.fact);
  }
  const selected = [...anchors.values()].slice(-5);
  // Labels describe the calendar year in which the reporting period ends. The UI
  // must say "year ending", not imply this is the issuer's own fiscal-year number.
  const fiscalLabels = selected.map((anchor) => anchor.end.slice(0, 4));
  const financialInstitution = all(["RevenuesNetOfInterestExpense", "PremiumsEarnedNet"], currency).some(({ fact }) => fact.end === selected.at(-1)?.end && annual(fact));
  const provenance: SecProvenance[] = [];
  const cik = options.cik ?? String(payload.cik ?? "");
  const validCik = /^\d{1,10}$/.test(cik);
  const sourceUrl = validCik ? `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik.padStart(10, "0")}.json` : "https://www.sec.gov/search-filings/edgar-application-programming-interfaces";
  const periodObservations: Record<string, Observation | undefined>[] = [];
  const definitions = [...income, ...balance, ...cashflow];
  const periods = selected.map((anchor, index): FinancialPeriod => {
    const read = (tags: string[], duration = false, unit = currency): Observation | undefined => {
      const matches = all(tags, unit).filter(({ fact }) => Number.isFinite(fact.val) && FORMS.has(fact.form ?? "") && fact.end === anchor.end && (duration ? fact.start === anchor.start : !fact.start));
      matches.sort((a, b) => (b.fact.filed ?? "").localeCompare(a.fact.filed ?? "") || tags.indexOf(a.concept.split(":")[1]) - tags.indexOf(b.concept.split(":")[1]));
      return matches[0] ? { value: matches[0].fact.val, facts: [matches[0]] } : undefined;
    };
    const observations: Record<string, Observation | undefined> = {};
    for (const definition of definitions) observations[definition.key] = read(definition.tags, definition.duration, definition.unit === "currency-per-share" ? `${currency}/shares` : currency);
    if (financialInstitution) observations.revenue = read(["RevenuesNetOfInterestExpense"], true) ?? observations.revenue;
    observations.grossProfit ??= !financialInstitution ? calculated("Revenue minus disclosed cost of revenue, for the same fiscal period and filing.", [observations.revenue, observations.costOfRevenue], (a, b) => a - b) : undefined;
    observations.operatingIncome ??= !financialInstitution ? calculated("Gross profit minus disclosed operating expenses, for the same fiscal period and filing.", [observations.grossProfit, observations.operatingExpenses], (a, b) => a - b) : undefined;
    observations.liabilities ??= calculated("Current liabilities plus non-current liabilities, from the same balance sheet.", [observations.currentLiabilities, observations.noncurrentLiabilities], (a, b) => a + b);
    const totalEquity = read(["StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest", "Equity"]);
    const noncontrollingEquity = read(["MinorityInterest", "NoncontrollingInterestInConsolidatedEntity", "NoncontrollingInterests"]);
    observations.equity ??= calculated("Total permanent equity less explicitly disclosed non-controlling interests; parent-shareholder basis for return on equity.", [totalEquity, noncontrollingEquity], (a, b) => a - b);
    observations.netIncome ??= calculated("Consolidated profit or loss less profit or loss attributable to non-controlling interests; parent-shareholder basis for return on equity.", [observations.consolidatedNetIncome, read(["NetIncomeLossAttributableToNoncontrollingInterest", "ProfitLossAttributableToNoncontrollingInterests"], true)], (a, b) => a - b);
    const totalAssetsEquity = read(["LiabilitiesAndStockholdersEquity", "EquityAndLiabilities"]);
    // Redeemable non-controlling interests may sit outside both liabilities and equity.
    const temporaryEquityTags = [...new Set(taxonomies.flatMap((taxonomy) => Object.keys(payload.facts?.[taxonomy] ?? {})))].filter((tag) => /TemporaryEquity|RedeemableNoncontrollingInterest|RedeemablePreferredStock|PreferredStockRedeemable|RedeemableCommonStock/.test(tag));
    const hasTemporaryEquity = temporaryEquityTags.some((tag) => (read([tag])?.value ?? 0) !== 0);
    if (!hasTemporaryEquity) observations.liabilities ??= calculated("Total assets less total equity including non-controlling interests; no disclosed temporary equity for this balance sheet.", [observations.assets, totalEquity], (a, b) => a - b);
    if (!hasTemporaryEquity && totalAssetsEquity && observations.assets && totalAssetsEquity.value === observations.assets.value) {
      // A shareholder-only equity tag is not automatically total equity. Require an
      // explicit zero non-controlling interest disclosure before using that identity.
      const nci = read(["MinorityInterest", "NoncontrollingInterestInConsolidatedEntity", "NoncontrollingInterests"]);
      if (nci?.value === 0) observations.liabilities ??= calculated("Assets minus shareholder equity; explicitly disclosed non-controlling interests are zero.", [observations.assets, observations.equity, nci], (a, b) => a - b);
    }
    observations.debt ??= calculated("Current debt (including current maturities) plus non-current long-term debt, from the same filing.", [read(["DebtCurrent", "CurrentBorrowings"]), read(["LongTermDebtNoncurrent", "LongTermDebtAndCapitalLeaseObligations", "NoncurrentBorrowings"])], (a, b) => a + b);
    const totalLongTermDebt = read(["LongTermDebtCurrentPlusNoncurrent", "LongTermDebt", "LongTermDebtAndFinanceLeaseObligationsIncludingCurrentMaturities", "LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities"]);
    observations.debt ??= calculated("Long-term debt including current maturities plus explicitly disclosed short-term borrowings, from the same filing.", [totalLongTermDebt, read(["ShortTermBorrowings", "ShortTermDebtCurrent"])], (a, b) => a + b);
    observations.cash ??= calculated("Reported cash and equivalents including restricted cash, less explicitly reported total restricted cash and equivalents.", [read(["CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"]), read(["RestrictedCashAndCashEquivalents", "RestrictedCashAndCashEquivalentsCurrentAndNoncurrent"])], (a, b) => a - b);
    observations.cash ??= calculated("Cash plus cash equivalents, from the same balance sheet.", [read(["Cash"]), read(["CashEquivalentsAtCarryingValue"])], (a, b) => a + b);
    for (const field of ["liabilities", "debt", "cash"]) if (observations[field]?.basis && observations[field]!.value < 0) observations[field] = undefined;
    if (observations.capex) observations.capex = { ...observations.capex, value: Math.abs(observations.capex.value) };
    observations.freeCashFlow = calculated("Cash from operating activities minus capital expenditure; a calculated non-GAAP measure.", [observations.operatingCashFlow, observations.capex], (a, b) => a - b);
    periodObservations.push(observations);
    const label = fiscalLabels[index];
    const year = fiscalLabels.filter((value) => value === label).length > 1 ? anchor.end : label;
    for (const [field, observation] of Object.entries(observations)) if (observation) {
      const accession = [...observation.facts].sort((a, b) => (b.fact.filed ?? "").localeCompare(a.fact.filed ?? "")).map(({ fact }) => fact.accn).find((value) => value && /^\d{10}-\d{2}-\d{6}$/.test(value));
      const filingUrl = validCik && accession ? `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replaceAll("-", "")}/${accession}-index.html` : sourceUrl;
      provenance.push({ period: anchor.end, periodLabel: year, field, concepts: [...new Set(observation.facts.map((item) => item.concept))], filedAt: observation.facts.map(({ fact }) => fact.filed ?? "").sort().at(-1) ?? "", accessions: [...new Set(observation.facts.map(({ fact }) => fact.accn).filter((value): value is string => !!value))], sourceUrl: filingUrl, derived: !!observation.basis, ...(observation.basis ? { basis: observation.basis } : {}) });
    }
    return { year, ...Object.fromEntries(SEC_CORE_FIELDS.map((field) => [field, observations[field] ? scaled(observations[field]!.value) : null])) } as FinancialPeriod;
  });
  const statement = (kind: FinancialStatement["kind"], title: string, fields: Definition[]): FinancialStatement => ({ kind, title, rows: fields.map((definition) => ({ key: definition.key, label: definition.label, ...(definition.total ? { total: true } : {}), unit: definition.unit ?? "million-currency", values: Object.fromEntries(periods.map((period, index) => [period.year, periodObservations[index][definition.key] ? scaled(periodObservations[index][definition.key]!.value, definition.unit) : null])) })) });
  const latest = periods.at(-1);
  const present = periods.reduce((count, period) => count + SEC_CORE_FIELDS.filter((field) => period[field] !== null).length, 0);
  const expected = periods.length * SEC_CORE_FIELDS.length;
  const missingLatest = SEC_CORE_FIELDS.filter((field) => latest?.[field] == null);
  const latestPresent = latest ? SEC_CORE_FIELDS.length - missingLatest.length : 0;
  return { periods, currency, dataAsOf: selected.at(-1)?.end ?? "", filedAt: provenance.map((item) => item.filedAt).sort().at(-1) ?? "", statements: [statement("income", "Standardized income statement", income), statement("balance", "Standardized balance sheet", balance), statement("cashflow", "Standardized cash flow statement", cashflow)], provenance, coverage: { fields: [...SEC_CORE_FIELDS], present, expected, percent: expected ? Number((present / expected * 100).toFixed(1)) : 0, latestPresent, latestExpected: SEC_CORE_FIELDS.length, latestPercent: Number((latestPresent / SEC_CORE_FIELDS.length * 100).toFixed(1)), missingLatest, financialInstitution, statementBasis: "standardized-sec-concepts" } };
}
