"use client";
import { useState } from "react";
import { useI18n } from '@/components/i18n';
import { FileText, ExternalLink } from "lucide-react";
import type { Report, FinancialStatement, FinancialPeriod } from "@/lib/types";
import "./financial-statements.css";

export default function FinancialStatements({ report }: { report: Report }) {
 const { t, locale } = useI18n();

  const [active, setActive] = useState("income");
  const fallback:FinancialStatement[]=[
    {kind:"income",title:t("Income statement summary"),rows:summaryRows(report,[["revenue",t("Revenue")],["grossProfit",t("Gross profit")],["operatingIncome",t("Operating income")],["netIncome",t("Net income")]])},
    {kind:"balance",title:t("Balance sheet summary"),rows:summaryRows(report,[["cash",t("Cash and equivalents")],["assets",t("Total assets")],["liabilities",t("Total liabilities")],["debt",t("Interest-bearing debt")],["equity",t("Shareholders’ equity")]])},
    {kind:"cashflow",title:t("Cash flow summary"),rows:summaryRows(report,[["operatingCashFlow",t("Operating cash flow")],["capex",t("Capital expenditure · cash outflow magnitude")]])},
  ];
  const statements=report.statements?.length?report.statements:fallback;
  const standardized=report.provider!=="Microsoft Investor Relations";
  const calendarEndLabels=report.provider==="SEC EDGAR";
  const statement = statements.find((item) => item.kind === active) ?? statements[0];
  const years = report.periods.map((period) => period.year);
  const format = (value: number | null | undefined) => value == null ? "—" : new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
  return <section className="statement-section" aria-label={t("Financial statement data")}>
    <div className="section-title row-between"><div><span className="eyebrow">{t("THE FINANCIAL STATEMENTS")}</span><h2>{standardized?t("The statements, brought together."):t("Every line, in context.")}</h2><p>{t('{description}, across {count} annual reporting periods.',{description:standardized?t('Standardized financial summaries'):t('The issuer’s primary statement rows'),count:years.length})} {standardized&&t("Read the original filings for the complete audited statements.")}</p></div><FileText size={24}/></div>
    <div className="statement-provenance panel"><div><strong>{report.provider || t("Published financial statements")}</strong><span>{t('Fiscal period ending {date}',{date:report.dataAsOf})} · {report.currency}</span></div>{report.retrievedAt&&<span>{t('Source retrieved {date}',{date:new Date(report.retrievedAt).toLocaleString(locale)})}</span>}</div>
    <div className="statement-tabs" role="tablist" aria-label={t("Choose a financial statement")}>{statements.map((item)=><button key={item.kind} id={`tab-${item.kind}`} role="tab" aria-selected={statement.kind===item.kind} aria-controls={`statement-${item.kind}`} onClick={()=>setActive(item.kind)}>{t(item.title)}<span>{t('{count} rows',{count:item.rows.length})}</span></button>)}</div>
    {statements.map(item=><div key={item.kind} role="tabpanel" id={`statement-${item.kind}`} aria-labelledby={`tab-${item.kind}`} className={`statement-table-wrap panel${statement.kind===item.kind?'':' statement-inactive'}`} tabIndex={0}>
      <table className="statement-table"><caption>{t('{title} · {currency} millions unless a row specifies otherwise',{title:t(item.title),currency:report.currency})}</caption><thead><tr><th scope="col">{standardized?t("Standardized financial item"):t("Reported line item")}</th>{years.map(year=><th scope="col" key={year}>{calendarEndLabels?t("Year ended "):t("FY")}{year}</th>)}</tr></thead><tbody>{item.rows.map((row)=><tr key={row.key} className={row.total?"statement-total":undefined}><th scope="row"><span>{t(row.label)}</span>{row.section&&<small>{t(row.section)}</small>}{row.unit==="currency-per-share"&&<em>{t('{currency} per share',{currency:report.currency})}</em>}{row.unit==="million-shares"&&<em>{t("Million shares")}</em>}</th>{years.map(year=><td key={year} title={row.values[year]==null?t("Not available for this period"):undefined}>{format(row.values[year])}</td>)}</tr>)}</tbody></table>
    </div>)}
    <p className="statement-note">{standardized?t("Labels are normalized for comparison; the source may use different terminology. Capital expenditure is presented as a positive outflow magnitude in the financial summary."):t("Cash-flow outflows retain their reported negative signs. Differently worded disclosures may appear as separate rows.")} {t("Newer filings take precedence for comparative figures. A dash means the line is not available for that period; it does not mean zero.")}</p>
    <div className="statement-sources">{report.sources.filter(source=>!source.label.includes("index")).map(source=><a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">{source.label}<ExternalLink size={13}/></a>)}</div>
    <p className="statement-note">{t("Read the original annual reports for the full notes, accounting policies, comprehensive income, changes in equity and independent auditor’s opinion.")}</p>
  </section>;
}
function summaryRows(report:Report,fields:[keyof FinancialPeriod,string][]){return fields.map(([key,label])=>({key,label,unit:"million-currency" as const,values:Object.fromEntries(report.periods.map(period=>[period.year,typeof period[key]==="number"?period[key]:null]))}));}
