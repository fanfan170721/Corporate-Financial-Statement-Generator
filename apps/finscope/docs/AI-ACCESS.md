# AI access and limits

Financial tools do not require AI. AI adds a source-backed explanation using OpenAI Responses with web search. It cannot turn synthetic figures into real evidence.

## Personal keys

Signed-in users open `/ai-access`, enter their OpenAI API key, and may delete or replace it. HTTPS carries the key to the server; AES-256-GCM encrypts it with a fresh 96-bit nonce and account-bound authenticated data. Only the last four characters and save date are returned. Keys never enter browser storage or account exports.

`CREDENTIAL_ENCRYPTION_KEY` must contain 64 cryptographically random hexadecimal characters. It is a hosting secret outside D1. Back it up securely. Rotation requires re-encrypting every record, or deleting saved keys and reconnecting. Never silently replace it.

A personal key takes priority over a pass. The user's OpenAI account pays API costs. Saving a key makes no billable validation call; the first actual analysis checks provider access and funding.

## Sponsored passes

The verified owner opens `/admin` and supplies a sponsored API key, or uses server `OPENAI_API_KEY`. Pass creation accepts a label, maximum claims and redemption deadline. The secret code is shown once; D1 retains its SHA-256 hash. It is not an OpenAI key.

Each claimant receives 24 hours beginning at successful redemption, tracked by server time across devices. An account cannot reuse a code or stack active passes. Revocation stops new requests, including existing grants; it cannot cancel provider work in flight. An atomic grant INSERT and SQL counter trigger enforce shared-code capacity.

## Budgets

Defaults: 100,000 tokens and 5 requests per person per 24-hour pass. Personal accounts use the same limits per UTC day. Sponsored calls also have a site-wide 500,000-token and 25-request daily ceiling. Owners can change these; existing passes keep their issued personal allowance.

Each AI request reserves 20,000 tokens atomically and allows one in-flight AI request per user. Actual input/output usage replaces the reservation. Unknown/failed calls retain it; failed requests also count towards the request limit. New calls are denied when the next reservation exceeds the allowance. Final provider usage may exceed an estimate, so an admitted call can push the final total over an application threshold. These controls are **not a currency hard cap**. Web search has separate provider charges; configure an OpenAI project spending limit too.

Output is capped at 4,500 tokens and built-in tool calls at 2 per response. Passes cannot be issued or consumed before a sponsor key exists. Keys need funded API billing and model access. ChatGPT Pro is not an API token balance; no Pro-to-token conversion is claimed.

## Verification

Tests cover expiry, reuse, revocation, capacity, ownership, encrypted scope, atomic reservations and usage settlement. Citations must match supplied evidence or actual web-search annotations. Financial data is saved before optional AI generation, so an AI outage does not erase a report.
