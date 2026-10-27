// Called by an external scheduler. Never log request headers or environment values.
const { SITE_URL, CRON_SECRET, OAI_SITES_AUTHORIZATION } = process.env;
if (!SITE_URL || !CRON_SECRET) {
  console.log('Morning brief runner is inactive: required configuration is not present.');
  process.exit(0);
}
const base = new URL(SITE_URL);
if (base.protocol !== 'https:' || base.username || base.password) throw new Error('SITE_URL must be an HTTPS origin without credentials.');
let cursor;
let processedPages = 0;
let failedAccounts = 0;
do {
  const url = new URL('/api/jobs/daily', base.origin);
  if (cursor) url.searchParams.set('cursor', cursor);
  const response = await fetch(url, { method: 'POST', headers: {
    Authorization: `Bearer ${CRON_SECRET}`,
    ...(OAI_SITES_AUTHORIZATION ? { 'OAI-Sites-Authorization': `Bearer ${OAI_SITES_AUTHORIZATION}` } : {}),
  }, signal: AbortSignal.timeout(180_000), redirect:'error' });
  if (!response.ok) throw new Error(`Daily runner returned HTTP ${response.status}. Check service readiness and authorization.`);
  const result = await response.json();
  cursor = result.nextCursor || null;
  failedAccounts += Number.isInteger(result.failed) ? result.failed : 0;
  processedPages++;
  console.log(`Processed schedule page ${processedPages}.`);
  if (processedPages >= 30 && cursor) throw new Error('Batch bound reached. Increase runner capacity before enabling more schedules.');
} while (cursor);
if (failedAccounts > 0) throw new Error(`${failedAccounts} scheduled account runs failed. Review the private service logs and provider readiness.`);
console.log('Daily schedule scan complete.');
