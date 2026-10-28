# Developer handoff

This document records Finscope's architecture, current service readiness and development priorities.

## Workforce history

Report generation checks up to five annual filings for dated workforce observations. `company-context.ts` supports full-time equivalents, full-/part-time totals, full-time people, verified issuer names and filing-bound fiscal-year phrases; the 50,000-row metadata scan accommodates frequent filers. Values retain approximation, basis, reporting date and source. `employee-trend.ts` separates incompatible bases, preserves missing-year gaps and treats old saved reports as snapshots needing regeneration. History is included in CSV.

Actual public-document checks produced five sourced observations each for Apple, Microsoft, NVIDIA, Amazon and JPMorganChase. This five-issuer sample is not proof of universal coverage. Retrieval uses at most five annual HTML files plus up to eight validated, date-targeted historical metadata files. Parsing is sequential and bounded to 17 MB per annual document. Compact document observations cache for 30 days, unparsed results for 24 hours and retrieval failures for 60 seconds. Report batches and per-Worker enrichment are sequential; existing shared SEC spacing remains. No paid AI call, credential change, database migration or homepage prefetch is needed.

## Administrator allowances

Verified application administrators receive unlimited site report and AI allowances. `isAdminAccount` reads the verified `auth_accounts` identity and applies server administrator configuration; editable profiles never grant the exemption. `Viewer.usage.unlimited` and AI status `unlimited` control the English/French displays. Administrator AI uses a separate usage-ledger scope and can use the existing sponsored connection without a pass. Normal accounts and guests retain their allowances. Provider balance/rate limits and existing authentication, evidence and request-validation checks remain in force. No automatic billing is enabled by this change.

Production account verification is complete for the owner's account: the owner received the registration email, verified the code, signed out and back in, then completed password recovery and signed in with the new password. The authenticated workspace and administrator controls were observed on the branded domain. No test-mail mode or verification bypass was used. Version 19 also passed a real sponsored NVIDIA AI request: seven research dimensions, 24,410 metered tokens, and the saved analysis remained after reload. Unlimited administrator status and the single recorded request were observed in AI access. Do not repeat a paid test merely to reconfirm this record. Bootstrap and trusted gateway linking are now disabled; normal management uses the verified application's `/admin` page.

## Report scope and sparse disclosures

Reports distinguish full financial coverage, partial financial coverage and basic public information. The full-coverage threshold classifies generated reports. Discovery is metadata only and permits requesting a report without claiming verified financial availability. Generation may return a partial report using disclosed financial concepts, or a basic report after SEC submissions verify issuer identity and at least one filing. A directory match alone cannot substantiate a completed report. Data scope and retrieval limitations accompany the report and its export; no missing number is replaced with zero. Basic reports show company details and source documents without empty financial charts or financial AI calls.

The fallback uses the SEC's [submissions API](https://www.sec.gov/search-filings/edgar-application-programming-interfaces), alongside the existing company-facts adapter. These provide different evidence: filing history and issuer metadata can remain useful when standardized annual XBRL data is absent. They do not establish a universal disclosure obligation for every private or overseas company. Available fields depend on jurisdiction, issuer and disclosure date.

## Welcome pond

`lib/fish-companies.ts` holds 100 illustrative company identities and a partial Fisher–Yates sampler. The welcome and login server pages select 20 distinct identities per document request and pass that exact sample through client props. Language, theme and feeding interactions must not resample the school or introduce hydration differences. This decorative catalogue does not determine report coverage or represent a current market-cap ranking.

Feeding and hover ripples remain at their original water coordinates, expand outwards and fade using a shared water-blue palette for every fish. They do not follow, shrink around or take the colour of a fish. Particle counts remain bounded; reduced-motion mode disables animated ripples and retains static feeding feedback.

