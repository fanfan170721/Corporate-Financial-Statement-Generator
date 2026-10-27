"use client";
import { useState } from "react";
import { FileText, ExternalLink } from "lucide-react";
import type { Report, FinancialStatement, FinancialPeriod } from "@/lib/types";
import "./financial-statements.css";

export default function FinancialStatements({ report }: { report: Report }) {
  const [active, setActive] = useState("income");
  const fallback:FinancialStatement[]=[
    {kind:"income",title:"Income statement summary",rows:summaryRows(report,[["revenue","Revenue"],["grossProfit","Gross profit"],["operatingIncome","Operating income"],["netIncome","Net income"]])},
    {kind:"balance",title:"Balance sheet summary",rows:summaryRows(report,[["cash","Cash and equivalents"],["assets","Total assets"],["liabilities","Total liabilities"],["debt","Interest-bearing debt"],["equity","Shareholders’ equity"]])},
    {kind:"cashflow",title:"Cash flow summary",rows:summaryRows(report,[["operatingCashFlow","Operating cash flow"],["capex","Capital expenditure · cash outflow magnitude"]])},
  ];
  const statements=report.statements?.length?report.statements:fallback;
  const standardized=report.provider!=="Microsoft Investor Relations";
  const calendarEndLabels=report.provider==="SEC EDGAR";
  const statement = statements.find((item) => item.kind === active) ?? statements[0];
  const years = report.periods.map((period) => period.year);
  const format = (value: number | null | undefined) => value == null ? "—" : new Intl.NumberFormat("en-CA", { maximumFractionDigits: 2 }).format(value);
  return <section className="statement-section" aria-label="Financial statement data">
    <div className="section-title row-between"><div><span className="eyebrow">THE FINANCIAL STATEMENTS</span><h2>{standardized?"The statements, brought together.":"Every line, in context."}</h2><p>{standardized?"Standardized financial summaries":"The issuer’s primary statement rows"}, across {years.length} annual reporting periods. {standardized&&"Read the original filings for the complete audited statements."}</p></div><FileText size={24}/></div>
    <div className="statement-provenance panel"><div><strong>{report.provider || "Published financial statements"}</strong><span>Fiscal period ending {report.dataAsOf} · {report.currency}</span></div>{report.retrievedAt&&<span>Source retrieved {new Date(report.retrievedAt).toLocaleString("en-CA")}</span>}</div>
    <div className="statement-tabs" role="tablist" aria-label="Choose a financial statement">{statements.map((item)=><button key={item.kind} id={`tab-${item.kind}`} role="tab" aria-selected={statement.kind===item.kind} aria-controls={`statement-${item.kind}`} onClick={()=>setActive(item.kind)}>{item.title}<span>{item.rows.length} rows</span></button>)}</div>
    {statements.map(item=><div key={item.kind} role="tabpanel" id={`statement-${item.kind}`} aria-labelledby={`tab-${item.kind}`} className={`statement-table-wrap panel${statement.kind===item.kind?'':' statement-inactive'}`} tabIndex={0}>
      <table className="statement-table"><caption>{item.title} · {report.currency} millions unless a row specifies otherwise</caption><thead><tr><th scope="col">{standardized?"Standardized financial item":"Reported line item"}</th>{years.map(year=><th scope="col" key={year}>{calendarEndLabels?"Year ended ":"FY"}{year}</th>)}</tr></thead><tbody>{item.rows.map((row)=><tr key={row.key} className={row.total?"statement-total":undefined}><th scope="row"><span>{row.label}</span>{row.section&&<small>{row.section}</small>}{row.unit==="currency-per-share"&&<em>{report.currency} per share</em>}{row.unit==="million-shares"&&<em>Million shares</em>}</th>{years.map(year=><td key={year} title={row.values[year]==null?"Not available for this period":undefined}>{format(row.values[year])}</td>)}</tr>)}</tbody></table>
    </div>)}
    <p className="statement-note">{standardized?"Labels are normalized for comparison; the source may use different terminology. Capital expenditure is presented as a positive outflow magnitude in the financial summary.":"Cash-flow outflows retain their reported negative signs. Differently worded disclosures may appear as separate rows."} Newer filings take precedence for comparative figures. A dash means the line is not available for that period; it does not mean zero.</p>
    <div className="statement-sources">{report.sources.filter(source=>!source.label.includes("index")).map(source=><a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">{source.label}<ExternalLink size={13}/></a>)}</div>
    <p className="statement-note">Read the original annual reports for the full notes, accounting policies, comprehensive income, changes in equity and independent auditor’s opinion.</p>
  </section>;
}
function summaryRows(report:Report,fields:[keyof FinancialPeriod,string][]){return fields.map(([key,label])=>({key,label,unit:"million-currency" as const,values:Object.fromEntries(report.periods.map(period=>[period.year,typeof period[key]==="number"?period[key]:null]))}));}
