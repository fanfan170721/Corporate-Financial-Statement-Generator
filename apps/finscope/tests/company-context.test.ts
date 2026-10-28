import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

const source = stripTypeScriptTypes(await readFile(new URL("../lib/company-context.ts", import.meta.url), "utf8"));
const context = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`) as typeof import("../lib/company-context");
const cik = "12345";
const periodEnd = "2025-12-31";
// Invented issuer metadata and XBRL facts exercise parsing only.
const submissions = () => ({ cik: 12345, sicDescription: "Industrial instruments", description: "", website: "https://example.com", filings: { recent: {
  form: ["8-K", "10-K", "10-Q", "10-K", "10-K/A"],
  accessionNumber: ["0000012345-26-000004", "0000012345-26-000003", "0000012345-25-000002", "0000012345-25-000001", "0000012345-26-000005"],
  primaryDocument: ["current.htm", "annual-2025.htm", "quarterly.htm", "annual-2024.htm", "amendment.htm"],
  filingDate: ["2026-04-01", "2026-02-15", "2025-11-01", "2025-02-15", "2026-03-01"],
  reportDate: ["2026-04-01", "2025-12-31", "2025-09-30", "2024-12-31", "2025-12-31"],
} } });
function document(facts = '<ix:nonFraction name="sample:NumberOfEmployees" contextRef="annual" unitRef="headcount" format="ixt:num-dot-decimal" scale="0">12,345</ix:nonFraction>', period = `<xbrli:instant>${periodEnd}</xbrli:instant>`, unit = "xbrli:pure", entityCik = cik) {
  return `<html><xbrli:context id="annual"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">${entityCik}</xbrli:identifier></xbrli:entity><xbrli:period>${period}</xbrli:period></xbrli:context><xbrli:unit id="headcount"><xbrli:measure>${unit}</xbrli:measure></xbrli:unit>${facts}</html>`;
}
const fact = (value: string, attributes = "") => `<ix:nonFraction name="dei:EntityNumberOfEmployees" contextRef="annual" unitRef="headcount" ${attributes}>${value}</ix:nonFraction>`;

test("SEC URLs accept only canonical issuer IDs, accession numbers and document basenames", () => {
  assert.equal(context.normalizeCik(cik), "0000012345");
  for (const invalid of ["0", "-1", "12345678901", "12/34", "12345 ", "1e5"]) assert.equal(context.normalizeCik(invalid), undefined);
  assert.equal(context.filingDocumentUrl(cik, "0000012345-26-000001", "annual.htm"), "https://www.sec.gov/Archives/edgar/data/12345/000001234526000001/annual.htm");
  for (const invalid of ["../annual.htm", "https://other.test/annual.htm", "sub/annual.htm", "annual.htm?url=other", "annual%2ehtm", "annual\\other.htm", "annual..htm", "annual.xml"]) assert.equal(context.filingDocumentUrl(cik, "0000012345-26-000001", invalid), undefined);
  assert.equal(context.filingDocumentUrl(cik, "../0000012345-26-000001", "annual.htm"), undefined);
});

test("submission profile and filing feed retain dated primary sources without calling them news", () => {
  const parsed = context.parseSecSubmissions(submissions(), cik);
  assert.equal(parsed.profile?.industry, "Industrial instruments");
  assert.equal(parsed.profile?.website, "https://example.com/");
  assert.equal(parsed.profile?.description, undefined);
  assert.equal(parsed.filings.length, 4);
  assert.equal(parsed.filings[0].title, "8-K · Company filing");
  assert.equal(parsed.latestAnnual?.reportDate, periodEnd);
  assert.equal(parsed.latestAnnual?.filedAt, "2026-02-15");
  assert.equal(context.parseSecSubmissions(submissions(), "99").filings.length, 0);
});

test("invalid calendar dates, unsafe websites and mismatched submission arrays fail closed", () => {
  for (const website of ["javascript:alert(1)", "http://example.com", "https://u:p@example.com", "https://example.com:8443", "https://127.0.0.1"]) {
    const data = submissions(); data.website = website;
    assert.equal(context.parseSecSubmissions(data, cik).profile?.website, undefined);
  }
  const data = submissions(); data.filings.recent.filingDate[1] = "2026-02-30"; data.filings.recent.primaryDocument[0] = "../current.htm";
  const parsed = context.parseSecSubmissions(data, cik);
  assert.equal(parsed.latestAnnual?.reportDate, "2024-12-31");
  assert.equal(parsed.filings.length, 2);
  assert.deepEqual(context.parseSecSubmissions({ cik: 12345, filings: { recent: { form: ["10-K"] } } }, cik).filings, []);
});

