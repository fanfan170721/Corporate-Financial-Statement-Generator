# Financial data, research methods and AI

## Current coverage gap and next release

Read the 27 October 2026 takeover brief in `HANDOFF.md` before expanding this system. The owner's latest priority is broad company lookup, even if the next release is simplified to a current stock quote. At least 100 companies should be a real acceptance sample rather than a hard-coded universe. The existing 42-company discovery catalogue and a configured-provider flag do not establish functioning coverage. Main search, recommendations and actions must be tied to actual provider capabilities. Full financial reports, employee counts and news can follow the broadly usable core; never claim a quote is a financial statement or a delayed observation is real-time.

## Evidence and freshness

- **Direct issuer reports:** Microsoft (MSFT) is available without a financial-data key. Each generation discovers the latest annual report listed by Microsoft and retrieves actual published statement pages. `dataAsOf` is the fiscal cutoff; `retrievedAt` is source retrieval time; `generatedAt` is when the account report was saved. No date is a claim of real-time pricing.
- **Published case:** `case-MSFT` contains verified Microsoft FY2021–FY2025 consolidated financials, compiled on 26 October 2026 in Toronto. This is a frozen research snapshot, not a refreshed feed. The internal `mode: live` distinguishes published figures from synthetic fixtures; label this case **Published financials**, never live or refreshed.
- **Provider reports:** the server retrieves the latest available complete annual disclosures. `generatedAt` records report creation; `dataAsOf` records fiscal year-end. Neither is a live market-price timestamp.
- **Synthetic illustrations:** deterministic 2020–2024 fixtures always carry `mode: demo`, have no issuer-source claims and cannot invoke paid AI. They support interaction testing, not the featured research case.
- Provider failures are explicit. Production uses `allowDemoFallback: false`. Only explicit service-layer opt-in returns an illustration with a failure explanation.

## Direct Microsoft statements

The server discovers reports from Microsoft's [annual-report index](https://www.microsoft.com/en-us/investor/annual-reports), accepting only HTTPS report links on `www.microsoft.com`. The newest listed report and reports two and four years earlier supply five annual periods, including two-year balance-sheet comparisons. Source pages are fetched at generation time, with a 15-minute index cache and one-hour annual-document cache. Concurrent requests are deduplicated. There is no bundled financial snapshot fallback.

The extraction reads the issuer's consolidated income, balance-sheet and cash-flow tables, validates the expected financial year and units, and preserves reported signs and per-share/share-count units. A newer filing takes precedence for comparative figures. Five annual periods must have revenue, net income, operating cash flow, assets, liabilities and equity; assets must equal liabilities plus equity within USD 1 million of rounding. Unexpected markup, missing primary totals or a failed identity stops generation. Missing observations remain null. Changed wording may produce separate statement rows.