This update was published as version 16 on 27 October 2026. TypeScript, all 122 existing tests and the production build passed. Browser checks confirmed 20 unique identities, a new school on reload, stable identities through feeding/theme/language changes, light/dark rendering, no hydration errors and a corrected 320px French layout. The 100-entry sampler was separately exercised across 1,000 seeded draws without duplicates or catalogue mutation. No financial report or paid AI request was needed.

## Bilingual interface — 27 October 2026

The EN/FR switch selects `en-CA` or `fr-CA` throughout the interface, including authentication, reports, exports, planning and account settings. `components/i18n.tsx` provides context and the selector; `lib/i18n.ts` uses curated catalogues in `lib/locales/`. New visible strings require a French entry and preservation of named interpolation values. Company identities, original source quotations, saved user notes and previously generated AI content remain in their original language.

The language is stored in a first-party cookie and, for signed-in accounts, in the existing preferences JSON. Server rendering reads the cookie with account preferences as the fallback. The shell receives the initial viewer and theme, and a prepaint script restores theme before display. Personalized HTML and component responses use `private, no-store` with cookie variation; hashed assets retain their existing cache behaviour. Do not restore an anonymous-first shell or an after-paint theme reset.

`lib/company-search.ts` normalizes French accents and common request phrases, maps established French company aliases to their actual directory symbols, and recognizes French industry terms in the curated sector catalogue. It does not translate brand names literally, invent missing directory entries, expand financial coverage merely because an alias matches, or bypass evidence checks. French language and account preference tests supplement the existing discovery tests.

The welcome page keeps sign-in primary for anonymous and guest visitors. A guest session can be resumed through the secondary action; registered sessions retain their direct workspace entry. The pond uses a pale blue water surface in light mode and muted navy at night. Existing fish motion and guest restrictions are preserved.

Version 14 was published successfully on 27 October 2026 with 122 automated tests, TypeScript and the production build passing. Production-build browser checks covered EN/FR navigation and reloads, authentication forms, report charts/tables, light/dark water and 320/375px layouts. Live HTTP checks confirmed localized initial HTML, prepaint theme, private no-store document headers, and `états financiers de Microsoft` returning verified MSFT coverage. No new paid AI request or guest report credit was used for localization validation. Release identifiers are recorded in the root recovery document.

## Release brief — 27 October 2026, America/New_York

**Broad company analysis starts with dependable financial evidence.** The SEC issuer directory now supplies discovery beyond the curated alias catalogue. Standardized company-facts reports replace the previous single-issuer path as the primary implementation. Financial statements, charts and provenance remain central; industry, filing links and dated employee disclosures are supplementary. Do not claim broad hiring, salary, employee-review or current-price coverage.

### Current data architecture

1. `lib/market.ts` searches the SEC ticker/exchange/CIK directory, ranks exact symbols and known aliases, without retrieving financial evidence during discovery. Coverage is checked after an explicit report request. Share classes keep their selected ticker while sharing issuer-level public facts. The curated company list provides aliases and familiar recommendation seeds, not a coverage ceiling.
2. `lib/sec-financials.ts` normalizes standard entity-wide US-GAAP/IFRS facts into up to five annual periods and three standardized statement tables. Exact reporting periods, original currency, restatement dates and filing provenance are retained. Missing values stay null. Safe arithmetic uses disclosed inputs from the same period and filing; it does not infer absent debt, cash or accounting classifications.
3. Full financial coverage has a fixed denominator of **11 core fields across every displayed annual period**. Require strictly more than 90% completeness, at least two periods, all six latest primary totals, at most one latest missing field and a valid reporting cutoff within 550 days. Discovery results have pending coverage. Generation returns full or partial financial data, or a basic issuer-and-filings report with the appropriate scope label. If sufficient evidence cannot be retrieved, generation returns an error rather than invented data.
4. `lib/market-storage.ts` persists compact public evidence for 15 minutes and the issuer directory for 12 hours. Migration `0006_market_evidence_cache.sql` adds cache and request-admission tables. Shared D1 reservations space SEC admission by 500 ms across instances; bounded JSON/document reads and fixed source origins protect retrieval. Private accounts, reports and paid analyses do not become shared cache content.
5. `lib/company-context.ts` reads SEC submissions for available industry/website metadata and recent company filings. Headcounts require explicit validated inline facts or a tightly matched dated annual-disclosure sentence; full-time-only counts retain their scope. Optional context failure cannot discard a valid financial report. This is not a general news, job-board, salary or review feed.
6. The direct Microsoft annual-report adapter remains a fallback, and its FY2021–FY2025 published case remains a frozen snapshot. FMP is an optional provider subject to configured access and entitlement. Synthetic fixtures stay labelled and are never a silent production fallback. No paid data subscription is required for the SEC adapter itself.

