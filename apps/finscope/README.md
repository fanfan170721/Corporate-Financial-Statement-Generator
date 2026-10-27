# Finscope

A company-analysis workspace built with React, Vinext, Cloudflare Workers, and D1. Generate sourced financial statements and six analytical charts, retain private report archives, compare companies, and add AI research. Investment memos, due diligence, allocation scenarios and liquidity planning provide additional research tools. Financial facts and hypothetical assumptions remain clearly separated.

## Develop

Use Node.js **22.13 or newer** (Node 24 recommended for the built-in SQLite test runner). Run from this directory:

```sh
npm run install:ci
npm run dev
```

Portable development starts at `http://127.0.0.1:5173`. Keep previews on loopback. Optional flags follow `npm run dev --`, for example `--port 5174`. Do not run overlapping installers or duplicate development servers.

The Sites initializer selects a portable or managed-Linux profile stored in ignored `.sites-runtime/`. Preserve the maintained scripts and Vite integrations. When using the Sites plugin, follow its skill for installation, preview, builds, and publishing; these commands remain available for direct local use. Portable execution supports Windows, macOS, and Linux without Bash. Publishing also needs Git and `tar`.

Application accounts use verified email and password. See [Operations](docs/OPERATIONS.md) for production email configuration, session protection and local-only verification testing. An outer Sites gateway, when present, is separate from the application account.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run install:ci` | One locked install including required dev/optional dependencies. |
| `npm run dev` | Development preview with HMR. |
| `npm test` | Financial/model and backend tests. |
| `npm run typecheck` | TypeScript verification. |
| `npm run lint` | ESLint verification. |
| `npm run build` | Build the deployable Sites artifact. |
| `npm start` | Preview the built Worker with shared local D1 state. |
| `npm run db:generate` | Generate migration SQL after schema changes. |

`npm start` requires a build and does not deploy or simulate SIWC. Pass `-- --port <port>` to select its port. Dev and built previews share `.wrangler/state`; database files are ignored by Git. Local tool metrics are disabled by default. Runtime helpers preserve host HOME, cache, proxy, and temporary directories.

## Database and settings

`.openai/hosting.json` declares the **DB** D1 binding. `cloudflare-env.d.ts` declares optional provider and operational settings. Local values belong in ignored `.dev.vars`; hosted values belong in the server secret/configuration store. Never expose credentials through client code or `NEXT_PUBLIC_*` variables.

For a fresh database, build once and apply ordered SQL in `drizzle/` using the commands in [Operations](docs/OPERATIONS.md#database-migrations-and-continuity). Do not replay migrations against an initialized database. Production migration application is separate from preview state.

No credentials are included. Microsoft (MSFT) financial reports can be generated directly from the issuer's official annual-report pages without a financial-data key. The adapter discovers the latest available report and extracts five fiscal years of income statements, balance sheets and cash flows. It preserves sources, retrieval time, missing values and published units; it never substitutes synthetic data when retrieval fails. Other issuers need compliant `SEC_USER_AGENT` configuration or `FMP_API_KEY`, subject to provider coverage and access. This is published annual financial data, not real-time prices.

AI access and its separate billing are described in [Operations](docs/OPERATIONS.md). Scheduling additionally requires an external runner, `CRON_SECRET`, and `SCHEDULER_ENABLED=true`; drafts alone do not run jobs. See [Data and methodology](docs/DATA.md) for source coverage, accounting definitions and validation.

## Code map

| Path | Role |
| --- | --- |
| `app/` | Full-page routes and API handlers. |
| `components/` | Research, memo, diligence, scenario, navigation, and interaction interfaces. |
| `lib/server.ts` | Owner-scoped persistence, quotas, authorization, and scheduling endpoint. |
| `lib/market.ts`, `lib/issuer-financials.ts` | Financial providers and direct official-issuer statement extraction. |
| `lib/ai.ts`, `lib/ai-access.ts` | Server-side AI research, credential access and usage controls. |
| `components/financial-statements.tsx`, `lib/report-export.ts` | Statement tables, complete CSV export and print support. |
| `lib/case-studies.ts` | Published financial snapshots and source notes. |
| `lib/types.ts` | Shared contracts. |
| `db/schema.ts`, `drizzle/` | Schema and ordered migrations. |
| `tests/` | Financial calculations and persistence/security checks. |
| `lib/auth.ts`, `lib/auth-core.ts`, `lib/auth-crypto.ts` | Verified email/password accounts, sessions, recovery, and hashing. |
| `app/chatgpt-auth.ts` | Optional trusted Sites identity for explicitly enabled legacy data linking. |
| `worker/index.ts` | Production Worker with request-scoped bindings. |
| `scripts/` | Maintained execution helpers and bounded morning-report runner. |

## Deployment boundary

Application identity comes from verified email/password sessions. Private Sites access may still impose a separate outer gateway sign-in. The optional AUTH_TRUST_SITES_IDENTITY migration feature must only be enabled behind trusted Sites dispatch; standalone deployments must keep it disabled. Existing cloud data remains preserved. Actual registration and password-recovery mail requires a verified sending domain, RESEND_API_KEY, AUTH_EMAIL_FROM, and a stable AUTH_SECRET. Missing mail configuration is shown honestly. See the operating guide for setup and local-only QA.

Keep `.env*`, `.dev.vars*`, `.sites-runtime/`, `.wrangler/`, `node_modules/`, and publication archives out of source control and deployment source. Keep `.openai/hosting.json`, authored source, the lockfile, and migrations in source control. Generated `dist/` is a build artifact. Publish archives outside the checkout or in ignored `outputs/`.
