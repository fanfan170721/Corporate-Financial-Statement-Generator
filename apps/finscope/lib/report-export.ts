import type { FinancialPeriod, Report } from "./types";
import { getReportScope } from "./report-scope";
import { employeeTrend, employeeBasisLabels } from "./employee-trend";

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
  if (report.profile?.employees) {
    const employees = report.profile.employees;
    const label = employees.basis === "full-time-equivalent" ? "REPORTED FULL-TIME EQUIVALENTS" : employees.basis === "full-and-part-time" ? "REPORTED FULL- AND PART-TIME EMPLOYEES" : employees.basis === "full-time" ? "REPORTED FULL-TIME EMPLOYEES" : employees.basis === "total" ? "REPORTED TOTAL EMPLOYEES" : "REPORTED EMPLOYEES";
    rows.push([t(label), employees.value, employees.asOf, employees.approximate ? t("Approximate") : "", employees.source]);
    if (employees.basis === "full-time-equivalent") rows.push([t("Definition"), t("Full-time equivalents measure working capacity, not individual people.")]);
  }
  if (report.profile?.employeeHistory) {
    const trend = employeeTrend(report.profile);
    rows.push([], [t("Historical workforce disclosures"), t("Reporting date"), t("Workforce measure"), t("Reported value"), t("Approximate"), t("Source")]);
    for (const row of trend.rows) {
      const items = trend.observations.filter(item => item.asOf === row.date);
      if (!items.length) rows.push([t("Historical workforce disclosures"), row.date, t("Not available"), null]);
      for (const item of items) rows.push([t("Historical workforce disclosures"), item.asOf, t(employeeBasisLabels[item.basis ?? "unspecified"]), item.value, item.approximate ? t("Approximate") : "", item.source]);
    }
  }
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