A network validation on 26 October 2026 (America/Toronto) successfully retrieved the [FY2026](https://www.microsoft.com/investor/reports/ar26/index.html), [FY2024](https://www.microsoft.com/investor/reports/ar24/index.html) and [FY2022](https://www.microsoft.com/investor/reports/ar22/index.html) annual reports. It produced FY2022–FY2026, 55 populated core observations and 98 combined statement rows (20 income, 40 balance sheet, 38 cash flow). The latest fiscal cutoff was 30 June 2026. The same real-data flow passed on the deployed `finscopehq.com` guest path on 27 October 2026 (America/New_York), including all three table tabs and archive/reopening. An honest Finscope User-Agent resolved the observed Worker HTTP 403. These are validation records, not a hard-coded claim about future availability or broader issuer coverage.

The interface includes all extracted primary-statement rows, six financial charts, complete CSV export and all three statement tables in print/PDF. Original report links remain essential: the app does not reproduce full footnotes, comprehensive income, changes in equity or the auditor's opinion. Direct coverage is currently MSFT only. A configured provider is required for other companies; discovery-catalogue inclusion does not imply financial-data coverage.

## Microsoft case provenance

All amounts are USD millions. FY2023–2025 income and cash-flow figures come from the [FY2025 annual report](https://www.microsoft.com/investor/reports/ar25/index.html); FY2021–2022 comparatives come from [FY2023](https://www.microsoft.com/investor/reports/ar23/index.html). Balance sheets use FY2025 for 2024–2025, FY2023 for 2022–2023, and [FY2022](https://www.microsoft.com/investor/reports/ar22/index.html) for 2021.

Fiscal years end 30 June. `grossProfit` maps to the dollar-denominated Gross margin statement row. Cash excludes short-term investments. Debt sums separately presented short-term debt, current long-term debt and noncurrent long-term debt; it excludes leases and borrowing embedded in other liabilities. Cash capex is additions to property and equipment, excluding noncash finance-lease additions. FCF is an analytical subtotal, not comprehensive owner earnings or a company forecast. The case contains 55 non-null values (11 financial fields across five years). It does not incorporate disclosures after FY2025.

## SEC adapter

Set a real, identifiable `SEC_USER_AGENT` with the operator's contact email. The directory is `https://www.sec.gov/files/company_tickers.json`; facts use `https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json`. Requests run on the server under SEC fair-access rules. No API key is needed.

Requests are spaced by at least 350 ms per service instance, with in-flight deduplication, a 24-hour directory cache and a one-hour facts cache. Scaled deployments also need shared caching and an aggregate outbound budget. Instance-local throttling is not a global rate limit.

The parser accepts USD standard US-GAAP/IFRS concepts in annual filings and full-year periods of approximately 330–380 days. Income and cash flow join by exact start/end dates; balance sheets join by ending date. Latest-filed values resolve duplicates. Filing `fy` is not used as the historical year. Missing fields remain `null`.

Issuer extensions, financial institutions, foreign issuers and changed fiscal calendars may leave gaps. General debt/equity is not a bank capital-adequacy ratio. A network check using a URL-only user agent received SEC HTTP 403; production connectivity requires compliant operator identity and deployment-level validation.

References: [EDGAR APIs](https://www.sec.gov/search-filings/edgar-application-programming-interfaces), [SEC developer resources](https://www.sec.gov/about/developer-resources).

## Optional global provider

With `FMP_API_KEY`, the adapter uses stable `search-symbol`, `search-name`, `income-statement`, `balance-sheet-statement` and `cash-flow-statement`. Coverage, history, commercial rights and quotas depend on the purchased plan.

Statements join by fiscal year-end, annual period and reporting currency, not array position. Amounts remain in millions of their original reporting currency. No FX rates are inferred. The 42-company discovery catalogue is curated and supports internal multilingual aliases. It is not a current market-cap ranking or universal company directory.

References: [FMP quickstart](https://site.financialmodelingprep.com/developer/docs/quickstart), [FMP documentation](https://site.financialmodelingprep.com/developer/docs).

## Metric definitions

| Field | Unit | Calculation |
| --- | --- | --- |
| `revenueGrowth` | % | Latest annual revenue change / previous annual revenue |
| `netMargin` | % | Net income / revenue |
| `freeCashFlow` | Reporting-currency millions | Operating cash flow − absolute cash capex |
| `debtToEquity` | × | Reported borrowings / equity; automated SEC parsing requires complete short-/long-term components |
| `roe` | % | Net income / average of the latest two year-end equity balances |
| `cashRatio` | × | Cash and equivalents / total liabilities; not the standard cash/current-liabilities ratio |

Missing, zero or negative denominators return null. Six deterministic observations explain calculations and research questions; they are not AI ratings. Colour cues use illustrative thresholds (8% growth, 15% net margin/ROE, 1.5× debt/equity), without industry calibration or backtesting.

Compare reporting currencies, fiscal calendars, accounting standards, business models and acquisitions before comparing peers. Annual reports can lag current operations. FCF does not adjust for acquisitions, leases, share-based compensation or maintenance versus expansion spending. Margins do not remove exceptional items; ROE can be distorted by buybacks. Retain sources, assumptions and missing fields. These measures do not establish target prices or recommendations.

## Scenario laboratories

Allocation and liquidity inputs are hypothetical assumptions in CAD billions, unrelated to any actual pension fund's portfolio or forecast. Allocation applies first-order duration changes and user-specified asset shocks. Liquidity reconciles 24 monthly balances, accelerates calls without increasing their total, and identifies buffer and cash shortfalls. Neither supplies historical returns, a valuation opinion or regulatory compliance. Each interface discloses formulas and exclusions. Cloud scenarios retain parameters and revisions; unsaved edits last for the current page session.

## Server-side AI

An account can add a personal OpenAI API key or redeem a limited 24-hour sponsored access pass at `/ai-access`. Keys submitted through the authenticated form are sent over HTTPS and encrypted by the server; they are not retained in browser storage or returned by the settings endpoint. Keep `CREDENTIAL_ENCRYPTION_KEY` and any deployment-level `OPENAI_API_KEY` in the server secret manager. Never put credential values in public environment variables, source control or logs. See the operating guide for access controls, limits and key management.

Select a Responses, web-search and structured-output capable model with `OPENAI_MODEL` (default `gpt-6-astra`). A report must first be saved to the user's account; public case pages and synthetic examples cannot directly trigger AI requests.

The service calls `POST https://api.openai.com/v1/responses` with `web_search`, source inclusion, strict JSON Schema and `store: false`. It sends public company financials, not user emails or watchlists. Output is original English for company analysis, with at least five dimensions, conditions, counterarguments and observable milestones.

URLs must occur in supplied report sources or actual search/annotation evidence. Invented URLs are rejected; at least one verified web citation is required. Source links and numbers remain visible. Web content is evidence, never executable instructions. Missing configuration, quota failures, incomplete output and failed citation checks return `status: unavailable`; no canned text pretends AI ran.

API access, billing and quotas are separate from a ChatGPT subscription. Set project budgets, alerts, model permissions and site-level limits. References: [Responses web search](https://developers.openai.com/api/docs/guides/tools-web-search), [production practices](https://developers.openai.com/api/docs/guides/production-best-practices).

## Verification

Run `node --experimental-strip-types --test tests/market.test.ts tests/issuer-financials.test.ts tests/liquidity.test.ts tests/server.test.ts`. Tests cover multilingual/fuzzy discovery, fiscal joins, restatements, quarter exclusion, currency consistency, missing values, invalid denominators, issuer discovery, statement units/signs, reconciliation failures, full CSV exports and formula-safe source text, honest demo labels, forbidden silent fallback, AI citation checks, archive isolation, liquidity cash bridges and conserved commitments. Unit fixtures are invented test inputs, never user-visible company financials. No paid APIs are called. Deployment credentials and network connectivity require separate validation.
