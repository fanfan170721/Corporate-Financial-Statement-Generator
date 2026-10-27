"use client";
import { useState } from "react";
import { FileText, ExternalLink } from "lucide-react";
import type { Report } from "@/lib/types";
import "./financial-statements.css";

export default function FinancialStatements({ report }: { report: Report }) {
  const [active, setActive] = useState("income");
  if (!report.statements?.length) return null;
  const statement = report.statements.find((item) => item.kind === active) ?? report.statements[0];
  const years = report.periods.map((period) => period.year);
  const format = (value: number | null | undefined) => value == null ? "—" : new Intl.NumberFormat("en-CA", { maximumFractionDigits: 2 }).format(value);
  return <section className="statement-section" aria-label="Published financial statements">
    <div className="section-title row-between"><div><span className="eyebrow">THE FINANCIAL STATEMENTS</span><h2>Every line, in context.</h2><p>The issuer’s primary statement rows, across {years.length} fiscal years.</p></div><FileText size={24}/></div>
    <div className="statement-provenance panel"><div><strong>{report.provider || "Published financial statements"}</strong><span>Fiscal period ending {report.dataAsOf} · {report.currency}</span></div>{report.retrievedAt&&<span>Source retrieved {new Date(report.retrievedAt).toLocaleString("en-CA")}</span>}</div>
    <div className="statement-tabs" role="tablist" aria-label="Choose a financial statement">{report.statements.map((item)=><button key={item.kind} id={`tab-${item.kind}`} role="tab" aria-selected={statement.kind===item.kind} aria-controls={`statement-${item.kind}`} onClick={()=>setActive(item.kind)}>{item.title}<span>{item.rows.length} rows</span></button>)}</div>
    {report.statements.map(item=><div key={item.kind} role="tabpanel" id={`statement-${item.kind}`} aria-labelledby={`tab-${item.kind}`} className={`statement-table-wrap panel${statement.kind===item.kind?'':' statement-inactive'}`} tabIndex={0}>
      <table className="statement-table"><caption>{item.title} · {report.currency} millions unless a row specifies otherwise</caption><thead><tr><th scope="col">Reported line item</th>{years.map(year=><th scope="col" key={year}>FY{year}</th>)}</tr></thead><tbody>{item.rows.map((row)=><tr key={row.key} className={row.total?"statement-total":undefined}><th scope="row"><span>{row.label}</span>{row.section&&<small>{row.section}</small>}{row.unit==="currency-per-share"&&<em>{report.currency} per share</em>}{row.unit==="million-shares"&&<em>Million shares</em>}</th>{years.map(year=><td key={year}>{format(row.values[year])}</td>)}</tr>)}</tbody></table>
    </div>)}
    <p className="statement-note">Cash-flow outflows retain their reported negative signs. Newer filings take precedence for comparative figures. A blank means the line is not available for that period; it does not mean zero. Differently worded disclosures may appear as separate rows.</p>
    <div className="statement-sources">{report.sources.filter(source=>!source.label.includes("index")).map(source=><a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">{source.label}<ExternalLink size={13}/></a>)}</div>
    <p className="statement-note">Read the original annual reports for the full notes, accounting policies, comprehensive income, changes in equity and independent auditor’s opinion.</p>
  </section>;
}
