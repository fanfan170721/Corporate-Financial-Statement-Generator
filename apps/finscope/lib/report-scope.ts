import type { Company, FinancialPeriod, Report, ReportScope } from "./types";

export function canGenerateCompany(company: Company): boolean {
  // Directory metadata permits a request, but does not certify financial coverage.
  if (company.discoveryOnly) return (/^\d{1,10}$/.test(company.cik ?? "") || company.discoveryProvider === "fmp") && /^[A-Za-z0-9.^-]{1,20}$/.test(company.symbol);
  return company.coverage?.reportAvailable ?? company.coverage?.status === "available";
}

/** Scope describes this retrieved evidence, never the company's overall quality. */
export function getReportScope(report: Report): ReportScope {
  const has = (fields: (keyof FinancialPeriod)[]) => report.periods.some(period => fields.some(field => typeof period[field] === "number" && Number.isFinite(period[field])));
  const financials = has(["revenue", "netIncome", "operatingIncome", "grossProfit", "assets", "liabilities", "equity", "cash", "debt", "operatingCashFlow", "capex"]);
  const categories: [string, boolean][] = [
    ["Company identity", Boolean(report.company.nameEn && (report.profile?.cik || report.company.cik || report.sources.length))],
    ["Original public filings", Boolean(report.filings?.length || report.sources.some(source => /Annual filing|Original filing|Annual report/i.test(source.label)))],
    ["Income and profitability", has(["revenue", "netIncome", "grossProfit", "operatingIncome"])],
    ["Assets and liabilities", has(["assets", "liabilities", "equity", "cash", "debt"])],
    ["Cash flow", has(["operatingCashFlow", "capex"])],
    ["Calculated financial ratios", Object.values(report.metrics).some(value => value !== null && Number.isFinite(value))],
    ["Reported employee count", report.profile?.employees?.value !== undefined],
  ];
  const level: ReportScope["level"] = !financials ? "basic" : report.coverage?.status === "available" || (!report.coverage && report.periods.length >= 2 && report.periods.every(period => Object.values(period).every(value => value !== null))) ? "full" : "partial";
  const limitations = [
    ...(report.scope?.limitations ?? []),
    ...(report.coverage?.reason ? [report.coverage.reason] : []),
    ...(level === "basic" ? ["This report contains company information and filing links only. Financial comparisons and financial conclusions are not available."] : ["Financial coverage measures selected standardized annual fields, not every disclosure in the original filings."]),
    "Market prices, analyst forecasts, salaries and hiring activity are not included in this report.",
    "Missing information was not verified in the connected sources; it does not mean the company failed to disclose it.",
  ];
  return { level, available: categories.filter(([, available]) => available).map(([label]) => label), missing: categories.filter(([, available]) => !available).map(([label]) => label), limitations: [...new Set(limitations)] };
}
