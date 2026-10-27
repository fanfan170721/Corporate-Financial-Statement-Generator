/** Verify public discovery against the deployed retrieval/normalization path. No AI or account mutations. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
const origin = new URL(arg('--origin', 'https://finscopehq.com')).origin;
if (!origin.startsWith('https://')) throw new Error('A production HTTPS origin is required.');
const input = arg('--candidates', 'outputs/sec-probe/production-candidates.json');
const output = path.resolve(arg('--output', 'outputs/coverage/production.json'));
const candidates = JSON.parse(await readFile(input, 'utf8'));
const audit = {
  schemaVersion: 1, environment: 'production', origin, startedAt: new Date().toISOString(),
  definition: 'Exact-symbol retrieval and financial normalization through the public company search API. This uses the same normalized financial report cache as generation, but is not a claim that every result was saved into a user account. The cohort was selected from the independently audited locally-supported issuers.',
  deployment: arg('--deployment', ''), results: [],
};
await mkdir(path.dirname(output), { recursive: true });
const persist = async () => { await writeFile(output, JSON.stringify(audit, null, 2) + '\n'); };
let failures = 0;
for (const company of candidates) {
  const started = Date.now();
  try {
    const response = await fetch(`${origin}/api/companies?q=${encodeURIComponent(company.symbol)}`, { signal: AbortSignal.timeout(90_000), redirect: 'error' });
    const body = await response.json();
    const companies = Array.isArray(body) ? body : body.companies ?? [];
    const result = companies.find(item => item.symbol === company.symbol && Number(item.cik) === Number(company.cik));
    const ready = response.ok && result?.coverage?.status === 'available' && result.coverage.completeness > 90;
    audit.results.push({ symbol: company.symbol, cik: company.cik, httpStatus: response.status, checkedAt: new Date().toISOString(), available: Boolean(ready), ...(result ? { name: result.name, coverage: result.coverage } : { error: body.code ?? 'NO_EXACT_ISSUER' }), durationMs: Date.now() - started });
    failures = ready ? 0 : failures + 1;
  } catch (error) {
    audit.results.push({ symbol: company.symbol, cik: company.cik, available: false, checkedAt: new Date().toISOString(), error: error.name === 'TimeoutError' ? 'TIMEOUT' : 'REQUEST_FAILED' });
    failures++;
  }
  await persist();
  if (audit.results.length % 10 === 0) console.log(JSON.stringify({ checked: audit.results.length, available: audit.results.filter(row => row.available).length }));
  if (failures >= 5) { audit.stoppedEarly = 'Five consecutive failures; inspect the deployment before continuing.'; break; }
  // Stay below the production 30/minute per-address search allowance.
  await new Promise(resolve => setTimeout(resolve, 2400));
}
audit.completedAt = new Date().toISOString();
audit.summary = { candidates: candidates.length, checked: audit.results.length, available: audit.results.filter(row => row.available).length, failedOrLimited: audit.results.filter(row => !row.available).length };
await persist();
console.log(JSON.stringify(audit.summary));
if (audit.summary.available < 100) process.exitCode = 1;
