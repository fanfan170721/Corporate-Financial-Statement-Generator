import { COMPANIES, getCompany, searchLocalCompanies } from "./companies";
import { DIRECT_ISSUERS, IssuerDataError, retrieveIssuerFinancials } from "./issuer-financials";
import type { Company, FinancialPeriod, Insight, Report, ReportMetrics, Source } from "./types";

export { getCompany } from "./companies";
export type ServiceOptions = { env?: Record<string, string | undefined>; fetcher?: typeof fetch };
type Fact = { start?: string; end: string; val: number; filed?: string; form?: string; fy?: number; fp?: string; accn?: string };
type Concept = { units?: Record<string, Fact[]> };
export type CompanyFacts = { facts?: Record<string, Record<string, Concept>> };
type Row = Record<string, unknown>;
type PeriodKey = Exclude<keyof FinancialPeriod, "year">;

export class MarketDataError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.name = "MarketDataError"; this.code = code; }
}

export function environment(name: string, options: ServiceOptions = {}): string | undefined {
  if (typeof window !== "undefined") return undefined;
  return options.env?.[name] ?? (typeof process !== "undefined" ? process.env[name] : undefined);
}

function assertServer() {
  if (typeof window !== "undefined") throw new MarketDataError("SERVER_ONLY", "Financial data must be requested by the server.");
}

