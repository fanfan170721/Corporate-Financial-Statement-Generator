# Financial data, research methods and AI

## Coverage and report availability

Financial evidence is fetched only after the user requests a report. Homepage ideas use curated company metadata without upstream requests. Typed search uses the cached SEC issuer/security directory rather than the curated alias list as its universe; it does not fetch company facts, filing history or annual documents. Exact ticker matches retain security identity, including share classes. Discovery results are explicitly marked as awaiting a coverage check, not verified financial availability. Report generation resolves the current issuer identity, retrieves public evidence and labels the result as full, partial or basic. Missing evidence is never replaced with invented figures.

The fixed completeness denominator is **11 fields × every displayed annual period**: revenue, net income, operating cash flow, capex, assets, liabilities, cash, debt, gross profit, operating income and equity. Full financial coverage requires all of:

- Strictly more than 90% populated observations across the full displayed period set.
- At least two comparable annual periods.
- Latest revenue, net income, operating cash flow, assets, liabilities and equity present, and no more than one missing latest core field.
- A valid reporting date no later than today and no more than 550 days old.

Completeness describes this defined financial summary, not 90% of everything known about a company, all statement rows, or all product features. The gate is deliberately unchanged for financial institutions; non-comparable fields may make their reports limited. Private companies and issuers without suitable public filings may be unavailable. Directory coverage is not a claim that every company can produce a report.

## Evidence and freshness

- **SEC reports:** standardized company facts provide up to five annual periods, with fiscal cutoff, original filing links, retrieval time and calculation provenance. Compact public financial evidence and optional context may be cached for 15 minutes. `dataAsOf` is the reporting cutoff; `retrievedAt` records source retrieval; `generatedAt` records creation of the user's saved report. A new save does not imply a new filing or bypass the cache.
- **Direct issuer fallback:** Microsoft (MSFT) can also be retrieved from its official annual-report pages without a financial-data key. The adapter discovers the latest listed annual report and retains its own bounded source-page caches.
- **Published case:** `case-MSFT` contains verified Microsoft FY2021–FY2025 consolidated financials, compiled on 26 October 2026 in Toronto. This is a frozen research snapshot, not a refreshed feed. The internal `mode: live` distinguishes published figures from synthetic fixtures; label this case **Published financials**, never live or refreshed.
- **Provider reports:** the server retrieves the latest available complete annual disclosures. `generatedAt` records report creation; `dataAsOf` records fiscal year-end. Neither is a live market-price timestamp.
- **Synthetic illustrations:** deterministic 2020–2024 fixtures always carry `mode: demo`, have no issuer-source claims and cannot invoke paid AI. They support interaction testing, not the featured research case.
- Provider failures are explicit. Production uses `allowDemoFallback: false`. Only explicit service-layer opt-in returns an illustration with a failure explanation.

## Direct Microsoft statements

The server discovers reports from Microsoft's [annual-report index](https://www.microsoft.com/en-us/investor/annual-reports), accepting only HTTPS report links on `www.microsoft.com`. The newest listed report and reports two and four years earlier supply five annual periods, including two-year balance-sheet comparisons. Source pages are fetched at generation time, with a 15-minute index cache and one-hour annual-document cache. Concurrent requests are deduplicated. There is no bundled financial snapshot fallback.

The extraction reads the issuer's consolidated income, balance-sheet and cash-flow tables, validates the expected financial year and units, and preserves reported signs and per-share/share-count units. A newer filing takes precedence for comparative figures. Five annual periods must have revenue, net income, operating cash flow, assets, liabilities and equity; assets must equal liabilities plus equity within USD 1 million of rounding. Unexpected markup, missing primary totals or a failed identity stops generation. Missing observations remain null. Changed wording may produce separate statement rows.

