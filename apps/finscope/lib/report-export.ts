import type { FinancialPeriod, Report } from "./types";
import { getReportScope } from "./report-scope";

const fields: [keyof FinancialPeriod, string][] = [["revenue", "Revenue"], ["netIncome", "Net income"], ["operatingCashFlow", "Operating cash flow"], ["capex", "Capital expenditure"], ["cash", "Cash and equivalents"], ["debt", "Interest-bearing debt"], ["assets", "Total assets"], ["liabilities", "Total liabilities"], ["equity", "Shareholders' equity"], ["grossProfit", "Gross profit"], ["operatingIncome", "Operating income"]];

/** Preserve financial signs while neutralizing spreadsheet formulas in source text. */
function cell(value: string | number | null | undefined): string {
  let text = value == null ? "" : String(value);
  if (typeof value === "string" && /^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

export function reportToCsv(report: Report, t: (source: string) => string = (source) => source): string {
  const years = report.periods.map((period) => period.year);
  const scope = getReportScope(report);
  const basic = scope.level === "basic";
  const rows: (string | number | null | undefined)[][] = [
    ["Finscope", report.company.name, report.symbol],
    [t("Evidence"), t(report.mode === "demo" ? "SYNTHETIC DEMONSTRATION — NOT ACTUAL FINANCIAL DATA" : report.dataKind === "filing-snapshot" ? "FROZEN PUBLISHED-FILING SNAPSHOT" : basic ? "Company identity and public filings" : "PUBLISHED FINANCIAL STATEMENTS")],
    [t("Report scope"), t(({full:"Broad financial coverage",partial:"Partial financial coverage",basic:"Basic company profile"})[scope.level])],
    [t("Information included"), ...scope.available.map(value=>t(value))],
    [t("Outside this report’s scope"), ...scope.missing.map(value=>t(value))],
    ...scope.limitations.map(limitation=>[t("Scope and limitations"), t(limitation)]),
    [t("Provider"), report.provider], ...(!basic ? [[t("Reporting currency"), report.currency], [t("Financial period ending"), report.dataAsOf]] : []),
    ...(basic ? [[t("Latest filing"), report.dataAsOf]] : []), [t("Source retrieved"), report.retrievedAt], [t("Report saved"), report.generatedAt],
  ];
  if (report.profile) for (const [label,value] of [["Registered name",report.profile.legalName],["SEC issuer identifier",report.company.cik],["Industry classification (SIC)",report.profile.sic],["Business location",report.profile.country],["Company website",report.profile.website]]) if(value) rows.push([t(label!),value]);
  if (!basic) rows.push([t("Definition"), t("Amounts in reporting-currency millions unless a row explicitly states per-share data or million shares. Empty cells indicate unavailable observations, never zero.")],[],[t("Statement"), t("Section"), t("Line item"), t("Unit"), ...years]);
  if (!basic && report.statements?.length) for (const statement of report.statements) for (const row of statement.rows) {
    const unit = row.unit === "currency-per-share" ? `${report.currency} per share` : row.unit === "million-shares" ? "Million shares" : `${report.currency} million`;
    rows.push([t(statement.title), row.section ? t(row.section) : row.section, t(row.label), t(unit), ...years.map((year) => row.values[year])]);
  }
  if (!basic) for (const [key, label] of fields) rows.push([t("Analytical metrics"), "", t(label), t(`${report.currency} million`), ...report.periods.map((period) => period[key])]);
  rows.push([], [t("Methodology and limitations"), report.note ? t(report.note) : report.note]);
  for (const filing of report.filings ?? []) rows.push([t("Original public filings"),filing.form,filing.title,filing.filedAt,filing.url]);
  for (const source of report.sources) rows.push([t("Source"), source.label, source.url, source.asOf]);
  return "\ufeff" + rows.map((row) => row.map(cell).join(",")).join("\r\n");
}