function nullable(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
const million = (value: unknown): number | null => nullable(value) === null ? null : Number(((value as number) / 1_000_000).toFixed(4));
const ratio = (a: number | null, b: number | null, scale = 1): number | null => a !== null && b !== null && b > 0 ? Number((a / b * scale).toFixed(3)) : null;
const difference = (a: number | null, b: number | null): number | null => a !== null && b !== null ? a - b : null;

export function calculateMetrics(periods: FinancialPeriod[]): ReportMetrics {
  const current = periods.at(-1);
  const previous = periods.at(-2);
  if (!current) return { revenueGrowth: null, netMargin: null, freeCashFlow: null, debtToEquity: null, roe: null, cashRatio: null };
  const averageEquity = current.equity !== null && previous?.equity != null ? (current.equity + previous.equity) / 2 : null;
  return {
    revenueGrowth: previous ? ratio(difference(current.revenue, previous.revenue), previous.revenue, 100) : null,
    netMargin: ratio(current.netIncome, current.revenue, 100),
    freeCashFlow: difference(current.operatingCashFlow, current.capex),
    debtToEquity: ratio(current.debt, current.equity),
    roe: ratio(current.netIncome, averageEquity, 100),
    cashRatio: ratio(current.cash, current.liabilities),
  };
}

/** Every duration fact is joined by its exact start/end, never the filing's fy label. */
const TAGS: Record<PeriodKey, string[]> = {
  revenue: ["RevenueFromContractWithCustomerExcludingAssessedTax", "RevenueFromContractWithCustomerIncludingAssessedTax", "Revenues", "SalesRevenueNet", "SalesRevenueGoodsNet", "Revenue"],
  netIncome: ["NetIncomeLoss", "ProfitLoss"],
  operatingCashFlow: ["NetCashProvidedByUsedInOperatingActivities", "CashFlowsFromUsedInOperatingActivities"],
  capex: ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets", "PurchaseOfPropertyPlantAndEquipment"],
  assets: ["Assets"], liabilities: ["Liabilities"],
  cash: ["CashAndCashEquivalentsAtCarryingValue", "CashAndCashEquivalents"],
  debt: [],
  grossProfit: ["GrossProfit"], operatingIncome: ["OperatingIncomeLoss", "ProfitLossFromOperatingActivities"],
  equity: ["StockholdersEquity", "EquityAttributableToOwnersOfParent", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest", "Equity"],
};
const DURATION_FIELDS = new Set<PeriodKey>(["revenue", "netIncome", "operatingCashFlow", "capex", "grossProfit", "operatingIncome"]);
const ANNUAL_FORMS = new Set(["10-K", "10-K/A", "20-F", "20-F/A", "40-F", "40-F/A"]);

function factsFor(payload: CompanyFacts, tags: string[]): Fact[] {
  for (const tag of tags) {
    const records = ["us-gaap", "ifrs-full"].flatMap((taxonomy) => payload.facts?.[taxonomy]?.[tag]?.units?.USD ?? []);
    if (records.length) return records;
  }
  return [];
}

function annual(fact: Fact): boolean {
  if (!fact.start || !ANNUAL_FORMS.has(fact.form ?? "") || !Number.isFinite(fact.val)) return false;
  const days = (Date.parse(fact.end) - Date.parse(fact.start)) / 86_400_000;
  return days >= 330 && days <= 380;
}

function findFact(payload: CompanyFacts, tags: string[], end: string, start?: string): Fact | undefined {
  for (const tag of tags) {
    const records = ["us-gaap", "ifrs-full"].flatMap((taxonomy) => payload.facts?.[taxonomy]?.[tag]?.units?.USD ?? []);
    const matches = records.filter((fact) => fact.end === end && Number.isFinite(fact.val) && ANNUAL_FORMS.has(fact.form ?? "") && (start ? fact.start === start : !fact.start));
    matches.sort((a, b) => (b.filed ?? "").localeCompare(a.filed ?? ""));
    if (matches.length) return matches[0];
  }
  return undefined;
}

export function parseSecCompanyFacts(payload: CompanyFacts): { periods: FinancialPeriod[]; dataAsOf: string; filedAt: string } {
  let candidates = TAGS.revenue.flatMap((tag) => factsFor(payload, [tag])).filter(annual);
  if (!candidates.length) candidates = factsFor(payload, TAGS.netIncome).filter(annual);
  const anchors = new Map<string, Fact>();
  for (const fact of candidates) {
    const old = anchors.get(fact.end);
    if (!old || (fact.filed ?? "") > (old.filed ?? "")) anchors.set(fact.end, fact);
  }
  // Some issuers change fiscal year-end: choose the latest complete annual period in each calendar year.
  const byYear = new Map<string, Fact>();
  for (const fact of [...anchors.values()].sort((a, b) => a.end.localeCompare(b.end))) byYear.set(fact.end.slice(0, 4), fact);
  const selected = [...byYear.values()].slice(-5);
  const periods = selected.map((anchor): FinancialPeriod => {
    const values = Object.fromEntries(Object.entries(TAGS).map(([field, tags]) => [field, million(findFact(payload, tags, anchor.end, DURATION_FIELDS.has(field as PeriodKey) ? anchor.start : undefined)?.val)])) as Record<PeriodKey, number | null>;
    if (values.debt === null) {
      // A known zero remains zero. A missing component is not assumed to be zero.
      const combined = findFact(payload, ["LongTermDebtCurrentPlusNoncurrent", "LongTermDebtAndFinanceLeaseObligationsIncludingCurrentMaturities", "LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities"], anchor.end)?.val;
      const nonCurrent = findFact(payload, ["LongTermDebtNoncurrent", "LongTermDebt"], anchor.end)?.val;
      const current = findFact(payload, ["LongTermDebtCurrent", "LongTermDebtAndCapitalLeaseObligationsCurrent"], anchor.end)?.val;
      const short = findFact(payload, ["ShortTermBorrowings", "ShortTermDebtCurrent"], anchor.end)?.val;
      if (combined != null && short != null) values.debt = million(combined + short);
      else if (nonCurrent != null && current != null && short != null) values.debt = million(nonCurrent + current + short);
    }
    // Do not invent absent financial line items; all charts retain the null gap.
    return { year: anchor.end.slice(0, 4), ...values, capex: values.capex === null ? null : Math.abs(values.capex) };
  });
  return { periods, dataAsOf: selected.at(-1)?.end ?? "", filedAt: selected.map((fact) => fact.filed ?? "").sort().at(-1) ?? "" };
}

export function buildInsights(periods: FinancialPeriod[], demo = false): Insight[] {
  const metrics = calculateMetrics(periods);
  const latest = periods.at(-1);
  const prefix = demo ? "Illustrative only · " : "";
  const percent = (value: number | null) => value === null ? "Not available" : `${value.toFixed(1)}%`;
  return [
    { title: "Revenue durability", stance: metrics.revenueGrowth === null ? "neutral" : metrics.revenueGrowth > 8 ? "positive" : metrics.revenueGrowth < 0 ? "caution" : "neutral", summary: `${prefix}Revenue growth: ${percent(metrics.revenueGrowth)}`, detail: "Year-over-year growth across complete fiscal years. Assess recurring demand, pricing and customer concentration before extrapolating the trend." },
    { title: "Earnings quality", stance: metrics.netMargin === null ? "neutral" : metrics.netMargin > 15 ? "positive" : metrics.netMargin < 0 ? "caution" : "neutral", summary: `${prefix}Net margin: ${percent(metrics.netMargin)}`, detail: "Net income divided by revenue. Reconcile taxes and non-recurring items with operating margins; reported earnings alone do not establish sustainable economics." },
    { title: "Cash conversion", stance: metrics.freeCashFlow === null ? "neutral" : metrics.freeCashFlow > 0 ? "positive" : "caution", summary: metrics.freeCashFlow === null ? "Operating cash flow or capital expenditure is unavailable" : `${prefix}Free cash flow is ${metrics.freeCashFlow >= 0 ? "positive" : "negative"}`, detail: "Operating cash flow less capital expenditure. Review working capital, maintenance versus expansion spending and lease commitments before assessing distributable cash." },
    { title: "Balance-sheet resilience", stance: metrics.debtToEquity === null ? "neutral" : metrics.debtToEquity > 1.5 ? "caution" : "positive", summary: metrics.debtToEquity === null ? "Incomplete debt disclosure; leverage assessment withheld" : `${prefix}Debt / equity: ${metrics.debtToEquity.toFixed(2)}x`, detail: "Interest-bearing debt relative to book equity. Missing or non-positive equity produces no ratio. Financial institutions require sector-specific capital measures." },
    { title: "Capital efficiency", stance: metrics.roe === null ? "neutral" : metrics.roe > 15 ? "positive" : metrics.roe < 0 ? "caution" : "neutral", summary: `${prefix}Return on average equity: ${percent(metrics.roe)}`, detail: "Net income divided by average beginning and ending equity. Leverage, repurchases and acquisition accounting can distort the result; it is not a standalone measure of competitive advantage." },
    { title: "Underwriting questions", stance: "neutral", summary: demo ? "Synthetic illustration; no investment conclusion" : `Financials through FY${latest?.year ?? "unknown"}; forward conclusions require further evidence`, detail: "Test the thesis against valuation, industry structure, reinvestment needs and downside catalysts. Market prices and recent events are not embedded in these historical financials." },
  ];
}

/** Synthetic, reproducible fixtures. They are deliberately never attributed to an issuer filing. */
export function getDemoReport(symbol: string): Report {
  const company = getCompany(symbol);
  if (!company) throw new MarketDataError("UNKNOWN_SYMBOL", "This company has no synthetic fixture. Use published financial data.");
  const seed = [...company.symbol].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  const base = 18_000 + seed * 64;
  const growth = 0.055 + (seed % 14) / 100;
  const periods = Array.from({ length: 5 }, (_, index): FinancialPeriod => {
    const revenue = Math.round(base * (1 + growth) ** index * (1 + Math.sin(index + seed) * 0.025));
    const netIncome = Math.round(revenue * (0.15 + (seed % 9) / 100 + index * 0.006));
    const assets = Math.round(revenue * (1.55 - index * 0.02));
    const liabilities = Math.round(assets * (0.38 + (seed % 8) / 100));
    return { year: String(2020 + index), revenue, netIncome, operatingCashFlow: Math.round(netIncome * 1.25), capex: Math.round(revenue * (0.055 + index * 0.002)), assets, liabilities, cash: Math.round(revenue * 0.27), debt: Math.round(liabilities * 0.58), grossProfit: Math.round(revenue * 0.58), operatingIncome: Math.round(netIncome * 1.22), equity: assets - liabilities };
  });
  return { id: `demo-${company.symbol.toLowerCase()}`, symbol: company.symbol, company, generatedAt: new Date().toISOString(), dataAsOf: "2024-12-31", mode: "demo", dataKind: "synthetic", currency: "USD", periods, metrics: calculateMetrics(periods), insights: buildInsights(periods, true), sources: [], note: "Synthetic illustration for 2020–2024, not the issuer's financial statements. Published annual financials are available through configured providers; these are not live market quotes." };
}

const cache = new Map<string, { expires: number; data: unknown }>();
const inFlight = new Map<string, Promise<unknown>>();
let secQueue: Promise<void> = Promise.resolve();
let lastSecRequest = 0;
async function fetchJson(url: string, options: ServiceOptions, headers: Record<string, string> = {}, ttl = 0): Promise<unknown> {
  const cached = cache.get(url);
  if (cached && cached.expires > Date.now()) return cached.data;
  if (inFlight.has(url)) return inFlight.get(url)!;
  const pending = (async () => {
    if (new URL(url).hostname.endsWith("sec.gov")) {
      const slot = secQueue.then(async () => {
        const wait = 350 - (Date.now() - lastSecRequest);
        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
        lastSecRequest = Date.now();
      });
      secQueue = slot.catch(() => undefined);
      await slot;
    }
    const response = await (options.fetcher ?? fetch)(url, { headers: { Accept: "application/json", ...headers }, signal: AbortSignal.timeout(18_000) });
    if (!response.ok) throw new MarketDataError("PROVIDER_ERROR", `Data provider unavailable (HTTP ${response.status}). Please retry later.`);
    const data: unknown = await response.json();
    if (ttl > 0) {
      if (cache.size >= 150) cache.delete(cache.keys().next().value!);
      cache.set(url, { data, expires: Date.now() + ttl });
    }
    return data;
  })();
  inFlight.set(url, pending);
  try { return await pending; } finally { inFlight.delete(url); }
}

function secHeaders(options: ServiceOptions): Record<string, string> {
  const agent = environment("SEC_USER_AGENT", options);
  if (!agent || !/[^\s@]+@[^\s@]+\.[^\s@]+/.test(agent)) throw new MarketDataError("SEC_NOT_CONFIGURED", "SEC access requires an administrator-configured User-Agent with valid contact details.");
  return { "User-Agent": agent };
}

async function secDirectory(options: ServiceOptions): Promise<Company[]> {
  const raw = await fetchJson("https://www.sec.gov/files/company_tickers.json", options, secHeaders(options), 86_400_000);
  if (!raw || typeof raw !== "object") throw new MarketDataError("INVALID_DATA", "The SEC issuer directory is unavailable.");
  return Object.values(raw).flatMap((item) => {
    const row = item as Row;
    if (typeof row.ticker !== "string" || typeof row.title !== "string") return [];
    const known = getCompany(row.ticker);
    return [{ symbol: row.ticker, name: known?.name ?? row.title, nameEn: known?.nameEn ?? row.title, exchange: known?.exchange ?? "US", sector: known?.sector ?? "Unclassified", color: known?.color ?? "#7199bf", mark: known?.mark ?? row.ticker.charAt(0), cik: String(row.cik_str) }];
  });
}

async function fmp(endpoint: string, params: Record<string, string>, options: ServiceOptions): Promise<Row[]> {
  const key = environment("FMP_API_KEY", options);
  if (!key) throw new MarketDataError("GLOBAL_NOT_CONFIGURED", "This market requires a configured global financial-data provider.");
  const url = new URL(`https://financialmodelingprep.com/stable/${endpoint}`);
  for (const [name, value] of Object.entries({ ...params, apikey: key })) url.searchParams.set(name, value);
  const data = await fetchJson(url.href, options, {}, endpoint.startsWith("search") ? 300_000 : 3_600_000);
  if (!Array.isArray(data)) throw new MarketDataError("PROVIDER_ERROR", "The provider returned an invalid response. Check account access and quota.");
  return data as Row[];
}

function providerCompany(row: Row): Company | undefined {
  if (typeof row.symbol !== "string" || typeof row.name !== "string") return undefined;
  return getCompany(row.symbol) ?? { symbol: row.symbol, name: row.name, nameEn: row.name, exchange: String(row.exchange ?? row.exchangeShortName ?? "GLOBAL"), sector: String(row.sector ?? "Unclassified"), color: "#7199bf", mark: row.symbol.charAt(0), ...(row.cik ? { cik: String(row.cik) } : {}) };
}

export async function searchCompanies(query: string, options: ServiceOptions & { limit?: number; live?: boolean } = {}): Promise<Company[]> {
  const term = query.trim().slice(0, 100);
  const limit = Math.min(30, Math.max(1, options.limit ?? 12));
  const local = searchLocalCompanies(term, limit);
  if (!term || options.live === false) return local;
  assertServer();
  const remote: Company[] = [];
  if (environment("FMP_API_KEY", options)) {
    const results = await Promise.allSettled([fmp("search-symbol", { query: term, limit: String(limit) }, options), fmp("search-name", { query: term, limit: String(limit) }, options)]);
    for (const result of results) if (result.status === "fulfilled") for (const row of result.value) { const company = providerCompany(row); if (company) remote.push(company); }
  } else if (environment("SEC_USER_AGENT", options)) {
    const all = await secDirectory(options);
    const normalized = term.toUpperCase();
    remote.push(...all.filter((company) => company.symbol.includes(normalized) || company.nameEn.toUpperCase().includes(normalized)).sort((a, b) => Number(b.symbol === normalized) - Number(a.symbol === normalized)).slice(0, limit));
  }
  return [...new Map([...local, ...remote].map((company) => [company.symbol, company])).values()].slice(0, limit);
}

/** Join all FMP statements by the exact fiscal end date and currency, not array position. */
export function parseFmpStatements(income: Row[], balance: Row[], cashflow: Row[]): { periods: FinancialPeriod[]; currency: string; dataAsOf: string } {
  const rows = income.filter((row) => typeof row.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.date) && (row.period === "FY" || row.period === "annual")).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const currency = String(rows.at(-1)?.reportedCurrency ?? "");
  if (!/^[A-Z]{3}$/.test(currency)) throw new MarketDataError("INVALID_CURRENCY", "The provider did not supply a valid reporting currency.");
  const unique = [...new Map(rows.filter((row) => row.reportedCurrency === currency).map((row) => [String(row.date), row])).values()].slice(-5);
  const periods = unique.map((row): FinancialPeriod => {
    const samePeriod = (candidate: Row) => candidate.date === row.date && candidate.reportedCurrency === currency && (candidate.period === "FY" || candidate.period === "annual");
    const b = balance.find(samePeriod) ?? {};
    const c = cashflow.find(samePeriod) ?? {};
    const capex = million(c.capitalExpenditure ?? c.investmentsInPropertyPlantAndEquipment);
    return { year: String(row.date).slice(0, 4), revenue: million(row.revenue), netIncome: million(row.netIncome), operatingCashFlow: million(c.operatingCashFlow ?? c.netCashProvidedByOperatingActivities), capex: capex === null ? null : Math.abs(capex), assets: million(b.totalAssets), liabilities: million(b.totalLiabilities), cash: million(b.cashAndCashEquivalents), debt: million(b.totalDebt), grossProfit: million(row.grossProfit), operatingIncome: million(row.operatingIncome), equity: million(b.totalStockholdersEquity ?? b.totalEquity) };
  });
  return { periods, currency, dataAsOf: String(unique.at(-1)?.date ?? "") };
}

async function resolveCompany(symbol: string, options: ServiceOptions): Promise<Company> {
  const known = getCompany(symbol);
  if (known) return known;
  const matches = await searchCompanies(symbol, { ...options, limit: 30 });
  const match = matches.find((company) => company.symbol.toUpperCase() === symbol.toUpperCase());
  if (!match) throw new MarketDataError("UNKNOWN_SYMBOL", "Company not found. Search again and select the matching exchange.");
  return match;
}

export async function generateReport(symbol: string, options: ServiceOptions & { allowDemoFallback?: boolean } = {}): Promise<Report> {
  assertServer();
  if (!/^[A-Za-z0-9.^-]{1,20}$/.test(symbol)) throw new MarketDataError("INVALID_SYMBOL", "Invalid security symbol.");
  const company = await resolveCompany(symbol, options);
  try {
    let issuerError: unknown;
    if ((DIRECT_ISSUERS as readonly string[]).includes(company.symbol)) {
      try {
        const financials = await retrieveIssuerFinancials(company.symbol, options);
        return { id: crypto.randomUUID(), symbol: company.symbol, company, generatedAt: new Date().toISOString(), mode: "live", dataKind: "provider", ...financials, metrics: calculateMetrics(financials.periods), insights: buildInsights(financials.periods) };
      } catch (error) { issuerError = error; }
    }
    let periods: FinancialPeriod[] = [];
    let dataAsOf = "";
    let currency = "USD";
    let sources: Source[] = [];
    let secError: unknown;
    if (company.cik && environment("SEC_USER_AGENT", options)) {
      try {
        const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${company.cik.padStart(10, "0")}.json`;
        const raw = await fetchJson(url, options, secHeaders(options), 3_600_000);
        const parsed = parseSecCompanyFacts(raw as CompanyFacts);
        periods = parsed.periods;
        dataAsOf = parsed.dataAsOf;
        sources = [{ label: "SEC · Company XBRL facts", url, asOf: parsed.filedAt }, { label: "SEC · Original issuer filings", url: `https://www.sec.gov/edgar/browse/?CIK=${company.cik}&owner=exclude` }];
      } catch (error) { secError = error; }
    }
    if (periods.length < 2 && environment("FMP_API_KEY", options)) {
      const [income, balance, cash] = await Promise.all([fmp("income-statement", { symbol: company.symbol, period: "annual", limit: "5" }, options), fmp("balance-sheet-statement", { symbol: company.symbol, period: "annual", limit: "5" }, options), fmp("cash-flow-statement", { symbol: company.symbol, period: "annual", limit: "5" }, options)]);
      const parsed = parseFmpStatements(income, balance, cash);
      ({ periods, dataAsOf, currency } = parsed);
      sources = [{ label: "FMP · Annual financial statements", url: "https://site.financialmodelingprep.com/developer/docs", asOf: dataAsOf }];
      for (const row of income) {
        const url = row.finalLink ?? row.link;
        if (typeof url === "string" && /^https:\/\/(www\.)?sec\.gov\//.test(url)) sources.push({ label: `${String(row.date ?? "")} · Original filing`, url });
      }
    }
    if (!periods.length) {
      if (secError instanceof MarketDataError) throw secError;
      if (issuerError instanceof IssuerDataError) throw new MarketDataError(issuerError.code, issuerError.message);
      if (issuerError) throw new MarketDataError("ISSUER_UNAVAILABLE", "The official issuer report could not be retrieved. Please retry; no older or synthetic report was substituted.");
      if (!environment("SEC_USER_AGENT", options) && !environment("FMP_API_KEY", options)) throw new MarketDataError("DATA_COVERAGE_UNAVAILABLE", "Direct financial-statement retrieval currently supports Microsoft (MSFT). This company requires the administrator to connect SEC access or a licensed financial-data provider. No synthetic report was generated.");
      throw new MarketDataError("NO_DATA", "No comparable annual financial data is available in a consistent currency. Check provider configuration.");
    }
    return { id: crypto.randomUUID(), symbol: company.symbol, company, generatedAt: new Date().toISOString(), dataAsOf, mode: "live", dataKind: "provider", currency, periods, metrics: calculateMetrics(periods), insights: buildInsights(periods), sources, note: `Amounts in millions of ${currency}. Latest available complete fiscal years, not live prices. Missing items remain null. Growth, net margin and ROE are percentages; cash coverage is cash divided by total liabilities.` };
  } catch (error) {
    if (options.allowDemoFallback && getCompany(symbol)) {
      const report = getDemoReport(symbol);
      report.note = `Provider retrieval failed; this report is explicitly marked synthetic. ${error instanceof MarketDataError ? error.message : "The data provider is temporarily unavailable."} ${report.note}`;
      return report;
    }
    if (error instanceof MarketDataError) throw error;
    throw new MarketDataError("PROVIDER_UNAVAILABLE", "The provider timed out or is unavailable. No substitute financial figures were generated.");
  }
}

export const DISCOVERY_COMPANY_COUNT = COMPANIES.length;
