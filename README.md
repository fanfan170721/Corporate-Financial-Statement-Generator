# Finscope

**Investment research, built for the long view.**

[Open the deployed preview](https://finscope-market-observatory.upbeatclove8.chatgpt.site) — currently private to the owner.

Finscope is an institutional investment research workspace designed around the questions a long-horizon investor should ask: What supports the thesis? What could invalidate it? How does the investment interact with the portfolio, its liquidity and its obligations?

The interface is written in original English for a Canadian institutional-investment audience. It uses a restrained black-and-white foundation with pale blue and pink accents, an equally complete dark theme, full-page navigation and an interactive company-fish welcome experience.

## Research workflow

| Workspace | What it demonstrates |
| --- | --- |
| Company research | Company and ticker discovery, three-company comparisons, six financial charts, source registers and dated report snapshots |
| Microsoft case study | Verified FY2021–FY2025 annual-report financials, with a thesis and counter-thesis; explicitly frozen, not a live feed |
| Asset–liability lab | Six asset classes, allocation rebalancing, interest-rate shocks, liability duration, funding-ratio sensitivity and transparent assumptions |
| Liquidity & commitments | A reconciled 24-month cash ledger, benefit payments, contributions, private-market capital calls and stress scenarios |
| Manager due diligence | Eight evidence-led review areas, unresolved critical topics and a private memo hand-off; no invented manager rating |
| Investment memos | Structured thesis, catalysts, valuation, risks, disconfirming evidence and sources, with editing, exports and print layouts |
| Personal workspace | Persistent watchlists, report archives, saved scenarios, preferences, data export and morning-brief settings |

### Real functionality and clear boundaries

Account-owned data is stored in Cloudflare D1 and survives browser or device changes. Authentication is handled by the hosting platform's Sign in with ChatGPT integration. Every private operation checks the authenticated user on the server. Mutations require a same-origin request.

Research jobs have durable, atomic limits: at most three concurrent companies and 18 daily research credits. Failed attempts retain their credit cost, while concurrency leases are released. Saved scenarios support revision checks to prevent silently overwriting another device's newer changes.

The Microsoft case uses verified published statements. Company demonstration reports are **synthetic**, clearly labelled, and excluded from AI analysis. On-demand financials require a configured SEC contact or licensed data provider. SEC retrieval from the development host returned HTTP 403; no access restriction was bypassed and a successful live feed is not claimed.

Optional AI research uses the OpenAI Responses API with web search, server-only credentials, structured output and source validation. A valid account and funded API project are required. ChatGPT subscription usage does not fund API calls. No real key is included in this repository.

Morning briefs require a configured financial provider, a private cron secret and an enabled external scheduler. The included GitHub workflow is disabled until the `ENABLE_MORNING_BRIEF` repository variable is set to `true`; absent credentials never simulate a successful schedule. Scheduling is best-effort and follows the runner's cadence, not an exact delivery-time guarantee.

## Run locally

Requirements: Node.js 24 and npm.

```sh
cd apps/finscope
npm ci
npm run build
# Apply each pending local migration once; see apps/finscope/README.md.
npm run dev
```

The development server prints its local address, normally `http://127.0.0.1:5173`. Local sign-in is simulated only for loopback development. The production build uses hosting-managed authentication.

```sh
npm run typecheck
npm test
npm run build
```

The tests cover fiscal-period alignment, missing values, financial calculations, citation validation, ownership, same-origin protection, concurrency and quota accounting, scenario revisions, memo persistence, scheduled-run idempotency and cash-flow reconciliation.

## Project structure

```text
apps/finscope/
  app/          Pages and protected API routes
  components/   Research tools, charts, interface and interaction
  lib/          Financial data, research services and domain models
  db/           D1 schema
  drizzle/      Versioned database migrations
  tests/        Domain and service tests
  scripts/      Build and background-runner tooling
  docs/         Data definitions and operational setup
```

See [data methodology](apps/finscope/docs/DATA.md) and [operations](apps/finscope/docs/OPERATIONS.md) before enabling external services. The app relies on the Sites authentication boundary; do not deploy its raw Worker behind a public endpoint that accepts spoofed identity headers.

## Presenting the project

A useful demonstration starts with the source-verified Microsoft case, moves to the asset–liability funding paradox, tests a stressed liquidity runway, and closes with an evidence-backed investment memo. Discuss assumptions, missing inputs and what would change the conclusion—not just the interface.

Before using it in applications, connect a domain you own, verify the intended sharing settings, complete the data/API setup and review the research yourself. Financial scenarios are educational decision-support tools, not personalised investment advice or promised outcomes.
