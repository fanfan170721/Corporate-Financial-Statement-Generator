# Developer handoff

This document records Finscope's architecture, current service readiness and development priorities.

## Takeover brief — 27 October 2026, America/New_York

**The owner's latest instruction is universality first.** A useful tool must let people look up companies broadly, rather than providing an elaborate report for Microsoft alone. The owner explicitly permits substantial feature removal or a smaller information set. Even a tool that only returns a broadly available stock quote is preferable if it works across the market. Preserve source honesty, data security and the English product identity while reducing scope. The owner would prefer a rebuild to retaining a Microsoft-only product, but has not required a rewrite: assess which existing parts can support the new goal first.

The earlier request for at least 100 rich company reports and at least 90% information completeness is superseded where it conflicts with this simpler, broadly usable first release. Use **at least 100 distinct real companies as an end-to-end acceptance sample**, not as a fixed allowlist or maximum coverage. Once the broadly usable core works, expand the financial depth and apply the earlier completeness objective to the fields actually promised. Do not inflate coverage by shrinking its denominator after a failure, fabricating values or rebranding synthetic data.

### What to build next

1. **Research the normal data-provider approach before extending the bespoke scraper.** Compare established stock/company tools and their documented data sources, market coverage, symbol directories, update cadence, usage rights and API limits. Prefer official APIs, issuer/regulator disclosures and licensed market data. Validate candidate providers from the deployed Worker, not only a laptop. Do not buy a subscription, start a billable plan, enter payment details or enable automatic charges. Explain any paid dependency to the owner before it is incurred.
2. **Build broad, provider-backed company discovery and one dependable core output.** Start with US-listed companies as previously requested, using a provider's actual company/security directory. Preserve stable issuer, ticker and exchange identities and distinguish share classes. The architecture must allow broader exchange coverage, not another hand-written list of company-specific parsers. A current stock quote with exchange, currency, timestamp and market status is an acceptable initial output under the latest instruction. A quote is not a financial statement; label the reduced tool accurately.
3. **Make discovery consistent with capability.** Searchable, selectable companies and recommendations must be backed by working data retrieval for the advertised feature. Do not recommend unsupported names as if generation will work. If unsupported items appear for discovery, show `Not available`, explain the reason and disable the unsupported action. A provider key existing in an environment variable is not evidence that a company is supported.
4. **Define freshness honestly.** Fetch current available information on demand with bounded, disclosed caching. Show the provider/source, retrieval time, observation or reporting date, exchange, currency, and whether a quote is real-time, delayed, stale or from a closed market. Do not claim that a free delayed quote is real-time. Annual statements update when filings are published, not continuously. Broad coverage refers to publicly available information; private or delisted companies may have no public quote or complete statements.
5. **Add depth from multiple sources after breadth works.** The owner specifically suggested one general securities source for stocks and another source for employee counts. Future sources may include exchange/provider quotes, SEC/issuer financial filings, employee counts from dated annual reports, and relevant company announcements/news with links and publication dates. Use field-specific sources and provenance rather than assuming one scraper provides everything. Never infer missing numeric facts with an LLM. AI remains optional, and guest financial/market-data lookup must work without it.
6. **Measure the result before calling it complete.** Retain a reproducible coverage report for at least 100 distinct companies across multiple sectors and US exchanges, covering aliases/search, correct identity, retrieval, freshness labels, errors and the applicable save/reopen flow. At least one main search/recommendation path must exercise the actual production provider. If richer financial reports are retained, define the expected core fields per business/sector up front, target at least 90% verified completeness for each advertised supported company, and show missing items as `Not available`. Unsupported business models, currencies and accounting conventions must not silently produce misleading charts.

### Verified baseline and known gaps

