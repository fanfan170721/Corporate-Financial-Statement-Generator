# Finscope operations

Finscope is a research portfolio application hosted through Sites, with a Cloudflare Worker and a D1 database. It persists account preferences, watchlists, financial reports, investment memos, diligence reviews saved as memos, allocation and liquidity scenarios, and schedule settings. It does not promise investment outcomes or real-time financial statements.

## Current readiness

The repository includes an illustrative dataset and a sourced Microsoft FY2021–FY2025 case. The published case is a frozen annual-report snapshot through **30 June 2025**. Saving it changes the archive timestamp; it does not refresh the figures. The server copies only its own curated evidence and preserves the source note and financial reporting date.

Live financial retrieval, OpenAI analysis, and scheduled generation require server configuration. No provider credentials or active scheduling service are supplied in this repository. A configured flag indicates required environment values exist, not that an external provider or scheduler has passed a health check.

## Identity and hosting boundary

The current sign-in method is **Sign in with ChatGPT (SIWC)**. Sites dispatch owns sign-in, sign-out, OAuth cookies, and verified identity headers. Finscope uses `oai-authenticated-user-id` as its stable per-Site account key; names and emails are display fields. Cross-device continuity comes from that identity and D1 records.

**Keep the application behind Sites dispatch.** The identity helper trusts headers injected by that gateway. Exposing the raw Worker without an equivalent verified identity boundary would allow forged identity headers. A standalone deployment or independent email/password registration requires a separately implemented authentication service, verified sessions, and removal of this header-trust assumption. A custom domain alone does not implement those changes.

SIWC establishes identity, not employer or workspace membership. Use the hosting platform's access policy for private access. `/signin-with-chatgpt`, `/signout-with-chatgpt`, and `/callback` are reserved gateway paths. Start sign-in through a normal top-level link, never a background fetch.

Portable loopback development has a separate simulated user, `local_seedy`. That simulation is excluded from production builds. Keep local previews bound to loopback.

## Server configuration

Local Worker values belong in **`apps/finscope/.dev.vars`**. This file and its variants are ignored by Git and must stay out of publication archives. Hosted values belong in the server-side secret/configuration mechanism. Do not put credentials in `NEXT_PUBLIC_*`, client components, browser storage, source files, or a web form. The admin page deliberately cannot display or edit secret values.

| Name | Purpose |
| --- | --- |
| `DB` | D1 binding declared in `.openai/hosting.json`, provided by the runtime. |
| `OPENAI_API_KEY` | Server-only OpenAI credential. Configure it through the connected secure key flow; the repository contains no key. |
| `OPENAI_MODEL` | Optional model override; the provider module defines the default. |
| `SEC_USER_AGENT` | Identifying user agent with a real contact email for SEC retrieval. Coverage depends on available issuer filings. |
| `FMP_API_KEY` | Optional server-only Financial Modeling Prep credential. Coverage and entitlements depend on the provider. |
| `ADMIN_USER_ID` | Exact verified per-Site user ID allowed to read operational status; an identifier rather than an API credential. |
| `CRON_SECRET` | Random secret of at least 32 characters, shared only by the Worker and external schedule runner. |
| `SCHEDULER_ENABLED` | Must equal `true` to allow enabled schedules; leave unset until the runner and data access work. |

The live provider path does not silently substitute illustrative figures. Missing evidence produces an explicit error. AI research accepts public-financial reports, including the frozen curated case, and requires the OpenAI credential. Its analysis stays tied to the financial period; web context does not refresh stored statements.

### Administrator access

Sign in on the intended hosted Site and read your own `user.id` from `/api/me`. Set that exact value as the hosted `ADMIN_USER_ID`, then reload. Do not copy the local simulated identity into production. `/api/admin` checks the authenticated ID on every request and returns configuration status, aggregate counts, quotas, and server time. It returns no credential values or other users' research content.

Secret confidentiality also depends on hosting-account security, deployment permissions, and secret storage. No system can guarantee that a key is impossible to compromise. Rotate exposed credentials and update the server environment; never commit the replacement.

## Morning reports

Saving a schedule does not create a timer. An external runner must call `POST /api/jobs/daily`. Generated reports are stored in the account archive; this version does not send email or push notifications.

`.github/workflows/morning-brief.yml` provides manual dispatch and a nominal 15-minute cadence. It remains inactive unless the repository variable **`ENABLE_MORNING_BRIEF=true`** is set. GitHub scheduled jobs can be delayed; exact-minute delivery is not guaranteed.

Configure these GitHub Actions secrets before enabling it:

