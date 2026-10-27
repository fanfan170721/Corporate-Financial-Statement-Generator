# Developer handoff

This document is for any developer or coding assistant maintaining Finscope. No conversation history or particular AI provider is required.

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

Open `/owner/setup` through the owner's authenticated Sites session when bootstrap remains enabled. Anonymous requests receive a generic 404. The existing sponsored AI credential is already saved; do not create or replace it merely to check readiness. Use existing API credit for explicitly authorized tests; do not purchase credits or enable automatic charging without separate owner authorization. The website domains have active TLS and `mail.finscopehq.com` is verified in Resend. Complete mail-key configuration if it is still missing, then register the exact owner email, receive the real code and verify the account. Check the hosted account/report flow before inviting guests; disable bootstrap when no longer needed.

Configure broader financial coverage and scheduler operation separately. Add retention and account-deletion tooling before expanding usage. These are follow-ups, not claims that unconfigured services already work.

## Guest access

The welcome screen offers an explicit guest choice alongside normal sign-in/registration. A guest can manually generate and export financial reports and reopen them in the same browser for 24 hours. Guest records do not become account records on sign-in; a verified account takes precedence. Keep both the UI and server distinction: guests cannot request AI, configure keys, redeem passes, use owner controls or schedule morning briefs. Normal verified-user functions, including schedule preferences and the existing job runner, remain intact.

Guest creation and report generation have separate server-side admission limits. Keep isolation, expiry, cookie-churn limits and the `ai:true` rejection covered by tests. Never loosen `requireUser` to admit a guest. Do not transfer guest reports into an account by trusting a browser-supplied guest ID. Session creation and exit clean up at most 50 expired or revoked guest report payloads per request, retaining admission history and leaving account data untouched.
