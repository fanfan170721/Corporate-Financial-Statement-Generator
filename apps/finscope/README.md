# Finscope

An institutional investment research workspace built with React, Vinext, Cloudflare Workers, and D1. It combines sourced financial charts, a frozen Microsoft annual-report case, private archives, investment committee memos, manager due diligence, allocation stress scenarios, and liquidity planning. Illustrative data and assumptions are labelled explicitly.

## Develop

Use Node.js **22.13 or newer** (Node 24 recommended for the built-in SQLite test runner). Run from this directory:

```sh
npm run install:ci
npm run dev
```

Portable development starts at `http://127.0.0.1:5173`. Keep previews on loopback. Optional flags follow `npm run dev --`, for example `--port 5174`. Do not run overlapping installers or duplicate development servers.

The Sites initializer selects a portable or managed-Linux profile stored in ignored `.sites-runtime/`. Preserve the maintained scripts and Vite integrations. When using the Sites plugin, follow its skill for installation, preview, builds, and publishing; these commands remain available for direct local use. Portable execution supports Windows, macOS, and Linux without Bash. Publishing also needs Git and `tar`.

Portable development simulates sign-in on loopback: open `/signin-with-chatgpt?return_to=/workspace` for the `local_seedy` account, and `/signout-with-chatgpt?return_to=/` to sign out. The local cookie survives server restarts. Production uses Sites-owned Sign in with ChatGPT; mock authentication is excluded from the production build.

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

No credentials are included. Illustrative data and the published case work without a provider. `SEC_USER_AGENT` or `FMP_API_KEY` enables supported live retrieval; `OPENAI_API_KEY` enables server-side AI. Scheduling additionally requires an external runner, `CRON_SECRET`, and `SCHEDULER_ENABLED=true`; drafts alone do not run jobs. See [Operations](docs/OPERATIONS.md) for admin access, allowances, provider setup boundaries, and the optional GitHub Actions runner.

## Code map

| Path | Role |
| --- | --- |
| `app/` | Full-page routes and API handlers. |
| `components/` | Research, memo, diligence, scenario, navigation, and interaction interfaces. |
| `lib/server.ts` | Owner-scoped persistence, quotas, authorization, and scheduling endpoint. |
| `lib/market.ts`, `lib/ai.ts` | Server-side financial and AI providers. |
| `lib/case-studies.ts` | Published financial snapshots and source notes. |
| `lib/types.ts` | Shared contracts. |
| `db/schema.ts`, `drizzle/` | Schema and ordered migrations. |
| `tests/` | Financial calculations and persistence/security checks. |
| `app/chatgpt-auth.ts` | Sites dispatch identity helpers. |
| `worker/index.ts` | Production Worker with request-scoped bindings. |
| `scripts/` | Maintained execution helpers and bounded morning-report runner. |

## Deployment boundary

The app trusts identity headers supplied by **Sites dispatch**. Keep that gateway in front of the Worker. A raw standalone deployment needs its own verified authentication boundary. SIWC paths are gateway-owned and must begin as top-level browser navigation. Email/password registration and an independent non-ChatGPT sign-in path are not implemented in this release.

Keep `.env*`, `.dev.vars*`, `.sites-runtime/`, `.wrangler/`, `node_modules/`, and publication archives out of source control and deployment source. Keep `.openai/hosting.json`, authored source, the lockfile, and migrations in source control. Generated `dist/` is a build artifact. Publish archives outside the checkout or in ignored `outputs/`.
