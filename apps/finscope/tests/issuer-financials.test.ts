import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

async function moduleUrl(name: string, dependencies: Record<string, string> = {}): Promise<string> {
  let source = stripTypeScriptTypes(await readFile(new URL(`../lib/${name}.ts`, import.meta.url), "utf8"));
  for (const [dependency, url] of Object.entries(dependencies)) source = source.replaceAll(`"./${dependency}"`, `"${url}"`);
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}
const issuerUrl = await moduleUrl("issuer-financials");
const issuer = await import(issuerUrl) as typeof import("../lib/issuer-financials");
const market = await import(await moduleUrl("market", { "issuer-financials": issuerUrl, companies: await moduleUrl("companies") })) as typeof import("../lib/market");
const exporter = await import(await moduleUrl("report-export")) as typeof import("../lib/report-export");

// Invented fixture values test extraction only. No fixture is exposed as issuer data.
function annual(year: number, revenueOverride?: number): string {
  const table = (id: string, rows: [string, number | string | null][], years: number[]) => `<article id="${id}"><table><tr><td>In millions, except per share amounts</td></tr><tr><td>Year ended June 30</td>${years.map(value=>`<td></td><td>${value}</td>`).join("")}</tr>${rows.map(([label,value])=>`<tr><td>${label}</td>${years.map(y=>`<td></td><td>${value===null?"":typeof value==="number" ? (label==="Total revenue" ? revenueOverride??(y-2000)*10 : value) : value}</td>`).join("")}</tr>`).join("")}</table></article>`;
  return table("income-statements", [["Product revenue",100],["Service revenue",160],["Total revenue",260],["Cost of revenue",100],["Gross margin",160],["Research and development",20],["Sales and marketing",15],["General and administrative",5],["Operating income",120],["Other income",1],["Income before income taxes",121],["Provision for income taxes",20],["Net income",101],["Earnings per share:",null],["Basic","1.50"],["Diluted","1.40"],["Weighted average shares outstanding:",null],["Basic",72],["Diluted",74]], [year,year-1,year-2])
    + table("balance-sheets", [["Cash and cash equivalents",66],["Short-term investments",30],["Receivables",60],["Inventory",5],["Total current assets",161],["Property and equipment",80],["Other assets",759],["Total assets",1000],["Short-term debt",5],["Current portion of long-term debt",10],["Other current liabilities",355],["Long-term debt",30],["Total liabilities",400],["Total stockholders’ equity",600],["Total liabilities and stockholders’ equity",1000]], [year,year-1])
    + table("cash-flows-statements", [["Net income",101],["Depreciation",10],["Share-based compensation",2],["Working capital","(13)"],["Net cash from operations",100],["Additions to property and equipment","(40)"],["Acquisitions","(5)"],["Net cash used in investing","(45)"],["Dividends paid","(10)"],["Net cash used in financing","(10)"],["Effect of exchange rates",1],["Net change in cash",46],["Beginning cash",20],["Ending cash",66],["Optional disclosure","—"]], [year,year-1,year-2]);
}
const index = `<html>${[2026,2025,2024,2023,2022].map(year=>`<a href="https://www.microsoft.com/investor/reports/ar${String(year).slice(-2)}/index.html">Annual report FY${year}</a>`).join("")}${" ".repeat(500)}</html>`;
function fetchFixture(fail = false): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    assert.equal(init?.redirect,"manual","Cloudflare Workers supports manual/follow, not Node's redirect:error");
    if (fail) return new Response("Unavailable", { status: 503 });
    const url = String(input);
    if (url === "https://www.microsoft.com/en-us/investor/annual-reports") return new Response(index);
    const year = /https:\/\/www\.microsoft\.com\/investor\/reports\/ar(\d{2})\/index\.html$/.exec(url)?.[1];
    assert.ok(year, "Only the discovered official issuer URLs may be requested");
    return new Response(annual(2000+Number(year)));
  }) as typeof fetch;
}

test("issuer discovery uses official report links and rejects off-host and future pages", () => {
  const links = issuer.discoverMicrosoftReports(index + '<a href="https://attacker.test/investor/reports/ar30/index.html">bad</a><a href="https://www.microsoft.com/investor/reports/ar99/index.html">future</a>');
  assert.deepEqual(links.map(link=>link.year), [2026,2025,2024,2023,2022]);
  assert.ok(links.every(link=>new URL(link.url).hostname === "www.microsoft.com"));
});

