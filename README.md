# Finscope

**Understand the numbers. Plan what comes next.**

[Website](https://finscopehq.com) · [Owner setup](apps/finscope/docs/GETTING-STARTED.md) · [Developer handoff](apps/finscope/docs/HANDOFF.md) · [Operations](apps/finscope/docs/OPERATIONS.md) · [AI access](apps/finscope/docs/AI-ACCESS.md)

Finscope is a financial analysis and planning tool combining company statements, comparable charts, source-backed explanations, watchlists, portfolio scenarios and private notes. The English and Canadian French interface has light and dark themes, full-page navigation and an interactive fish-school welcome screen.

## Features

- Lightweight company discovery, on-demand financial reports and comparisons for up to three issuers.
- Organization profiles beyond listed issuers: search covers active legal entities in the Global LEI System (GLEIF), including pension funds and private companies such as HOOPP. These profiles show registry details plus key figures quoted from Wikipedia with their year and citation, only when the article matches the registered headquarters city. They never include standardized financial statements.
- Sourced workforce history from up to five annual filings, with distinct headcount/FTE series, missing-year gaps and CSV export. Historical evidence is reused to limit repeated downloads.
- Standardized annual income, balance-sheet and cash-flow summaries with dates, currencies, missing-value handling and original filing sources.
- Six financial charts, calculated ratios, CSV export and print layouts.
- Email/password accounts, verification codes, password reset and persistent sessions. Account-owned records live in Cloudflare D1.
- Optional guest access for manual financial reports without email. Guest sessions last 24 hours in the current browser; AI and morning briefs require a verified account.
- Optional AI explanations grounded in financial evidence and web sources. Users may supply an encrypted OpenAI API key or redeem an owner-issued 24-hour pass.
- Separate free-provider analysis can interpret saved public report evidence through an owner-configured Gemini or Groq connection. It preserves the existing OpenAI options and never automatically falls back to paid analysis.
- Owner controls for passes, request/token allowances and sponsored API configuration.
- Watchlists, archives, memos, manager-review checklists, asset–liability scenarios and a reconciled liquidity model.
- Saved morning-report preferences and an optional external job runner.

## Service readiness

The branded website is `finscopehq.com`, with `www.finscopehq.com` also connected. Hosting access and application email accounts are separate: opening the website to visitors does not grant access to another account's saved data or paid AI.

The restricted `/owner/setup` page lets the configured owner connect provider keys before email registration is available, using trusted Sites gateway identity. It stores encrypted settings without testing providers, creating an application account or bypassing email verification. Its trust flags must never be enabled on a directly reachable public Worker origin. Follow [Owner setup](apps/finscope/docs/GETTING-STARTED.md) for the required gate, mail setup and hosted verification.

| Function | Implementation / configuration |
| --- | --- |
| Email authentication | Implemented; delivery requires Resend and a verified sender domain. Production never simulates delivery. |
| Company reports | SEC EDGAR directory, company-facts and submissions adapters provide annual financial summaries or clearly scoped basic profiles. A genuine operator contact in `SEC_USER_AGENT` is required; no SEC API key is needed. Search loads company metadata; evidence is fetched and coverage checked when a report is requested. |
| Saved data | D1 stores reports, watchlists, notes, plans and preferences for authenticated accounts. |
| AI | OpenAI uses a funded personal or sponsored key. Optional free-provider analysis requires a configured free-tier Gemini or Groq key and interprets saved evidence without web search. Gemini English/French generation and persistence were verified in production. No key is included in Git. |
| Daily reports | Runner implemented; disabled until configuration and a manual verification succeed. |

Full financial coverage requires strictly more than 90% completeness across the same 11 core fields and every displayed annual period, at least two comparable years, all six current primary totals, at most one missing latest field, and a valid latest reporting date within 550 days. Suggestions and search results are metadata with coverage pending. On generation, available evidence determines whether the report has full or partial financial coverage, or basic public information with verified issuer details and filing links. Each report identifies its scope, missing information and source dates. Missing financials are never invented, and basic reports do not support financial AI analysis. Coverage depends on the connected sources; it does not include every listed or private company worldwide.

Public financial evidence can be cached for 15 minutes. Optional company context adds SEC industry/filing information and an employee count only when a dated disclosure can be verified; it does not promise broad headcount, hiring, salary or review coverage. See [Data and methodology](apps/finscope/docs/DATA.md) and the [350-issuer local adapter audit](apps/finscope/docs/coverage/2026-10-27-local.json). The audit records its parser fingerprint and environment; local results do not establish production-browser availability.

The direct Microsoft annual-report adapter remains a fallback, and the older Microsoft FY2021–FY2025 case remains a labelled frozen snapshot. Synthetic examples are labelled and excluded from AI company analysis. Annual statements are periodic disclosures, not real-time market prices. Standardized summaries do not reproduce complete issuer statements or footnotes. Unsupported data never silently falls back to fabricated financials.

## Local development

Requirements: Node.js 24 and npm.

```sh
cd apps/finscope
npm ci
npm run build
```

Create an ignored `.dev.vars` using `.dev.vars.example`. Apply pending D1 migrations following [Operations](apps/finscope/docs/OPERATIONS.md), then run:

```sh
npm run dev
npm run typecheck
npm test
npm run build
```

The development URL is normally `http://127.0.0.1:5173`. Explicit local mail-test mode is restricted to loopback, clearly labelled and never enabled on the hosted website.

## Deployment (self-hosted Cloudflare, since 30 October 2026)

The original Sites hosting is no longer available. `finscopehq.com` is now served by the Worker `finscope-research` in the owner's Cloudflare account, with the D1 database `finscope-db` recorded in `apps/finscope/cloudflare.production.json`. `www.finscopehq.com` still points to the retired Sites target. The production database started empty: accounts and reports from the Sites deployment were not exported and cannot be restored.

```sh
cd apps/finscope
npx wrangler login
npm run deploy
```

`npm run deploy` builds against the production D1 database, applies pending migrations remotely and deploys with the configured custom domains. `npm run deploy:config -- --admin-email <owner email>` stores runtime settings as Worker secrets; it generates `AUTH_SECRET` and `CREDENTIAL_ENCRYPTION_KEY` only when they are missing and never replaces them. Add mail delivery with `npx wrangler secret put RESEND_API_KEY --config dist/server/wrangler.json` and the same for `AUTH_EMAIL_FROM`. Keep `AUTH_TRUST_SITES_IDENTITY` and `OWNER_SETUP_ENABLED` false: this Worker is a directly reachable public origin.

## Maintenance

```text
apps/finscope/
  app/          Pages and HTTP endpoints
  components/   Interface, charts and interactive tools
  lib/          Authentication, financial adapters, AI, encryption and models
  db/           Database schema
  drizzle/      Ordered, versioned SQL migrations
  tests/        Service, security and financial-model checks
  scripts/      Build and job-runner tooling
  docs/         Setup, architecture, data definitions and handoff
```

The repository is the source of truth. Developers can clone it, run checks, change the source and submit ordinary Git commits. Start with `MAINTENANCE.md`. Generated runtime/publication files are ignored and not required to understand the application. Preserve the hosted project ID when updating this deployment.

Secrets belong in server environment settings or the encrypted credential vault, never source, browser storage or screenshots. Back up D1 and preserve encryption keys before moving hosts. The owner has registered `finscopehq.com`; website TLS and the `mail.finscopehq.com` sending domain are verified. See Operations for the distinction between provider configuration and tested email delivery.
