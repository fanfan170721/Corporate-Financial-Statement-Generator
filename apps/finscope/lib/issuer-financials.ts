import type { FinancialPeriod, FinancialStatement, FinancialStatementRow, Source } from "./types";

export const DIRECT_ISSUERS = ["MSFT"] as const;
const MICROSOFT_INDEX = "https://www.microsoft.com/en-us/investor/annual-reports";
type Options = { fetcher?: typeof fetch };
type Page = { html: string; retrievedAt: string };
type ParsedAnnualReport = { year: number; statements: FinancialStatement[] };
export type IssuerFinancials = { periods: FinancialPeriod[]; statements: FinancialStatement[]; sources: Source[]; currency: string; dataAsOf: string; retrievedAt: string; provider: string; note: string };

export class IssuerDataError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.name = "IssuerDataError"; this.code = code; }
}
const cache = new Map<string, { expires: number; page: Page }>();
const pending = new Map<string, Promise<Page>>();

async function readPage(url: string, options: Options): Promise<Page> {
  const existing = !options.fetcher && cache.get(url);
  if (existing && existing.expires > Date.now()) return existing.page;
  if (!options.fetcher && pending.has(url)) return pending.get(url)!;
  const request = (async () => {
    // Workers support manual/follow only. Reject 3xx below instead of following
    // an unverified destination or relying on Node-only redirect:"error".
    const response = await (options.fetcher ?? fetch)(url, { headers: { Accept: "text/html" }, signal: AbortSignal.timeout(20_000), redirect: "manual" });
    if (!response.ok) throw new IssuerDataError("ISSUER_UNAVAILABLE", `Microsoft's published statements could not be retrieved (HTTP ${response.status}). No substitute figures were generated.`);
    const html = await response.text();
    if (html.length < 500 || html.length > 2_000_000) throw new IssuerDataError("ISSUER_FORMAT_CHANGED", "The issuer returned an unexpected document. Financial extraction was stopped.");
    const page = { html, retrievedAt: new Date().toISOString() };
    if (!options.fetcher) cache.set(url, { page, expires: Date.now() + (url === MICROSOFT_INDEX ? 900_000 : 3_600_000) });
    return page;
  })();
  if (!options.fetcher) pending.set(url, request);
  try { return await request; } finally { if (!options.fetcher) pending.delete(url); }
}

