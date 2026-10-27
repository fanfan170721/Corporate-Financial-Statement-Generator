import type { FinancialPeriod, Report } from "./types";

const fields: [keyof FinancialPeriod, string][] = [["revenue", "Revenue"], ["netIncome", "Net income"], ["operatingCashFlow", "Operating cash flow"], ["capex", "Capital expenditure"], ["cash", "Cash and equivalents"], ["debt", "Interest-bearing debt"], ["assets", "Total assets"], ["liabilities", "Total liabilities"], ["equity", "Shareholders' equity"], ["grossProfit", "Gross profit"], ["operatingIncome", "Operating income"]];

/** Preserve financial signs while neutralizing spreadsheet formulas in source text. */
function cell(value: string | number | null | undefined): string {
  let text = value == null ? "" : String(value);
  if (typeof value === "string" && /^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

export function reportToCsv(report: Report): string {
  const years = report.periods.map((period) => period.year);
  const rows: (string | number | null | undefined)[][] = [
    ["Finscope", report.company.name, report.symbol],
    ["Evidence", report.mode === "demo" ? "SYNTHETIC DEMONSTRATION — NOT ACTUAL FINANCIAL DATA" : report.dataKind === "filing-snapshot" ? "FROZEN PUBLISHED-FILING SNAPSHOT" : "PUBLISHED FINANCIAL STATEMENTS"],
    ["Provider", report.provider], ["Reporting currency", report.currency], ["Financial period ending", report.dataAsOf],
    ["Source retrieved", report.retrievedAt], ["Report saved", report.generatedAt],
    ["Definition", "Amounts in reporting-currency millions unless a row explicitly states per-share data or million shares. Empty cells indicate unavailable observations, never zero."],
    [], ["Statement", "Section", "Line item", "Unit", ...years],
  ];
  if (report.statements?.length) for (const statement of report.statements) for (const row of statement.rows) {
    const unit = row.unit === "currency-per-share" ? `${report.currency} per share` : row.unit === "million-shares" ? "Million shares" : `${report.currency} million`;
    rows.push([statement.title, row.section, row.label, unit, ...years.map((year) => row.values[year])]);
  }
  for (const [key, label] of fields) rows.push(["Analytical metrics", "", label, `${report.currency} million`, ...report.periods.map((period) => period[key])]);
  rows.push([], ["Methodology and limitations", report.note]);
  for (const source of report.sources) rows.push(["Source", source.label, source.url, source.asOf]);
  return "\ufeff" + rows.map((row) => row.map(cell).join(",")).join("\r\n");
}