A network validation on 26 October 2026 (America/Toronto) successfully retrieved the [FY2026](https://www.microsoft.com/investor/reports/ar26/index.html), [FY2024](https://www.microsoft.com/investor/reports/ar24/index.html) and [FY2022](https://www.microsoft.com/investor/reports/ar22/index.html) annual reports. It produced FY2022–FY2026, 55 populated core observations and 98 combined statement rows (20 income, 40 balance sheet, 38 cash flow). The latest fiscal cutoff was 30 June 2026. The same real-data flow passed on the deployed `finscopehq.com` guest path on 27 October 2026 (America/New_York), including all three table tabs and archive/reopening. An honest Finscope User-Agent resolved the observed Worker HTTP 403. These are validation records, not a hard-coded claim about future availability or broader issuer coverage.

The direct-adapter interface includes extracted primary-statement rows, six financial charts, CSV export and all three statement tables in print/PDF. Original report links remain essential: the app does not reproduce full footnotes, comprehensive income, changes in equity or the auditor's opinion. This issuer-specific fallback covers Microsoft; broad discovery and standardized reports use the SEC adapter below.

## Microsoft case provenance

All amounts are USD millions. FY2023–2025 income and cash-flow figures come from the [FY2025 annual report](https://www.microsoft.com/investor/reports/ar25/index.html); FY2021–2022 comparatives come from [FY2023](https://www.microsoft.com/investor/reports/ar23/index.html). Balance sheets use FY2025 for 2024–2025, FY2023 for 2022–2023, and [FY2022](https://www.microsoft.com/investor/reports/ar22/index.html) for 2021.

Fiscal years end 30 June. `grossProfit` maps to the dollar-denominated Gross margin statement row. Cash excludes short-term investments. Debt sums separately presented short-term debt, current long-term debt and noncurrent long-term debt; it excludes leases and borrowing embedded in other liabilities. Cash capex is additions to property and equipment, excluding noncash finance-lease additions. FCF is an analytical subtotal, not comprehensive owner earnings or a company forecast. The case contains 55 non-null values (11 financial fields across five years). It does not incorporate disclosures after FY2025.

## SEC adapter

Set a real, identifiable `SEC_USER_AGENT` with the operator's contact email. Discovery reads `https://www.sec.gov/files/company_tickers_exchange.json`; financial facts use `https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json`. The directory keeps ticker, exchange and CIK identities. Requests run on the server under SEC fair-access rules. No SEC API key is needed.

The directory cache lasts 12 hours. Compact normalized financial evidence is cached for 15 minutes in shared D1 storage, with a bounded in-memory cache and in-flight deduplication. Raw company-facts payloads are not stored in D1. A shared D1 reservation admits at most four SEC requests per one-second window across Worker instances, so any one-second span stays at or below eight, under SEC's fair-access maximum of ten. The 350 ms in-process queue applies only when no shared limiter is configured. Admission fails after a bounded wait rather than creating an unbounded queue. Provider redirects are not followed; JSON and annual-document reads have time and size limits.

The parser reads entity-wide standard US-GAAP/IFRS concepts from annual filings, selecting one reporting currency without currency conversion. Full-year duration observations span approximately 330–380 days. Income and cash flow join exact start/end dates; balance sheets join ending dates. The latest eligible filed observation resolves restatements. Labels describe the year ending; distinct annual periods ending in one calendar year retain full date labels. Filing `fy` is not treated as the observation year.

Safe derivations require disclosed inputs from the same fiscal period and filing. Provenance records the source concepts, accession, filing date and calculation basis. Parent-shareholder earnings/equity are not silently substituted with consolidated totals. Debt retains a disclosed borrowing/finance-lease basis; missing components are not zero. Liabilities derived from assets and equity require appropriate total-equity evidence and exclude known temporary-equity cases. Null observations remain null. These are **standardized summaries**, not a complete reconstruction of custom issuer statements, segment disclosures, footnotes or auditor opinions.

Issuer extensions, financial institutions, foreign issuers and changed fiscal calendars may leave gaps. General debt/equity is not a bank capital-adequacy ratio. The presence of a configured contact does not prove connectivity; deployed source access and report/save/reopen paths require their own checks.

References: [EDGAR APIs](https://www.sec.gov/search-filings/edgar-application-programming-interfaces), [SEC developer resources](https://www.sec.gov/about/developer-resources).

## Supplementary company context

`lib/company-context.ts` reads SEC submissions for SIC industry, available HTTPS website metadata and the eight latest supported filing links. The feed is labelled company filings, not general news. It is fetched during report generation, not autocomplete. Annual documents are optional enrichment and do not block valid financial evidence if retrieval fails.

Employee counts require either explicit inline-XBRL employee facts with matching issuer, period and count units, or a tightly matched annual-disclosure sentence that states the company-wide count and exact reporting date. Dimensional subsets, contractors, undated narratives and contradictory totals are rejected. Full-time-only, combined full-/part-time and full-time-equivalent disclosures retain their separate scopes; FTE is not relabelled as individual people. Approximate disclosures stay approximate. Narrative evidence retains a short original sentence and source URL. No missing numeric values are inferred by a model.

On explicit report generation, up to five annual filings are checked for workforce history. The parser supports dated issuer-wide statements, validated fiscal-year labels and reconciled regional or functional breakdowns. Prior submission manifests are followed within a bounded date window for frequent filers. Historical observations have individual dates and sources; incompatible measurement bases are separate chart series and missing periods stay gaps.

When periods remain missing, the supplement follows up to two relevant HTML documents linked by those annuals. An incorporated document may use another accession but must remain under the identical SEC issuer CIK. Annual-information and annual-statistics links are ranked before generic Exhibit 99 links. Redirects, arbitrary domains, PDF documents and traversal paths are not followed. Valid primary observations take precedence.

The next source is the documented Wikidata API: resolve the company by its exact CIK (P5531), then read dated employee statements (P1128/P585). Only unambiguous Gregorian dates and integer quantities are retained; stale, future, restricted-scope and conflicting observations are excluded. Wikidata is community-maintained secondary evidence, not independent verification of an issuer disclosure. Counts may omit the distinction between people and FTE, and stay in a separate scope-unspecified series. The report links the entity, labels its source type, and records checks that yielded no data. It does not infer current headcount from older observations. [Data access](https://www.wikidata.org/wiki/Wikidata:Data_access), [CC0 licensing](https://www.wikidata.org/wiki/Wikidata:Licensing).

Supplementation has a maximum of six requests, a 25-second deadline and 20 MB downloaded per attempt (17 MB per SEC document, 2 MB per secondary payload). Requests are sequential. Shared admission spaces public-source requests by one second and admits four SEC requests per one-second window. Compact successful/empty supplement results cache for 24 hours; failures cool down for at least 60 seconds, honouring Retry-After. No raw page bodies are shared or persisted. Existing complete primary histories skip the supplement. This budget is additional to the existing annual-filing retrieval budget; it is not a cap on the complete financial report. No homepage or autocomplete fetch is added.

An experimental StockAnalysis adapter is retained in source for testing, but production does not enable it. Its public access does not grant permission to build a competing dataset; separate operator authorization would be needed. No end-user input can enable that adapter.

Annual documents are downloaded sequentially with a 17 MB limit. Compact validated observations are reused for 30 days; unparsed documents for one day; failed retrievals have a one-minute retry cooldown. No raw filing HTML is retained in shared storage. Companies in a multi-company request are generated concurrently. Each Worker runs at most three enrichments at once, each parsing one annual document at a time; shared SEC admission limits aggregate traffic to four requests per one-second window.

This release does not guarantee employee coverage for every issuer or year, current hiring counts, salary averages, employee reviews or stock quotes. Source links alone do not establish any of those numbers. Additional sources require documented access, dates, definitions and redistribution rights before their data can be presented.

## Optional global provider

With `FMP_API_KEY`, the adapter uses stable `search-symbol`, `search-name`, `income-statement`, `balance-sheet-statement` and `cash-flow-statement`. Coverage, history, commercial rights and quotas depend on the purchased plan.

Statements join by fiscal year-end, annual period and reporting currency, not array position. Amounts remain in millions of their original reporting currency. No FX rates are inferred. The small curated company list supplies multilingual aliases, colours and recommendation seeds; SEC's directory supplies broad issuer discovery. Neither is a current market-cap ranking.

References: [FMP quickstart](https://site.financialmodelingprep.com/developer/docs/quickstart), [FMP documentation](https://site.financialmodelingprep.com/developer/docs).

## Metric definitions

| Field | Unit | Calculation |
| --- | --- | --- |
| `revenueGrowth` | % | Latest annual revenue change / previous annual revenue |
| `netMargin` | % | Net income / revenue |
| `freeCashFlow` | Reporting-currency millions | Operating cash flow − absolute cash capex |
| `debtToEquity` | × | Disclosed debt, including finance leases where identified, / parent-shareholder equity; absent borrowing components are never assumed zero |
| `roe` | % | Net income / average of the latest two year-end equity balances |
| `cashRatio` | × | Cash and equivalents / total liabilities; not the standard cash/current-liabilities ratio |

Missing, zero or negative denominators return null. Six deterministic observations explain calculations and research questions; they are not AI ratings. Colour cues use illustrative thresholds (8% growth, 15% net margin/ROE, 1.5× debt/equity), without industry calibration or backtesting.

Compare reporting currencies, fiscal calendars, accounting standards, business models and acquisitions before comparing peers. Annual reports can lag current operations. FCF does not adjust for acquisitions, leases, share-based compensation or maintenance versus expansion spending. Margins do not remove exceptional items; ROE can be distorted by buybacks. Retain sources, assumptions and missing fields. These measures do not establish target prices or recommendations.

## Scenario laboratories

Allocation and liquidity inputs are hypothetical assumptions in CAD billions, unrelated to any actual pension fund's portfolio or forecast. Allocation applies first-order duration changes and user-specified asset shocks. Liquidity reconciles 24 monthly balances, accelerates calls without increasing their total, and identifies buffer and cash shortfalls. Neither supplies historical returns, a valuation opinion or regulatory compliance. Each interface discloses formulas and exclusions. Cloud scenarios retain parameters and revisions; unsaved edits last for the current page session.

## Server-side AI

An optional free-tier path supports owner-selected Gemini or Groq and separately analyses a bounded subset of the saved report. It performs no new web search, retains report dates and missing fields, and only accepts citations referring to the supplied source list. Its output is labelled separately and does not replace the existing OpenAI analysis. Availability requires an owner-connected Free-plan key and is subject to provider/site limits and regional eligibility. Google's free-service data-use terms are disclosed. The app never routes free requests to the OpenAI balance or automatically switches providers. See [AI access](AI-ACCESS.md#optional-free-tier-analysis).

An account can add a personal OpenAI API key or redeem a limited 24-hour sponsored access pass at `/ai-access`. Keys submitted through the authenticated form are sent over HTTPS and encrypted by the server; they are not retained in browser storage or returned by the settings endpoint. Keep `CREDENTIAL_ENCRYPTION_KEY` and any deployment-level `OPENAI_API_KEY` in the server secret manager. Never put credential values in public environment variables, source control or logs. See the operating guide for access controls, limits and key management.

Select a Responses, web-search and structured-output capable model with `OPENAI_MODEL` (default `gpt-6-astra`). A report must first be saved to the user's account; public case pages and synthetic examples cannot directly trigger AI requests.

The service calls `POST https://api.openai.com/v1/responses` with `web_search`, source inclusion, strict JSON Schema and `store: false`. It sends public company financials, not user emails or watchlists. Output is original English for company analysis, with at least five dimensions, conditions, counterarguments and observable milestones.

URLs must occur in supplied report sources or actual search/annotation evidence. Invented URLs are rejected; at least one verified web citation is required. Source links and numbers remain visible. Web content is evidence, never executable instructions. Missing configuration, quota failures, incomplete output and failed citation checks return `status: unavailable`; no canned text pretends AI ran.

API access, billing and quotas are separate from a ChatGPT subscription. Set project budgets, alerts, model permissions and site-level limits. References: [Responses web search](https://developers.openai.com/api/docs/guides/tools-web-search), [production practices](https://developers.openai.com/api/docs/guides/production-best-practices).

## Verification

Run `npm test`, `npm run typecheck` and `npm run build`. Tests cover directory discovery beyond the curated list, exact share-class identity, unsupported results, fiscal joins, restatements, currency consistency, provenance, safe derivations, missing fields, bounded cache/admission, employee fact/disclosure parsing, archive isolation, CSV exports and existing account/guest/AI controls. Unit fixtures are invented inputs, never user-visible company financials. Unit tests do not call paid APIs.

The [27 October local adapter audit](coverage/2026-10-27-local.json) samples 350 distinct CIKs from SEC's NYSE/Nasdaq directory order, selected before financial retrieval. Failures stay in the sample; share classes do not count as separate companies. Read the file's current summary rather than copying counts into product promises. Its `parserSha256` identifies the exact parser assessed. Regenerate the audit after accounting corrections before treating its result as evidence for a new build.

To reproduce a fresh network audit from the application directory, configure the genuine `SEC_USER_AGENT` privately and run `node scripts/audit-sec-coverage.mjs --limit 350 --output outputs/coverage/sec-local.json`. The script reports local adapter results, not production navigation, guest admission, chart rendering, saving or reopening. Verify those separately on the published deployment and retain the deployed version with the results. No audit establishes all-company coverage or future source availability.

The [production retrieval audit](coverage/2026-10-27-production.json) verified all 125 locally supported candidates through the deployed public API. Its scope is retrieval and normalization, separate from the guest save/reopen checks documented in the handoff. `scripts/audit-production-coverage.mjs` accepts a candidate JSON file, origin, deployment ID and output path; it respects the production search allowance and performs no AI calls or account mutations.

## Implementation research

These primary references informed the provider, normalization and evidence approach. Product interfaces, proprietary datasets and third-party source code are not copied into this implementation.

- [Stock Analysis data overview](https://stockanalysis.com/help/data-and-downloads/about-our-data/) explains its multiple financial-data providers and differing coverage/update characteristics. Its [API policy](https://stockanalysis.com/help/faq/api-access/) says it does not offer programmatic access; the site is a product reference, not a Finscope ingestion endpoint.
- [Simply Wall St sources and methodology](https://simplywall.st/analysis-and-financial-data-sources) explains normalized financial evidence and reporting cadence. Its [public company-analysis model](https://github.com/SimplyWallSt/Company-Analysis-Model) provides conceptual documentation with its own licence; it is not the source of Finscope scores or report text.
- [EdgarTools](https://github.com/dgunning/edgartools) demonstrates company/CIK discovery, financial-statement extraction and filing provenance as separate capabilities. Finscope's Worker adapter is implemented independently in TypeScript.
- [OpenBB provider documentation](https://docs.openbb.co/odp/python/extensions/providers) and the [OpenBB SEC provider](https://pypi.org/project/openbb-sec/) illustrate a source-specific connector architecture with explicit coverage and caching.
- [SEC's API documentation](https://www.sec.gov/search-filings/edgar-application-programming-interfaces) defines submissions, entity-wide company facts, units, filing updates and the limits of standardized concepts.
- [OpenBB debt-field discussion](https://github.com/openbq-org/OpenBB/issues/7634) illustrates gaps caused by concept selection and the risk of unsafe imputation; missing components need explicit provenance rather than assumed zeros. [EdgarTools historical-statement discussion](https://github.com/dgunning/edgartools/issues/1802) illustrates historical-period gaps and the need to test period alignment. Issue reports are implementation lessons, not proof of universal coverage by either product or by Finscope.