function text(html: string): string {
  const named: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", rsquo: "’", lsquo: "‘", ndash: "–", mdash: "—", minus: "−" };
  return html.replace(/<[^>]*>/g, " ").replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code: string) => String.fromCodePoint(code.startsWith("x") ? parseInt(code.slice(1), 16) : Number(code))).replace(/&([a-z]+);/gi, (_, name: string) => named[name.toLowerCase()] ?? " ").replace(/\s+/g, " ").trim();
}
function numeric(value: string): number | null {
  const cleaned = value.replace(/[$,\s]/g, "").replace(/−/g, "-");
  if (!/^\(?-?\d+(?:\.\d+)?\)?$/.test(cleaned)) return null;
  const result = Number(cleaned.replace(/[()]/g, "")) * (cleaned.startsWith("(") ? -1 : 1);
  return Number.isFinite(result) ? result : null;
}
function key(value: string): string {
  return value.toLowerCase().replace(/,? net of allowance.*$/i, "").replace(/[’']/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function discoverMicrosoftReports(html: string): { year: number; url: string }[] {
  const links = [...html.matchAll(/href\s*=\s*["']([^"']*\/investor\/reports\/ar(\d{2}|\d{4})\/index\.html)["']/gi)];
  const reports = links.flatMap((match) => {
    const url = new URL(match[1], MICROSOFT_INDEX);
    const year = match[2].length === 2 ? 2000 + Number(match[2]) : Number(match[2]);
    return url.protocol === "https:" && url.hostname === "www.microsoft.com" && year >= 2000 && year <= new Date().getUTCFullYear() ? [{ year, url: url.href }] : [];
  });
  return [...new Map(reports.map((report) => [report.year, report])).values()].sort((a, b) => b.year - a.year);
}

export function parseMicrosoftAnnualReport(html: string, expectedYear: number): ParsedAnnualReport {
  const definitions = [
    { kind: "income" as const, id: "income-statements", title: "Income statement" },
    { kind: "balance" as const, id: "balance-sheets", title: "Balance sheet" },
    { kind: "cashflow" as const, id: "cash-flows-statements", title: "Cash-flow statement" },
  ];
  const statements = definitions.map(({ kind, id, title }): FinancialStatement => {
    const sectionPattern = new RegExp('<article\\b[^>]*\\bid=["\']' + id + '["\'][^>]*>([\\s\\S]*?)<\\/article>', "i");
    const article = sectionPattern.exec(html)?.[1];
    const table = article?.match(/<table\b[^>]*>([\s\S]*?)<\/table>/i)?.[1];
    if (!table || !/In millions/i.test(text(table))) throw new IssuerDataError("ISSUER_FORMAT_CHANGED", `The ${title.toLowerCase()} could not be identified with its published units.`);
    const tableRows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) => [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => text(cell[1])));
    const header = tableRows.find((row) => row[0]?.includes("June 30") && row.some((cell) => cell === String(expectedYear)));
    if (!header) throw new IssuerDataError("ISSUER_FORMAT_CHANGED", `The ${title.toLowerCase()} fiscal-year header does not match the discovered annual report.`);
    const columns = header.flatMap((cell, index) => /^20\d{2}$/.test(cell) ? [{ year: cell, index }] : []);
    if (Math.max(...columns.map(column=>Number(column.year))) !== expectedYear) throw new IssuerDataError("ISSUER_FORMAT_CHANGED", "The discovered annual report does not match the most recent year in its financial statements.");
    if (columns.length < 2) throw new IssuerDataError("ISSUER_INCOMPLETE", "The annual report did not provide comparable fiscal periods.");
    const rows: FinancialStatementRow[] = [];
    let section = "";
    for (const cells of tableRows.slice(tableRows.indexOf(header) + 1)) {
      const label = cells[0];
      if (!label) continue;
      const values = Object.fromEntries(columns.map((column) => [column.year, numeric(cells[column.index] ?? "")]));
      if (Object.values(values).every((value) => value === null)) { section = label.replace(/:$/, ""); continue; }
      const unit = /earnings per share/i.test(section) ? "currency-per-share" : /weighted average shares/i.test(section) ? "million-shares" : "million-currency";
      rows.push({ key: key(section + " " + label), label, section, unit, total: /^(total |net cash |net income$|gross margin$|operating income$|income before)/i.test(label), values });
      // A subtotal closes its group. Carrying "Current assets" onto PPE or
      // "Cost of revenue" onto operating expenses misclassifies published rows.
      if (/^(total |net cash )/i.test(label)) section = "";
    }
    if (rows.length < 10) throw new IssuerDataError("ISSUER_INCOMPLETE", `The extracted ${title.toLowerCase()} is incomplete.`);
    return { kind, title, rows };
  });
  return { year: expectedYear, statements };
}

