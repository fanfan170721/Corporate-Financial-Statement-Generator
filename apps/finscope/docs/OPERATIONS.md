# Finscope operations

Finscope is a financial analysis and planning application hosted through Sites, with a Cloudflare Worker and a D1 database. It persists account preferences, watchlists, financial reports, notes, manager reviews, allocation and liquidity scenarios, and schedule settings. It does not promise investment outcomes or real-time financial statements.

## Current readiness

The repository includes an illustrative dataset and a sourced Microsoft FY2021–FY2025 case. The published case is a frozen annual-report snapshot through **30 June 2025**. Saving it changes the archive timestamp; it does not refresh the figures. The server copies only its own curated evidence and preserves the source note and financial reporting date.

The Microsoft direct adapter discovers and retrieves published financial statements without a provider key. Broader issuer coverage, OpenAI analysis, and scheduled generation need additional configuration. No provider credentials or active scheduling service are supplied in this repository. A configured flag indicates required environment values exist, not that an external service has passed a health check.

A real local AI integration test completed on **26 October 2026 (America/New_York)**, recorded at `2026-10-27T02:08:18Z`. It analysed Microsoft FY2022–FY2026 using `gpt-6-astra`, returned seven insights with five verified sources, and saved/reopened the completed report. Usage was 22,226 input + 2,039 output = 24,265 tokens. This validates the local path only. Hosted AI connectivity, real email delivery and the hosted account flow require separate verification; saving provider settings is not such a verification.

## Email accounts and hosting access

Application accounts now use **email and password with email verification**. Registration creates an account only after the six-digit code is verified. An ordinary application session never falls back to ChatGPT identity headers. Existing private Sites hosting can still require an outer platform sign-in before a visitor reaches the app; changing that hosting access policy is separate from application authentication.

### Branded domains

Use `https://finscopehq.com` in visitor-facing links. `https://www.finscopehq.com` serves the same application and D1 records. Both custom domains and TLS certificates are active. Cookies are host-only, so signing in on one hostname does not sign in on the other; prefer the root hostname consistently.

Cloudflare DNS is DNS-only for these records: root A records `162.159.143.30` and `172.66.3.26`, and `www` CNAME to the Sites-provided custom-domain target. Preserve the two ownership-verification TXT records per hostname. Use the native hosting domain tool to read current targets before changing records; do not invent an origin or point an enabled bootstrap directly at a standalone Worker.

Resend uses TXT `resend._domainkey.mail` plus CNAME `rsend.mail` to `rsend.forge.rmta.net` and `send.mail` to `send.forge.rmta.net`. Preserve the exact public DKIM value in DNS. Sending is enabled; receiving is disabled. This does not create an inbound mailbox for the sender address.

The user requested a normal branded visitor entry with the application's own login. Public hosting must still leave report archives, account settings, AI credentials, owner controls and paid requests behind their application authorization gates. The original platform hostname remains an operator fallback, not the link to distribute to visitors.