The SEC path requires a genuine operator contact in `SEC_USER_AGENT`, not an API key. Recommendations load curated metadata without provider calls. Typed search uses the cached directory; financial facts and filings are fetched only on generation. Search requests have an eight-second UI timeout with retry; the upstream SEC directory fetch has a five-second timeout. Published annual disclosures are not real-time prices. Standardized tables do not reproduce complete audited issuer statements, custom disclosures, footnotes or auditor opinions.

### Validation and deployment boundary

The [local 350-issuer adapter audit](coverage/2026-10-27-local.json) records an acceptance sample fixed from the SEC NYSE/Nasdaq directory before retrieval. It is not a fixed allowlist. Keep failed and limited issuers in the results; do not improve reported coverage by deleting them. The file's parser fingerprint and latest summary are authoritative for that particular run. Regenerate after parser corrections; do not repeat provisional counts in product claims. `scripts/audit-sec-coverage.mjs` provides a fresh network audit. See [Data and methodology](DATA.md#verification).

The [production audit](coverage/2026-10-27-production.json) ran against Sites version 12 on 27 October 2026: all 125 distinct issuers selected from the locally supported cohort passed the actual deployed search/retrieval/normalization path. Each exceeded 90% completeness over the fixed 11 core fields. This is not a random 125-company sample, a claim that all 350 sampled companies passed, or a claim that 125 reports were saved to user accounts. The production search builds the same normalized financial evidence used by report generation.

Separately, normal production guest credits generated Apple and Tesla reports. Both loaded in comparison; Apple displayed five years, six populated chart cards, three standardized statement tables, source links and its missing-debt annotation. CSV export produced a verified nonempty download. The local end-to-end checks generated, saved and reopened Apple, Tesla and Costco. No paid AI was invoked for these coverage checks. Version 12's published source is `6cec3cbb4e51b32638004d04b1929a96c838eeba`; deployment identity is retained in the production audit. A subsequent interface patch fixes reopening search results when typing a second company without blurring the input; the financial adapter is unchanged.

TypeScript and 115 automated tests passed; the production build succeeded. Original version 11 remains the rollback checkpoint in the root recovery document. There is no all-company guarantee, and broad employee, live-price and bank/insurer coverage is not established by these tests.

Email/password, verification/reset, account ownership, guest isolation and encrypted credentials remain implemented. The owner has completed the real production registration, inbox delivery, verification, login and password-recovery checks, followed by a successful saved AI analysis on version 19. Guest sessions remain 24 hours with three manual report credits and no AI, key management, sponsored passes or daily schedules. Existing registered-user functions and saved data are preserved. Scheduling still requires its external runner and verification; saved drafts do not activate jobs.

### Development and release requirements

Use the existing checkout at `C:\Users\rosem\IdeaProjects\Corporate-Financial-Statement-Generator`, with the application in `apps/finscope`. Use Node.js 24, the checked-in lockfile and ignored local `.dev.vars`. Run tests, typecheck and build. Apply only pending migrations; do not recreate D1, change authentication/encryption secrets or rewrite historical reports when updating data adapters.