test("employee counts use explicit inline facts, grouping, scales and matching issuer dates", () => {
  assert.deepEqual(context.parseEmployeeFact(document(), { cik, periodEnd }), { value: 12345, asOf: periodEnd });
  assert.deepEqual(context.parseEmployeeFact(document(fact("12.5", 'scale="3"')), { cik, periodEnd }), { value: 12500, asOf: periodEnd });
  assert.deepEqual(context.parseEmployeeFact(document(fact("12.500", 'format="ixt:num-comma-decimal"')), { cik, periodEnd }), { value: 12500, asOf: periodEnd });
  assert.deepEqual(context.parseEmployeeFact(document(fact("12&nbsp;500")), { cik, periodEnd }), { value: 12500, asOf: periodEnd });
  assert.deepEqual(context.parseEmployeeFact(document(fact("12<span>,</span>500<ix:exclude>1</ix:exclude>")), { cik, periodEnd }), { value: 12500, asOf: periodEnd });
  assert.deepEqual(context.parseEmployeeFact(document(fact("0")), { cik, periodEnd }), { value: 0, asOf: periodEnd });
  assert.deepEqual(context.parseEmployeeFact(document(fact("99"), `<xbrli:startDate>2025-01-01</xbrli:startDate><xbrli:endDate>${periodEnd}</xbrli:endDate>`, "sample:employees"), { cik, periodEnd }), { value: 99, asOf: periodEnd });
});

test("narratives, subsidiary facts, ratios, different issuers and different dates are not headcounts", () => {
  assert.equal(context.parseEmployeeFact(document("We have 12345 employees."), { cik, periodEnd }), undefined);
  assert.equal(context.parseEmployeeFact(document().replace("NumberOfEmployees", "AverageNumberOfEmployees"), { cik, periodEnd }), undefined);
  assert.equal(context.parseEmployeeFact(document().replace("</xbrli:entity>", '<xbrli:segment><xbrldi:explicitMember dimension="Geography">Europe</xbrldi:explicitMember></xbrli:segment></xbrli:entity>'), { cik, periodEnd }), undefined);
  assert.equal(context.parseEmployeeFact(document(undefined, undefined, "iso4217:USD"), { cik, periodEnd }), undefined);
  assert.equal(context.parseEmployeeFact(document().replace('<xbrli:measure>xbrli:pure</xbrli:measure>', '<xbrli:divide><xbrli:unitNumerator><xbrli:measure>xbrli:pure</xbrli:measure></xbrli:unitNumerator></xbrli:divide>'), { cik, periodEnd }), undefined);
  assert.equal(context.parseEmployeeFact(document(undefined, undefined, undefined, "999"), { cik, periodEnd }), undefined);
  assert.equal(context.parseEmployeeFact(document(), { cik, periodEnd: "2024-12-31" }), undefined);
  assert.equal(context.parseEmployeeFact(document(undefined, '<xbrli:startDate>2025-10-01</xbrli:startDate><xbrli:endDate>2025-12-31</xbrli:endDate>'), { cik, periodEnd }), undefined);
});

test("invalid numeric transformations and ambiguous totals do not invent a count", () => {
  for (const [value, attributes] of [["-1", ""], ["1,23", ""], ["12.5", ""], ["123", 'sign="-"'], ["123", 'scale="99"'], ["123", 'xsi:nil="true"'], ["123", 'continuedAt="next"'], ["123", 'format="ixt:unknown"'], ["9007199254740992", ""]]) assert.equal(context.parseEmployeeFact(document(fact(value, attributes)), { cik, periodEnd }), undefined);
  assert.equal(context.parseEmployeeFact(document(fact("100") + fact("101")), { cik, periodEnd }), undefined);
  assert.deepEqual(context.parseEmployeeFact(document(fact("100") + fact("100")), { cik, periodEnd }), { value: 100, asOf: periodEnd });
  assert.equal(context.parseEmployeeFact(document(`<!--${fact("100")}--><script>${fact("100")}</script>`), { cik, periodEnd }), undefined);
  assert.equal(context.parseEmployeeFact(document(), { cik, periodEnd: "2025-02-30" }), undefined);
});

test("dated annual disclosures preserve full-time versus total scope and short original evidence", () => {
  const total = "As of December 31, 2025, we had approximately 12,345 employees worldwide.";
  assert.deepEqual(context.parseEmployeeDisclosure(`<h2>Human capital</h2><p>${total}</p>`, { periodEnd }), { value: 12345, asOf: periodEnd, basis: "total", approximate: true, evidence: total, method: "annual-disclosure" });
  assert.equal(context.parseEmployeeDisclosure("The company employed 12,000 full-time employees as of December 31, 2025.", { periodEnd })?.basis, "full-time");
  assert.equal(context.parseEmployeeDisclosure("As of 31 December 2025, the company and its subsidiaries had 12345 employees.", { periodEnd })?.value, 12345);
  assert.equal(context.parseEmployeeDisclosure("At 2025-12-31, we employed about 12345 employees.", { periodEnd })?.value, 12345);
  assert.equal(context.parseEmployeeDisclosure(total + " As of December 31, 2025, we had 12,000 full-time employees.", { periodEnd })?.value, 12345);
});

