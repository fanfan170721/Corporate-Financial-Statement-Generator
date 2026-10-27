/** Public-data integration audit. Requires a declared SEC_USER_AGENT; never prints it. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { stripTypeScriptTypes } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = fileURLToPath(new URL("../", import.meta.url));
const argument = (name, fallback) => { const index = process.argv.indexOf(name); return index < 0 ? fallback : process.argv[index + 1]; };
const limit = Number(argument("--limit", "350"));
if (!Number.isInteger(limit) || limit < 100 || limit > 1000) throw new Error("--limit must be between 100 and 1000 distinct issuers.");
const envText = await readFile(path.join(app, ".dev.vars"), "utf8").catch(() => "");
const localIdentity = envText.match(/^SEC_USER_AGENT\s*=\s*["']?(.*?)["']?\s*$/m)?.[1];
const identity = process.env.SEC_USER_AGENT || localIdentity;
if (!identity || !/\S+@\S+\.\S+/.test(identity)) throw new Error("Configure SEC_USER_AGENT with the application name and a genuine operator contact before running the audit.");
const parserSource = await readFile(path.join(app, "lib/sec-financials.ts"), "utf8");
const parserHash = createHash("sha256").update(parserSource).digest("hex");
const { parseSecFinancials } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(parserSource)).toString("base64")}`);
const startedAt = new Date().toISOString();
const output = path.resolve(argument("--output", path.join(app, "outputs/coverage/sec-local.json")));
let lastRequest = 0;
async function get(url) {
  const delay = 600 - (Date.now() - lastRequest);
  if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
  lastRequest = Date.now();
  const response = await fetch(url, { headers: { "User-Agent": identity, Accept: "application/json" }, signal: AbortSignal.timeout(25000) });
  if (!response.ok) return { status: response.status };
  return { status: response.status, value: await response.json(), retrievedAt: new Date().toISOString() };
}
const directoryUrl = "https://www.sec.gov/files/company_tickers_exchange.json";
const directory = await get(directoryUrl);
if (!directory.value?.data) throw new Error(`SEC directory unavailable (HTTP ${directory.status}).`);
const universe = directory.value.data.map(row => Object.fromEntries(directory.value.fields.map((field, index) => [field, row[index]])));
const selected = new Map();
for (const company of universe) if (["Nasdaq", "NYSE"].includes(company.exchange) && !selected.has(company.cik)) selected.set(company.cik, company);
// The sample is fixed from directory order before any company's financials are fetched.
const sample = [...selected.values()].slice(0, limit);
const results = [];
for (const company of sample) {
  const publicIdentity = { symbol: company.ticker, cik: company.cik, name: company.name, exchange: company.exchange };
  try {
    const response = await get(`https://data.sec.gov/api/xbrl/companyfacts/CIK${String(company.cik).padStart(10, "0")}.json`);
    if (!response.value) { results.push({ ...publicIdentity, httpStatus: response.status, available: false }); continue; }
    const parsed = parseSecFinancials(response.value, { cik: String(company.cik) });
    const missing = parsed.coverage.missingLatest;
    const age = Date.now() - Date.parse(parsed.dataAsOf);
    const current = !!parsed.dataAsOf && age >= 0 && age <= 550 * 86400000;
    const critical = ["revenue", "netIncome", "operatingCashFlow", "assets", "liabilities", "equity"].every(field => !missing.includes(field));
    const available = parsed.periods.length >= 2 && parsed.coverage.percent > 90 && missing.length <= 1 && critical && current;
    results.push({ ...publicIdentity, httpStatus: response.status, retrievedAt: response.retrievedAt, years: parsed.periods.length, dataAsOf: parsed.dataAsOf, filedAt: parsed.filedAt, currency: parsed.currency, available, current, coverage: parsed.coverage, periods: parsed.periods });
  } catch (error) { results.push({ ...publicIdentity, available: false, error: error?.name === "TimeoutError" ? "TIMEOUT" : "FETCH_OR_PARSE_FAILED" }); }
  if (results.length % 25 === 0) console.log(JSON.stringify({ checked: results.length, available: results.filter(row => row.available).length }));
}
const summary = { sample: sample.length, successfullyFetched: results.filter(row => row.httpStatus === 200).length, atLeastTwoYears: results.filter(row => row.years >= 2).length, fiveYears: results.filter(row => row.years === 5).length, above90Percent: results.filter(row => row.coverage?.percent > 90).length, available: results.filter(row => row.available).length };
const audit = { schemaVersion: 1, environment: "local", startedAt, completedAt: new Date().toISOString(), parserSha256: parserHash, source: directoryUrl, sampleSelection: "First unique CIK per current SEC NYSE/Nasdaq directory order; fixed before retrieval. First security for each issuer retained. No successful-result filtering.", definition: "11 fixed core fields per displayed annual period. Available requires >90% completeness across all years, at least 2 years, at most 1 latest missing field, revenue/net income/operating cash flow/assets/liabilities/equity present, and period end within 550 days. This is a local adapter audit, not a production browser or save/reopen audit.", summary, results };
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(audit, null, 2) + "\n");
console.log(JSON.stringify(summary));