export function mergeMicrosoftReports(reports: ParsedAnnualReport[]): Pick<IssuerFinancials, "periods" | "statements" | "dataAsOf"> {
  const ordered = [...reports].sort((a, b) => b.year - a.year);
  const latestYear = ordered[0]?.year;
  if (!latestYear) throw new IssuerDataError("ISSUER_INCOMPLETE", "No annual statements were retrieved.");
  const years = Array.from({ length: 5 }, (_, index) => String(latestYear - 4 + index));
  const statements = (["income", "balance", "cashflow"] as const).map((kind): FinancialStatement => {
    const rows = new Map<string, FinancialStatementRow>();
    for (const annual of ordered) for (const row of annual.statements.find((statement) => statement.kind === kind)!.rows) {
      const current = rows.get(row.key) ?? { ...row, values: {} };
      for (const year of years) if (year in row.values && !(year in current.values)) current.values[year] = row.values[year];
      rows.set(row.key, current);
    }
    return { kind, title: ordered[0].statements.find((statement) => statement.kind === kind)!.title, rows: [...rows.values()].filter((row) => Object.keys(row.values).length > 0).map((row) => ({ ...row, values: Object.fromEntries(years.map((year) => [year, row.values[year] ?? null])) })) };
  });
  const get = (kind: FinancialStatement["kind"], expression: RegExp, year: string): number | null => {
    for (const annual of ordered) {
      const row = annual.statements.find((statement) => statement.kind === kind)!.rows.find((candidate) => expression.test(candidate.label));
      if (row && year in row.values) return row.values[year];
    }
    return null;
  };
  const periods = years.map((year): FinancialPeriod => {
    const currentDebt = get("balance", /^Current portion of long-term debt$/i, year);
    const longDebt = get("balance", /^Long-term debt$/i, year);
    const shortDebt = get("balance", /^Short-term debt$/i, year);
    const capex = get("cashflow", /^Additions to property and equipment$/i, year);
    const period = { year, revenue: get("income", /^Total revenue$/i, year), netIncome: get("income", /^Net income$/i, year), operatingCashFlow: get("cashflow", /^Net cash from operations$/i, year), capex: capex === null ? null : Math.abs(capex), assets: get("balance", /^Total assets$/i, year), liabilities: get("balance", /^Total liabilities$/i, year), cash: get("balance", /^Cash and cash equivalents$/i, year), debt: currentDebt === null || longDebt === null ? null : currentDebt + longDebt + (shortDebt ?? 0), grossProfit: get("income", /^Gross margin$/i, year), operatingIncome: get("income", /^Operating income$/i, year), equity: get("balance", /^Total stockholders[’'] equity$/i, year) };
    if ([period.revenue, period.netIncome, period.operatingCashFlow, period.assets, period.liabilities, period.equity].some((value) => value === null)) throw new IssuerDataError("ISSUER_INCOMPLETE", `The FY${year} statements are missing a required primary-statement total. No estimated figures were inserted.`);
    if (Math.abs(period.assets! - period.liabilities! - period.equity!) > 1) throw new IssuerDataError("ISSUER_RECONCILIATION", `The FY${year} balance sheet did not reconcile. Report generation was stopped.`);
    return period;
  });
  return { periods, statements, dataAsOf: `${latestYear}-06-30` };
}

export async function retrieveIssuerFinancials(symbol: string, options: Options = {}): Promise<IssuerFinancials> {
  if (symbol.toUpperCase() !== "MSFT") throw new IssuerDataError("ISSUER_NOT_SUPPORTED", "Direct issuer retrieval currently supports Microsoft (MSFT). Other companies require a configured SEC or financial-data provider.");
  const index = await readPage(MICROSOFT_INDEX, options);
  const discovered = discoverMicrosoftReports(index.html);
  const latest = discovered[0];
  if (!latest) throw new IssuerDataError("ISSUER_FORMAT_CHANGED", "Microsoft's latest annual report could not be identified. No older report was substituted.");
  const wantedYears = [latest.year, latest.year - 2, latest.year - 4];
  const selected = wantedYears.map((year) => discovered.find((report) => report.year === year));
  if (selected.some((report) => !report)) throw new IssuerDataError("ISSUER_INCOMPLETE", "The issuer's annual-report index does not provide the five-year comparison required by this report.");
  const pages = await Promise.all(selected.map(async (report) => ({ ...report!, ...await readPage(report!.url, options) })));
  const merged = mergeMicrosoftReports(pages.map((page) => parseMicrosoftAnnualReport(page.html, page.year)));
  return { ...merged, currency: "USD", retrievedAt: pages.map((page) => page.retrievedAt).sort().at(-1)!, provider: "Microsoft Investor Relations", sources: [{ label: "Microsoft · Annual-report index", url: MICROSOFT_INDEX }, ...pages.map((page) => ({ label: `Microsoft FY${page.year} · Published consolidated financial statements`, url: page.url, asOf: `${page.year}-06-30` }))], note: "Retrieved from Microsoft's official annual-report index and published consolidated statements. Latest available annual report is discovered at request time; source pages may be cached for one hour. Five fiscal years ending 30 June, USD millions except per-share data and share counts. Newer annual reports take precedence for comparative figures. Statement rows retain reported signs; chart capex uses the absolute cash outflow. Cash excludes short-term investments. Debt sums separately reported borrowing lines, excluding leases and borrowing embedded in other liabilities. A line absent from a period remains blank; differently worded disclosures may appear as separate rows. These statement extracts do not replace the linked notes, accounting policies and auditor's report." };
}