| Area | Actual state at handover |
| --- | --- |
| GitHub implementation | `main` commit `00f0297d7ab209e8b4a7e37ae37d5dcabb335c03`; [CI passed](https://github.com/fanfan170721/Corporate-Financial-Statement-Generator/actions/runs/40460846385): 82 tests, typecheck and build. Later documentation commits do not change this runtime baseline. |
| Production | Public `https://finscopehq.com`, Sites version 11, source commit `9ac7553b437b145a964f676a865ea9013b3005e9`; deployment succeeded on 27 October 2026. The Sites source commit and GitHub monorepo commit differ because their repository roots differ. |
| Real financial coverage | **Microsoft only has verified end-to-end production retrieval.** The broader discovery catalogue is not equivalent to functioning report coverage. This is the main product gap, not a completed universal service. |
| Microsoft production test | Guest generated the FY2022–FY2026 report, with fiscal cutoff `2026-06-30`, six charts and three statement tables (20 income, 40 balance-sheet and 38 cash-flow rows). Archive and reopening passed; no paid AI was called. |
| Production fetch repair | Microsoft initially returned HTTP 403 from the Worker. Explicit honest `User-Agent: Finscope/1.0 (+https://finscopehq.com)` resolved the observed failure. Keep the bounded same-resource redirect validation and sanitized diagnostics. Laptop success alone had missed this issue. |
| Other issuers | SEC and FMP adapters exist but broader production coverage is unconfigured/unverified. Do not claim that setting a flag or returning autocomplete results solves coverage. Current source adapters need coverage validation and schema/financial-model work. |
| Guest mode | Welcome-screen choice; no email; 24-hour browser session; three report credits. AI, API-key management, pass redemption and daily schedules are denied server-side. Normal registered-user features were preserved. |
| Accounts and email | Email/password, verification/reset, persistence and ownership exist and local regressions passed. `mail.finscopehq.com` is verified and restricted mail configuration is saved. Real production registration/inbox delivery and password recovery have not been established by the tests recorded here. Do not create or rotate another key merely because this handoff occurred. |
| AI | Encrypted sponsor credentials and BYOK/pass controls are implemented. A real local AI run succeeded; a completed hosted account+AI flow remains unverified. Guest lookup must never spend AI credit. |
| Scheduling | Registered-user preferences and runner code remain. The external runner is not enabled/verified; guests have no daily-reminder feature. Feature removal may be considered under the owner's latest simplification instruction, but do not delete existing account data. |

### Development setup

Use this existing checkout on the owner's machine when available:
`C:\Users\rosem\IdeaProjects\Corporate-Financial-Statement-Generator`.
Otherwise clone the repository below and work in `apps/finscope`. Node.js 24 and npm are the normal tooling. Existing `node_modules` may be reused when dependency inputs have not changed; do not copy ignored environment files into chat or Git. Local preview on port 5173 was stopped after the last validation, so start it when needed. Follow Operations for local migrations; this checkout already has migrations 0000–0005 applied. Migration 0005 removes only exact initial QA records and is not a general-purpose retention operation.

Read this brief, `MAINTENANCE.md`, README, `docs/DATA.md`, then the relevant source paths below. Start with a concrete provider/coverage plan and a small working implementation; prioritize usable company lookup over additional decorative work. Run `npm run typecheck`, `npm test` and `npm run build` for changes, then verify in production. Preserve the welcome fish, light/dark visual language and natural English unless simplification actually requires a change.

GitHub push is **not an automatic deployment**. The current host is Sites with Cloudflare Workers/D1. With Sites access, update the existing project through its supported source/build/publish workflow and preserve `.openai/hosting.json`. Developers need the owner to grant hosting access or use a separate publishing step; GitHub access does not supply runtime secrets or deployment permission. Without the hosting integration, prepare and test the source and clearly report the unpublished commit. Do not silently create a new site, move the domain, replace the database, or invent deployment credentials. A host migration requires a separate plan to preserve D1 records, authentication secrets and the encrypted credential vault.

The latest owner instructions authorize simplification and relevant testing, **not purchases or payment/auto-renew changes**. Never expose keys to the browser, repository, logs or chat. Do not claim all companies are covered until the supported universe and production tests substantiate it.

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
8. Product copy stays natural English and describes practical financial analysis and planning.
9. `/owner/setup` is a separate, narrowly scoped bootstrap gate, not an application-login fallback. It requires both `OWNER_SETUP_ENABLED` and `AUTH_TRUST_SITES_IDENTITY`, trusted Sites identity and exact normalized `ADMIN_EMAIL`. Never enable it on an untrusted direct public Worker origin. Registration still requires an actual email code.

## Change map

| Area | Locations |
| --- | --- |
| Welcome and fish | `components/workspace.tsx`, `components/shell.tsx`, `components/fish-school.tsx`, `app/globals.css` |
| Accounts | `lib/auth*.ts`, `app/api/auth/`, `components/email-auth.tsx` |
| Guest reports | `lib/guest*.ts`, `app/api/guest/session/`, guest tables and report routing in `lib/server.ts` |
| Reports and sources | `lib/market.ts`, issuer/statement adapters, `components/research.tsx`, `lib/types.ts` |
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

First address the broad company-lookup priority in the dated takeover brief. For account readiness, open `/owner/setup` through the owner's authenticated Sites session when bootstrap remains enabled. Anonymous requests receive a generic 404. The existing sponsored AI credential and restricted email configuration are already saved; do not create or replace them merely to check readiness. Use existing API credit for relevant authorized tests; do not purchase credits or enable automatic charging. The website domains have active TLS and `mail.finscopehq.com` is verified in Resend. The remaining email task is real registration, inbox delivery and verification, followed by login and password-recovery checks. Disable bootstrap when no longer needed. Guest mode can operate without this email workflow.

Configure broader financial coverage and scheduler operation separately. Add retention and account-deletion tooling before expanding usage. These are follow-ups, not claims that unconfigured services already work.

## Guest access

The welcome screen offers an explicit guest choice alongside normal sign-in/registration. A guest can manually generate and export financial reports and reopen them in the same browser for 24 hours. Guest records do not become account records on sign-in; a verified account takes precedence. Keep both the UI and server distinction: guests cannot request AI, configure keys, redeem passes, use owner controls or schedule morning briefs. Normal verified-user functions, including schedule preferences and the existing job runner, remain intact.

Guest creation and report generation have separate server-side admission limits. Keep isolation, expiry, cookie-churn limits and the `ai:true` rejection covered by tests. Never loosen `requireUser` to admit a guest. Do not transfer guest reports into an account by trusting a browser-supplied guest ID. Session creation and exit clean up at most 50 expired or revoked guest report payloads per request, retaining admission history and leaving account data untouched.