Preserve the immutable `stable-2026-10-27` tag and follow `RECOVERY.md`. The saved code/build and encrypted local runtime backup are not a complete production D1 export. Obtain an appropriate production backup before destructive data changes. This release adds cache/admission tables without replacing account tables.

GitHub push does not deploy the website. Publish through the existing Sites project and preserve its hosting configuration, domain, D1 binding and access policy. No purchases, payment-method changes or automatic billing are authorized. Guest financial lookup must not require paid AI. Retain source evidence and honest unavailable states while expanding coverage.

## Repository and application

- Repository: https://github.com/fanfan170721/Corporate-Financial-Statement-Generator
- Application: `apps/finscope`
- Runtime: Node.js 24 for tooling; Cloudflare Workers for production; D1/SQLite for persistence.
- UI: React 19, TypeScript, Vinext, Recharts, Lucide and CSS.
- Hosted identity: read `.openai/hosting.json`; do not create a replacement project when updating this one.
- GitHub CI: `.github/workflows/check.yml`.
- Branded origins: `https://finscopehq.com` and `https://www.finscopehq.com`. Prefer the root domain in visitor links. Their host-only session cookies are separate; the same verified account still reads the same D1 records.

Start with README, `docs/GETTING-STARTED.md`, `docs/OPERATIONS.md`, `docs/AI-ACCESS.md` and `docs/DATA.md`. Install with `npm ci`, initialize the local database, then run `npm run dev`. Run typecheck, tests and build before release.

## Boundaries to preserve

1. Account data is scoped to verified application users. Guest reports are isolated in dedicated guest tables and authorized only by a server-validated guest session. Never accept a user ID or role from a browser request body, or treat a guest as a verified account.
2. Email sessions are independent of the hosting gateway. Do not restore the old implicit ChatGPT identity fallback.
3. Financial statements have dates, currencies and source URLs. Missing observations remain null. Demo fixtures cannot become live reports by changing a label.
4. `lib/ai-access.ts` is the admission path for paid AI. Do not call `generateAIAnalysis` directly from routes and bypass its controls.
5. `lib/credential-vault.ts` uses AES-GCM and scope-bound authenticated data. Keep the master key outside D1 and Git.
6. Native links in `components/app-link.tsx` are intentional. The deployed Vinext client router failed on clicks despite valid routes. Do not restore `next/link` without production navigation checks.
7. Database changes require new ordered migrations. Never edit deployed migrations. Preserve the handwritten AI grant-counter SQL trigger.
8. Product copy stays natural English and Canadian French and describes practical financial analysis and planning. Keep raw evidence and user-authored content intact.
9. `/owner/setup` is a separate, narrowly scoped bootstrap gate, not an application-login fallback. It requires both `OWNER_SETUP_ENABLED` and `AUTH_TRUST_SITES_IDENTITY`, trusted Sites identity and exact normalized `ADMIN_EMAIL`. Never enable it on an untrusted direct public Worker origin. Registration still requires an actual email code.

## Change map

| Area | Locations |
| --- | --- |
| Welcome and fish | `components/workspace.tsx`, `components/shell.tsx`, `components/fish-school.tsx`, `app/globals.css` |
| Accounts | `lib/auth*.ts`, `app/api/auth/`, `components/email-auth.tsx` |
| Guest reports | `lib/guest*.ts`, `app/api/guest/session/`, guest tables and report routing in `lib/server.ts` |
| Reports and sources | `lib/market.ts`, `lib/sec-financials.ts`, `lib/market-storage.ts`, `lib/company-context.ts`, issuer fallback, `components/research.tsx`, `lib/types.ts` |
| Account data | `lib/server.ts`, `db/schema.ts`, `app/api/` |
| AI and encryption | `lib/ai-access.ts`, `lib/credential-vault.ts`, `lib/ai.ts`, `components/ai-settings.tsx` |
| Owner bootstrap | `lib/owner-setup.ts`, `lib/owner-setup-core.ts`, `app/api/owner/setup/`, `components/owner-setup.tsx`; see Operations for trust boundaries |
| Planning | `components/research-scenarios.tsx`, `components/liquidity-lab.tsx`, financial-model helpers |
| Scheduling | `app/api/jobs/daily/`, `.github/workflows/morning-brief.yml`, runner scripts |