| Actions secret | Value |
| --- | --- |
| `SITE_URL` | The deployed HTTPS origin. |
| `CRON_SECRET` | The same secret configured in the Worker. |
| `OAI_SITES_AUTHORIZATION` | The private Site service authorization token, when required by its access policy. Keep it separate from the cron secret. |

The runner sends `Authorization: Bearer <CRON_SECRET>` to the application and, for a private Site, `OAI-Sites-Authorization: Bearer <service token>` to the gateway. This route uses machine authentication instead of a browser Origin check. Missing required runner configuration leaves the job inactive; a private Site also needs valid gateway authorization.

The endpoint processes **at most five enabled accounts per request** and returns `{ generated, skipped, failed, nextCursor }`. Counts refer to accounts, not companies. Continue with `?cursor=<nextCursor>` until it is null. The included runner caps scans at 30 pages (150 enabled accounts); review capacity before expanding that bound. Never log authorization headers or environment values.

Schedules contain one to three companies, an `HH:mm` time, and an IANA timezone; the default is `America/Toronto`. The server evaluates local calendar dates and times, including daylight-saving changes. A scan after the selected time can generate that day's report. A repeated autumn hour cannot create a second daily run; a skipped spring hour becomes due at the next later local time.

Each account/local-date pair is claimed atomically. Completed, failed, or interrupted claims are not automatically retried on the same day. This avoids duplicate charges but means a provider failure may leave that morning without reports. Check runner failure counts and `/api/admin`; users can request a manual report after service resumes. Missed prior days are not backfilled. Setting `SCHEDULER_ENABLED=false` stops execution and new schedule activation while preserving settings.

Verify live provider access and configure both authorization layers first. Then enable the Worker flag, run a manual authenticated scan, enable the Actions variable, and save an enabled account schedule. Verify its first archived result. Disabled schedule drafts can be saved before setup is complete.

## Allowances and abuse controls

The server allows **18 research credits per user per UTC day**, shared by interactive reports, curated-case saves, AI, and scheduled reports. A report or case save costs one credit; AI costs one additional credit. Three reports with AI cost six credits. Started attempts consume their allowance even if the provider fails; requests rejected before job admission do not.

No user may have more than **three company jobs active simultaneously**. Atomic D1 admissions enforce both limits across devices. Active leases expire after ten minutes if a Worker is interrupted; release or expiry does not refund daily usage. Quotas reset at midnight UTC independently of the schedule timezone.

Authenticated live company lookup has a separate allowance of 30 requests per minute and 300 per UTC day and consumes no research credits. Anonymous lookup uses the local catalogue. Additional account bounds are 50 watchlist companies, 100 memos, and 50 scenario plans. JSON mutation bodies are limited to 16 KiB. Provider spending caps and hosting-level abuse controls remain operational responsibilities.

## Database migrations and continuity

`apps/finscope/db/schema.ts` defines the schema; ordered SQL lives in `apps/finscope/drizzle/`. Generate migrations with `npm run db:generate`, then review the SQL before publishing, especially changes to existing data.

This checkout's initial local preview database has already received:

1. `0000_lonely_winter_soldier.sql` — account, report, schedule, quota, activity, and memo tables.
2. `0001_mighty_post.sql` — persisted scenario plans.

Do not replay those files against this local database. Local initialization did **not** apply production migrations. Sites publication applies checked-in production migrations separately; preserve ordering and follow the Sites workflow.

For a fresh local database, build once to create `dist/server/wrangler.json`, then execute each pending migration in order from `apps/finscope`:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_lonely_winter_soldier.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_mighty_post.sql
```

Use `.wrangler/state`, not `.wrangler/state/v3`; Wrangler adds the version suffix. Development and built previews share this directory. Deleting it deletes the local database and simulated user's work. `.sites-runtime/local-db.json`, if present, is an ignored initialization helper rather than production configuration.

All account reads and writes are scoped to verified user IDs. Reports preserve their generated snapshots; changing providers does not rewrite historical reports. Memos and scenarios require explicit saves. Unsaved browser drafts are not a cross-device backup. Schedule runs, usage ledgers, and activity currently have no automated retention cleanup; monitor D1 growth and establish a retention/backup policy before operating at scale.

## Verification and incidents

Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` from `apps/finscope` before release. Backend tests execute migration SQL in SQLite and exercise tenant isolation, concurrent admission, quota boundaries, CSRF, input bounds, schedule dates, and private curated-case saving.

For research failures, distinguish missing configuration from provider failure or an exhausted allowance. Check redacted status and runner counts. Errors omit raw provider URLs because they can contain credentials. For database failures, verify the `DB` binding and migration state. For account-continuity problems, verify the same deployed Site and user ID are being used; IDs are not interchangeable across unrelated Sites.