test("published table parsing preserves source signs, year positions and per-share units", () => {
  const parsed = issuer.parseMicrosoftAnnualReport(annual(2026),2026);
  const income = parsed.statements.find(statement=>statement.kind==="income")!;
  assert.equal(income.rows.find(row=>row.label==="Total revenue")!.values["2024"],240);
  assert.equal(income.rows.find(row=>row.unit==="currency-per-share" && row.label==="Basic")!.values["2026"],1.5);
  assert.equal(income.rows.find(row=>row.unit==="million-shares" && row.label==="Basic")!.values["2026"],72);
  assert.equal(parsed.statements.find(statement=>statement.kind==="cashflow")!.rows.find(row=>row.label==="Additions to property and equipment")!.values["2026"],-40);
  const grouped=issuer.parseMicrosoftAnnualReport(annual(2026).replace('<td>Cash and cash equivalents</td>','<td>Current assets:</td></tr><tr><td>Cash and cash equivalents</td>'),2026);
  const balanceRows=grouped.statements.find(statement=>statement.kind==="balance")!.rows;
  assert.equal(balanceRows.find(row=>row.label==="Cash and cash equivalents")!.section,"Current assets");
  assert.equal(balanceRows.find(row=>row.label==="Property and equipment")!.section,"","Subtotal must close the current-assets group");
  assert.throws(()=>issuer.parseMicrosoftAnnualReport(annual(2026).replaceAll("In millions", "In thousands"),2026),{code:"ISSUER_FORMAT_CHANGED"});
  assert.throws(()=>issuer.parseMicrosoftAnnualReport(annual(2026),2025),{code:"ISSUER_FORMAT_CHANGED"});
});

test("five-year merge prefers later comparatives and fails closed on inconsistent balance sheets", () => {
  const sources=[issuer.parseMicrosoftAnnualReport(annual(2026,999),2026),issuer.parseMicrosoftAnnualReport(annual(2024),2024),issuer.parseMicrosoftAnnualReport(annual(2022),2022)];
  const result=issuer.mergeMicrosoftReports(sources);
  assert.deepEqual(result.periods.map(period=>period.year),["2022","2023","2024","2025","2026"]);
  assert.equal(result.periods[2].revenue,999,"FY2024 comparative uses the more recent FY2026 filing");
  assert.equal(result.periods[0].capex,40,"Charts use positive cash capex while source table retains outflow");
  assert.equal(result.periods[0].debt,45);
  assert.equal(result.dataAsOf,"2026-06-30");
  const broken=structuredClone(sources);
  broken[0].statements.find(statement=>statement.kind==="balance")!.rows.find(row=>row.label==="Total assets")!.values["2026"]=1001.01;
  assert.throws(()=>issuer.mergeMicrosoftReports(broken),{code:"ISSUER_RECONCILIATION"});
  const missing=structuredClone(sources);
  missing[0].statements.find(statement=>statement.kind==="income")!.rows.find(row=>row.label==="Total revenue")!.values["2026"]=null;
  assert.throws(()=>issuer.mergeMicrosoftReports(missing),{code:"ISSUER_INCOMPLETE"});
});

test("MSFT generation needs no financial-data key and retains complete evidence without silent fallback", async () => {
  const report=await market.generateReport("MSFT",{env:{SEC_USER_AGENT:"",FMP_API_KEY:""},fetcher:fetchFixture(),allowDemoFallback:false});
  assert.equal(report.mode,"live");
  assert.equal(report.dataKind,"provider");
  assert.equal(report.provider,"Microsoft Investor Relations");
  assert.equal(report.dataAsOf,"2026-06-30");
  assert.equal(report.periods.length,5);
  assert.equal(report.statements!.length,3);
  assert.equal(report.sources.length,4);
  assert.ok(report.retrievedAt);
  assert.equal(report.metrics.freeCashFlow,60);
  await assert.rejects(()=>market.generateReport("MSFT",{env:{SEC_USER_AGENT:"",FMP_API_KEY:""},fetcher:fetchFixture(true),allowDemoFallback:false}),{code:"ISSUER_UNAVAILABLE"});
  const redirect = (async () => new Response(null,{status:302,headers:{Location:"https://attacker.test/fake.html"}})) as typeof fetch;
  await assert.rejects(()=>issuer.retrieveIssuerFinancials("MSFT",{fetcher:redirect}),{code:"ISSUER_UNAVAILABLE"});
});

test("CSV exports all statements, provenance, source units and safe text without corrupting negatives", async () => {
  const report=await market.generateReport("MSFT",{env:{SEC_USER_AGENT:"",FMP_API_KEY:""},fetcher:fetchFixture()});
  report.statements![0].rows.push({key:"malicious-label",label:"=HYPERLINK(\"bad\")",values:{"2026":null}});
  const csv=exporter.reportToCsv(report);
  assert.match(csv,/Income statement/);
  assert.match(csv,/Balance sheet/);
  assert.match(csv,/Cash-flow statement/);
  assert.match(csv,/USD per share/);
  assert.match(csv,/Source retrieved/);
  assert.match(csv,/https:\/\/www\.microsoft\.com\/investor\/reports\/ar26\/index\.html/);
  assert.match(csv,/'=HYPERLINK/);
  assert.match(csv,/"-40"/);
  assert.doesNotMatch(csv,/"'-40"/);
});