## Release

- Update readiness documentation when service dependencies change.
- Run tests/typecheck/build. Check desktop and mobile for navigation, authentication or chart changes.
- Verify entry→tool→save→reopen, not just HTTP200 or screenshots.
- Keep `.dev.vars`, `.env*`, `.wrangler`, `.sites-runtime` and `outputs` out of Git.
- Push source to GitHub and publish the same source/build to the existing Sites project.
- Preserve the hosting audience; public access is a separate owner decision.
- Verify migrations, deployed routes and service errors. Report unavailable providers honestly.

## Moving hosts

Source is ordinary TypeScript/React/Worker code. Another Cloudflare deployment requires a D1 binding, migrations, environment variables, Worker build and compatible asset serving. A non-Worker host also needs the `cloudflare:workers`/D1 layer adapted. Export/import D1 and transfer the encryption master key securely; replacing that key without re-encryption makes saved API keys unreadable. Review session and gateway differences explicitly.

Preserve `AUTH_SECRET` as well: it is part of password and code verification. A direct Worker deployment must keep trusted-Sites bootstrap/linking disabled unless an authenticated gateway establishes and protects those headers. Do not assume the old private Sites access policy transfers to a new origin.

## Verified integration status

The local real-data/AI run on **26 October 2026 (America/New_York)** (`2026-10-27T02:08:18Z`) used Microsoft's published FY2022–FY2026 financials and `gpt-6-astra`. It returned seven insights, five verified sources and usage of 22,226 input plus 2,039 output tokens (24,265 total). The completed analysis was saved and reopened. This is not a hosted-production or email-delivery test. Do not repeat paid tests merely to reconfirm this record.

Owner setup stores provider configuration without sending email or validating API access. Saved sponsored AI credentials override `OPENAI_API_KEY`; a complete environment `RESEND_API_KEY`/`AUTH_EMAIL_FROM` pair overrides saved email configuration. Preserve these precedence rules and distinguish configuration presence from working provider access.

## Next operational work

Verify the financial release against the dated brief and its audit fingerprint before expanding supplementary signals. The existing sponsored AI credential and restricted email configuration are saved and have passed real production use; do not recreate or replace them merely to check readiness. Registration, email verification, password login and recovery succeeded for the owner. Normal management is through the verified application's `/admin` page. `OWNER_SETUP_ENABLED=false` and `AUTH_TRUST_SITES_IDENTITY=false` close the temporary bootstrap route, which returns 404. Anonymous admin and AI-settings requests return 401. Use existing API credit only for necessary authorized tests; do not purchase credits or enable automatic charging. The website domains have active TLS and `mail.finscopehq.com` is verified in Resend. Guest mode remains independent of email registration.

Validate each additional data source and scheduler operation separately. Add retention and account-deletion tooling before expanding usage. These are follow-ups, not claims that unconfigured services already work.

## Guest access

The welcome screen offers an explicit guest choice alongside normal sign-in/registration. A guest can manually generate and export financial reports and reopen them in the same browser for 24 hours. Guest records do not become account records on sign-in; a verified account takes precedence. Keep both the UI and server distinction: guests cannot request AI, configure keys, redeem passes, use owner controls or schedule morning briefs. Normal verified-user functions, including schedule preferences and the existing job runner, remain intact.

Guest creation and report generation have separate server-side admission limits. Keep isolation, expiry, cookie-churn limits and the `ai:true` rejection covered by tests. Never loosen `requireUser` to admit a guest. Do not transfer guest reports into an account by trusting a browser-supplied guest ID. Session creation and exit clean up at most 50 expired or revoked guest report payloads per request, retaining admission history and leaving account data untouched.