test("undated, regional, contractor, approximate-year and contradictory narratives stay unavailable", () => {
  for (const sentence of [
    "We had 12345 employees.",
    "As of December 31, 2024, we had 12345 employees.",
    "As of December 31, 2025, we had 12345 employees in Canada.",
    "As of December 31, 2025, our German subsidiary had 12345 employees.",
    "As of December 31, 2025, we had 12345 employees including 1,000 contractors.",
    "As of December 31, 2025, we had 12345 full-time employees and 1000 part-time employees.",
    "As of December 31, 2025, we had 12345 employees. As of December 31, 2025, we had 12500 employees.",
    "As of December 31, 2025, we had 12345 employees. As of December 31, 2025, we had 12500 full-time employees.",
    "As of December 31, 2025, we had 12,34 employees.",
  ]) assert.equal(context.parseEmployeeDisclosure(sentence, { periodEnd }), undefined, sentence);
});

test("disclosure fallback is dated and contradictory inline totals cannot override it", async () => {
  const disclosure = "As of December 31, 2025, we had approximately 12,345 employees worldwide.";
  const result = await context.getCompanyContext(cik, { fetchJson: async () => submissions(), fetchText: async () => `<p>${disclosure}</p>` });
  assert.equal(result.profile?.employees?.value, 12345);
  const conflict = await context.getCompanyContext(cik, { fetchJson: async () => submissions(), fetchText: async () => document(fact("100")) + `<p>${disclosure}</p>` });
  assert.equal(conflict.profile?.employees, undefined);
});

test("context retrieval collects bounded annual history while preserving latest observation", async () => {
  const requested: string[] = [];
  const result = await context.getCompanyContext(cik, {
    fetchJson: async url => { requested.push(url); return submissions(); },
    fetchText: async url => { requested.push(url); return document(); },
  });
  assert.equal(requested.length, 3);
  assert.equal(requested[0], "https://data.sec.gov/submissions/CIK0000012345.json");
  assert.ok(requested[1].endsWith("/annual-2025.htm"));
  assert.equal(result.profile?.employees?.value, 12345);
  assert.equal(result.profile?.employees?.asOf, periodEnd);
  assert.equal(result.profile?.employees?.source, requested[1]);
  assert.equal(result.sources[1].asOf, periodEnd);
  assert.equal(result.filings?.length, 4);
  assert.equal(result.profile?.employeeHistory?.length, 1);
  assert.deepEqual(result.profile?.employeeCoverage, {annualFilings:2, extracted:1, unavailablePeriods:["2024-12-31"], retrievalFailures:0});
});

test("missing or unavailable optional enrichment preserves valid profile and filing history", async () => {
  const result = await context.getCompanyContext(cik, { fetchJson: async () => submissions(), fetchText: async () => { throw new Error("temporary upstream failure"); } });
  assert.equal(result.profile?.industry, "Industrial instruments");
  assert.equal(result.profile?.employees, undefined);
  assert.equal(result.sources.length, 1);
  assert.equal(result.filings?.length, 4);
  assert.deepEqual(await context.getCompanyContext(cik, { fetchJson: async () => { throw new Error("temporary upstream failure"); } }), { sources: [] });
  assert.deepEqual(await context.getCompanyContext("../12345", { fetchJson: async () => { throw new Error("must not run"); } }), { sources: [] });
});


test("annual narrative variants retain Apple FTE, combined staffing and full-time basis", () => {
  const apple = '<p>As of September 27, 2025, the Company had approximately <span>166,</span><span>000</span> full-time <span>equivalent employees.</span></p>';
  const fte = context.parseEmployeeDisclosure(apple, { periodEnd: "2025-09-27" });
  assert.equal(fte?.value, 166000);
  assert.equal(fte?.basis, "full-time-equivalent");
  assert.equal(fte?.approximate, true);
  assert.equal(fte?.asOf, "2025-09-27");
  assert.equal(context.parseEmployeeDisclosure(apple, { periodEnd: "2024-09-28" }), undefined);
  const combined = context.parseEmployeeDisclosure('We employed approximately 1,576,000 full-time and part-time employees as of December 31, 2025.', { periodEnd });
  assert.equal(combined?.value, 1576000);
  assert.equal(combined?.basis, "full-and-part-time");
  const fullTime = context.parseEmployeeDisclosure('As of June 30, 2026, we employed approximately 223,000 people on a full-time basis, 125,000 in the U.S. and 98,000 internationally.', { periodEnd: "2026-06-30" });
  assert.equal(fullTime?.value, 223000);
  assert.equal(fullTime?.basis, "full-time");
  assert.equal(fullTime?.approximate, true);
  assert.ok(fullTime?.evidence.endsWith('basis…'));
});

