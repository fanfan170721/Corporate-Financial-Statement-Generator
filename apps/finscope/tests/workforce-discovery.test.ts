import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import type { Company, EmployeeObservation } from "../lib/types";
import type { CompanyContext } from "../lib/company-context";
import type { EvidenceCache } from "../lib/market-storage";

async function moduleUrl(name: string): Promise<string> {
  let source = stripTypeScriptTypes(await readFile(new URL(`../lib/${name}.ts`, import.meta.url), "utf8"));
  for (const match of [...source.matchAll(/from ["']\.\/([a-z-]+)["']/g)]) source = source.replaceAll(match[0], `from "${await moduleUrl(match[1])}"`);
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}
const { supplementWorkforce, robotsAllows } = await import(await moduleUrl("workforce-discovery")) as typeof import("../lib/workforce-discovery");
const now = new Date("2026-10-28T12:00:00Z");
const company: Company = {symbol:"TEST", name:"Example Company", nameEn:"Example Company", exchange:"NYSE", sector:"Other", color:"#abc", mark:"E", cik:"123"};
const robotsUrl = "https://stockanalysis.com/robots.txt";
const profileUrl = "https://stockanalysis.com/stocks/test/company/";
const employeesUrl = "https://stockanalysis.com/stocks/test/employees/";
const primary = (year: number, value = 100): EmployeeObservation => ({asOf:`${year}-12-31`, value, basis:"full-time", method:"annual-disclosure", source:`https://www.sec.gov/Archives/annual-${year}.htm`});
const context = (observations: EmployeeObservation[] = []): CompanyContext => ({
  profile:{cik:"0000000123", legalName:"Example Company", employeeHistory:observations, employees:observations.at(-1), employeeCoverage:{annualFilings:5, extracted:observations.length, unavailablePeriods:observations.length >= 5 ? [] : ["2024-12-31"], retrievalFailures:0}},
  sources:[{label:"Original annual filing",url:"https://www.sec.gov/Archives/source.htm"}],
});
const profileHtml = (cik = "123") => `<title>Example Company (TEST) Company Profile</title><table><tr><td>CIK Code</td><td>${cik}</td></tr><tr><td>Ticker Symbol</td><td>TEST</td></tr><tr><td>Website</td><td><a href="https://example.com">Website</a></td></tr></table>`;
const workforceHtml = (values: [string,number][]) => `<title>Example Company (TEST) Number of Employees</title><table><thead><tr><th>Date</th><th>Employees</th></tr></thead><tbody>${values.map(([date,value])=>`<tr><td>${date}</td><td>${value}</td></tr>`).join("")}</tbody></table>`;
function network(routes: Record<string, string | (() => Response)>) {
  const calls: {url:string;options?:RequestInit}[] = [];
  const fetcher: typeof fetch = async (input, options) => {
    const url = String(input); calls.push({url, options});
    const response = routes[url];
    assert.notEqual(response, undefined, `Unexpected request: ${url}`);
    return typeof response === "function" ? response() : new Response(response, {headers:{"content-type":"text/html"}});
  };
  return {calls, fetcher};
}
const run = (input: CompanyContext, net: ReturnType<typeof network>, cache?: EvidenceCache) => supplementWorkforce(company, input, {fetcher:net.fetcher, cache, secUserAgent:"Finscope test contact@example.com", now, allowDirectory:true});

test("complete primary history makes no supplementary request", async () => {
  const input = context([2021,2022,2023,2024,2025].map(year=>primary(year)));
  const net = network({});
  assert.equal(await run(input,net),input);
  assert.equal(net.calls.length,0);
});

test("robots disallow stops the crawl before company or employee pages", async () => {
  const input = context([primary(2025)]);
  const net = network({[robotsUrl]:"User-agent: *\nDisallow: /stocks/"});
  const result = await run(input,net);
  assert.deepEqual(net.calls.map(call=>call.url),[robotsUrl]);
  assert.deepEqual(result.profile?.employeeHistory,input.profile?.employeeHistory);
  assert.deepEqual(result.sources,input.sources);
  assert.equal(result.profile?.employeeResearch?.steps.at(-1)?.status,"blocked");
  assert.equal(result.profile?.employeeResearch?.addedObservations,0);
});

test("issuer identity mismatch never requests employee history", async () => {
  const net = network({[robotsUrl]:"User-agent: *\nAllow: /",[profileUrl]:profileHtml("999")});
  const result = await run(context(),net);
  assert.deepEqual(net.calls.map(call=>call.url),[robotsUrl,profileUrl]);
  assert.equal(result.profile?.employeeResearch?.steps.at(-1)?.status,"identity-mismatch");
  assert.deepEqual(result.profile?.employeeHistory,[]);
});

test("dated secondary observations preserve source scope and trace without inflating primary coverage", async () => {
  const input = context([primary(2025,140)]);
  const net = network({[robotsUrl]:"User-agent: *\nAllow: /",[profileUrl]:profileHtml(),[employeesUrl]:workforceHtml([["Jun 30, 2026",150],["Dec 31, 2025",140],["Dec 31, 2024",130],["Dec 31, 2023",120]])});
  const result = await run(input,net);
  const added = result.profile!.employeeHistory!.filter(item=>item.method === "public-directory");
  assert.deepEqual(added.map(item=>[item.asOf,item.value]),[["2023-12-31",120],["2024-12-31",130],["2026-06-30",150]]);
  assert.ok(added.every(item=>item.basis === "secondary-unspecified" && item.source === employeesUrl && item.retrievedAt === now.toISOString() && item.sourceLabel === "StockAnalysis"));
  assert.equal(result.profile?.employees?.asOf,"2026-06-30");
  assert.equal(result.profile?.website,"https://example.com/");
  assert.deepEqual(result.profile?.employeeCoverage,input.profile?.employeeCoverage);
  assert.equal(result.profile?.employeeResearch?.addedObservations,3);
  assert.equal(result.profile?.employeeResearch?.requests,3);
  assert.ok(result.profile!.employeeResearch!.bytes > 0);
  assert.equal(result.profile?.employeeResearch?.steps.at(-1)?.status,"used");
  assert.ok(result.sources.some(source=>source.url === employeesUrl && source.label.includes("scope unspecified")));
  assert.deepEqual(input.profile?.employeeHistory,[primary(2025,140)]);
  assert.ok(net.calls.every(call=>call.options?.redirect === "manual"));
});

test("secondary dates remain distinct and mixed workforce scopes do not create false conflicts", async () => {
  const input = context([primary(2025,140)]);
  const net = network({[robotsUrl]:"User-agent: *\nAllow: /",[profileUrl]:profileHtml(),[employeesUrl]:workforceHtml([["Dec 31, 2025",999],["Sep 30, 2025",999]])});
  const result = await run(input,net);
  assert.deepEqual(result.profile?.employeeHistory?.map(item=>[item.asOf,item.value,item.basis]),[["2025-09-30",999,"secondary-unspecified"],["2025-12-31",140,"full-time"]]);
  assert.deepEqual(result.profile?.employees,input.profile?.employees);
  assert.equal(result.profile?.employeeResearch?.steps.at(-1)?.status,"used");
  assert.equal(result.profile?.employeeResearch?.addedObservations,1);
  assert.ok(!result.profile?.employeeResearch?.steps.some(step=>step.status === "conflict"));
  assert.deepEqual(input.profile?.employeeHistory,[primary(2025,140)]);
});

test("a warm discovery cache avoids every external request", async () => {
  const entries = new Map<string,unknown>();
  const ttl: number[] = [];
  const cache: EvidenceCache = {get:async key=>entries.get(key),set:async(key,value,age)=>{entries.set(key,value);ttl.push(age);},reserveSec:async()=>{}};
  const input = context([primary(2025)]);
  const cold = network({[robotsUrl]:"User-agent: *\nAllow: /",[profileUrl]:profileHtml(),[employeesUrl]:workforceHtml([["Jun 30, 2026",150]])});
  const first = await run(input,cold,cache);
  const warm = network({});
  assert.deepEqual(await run(input,warm,cache),first);
  assert.equal(warm.calls.length,0);
  assert.ok(ttl.includes(86400000));
});

test("redirect responses are not followed and preserve earlier verified observations", async () => {
  const input = context([primary(2025)]);
  const net = network({[robotsUrl]:"User-agent: *\nAllow: /",[profileUrl]:profileHtml(),[employeesUrl]:()=>new Response("redirect",{status:302,headers:{Location:"https://untrusted.example/employee-data"}})});
  const result = await run(input,net);
  assert.deepEqual(net.calls.map(call=>call.url),[robotsUrl,profileUrl,employeesUrl]);
  assert.deepEqual(result.profile?.employeeHistory,input.profile?.employeeHistory);
  assert.equal(result.profile?.employeeResearch?.steps.at(-1)?.status,"unavailable");
});

test("oversized declared and streamed responses are discarded without losing primary data", async () => {
  for (const declared of [true,false]) {
    const input = context([primary(2025)]);
    const net = network({[robotsUrl]:"User-agent: *\nAllow: /",[profileUrl]:profileHtml(),[employeesUrl]:()=>new Response(declared?"unused body":" ".repeat(2_000_001),{headers:declared?{"content-length":"2000001"}:{}})});
    const result = await run(input,net);
    assert.deepEqual(result.profile?.employeeHistory,input.profile?.employeeHistory);
    assert.equal(result.profile?.employeeResearch?.steps.at(-1)?.status,"skipped");
    assert.equal(result.profile?.employeeResearch?.addedObservations,0);
  }
});

test("a verified annual-report exhibit survives a later blocked public source", async () => {
  const url = "https://www.sec.gov/Archives/edgar/data/123/000000012324000001/annual.htm";
  const input = context([primary(2025)]);
  input.employeeCandidates = [{url,periodEnd:"2024-12-31",form:"20-F"}];
  const net = network({[url]:"<p>As of December 31, 2024, we had approximately 125 employees worldwide.</p>",[robotsUrl]:()=>new Response("blocked",{status:403})});
  const result = await run(input,net);
  assert.equal(result.profile?.employeeHistory?.find(item=>item.asOf === "2024-12-31")?.value,125);
  assert.equal(result.profile?.employees?.value,100);
  assert.equal(result.profile?.employeeResearch?.addedObservations,1);
  assert.deepEqual(result.profile?.employeeResearch?.steps.map(step=>step.status),["used","blocked"]);
  assert.equal(result.profile?.employeeCoverage?.extracted,2);
  assert.deepEqual(result.profile?.employeeCoverage?.unavailablePeriods,[]);
  assert.deepEqual(input.profile?.employeeCoverage?.unavailablePeriods,["2024-12-31"]);
  assert.ok(result.sources.some(source=>source.url === url));
});

test("one successful exhibit per period leaves the second request for another year", async () => {
  const base = "https://www.sec.gov/Archives/edgar/data/123/000000012324000001/";
  const firstUrl = base + "annual-2024.htm";
  const duplicateUrl = base + "alternative-2024.htm";
  const secondUrl = base + "annual-2023.htm";
  const overBudgetUrl = base + "annual-2022.htm";
  const input = context([primary(2025)]);
  input.employeeCandidates = [[firstUrl,"2024-12-31"],[duplicateUrl,"2024-12-31"],[secondUrl,"2023-12-31"],[overBudgetUrl,"2022-12-31"]].map(([url,periodEnd])=>({url,periodEnd,form:"20-F"}));
  const net = network({[firstUrl]:"<p>As of December 31, 2024, we had 125 employees worldwide.</p>",[secondUrl]:"<p>As of December 31, 2023, we had 120 employees worldwide.</p>",[robotsUrl]:"User-agent: *\nDisallow: /"});
  const result = await run(input,net);
  assert.deepEqual(net.calls.map(call=>call.url),[firstUrl,secondUrl,robotsUrl]);
  assert.deepEqual(result.profile?.employeeHistory?.map(item=>[item.asOf,item.value]),[["2023-12-31",120],["2024-12-31",125],["2025-12-31",100]]);
  assert.equal(result.profile?.employeeResearch?.addedObservations,2);
  assert.equal(result.profile?.employeeResearch?.steps.filter(step=>step.status === "used").length,2);
});

test("candidate links cannot direct the crawler to arbitrary hosts or another issuer", async () => {
  const input = context([primary(2025)]);
  input.employeeCandidates = ["https://127.0.0.1/annual.htm","https://evil.example/annual.htm","https://www.sec.gov/Archives/edgar/data/999/000000012324000001/annual.htm"].map(url=>({url,periodEnd:"2024-12-31",form:"20-F"}));
  const net = network({[robotsUrl]:"User-agent: *\nDisallow: /"});
  await run(input,net);
  assert.deepEqual(net.calls.map(call=>call.url),[robotsUrl]);
});

test("robots matching honours bot-specific groups, longest paths and allow ties", () => {
  assert.equal(robotsAllows("User-agent: *\nDisallow: /\nUser-agent: FinscopeBot\nAllow: /stocks/", "/stocks/test/company/"),true);
  assert.equal(robotsAllows("User-agent: *\nAllow: /stocks/\nDisallow: /stocks/private/", "/stocks/private/employees/"),false);
  assert.equal(robotsAllows("User-agent: *\nDisallow: /stocks/\nAllow: /stocks/", "/stocks/test/employees/"),true);
});
