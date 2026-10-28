# AI access and limits

Financial tools do not require AI. AI adds a source-backed explanation using OpenAI Responses with web search. It cannot turn synthetic figures into real evidence.

## Optional free-tier analysis

The separate **Free AI analysis** section supports Gemini (`gemini-3.8-flash`) and Groq (`openai/gpt-oss-20b`), selected by the owner. It analyses the saved report only; it does not browse the web. The existing OpenAI personal-key, sponsored-pass and web-search paths remain available and unchanged. The free route never automatically switches providers, falls back to a paid provider or consumes an OpenAI pass.

An owner selects the provider under **Admin → Free AI connection**. Obtain a key from [Google AI Studio](https://aistudio.google.com/api-keys) or [Groq API keys](https://console.groq.com/keys), keep the project on the Free tier, and paste the key directly into the password field in Finscope. Do not place it in a repository, message, screenshot or public environment variable. The form requires confirmation of the Free plan, validates model access with a read-only models request, and encrypts the credential in the existing vault under a provider-specific scope. Only the suffix and save time are returned. No card, purchase, subscription upgrade or billing API is used. The application cannot inspect or enforce the provider account's billing tier; an owner who changes that tier must review the implications before enabling this option. An API key can validate successfully even when the project has no inference quota.

Google's unpaid-service terms allow submitted content and responses to improve its products, including human review. Only the bounded public-data projection described below is sent. Gemini free analysis is unavailable to requests from the EEA, the UK or Switzerland, where Google's terms require Paid Services. Native Worker country metadata is preserved before framework routing. Where the host supplies no country, the visitor must explicitly declare their current country for that request; this fallback currently supports Canada and the United States. It is a self-declaration, not verified geolocation, and cannot override a known restricted country. No country is inferred from language, an email address or browser-supplied headers. The declaration is not persisted, to avoid retaining a stale travel location. These restrictions do not remove financial tools or existing AI options. Review [Google's terms](https://ai.google.dev/gemini-api/terms) and [actual project limits](https://ai.google.dev/gemini-api/docs/rate-limits) when configuring a deployment.

Only authenticated accounts can request free analysis of their own saved live financial reports. Guests, public case pages and basic profiles without financial figures remain ineligible. Ordinary users receive three attempts per UTC day, subject to a shared twenty-attempt daily site allowance. Verified administrators bypass the application daily counts; provider quotas still apply. Durable reservations allow one active free-provider request, with at least sixty seconds between starts. Failed admitted requests count, and provider cooldowns are honoured. Application limits are shared across free providers and independent of the existing OpenAI allowance. [Groq rate limits](https://console.groq.com/docs/rate-limits).

The provider receives a bounded projection of public company identity, financial periods, calculated metrics, workforce observations and source labels. Account emails, passwords, private notes, API credentials and existing analyses are excluded. Five analytical dimensions and verified source identifiers are required; malformed, truncated or untraceable responses are rejected. This checks structure and provenance, not the truth of every model conclusion. The UI labels the provider and report-only evidence boundary. Results are stored in `report.freeAi`; existing `report.ai` results are preserved.

Key validation alone is not an end-to-end generation test. After connecting, generate one free analysis on a financial report, inspect the five dimensions and source links, then reload the report to verify persistence. Quota or connection failures must show a clear message without silently charging another provider. [Groq data handling](https://console.groq.com/docs/your-data).

## Personal keys

Signed-in users open `/ai-access`, enter their OpenAI API key, and may delete or replace it. HTTPS carries the key to the server; AES-256-GCM encrypts it with a fresh 96-bit nonce and account-bound authenticated data. Only the last four characters and save date are returned. Keys never enter browser storage or account exports.

`CREDENTIAL_ENCRYPTION_KEY` must contain 64 cryptographically random hexadecimal characters. It is a hosting secret outside D1. Back it up securely. Rotation requires re-encrypting every record, or deleting saved keys and reconnecting. Never silently replace it.

A personal key takes priority over a pass. The user's OpenAI account pays API costs. Saving a key makes no billable validation call; the first actual analysis checks provider access and funding.

## Sponsored passes

Before email delivery is configured, the owner can save the existing sponsored API key through `/owner/setup`. This narrowly scoped bootstrap requires both setup/trusted-identity flags and a trusted Sites gateway identity matching `ADMIN_EMAIL`; it does not create an application session or bypass email verification. See [Owner setup](GETTING-STARTED.md). Never expose this gate through an untrusted direct Worker origin.

After registration and email verification, the owner manages sponsored keys and passes in `/admin`. A saved sponsored key takes precedence over server `OPENAI_API_KEY`. Saving a key makes no provider-validation or billable request. Pass creation accepts a label, maximum claims and redemption deadline. The secret code is shown once; D1 retains its SHA-256 hash. It is not an OpenAI key.

Verified administrators are exempt from application report and AI allowances. They can use the configured sponsored key without redeeming a pass, or use their own saved key. This exemption is determined from the verified authentication account and server administrator configuration, never a browser-supplied role or editable profile. Administrator usage is still recorded in a separate `admin:` budget scope and does not exhaust visitor allowances. Missing provider configuration, provider balance/rate limits, authentication, source-evidence checks, input bounds and request timeouts still apply. The exemption does not purchase credits or enable automatic billing.

Each claimant receives 24 hours beginning at successful redemption, tracked by server time across devices. An account cannot reuse a code or stack active passes. Revocation stops new requests, including existing grants; it cannot cancel provider work in flight. An atomic grant INSERT and SQL counter trigger enforce shared-code capacity.

## Budgets

Defaults for non-administrators: 100,000 tokens and 5 requests per person per 24-hour pass. Personal accounts use the same limits per UTC day. Sponsored visitor calls also have a shared 500,000-token and 25-request daily ceiling. Owners can change these; existing passes keep their issued personal allowance.

Each AI request reserves 20,000 tokens atomically and allows one in-flight AI request per user. Actual input/output usage replaces the reservation. Unknown/failed calls retain it; failed requests also count towards the request limit. New calls are denied when the next reservation exceeds the allowance. Final provider usage may exceed an estimate, so an admitted call can push the final total over an application threshold. These controls are **not a currency hard cap**. Web search has separate provider charges; configure an OpenAI project spending limit too.

Output is capped at 4,500 tokens and built-in tool calls at 2 per response. Passes cannot be issued or consumed before a sponsor key exists. Keys need funded API billing and model access. ChatGPT Pro is not an API token balance; no Pro-to-token conversion is claimed.

## Verification

Tests cover expiry, reuse, revocation, capacity, ownership, encrypted scope, atomic reservations and usage settlement. Citations must match supplied evidence or actual web-search annotations. Financial data is saved before optional AI generation, so an AI outage does not erase a report.

A real **local** integration run on 26 October 2026 (America/New_York; `2026-10-27T02:08:18Z`) used `gpt-6-astra` on the published Microsoft FY2022–FY2026 report and produced seven insights with five verified sources. The completed analysis was saved and reopened. Recorded provider usage was 22,226 input + 2,039 output = 24,265 tokens. This also demonstrates why the 20,000-token admission reservation is an estimate rather than a hard cap on the final call. The hosted deployment still needs its own end-to-end validation; neither saving a credential nor this local result confirms hosted provider connectivity or email delivery.