test("regional breakdowns must reconcile and distinct workforce measures are not combined", () => {
  const msft = 'As of June 30, 2026, we employed approximately 223,000 people on a full-time basis, 125,000 in the U.S. and 97,000 internationally.';
  assert.equal(context.parseEmployeeDisclosure(msft, { periodEnd: "2026-06-30" }), undefined);
  for (const sentence of [
    'As of December 31, 2025, we had 12,000 full-time equivalent employees in Canada.',
    'As of December 31, 2025, we had 12,000 full-time equivalent employees including contractors.',
    'As of December 31, 2025, we had 12,000 full-time equivalent employees and 400 contractors.',
    'As of December 31, 2025, we had 12,000 full-time and part-time employees excluding Asia.',
  ]) assert.equal(context.parseEmployeeDisclosure(sentence, { periodEnd }), undefined);
  const observations = 'As of December 31, 2025, we had 12,000 full-time equivalent employees. As of December 31, 2025, we had 14,000 employees.';
  const result = context.parseEmployeeDisclosure(observations, { periodEnd });
  assert.equal(result?.value, 14000);
  assert.equal(result?.basis, 'total');
  const fteAndFullTime = 'As of December 31, 2025, we had 12,000 full-time equivalent employees. As of December 31, 2025, we had 11,000 full-time employees.';
  assert.equal(context.parseEmployeeDisclosure(fteAndFullTime, { periodEnd })?.basis, 'full-time');
});

test("matching inline counts preserve the explicitly disclosed workforce basis", async () => {
  const result = await context.getCompanyContext(cik, { fetchJson: async () => submissions(), fetchText: async () => document(fact("12345")) + '<p>As of December 31, 2025, we had approximately 12,345 full-time equivalent employees.</p>' });
  assert.equal(result.profile?.employees?.value, 12345);
  assert.equal(result.profile?.employees?.basis, 'full-time-equivalent');
  assert.equal(result.profile?.employees?.approximate, true);
  assert.equal(result.profile?.employees?.method, 'inline-xbrl');
});


test("fiscal-year wording needs a verified issuer and reporting-period DEI fact", () => {
  const fiscalFact = '<ix:nonNumeric name="dei:DocumentFiscalYearFocus" contextRef="annual">2026</ix:nonNumeric>';
  const statement = '<p>As of the end of fiscal year 2026, we had approximately 42,000 employees in 38 countries.</p>';
  const html = document(fiscalFact + statement);
  const result = context.parseEmployeeDisclosure(html, { cik, periodEnd });
  assert.equal(result?.value, 42000);
  assert.equal(result?.basis, 'total');
  assert.equal(result?.asOf, periodEnd);
  assert.equal(context.parseEmployeeDisclosure(statement, { cik, periodEnd }), undefined);
  assert.equal(context.parseEmployeeDisclosure(html, { periodEnd }), undefined);
  assert.equal(context.parseEmployeeDisclosure(html, { cik: '999', periodEnd }), undefined);
  assert.equal(context.parseEmployeeDisclosure(html, { cik, periodEnd: '2024-12-31' }), undefined);
  assert.equal(context.parseEmployeeDisclosure(document(fiscalFact.replace('>2026<', '>2025<') + statement), { cik, periodEnd }), undefined);
  assert.equal(context.parseEmployeeDisclosure(document(fiscalFact + fiscalFact.replace('>2026<', '>2025<') + statement), { cik, periodEnd }), undefined);
});

test("named issuer disclosures use the trusted legal name and retain its punctuation", () => {
  const statement = '<p>As of December 31, 2025, Fixture Company, Inc. had 12,345 employees globally.</p>';
  assert.equal(context.parseEmployeeDisclosure(statement, { periodEnd, legalName: 'Fixture Company, Inc.' })?.value, 12345);
  assert.equal(context.parseEmployeeDisclosure(statement, { periodEnd, legalName: 'Other Company, Inc.' }), undefined);
  assert.equal(context.parseEmployeeDisclosure(statement, { periodEnd }), undefined);
  assert.equal(context.parseEmployeeDisclosure('At December 31, 2025, the firm had 12,345 employees globally.', { periodEnd })?.value, 12345);
});