Passwords require 12–128 characters. The server uses WebCrypto PBKDF2-SHA256 with 100,000 iterations, a random salt, and an HMAC pepper held in AUTH_SECRET. This work factor respects the current Workers default cap; [Cloudflare's proposed cap increase](https://github.com/cloudflare/workerd/pull/7550) remains open. The versioned hash format permits a future KDF upgrade. This is a platform constraint, not a claim to meet the higher PBKDF2 work factor recommended for unconstrained servers.

Verification/reset codes expire after ten minutes and allow at most five attempts. Codes are purpose-bound HMACs in the database; plaintext codes are sent only to the mail provider. Resends have a 60-second cooldown. Server limits also constrain attempts by hashed email/IP buckets and global mail volume. Registration and recovery responses do not disclose whether the address already has an account.

Production sessions use a 256-bit random token in a host-only, HttpOnly, Secure, SameSite=Lax cookie. Only the token hash is stored. Standard sessions expire after 24 hours and use a browser-session cookie; “remember me” lasts up to 30 days. Login rotates the current session. Logout revokes that token, logout-all revokes every device, and a password reset increments the account credential version and invalidates all sessions. The session list never returns session tokens.

The application stores research against its verified account ID in D1, so the same account sees its saved data across devices. Unsaved drafts remain local. The `/api/auth/config` endpoint exposes readiness and password/code limits; `/api/me` exposes the current account and research preferences.

### Connecting actual email delivery

`mail.finscopehq.com` is verified in Resend, with sending enabled and receiving disabled. Its domain-scoped sending key belongs only in the encrypted owner configuration, with sender `Finscope <accounts@mail.finscopehq.com>`. Domain verification and saved configuration do not establish inbox delivery: the owner must complete a real registration and verification. Missing configuration returns an explicit unavailable response; provider rejection never reports a successful send.

1. Preserve the verified sending domain and the DNS records requested by Resend. Use a sender address on that domain.
2. Save the Resend key and sender in the restricted `/owner/setup` form described below, or configure the complete server-only pair `RESEND_API_KEY` and `AUTH_EMAIL_FROM` (for example, `Finscope <accounts@your-domain.example>`). A complete environment pair takes precedence; otherwise the app uses encrypted saved mail settings. A partial pair is not combined with part of a saved configuration.
3. Keep the existing `AUTH_SECRET` stable and local test flags disabled in the hosted environment. Configure `ADMIN_EMAIL` to the intended owner's address, then register and complete real email verification for that account.
4. Send an end-to-end registration email to an address you control. Test verification, logout/login, and password reset. Check spam placement and sender-domain status before inviting visitors.

Mail is sent using Resend's HTTPS API with a unique idempotency key and a bounded timeout. The app waits for a successful provider acknowledgement, which confirms queue acceptance rather than inbox delivery. See [Resend's send-email API](https://resend.com/docs/api-reference/emails/send-email). There is no SMS, email-login link, or hidden production verification bypass.

AUTH_SECRET is also the password pepper: retain it securely. Changing it without a migration makes existing passwords unverifiable and existing codes unusable. A planned rotation requires password recovery and session revocation; restore from secure configuration backup if it was lost. Do not casually regenerate it on every deployment.

### Owner bootstrap before email is configured

`/owner/setup` resolves the initial dependency between email configuration and a verified application administrator. It authorizes only the configured owner through the trusted Sites gateway, so the owner can securely save sponsored AI and mail settings before creating an application account. It does not create an account, choose an application password, start an application session, or return a verification code.

Every setup read/write requires `OWNER_SETUP_ENABLED=true`, `AUTH_TRUST_SITES_IDENTITY=true`, a nonempty trusted Sites user ID, and an exact normalized email match with `ADMIN_EMAIL`. A normal application session or arbitrary request-body email is insufficient. Enable these flags only behind authentic Sites dispatch. **Do not expose an enabled setup gate on a directly reachable public Worker origin where identity headers can be supplied by a caller.** The existing private hosting audience remains a separate access layer.

The masked form accepts an existing OpenAI API key, or a Resend API key together with its verified-domain sender. It stores credentials in the existing scope-bound AES-GCM vault. Server settings `AUTH_SECRET` and `CREDENTIAL_ENCRYPTION_KEY` must already exist and remain stable; neither is editable through this form. Saves perform local validation and encrypted persistence only: they do not validate provider credentials, send email, make an AI call, or prove domain verification. Returned status includes configuration source, a key suffix or sender where applicable, never plaintext credentials.

A saved sponsored AI key takes precedence over `OPENAI_API_KEY`. For email, a complete environment key/sender pair takes precedence over the saved vault configuration. A stale complete environment pair must therefore be updated or removed in deployment settings; saving a new mail key cannot override it.

After connecting mail, the owner must register with `ADMIN_EMAIL` and receive/enter the normal verification code before using `/admin`. Disable `OWNER_SETUP_ENABLED` after configuration when bootstrap access is no longer needed. Disable `AUTH_TRUST_SITES_IDENTITY` once neither bootstrap nor proof-based legacy linking is needed. Never use local email-test flags as a hosted workaround.

### Existing Sites account data

The migration preserves legacy profiles and research. It never links accounts solely by an email match. While the app remains behind trusted Sites dispatch, an operator may temporarily enable AUTH_TRUST_SITES_IDENTITY=true. Registration then preserves the existing profile ID only if the currently verified gateway identity owns that profile, its email matches the registration address, and the new email code is successfully verified. After migration, disable the flag. Never enable this option on a standalone Worker where callers can forge gateway headers.

Without that explicit trusted-linking option, new email accounts receive new IDs and legacy records remain intact. There is no automatic transfer from another user's account or from an unrelated Site.

### Local end-to-end testing

For loopback development only, set AUTH_ALLOW_LOCAL_HTTP=true and AUTH_EMAIL_TEST_MODE=true alongside AUTH_SECRET in ignored .dev.vars. Restart the dev server. Both flags plus a localhost/127.0.0.1/[::1] HTTP URL are required. The UI labels this “local test mode”; no email is sent. GET /api/auth/dev-outbox exposes at most 20 ephemeral test messages from the current Worker instance, expiring after ten minutes. The route returns 404 on hosted/non-loopback URLs or when either flag is disabled. No production code is returned through the API.

This mode still exercises the normal verification, password hashing, D1 account creation, and session flow. It uses a distinct development cookie. The server's old simulated Sites identity is not an application login. Do not deploy local test flags or copy .dev.vars into a publication archive.

## Guest reports

Visitors may explicitly choose **Continue as guest** without entering an email. A guest session lasts 24 hours, uses a server-validated HttpOnly cookie and stores reports separately from verified accounts. Closing and reopening the same browser can retain access until expiry; clearing cookies, switching browsers or changing devices does not recover the guest session. Export reports before expiry. Signing in uses the account's own archive and does not automatically import guest work.

Guests receive three manual report credits for the session. Additional rolling 24-hour limits cover shared-network report generation and repeated session creation, so clearing a cookie does not grant unlimited issuer retrieval. Failed admitted attempts still consume their reservation. These limits are independent of verified users' existing allowance.

AI generation, personal keys, sponsored passes, owner controls, watchlists, saved notes and scheduled morning briefs remain verified-account functions. Guest sessions never create a verified profile or email account. The existing scheduler is preserved for normal users and remains subject to its provider/runner configuration; the guest feature does not enable it.

## Server configuration

Local Worker values belong in **`apps/finscope/.dev.vars`**. This file and its variants are ignored by Git and must stay out of publication archives. Hosted values belong in the server-side secret/configuration mechanism. Do not put secrets in `NEXT_PUBLIC_*`, authored client code, browser storage, source control or logs. Authentication/encryption master secrets must never be submitted through web forms. The designated owner and personal-key forms accept provider credentials over authenticated HTTPS and persist encrypted ciphertext; see [AI access](AI-ACCESS.md). Status responses never echo plaintext secrets.

| Name | Purpose |
| --- | --- |
| `DB` | D1 binding declared in `.openai/hosting.json`, provided by the runtime. |
| `OPENAI_API_KEY` | Server-only OpenAI credential. Configure it through the connected secure key flow; the repository contains no key. |
| `OPENAI_MODEL` | Optional model override; the provider module defines the default. |
| `SEC_USER_AGENT` | Identifying user agent with a real contact email for SEC retrieval. Coverage depends on available issuer filings. |
| `FMP_API_KEY` | Optional server-only Financial Modeling Prep credential. Coverage and entitlements depend on the provider. |
| `ADMIN_USER_ID`, `ADMIN_EMAIL` | Exact application user ID or independently verified owner email allowed to read operational status. |
| `AUTH_SECRET` | Stable random server-only password pepper and code-HMAC secret, at least 32 characters. |
| `CREDENTIAL_ENCRYPTION_KEY` | Stable 64-character hexadecimal AES-256-GCM master key for the provider vault. Keep outside D1; rotation requires re-encryption. |
| `RESEND_API_KEY`, `AUTH_EMAIL_FROM` | Optional complete environment email-provider pair; takes precedence over encrypted saved mail settings. |
| `AUTH_ALLOW_LOCAL_HTTP`, `AUTH_EMAIL_TEST_MODE` | Explicit loopback-only testing; false in hosted environments. |
| `OWNER_SETUP_ENABLED` | Must equal `true` for owner bootstrap; disable after configuration when no longer needed. |
| `AUTH_TRUST_SITES_IDENTITY` | Explicit owner bootstrap and proof-based legacy linking behind trusted Sites dispatch only. Never trust forgeable headers from a direct public Worker origin. |
| `CRON_SECRET` | Random secret of at least 32 characters, shared only by the Worker and external schedule runner. |
| `SCHEDULER_ENABLED` | Must equal `true` to allow enabled schedules; leave unset until the runner and data access work. |

The live provider path does not silently substitute illustrative figures. Missing evidence produces an explicit error. AI research accepts account-saved public-financial reports, including a saved copy of the frozen curated case, and requires a personal key or a valid sponsored pass. Its analysis stays tied to the financial period; web context does not refresh stored statements.

### Administrator access

Set ADMIN_EMAIL to the intended owner’s address, then register and verify that email. Alternatively, sign in to the application and set its exact user.id from /api/me as ADMIN_USER_ID. Neither route accepts a role from a client request. Do not use the local simulated Sites identity. `/api/admin` checks the authenticated ID on every request and returns configuration status, aggregate counts, quotas, and server time. It returns no credential values or other users' research content.

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
3. `0002_yellow_nightmare.sql` — verified accounts, codes, sessions, and rate-limit buckets.
4. `0003_broken_master_mold.sql` — encrypted AI credentials, sponsored passes, and usage accounting.
5. `0004_living_quasimodo.sql` — isolated guest sessions, reports and admission ledger; no verified-account tables are changed.
6. `0005_clear_guest_validation_runs.sql` — removes only exact, identified initial production QA records so validation does not exhaust visitor allowances; no schema change and no other guest/account data is affected.

Do not replay those files against this local database. Local initialization did **not** apply production migrations. Sites publication applies checked-in production migrations separately; preserve ordering and follow the Sites workflow.

For a fresh local database, build once to create `dist/server/wrangler.json`, then execute each pending migration in order from `apps/finscope`:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_lonely_winter_soldier.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_mighty_post.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_yellow_nightmare.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0003_broken_master_mold.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0004_living_quasimodo.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0005_clear_guest_validation_runs.sql
```

Use `.wrangler/state`, not `.wrangler/state/v3`; Wrangler adds the version suffix. Development and built previews share this directory. Deleting it deletes the local database and simulated user's work. `.sites-runtime/local-db.json`, if present, is an ignored initialization helper rather than production configuration.

All account reads and writes are scoped to verified user IDs. Reports preserve their generated snapshots; changing providers does not rewrite historical reports. Memos and scenarios require explicit saves. Unsaved browser drafts are not a cross-device backup. Schedule runs, usage ledgers, and activity currently have no automated retention cleanup; monitor D1 growth and establish a retention/backup policy before operating at scale.

## Verification and incidents

Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` from `apps/finscope` before release. Backend tests execute migration SQL in SQLite and exercise tenant isolation, concurrent admission, quota boundaries, CSRF, input bounds, schedule dates, and private curated-case saving.

For research failures, distinguish missing configuration from provider failure or an exhausted allowance. Check redacted status and runner counts. Errors omit raw provider URLs because they can contain credentials. For database failures, verify the `DB` binding and migration state. For account-continuity problems, verify the same deployed Site and user ID are being used; existing legacy IDs are not interchangeable across unrelated Sites.
