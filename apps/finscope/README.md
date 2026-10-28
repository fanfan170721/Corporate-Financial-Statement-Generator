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

No credentials are included. Configure `SEC_USER_AGENT` with the application name and a genuine operator contact to use SEC's issuer directory and company-facts APIs; no SEC API key is required. Search checks actual annual financial evidence and recommendations include only available results. Availability uses the same 11 core fields across every displayed year, strictly more than 90% completeness, at least two years, six latest primary totals, at most one latest missing field and a valid reporting date within 550 days. Limited results are explicitly labelled and disabled in the selection interface.

The primary output is a standardized annual financial summary with source provenance, chart gaps for missing values, and up to five comparable periods. Public financial evidence is cached for 15 minutes. It is not a real-time stock quote or a reproduction of full issuer statements and footnotes. The direct Microsoft adapter remains a fallback; optional FMP access depends on provider coverage and entitlement. No failure silently becomes synthetic data.

Optional context supplies SEC industry and filing links. Workforce enrichment checks dated annual disclosures, follows a bounded set of linked issuer exhibits for missing periods, then queries Wikidata by exact CIK for clearly labelled secondary observations. Sources and measurement scopes remain distinct. Hiring, salary and review figures are not claimed without a connected source. The [local 350-issuer adapter audit](docs/coverage/2026-10-27-local.json) records the sample, failures and parser fingerprint. It does not establish production navigation, archive or save/reopen results; see [Data and methodology](docs/DATA.md#verification).

AI access and its separate billing are described in [Operations](docs/OPERATIONS.md). Scheduling additionally requires an external runner, `CRON_SECRET`, and `SCHEDULER_ENABLED=true`; drafts alone do not run jobs. See [Data and methodology](docs/DATA.md) for source coverage, accounting definitions and validation.

## Code map

| Path | Role |
| --- | --- |
| `app/` | Full-page routes and API handlers. |
| `components/` | Research, memo, diligence, scenario, navigation, and interaction interfaces. |
| `lib/server.ts` | Owner-scoped persistence, quotas, authorization, and scheduling endpoint. |
| `lib/market.ts`, `lib/sec-financials.ts` | Provider-backed discovery, financial normalization, coverage gates and filing provenance. |
| `lib/market-storage.ts`, `lib/company-context.ts` | Shared public evidence cache, aggregate SEC admission, profile/filing enrichment and dated employee disclosures. |
| `lib/issuer-financials.ts` | Direct Microsoft statement fallback. |
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

Application identity comes from verified email/password sessions. Private Sites access may still impose a separate outer gateway sign-in. Before email is connected, the configured owner can use `/owner/setup` to save provider settings through trusted Sites identity; this requires both `OWNER_SETUP_ENABLED` and `AUTH_TRUST_SITES_IDENTITY` and an exact owner-email match. It does not bypass application registration or email verification. Never enable this trust gate on a directly reachable public Worker origin. See [Owner setup](docs/GETTING-STARTED.md).

Existing cloud data remains preserved. Actual registration and password-recovery mail requires a verified sending domain, provider key/sender configuration and a stable `AUTH_SECRET`. Mail settings may be encrypted in the vault or provided as a complete environment pair; the environment pair takes precedence. Preserve `CREDENTIAL_ENCRYPTION_KEY` so saved keys remain readable. Saving settings does not test providers. Missing configuration is shown honestly. See the operating guide for setup, bootstrap shutdown and local-only QA.

Keep `.env*`, `.dev.vars*`, `.sites-runtime/`, `.wrangler/`, `node_modules/`, and publication archives out of source control and deployment source. Keep `.openai/hosting.json`, authored source, the lockfile, and migrations in source control. Generated `dist/` is a build artifact. Publish archives outside the checkout or in ignored `outputs/`.
