# Recovery reference

## First-visit introduction — version 29

Published on 28 October 2026. Adds the Zidong Yuan introduction, public-source credits, replay and methodology links, English/French text and theme/reduced-motion support. First-visit display is controlled by a browser-local cookie. No database, credential, billing or financial-data changes.

- Source commit: `2a151383951c9878a92bda6d562763a09d405466`.
- Saved version: `appgprj_6adfe53d05bc8191983062a369584a6a~appgver_c23d93f813a48191a798f43b97314ff8`.
- Deployment: `appgdep_6ae1ab32a8c481919e0b3687974c898d`.
- Archive: `outputs/finscope-introduction-v29.tar.gz`.
- Recovery tag: `release-introduction-v29`; previous checkpoint: `release-gemini-free-v28`.
- Validation: TypeScript, six existing localization tests, production build and publication-input credential scan passed. Browser checks covered automatic exit, returning visits, replay, English/French, light/dark display and the live branded domain. HTTP checks confirmed the first-visit backdrop is absent for a seen-cookie request and document responses remain private/no-store.
- Local recovery copy: `C:\Users\rosem\Finscope-Backups\release-introduction-v29` (source, Git history and deployment build; excludes production database and credentials).

## Cross-source workforce release — version 22

Published on 28 October 2026. This release adds bounded missing-period discovery through linked SEC issuer exhibits and the Wikidata API, annual year-end workforce table extraction, explicit secondary-source scope, and an English/French source-check trace. No database migration or production secret change.

- Saved version: `appgprj_6adfe53d05bc8191983062a369584a6a~appgver_a0e92de6fd208191b55ed1e094995345`
- Published source: `d9b529c5fc17c803e9c3bbf67ff0b677b37f0dd6`
- Successful deployment: `appgdep_6ae1924df3108191b14dff6c78e4c276`
- Environment revision: 5, unchanged.
- Archive: `outputs/finscope-cross-source-v22.tar.gz`.
- Validation: 196 automated tests, typecheck, production build and local HTTP checks passed. Actual CNI retrieval added two official year-end counts (2024/2025) using 4 supplementary requests / 3,316,711 bytes; the warm supplement cache made zero requests. Actual RY retrieval retained an explicit missing result. Sony, TSMC and Starbucks were separately checked against real dated Wikidata payloads. These samples do not prove universal coverage.
- Recovery tag: `release-cross-source-workforce-v22`; prior `release-workforce-history-v21` remains intact.
- Local source/build backup: `C:\Users\rosem\Finscope-Backups\cross-source-workforce-v22`. This is not a production database backup.

## Stable checkpoint

`stable-2026-10-27` is the recovery tag for the application and maintenance documentation saved on 27 October 2026 (America/New_York). Do not move, overwrite or delete this tag.

The runtime baseline is GitHub commit `00f0297d7ab209e8b4a7e37ae37d5dcabb335c03`, which passed 82 tests, typecheck and build. The recovery tag also includes subsequent documentation updates; these do not change the deployed runtime.

The checkpoint's production baseline is Sites version **11** at `https://finscopehq.com`. This is the preserved rollback target, not a statement that version 11 is still the current release. See `apps/finscope/docs/HANDOFF.md` for newer deployment verification.

- Project: `appgprj_6adfe53d05bc8191983062a369584a6a`
- Saved version: `appgprj_6adfe53d05bc8191983062a369584a6a~appgver_93127bbe4a5c819199c795fb90a57f00`
- Source commit: `9ac7553b437b145a964f676a865ea9013b3005e9`
- Successful deployment: `appgdep_6ae04366f9f481918c6cca339fd43c45`
- Database migrations: 0000 through 0005. Never edit or replay a deployed migration.

## Recover source without discarding newer work

The broad financial-coverage release was published as Sites version **13** on 27 October 2026. It adds only migration `0006_market_evidence_cache.sql`; the original stable tag remains intact.

- Saved version: `appgprj_6adfe53d05bc8191983062a369584a6a~appgver_4b0a96898b9c81918c5989856334c162`
- Published source: `1f756f1cc109b77ae66dc76911282501ffb87818`
- Successful deployment: `appgdep_6ae05578f41c8191bdeba757e3f6af0a`
- Local deployment archive: `outputs/finscope-broad-coverage-v13.tar.gz` (ignored by Git).
- Evidence: `apps/finscope/docs/coverage/2026-10-27-local.json` and `2026-10-27-production.json`. The 125-issuer production retrieval audit ran on version 12; version 13 keeps the same financial adapter and fixes consecutive company selection. Apple and Tesla were generated with normal guest credits, compared, exported and reopened from the production archive. The published mobile layout and all six chart series were checked separately.

These artifacts preserve code/builds, not a complete production database backup. Restore code through the existing project and keep the account database and encryption secrets intact.

The bilingual interface release is Sites version **14**. It adds no database migration and preserves the version-13 financial parser and data-access controls.

- Saved version: `appgprj_6adfe53d05bc8191983062a369584a6a~appgver_198a98c074ec8191aaf3cba1e5e32ca9`
- Published source: `5844cd74de40d06ae0e92d5edccdd193cbcbafb2`
- Successful deployment: `appgdep_6ae05d95a8dc8191aeeaa8d1de7ed8fc`
- Deployment archive: `outputs/finscope-bilingual-v14-final.tar.gz` (ignored by Git).
- Preserve both prior rollback tags: `stable-2026-10-27` and `release-2026-10-27-coverage`. Language preferences use existing JSON storage and remain backward-compatible.

The welcome-pond update is Sites version **16**, published on 27 October 2026. It samples 20 distinct companies from 100 presets, softens water ripples and corrects the French welcome heading at 320px. It makes no database, credential or financial-adapter changes. Version 15 was an unpublished validation candidate.

- Saved version: `appgprj_6adfe53d05bc8191983062a369584a6a~appgver_924c44ec7c888191a0aaf9bb834468cd`
- Published source: `2d9422bd877b9811e0112527c70c3e676294c502`
- Successful deployment: `appgdep_6ae0c07ff2c48191836af33a07fb4d38`
- Deployment archive: `outputs/finscope-fish-v16.tar.gz` (ignored by Git).
- The preceding public release remains preserved at `release-2026-10-27-bilingual`.

The evidence-scope update is Sites version **18** (version 17 introduced the same behaviour; version 18 completes two French labels). It adds verified partial and basic company reports, per-report and per-chart scope, and a server gate that prevents basic profiles from reserving paid financial analysis. No database migration or production credential change was required.

- Saved version: `appgprj_6adfe53d05bc8191983062a369584a6a~appgver_a309710eab288191ad2e770a6d1156b5`
- Published source: `77657035f66015a25aeb49d4f015b9c02715bccb`
- Successful deployment: `appgdep_6ae16fcd38348191963b40e3b01f337b`
- Deployment archive: `outputs/finscope-report-scope-v18.tar.gz` (ignored by Git).
- Verification: 129 tests, TypeScript and production build passed; final catalogue changes passed targeted translation/export checks. Real SEC retrieval returned NVDA full (100%), JPM partial (67.3%) and CNI basic (eight original filings). Live production search confirmed CNI/JPM availability. Normal local guest requests generated and reopened both reports; CNI's English/French UI showed the correct scope without empty financial charts or AI controls. Browser inspection of the completed JPM page and the CSV download observer timed out; no further browser success is claimed. CSV content is covered by automated tests. No paid AI request or production guest credit was used.
- Previous release retained at `release-2026-10-27-pond`; current source checkpoint: `release-2026-10-27-scope`.

The verified administrator access release is Sites version **19**. It exempts verified administrator accounts from internal report and AI allowances, preserves normal-user limits, and records administrator usage separately. No schema migration or credential rotation was required.

- Saved version: `appgprj_6adfe53d05bc8191983062a369584a6a~appgver_09d7a3f2b4fc8191a762306dc9f9b2fc`
- Published source: `cb0a6c3b33643adbfaec63e7d8fae555b3e97168`
- Successful deployment: `appgdep_6ae172e586b08191b6c3dbb9b73562b8`
- Deployment archive: `outputs/finscope-admin-access-v19.tar.gz` (ignored by Git).
- Verification: 132 tests, TypeScript and production build passed. The owner confirmed real registration email delivery, verification, password login and successful password recovery/new-password login. Production settings and AI access display administrator status and unlimited site allowance. A real NVIDIA report and seven-dimension AI analysis were generated, saved and reopened; the AI ledger records one request and 24,410 tokens. No payment setting or automatic reload was changed.
- Runtime environment revision 5 closes temporary bootstrap/linking (`OWNER_SETUP_ENABLED=false`, `AUTH_TRUST_SITES_IDENTITY=false`) after verified account management succeeded. Keep `AUTH_SECRET`, encryption keys and existing provider credentials unchanged. Anonymous admin and AI-settings requests return 401; bootstrap returns 404.
- Source checkpoint: `release-admin-access-v19`. The previous scope checkpoint and all older tags remain intact. Post-deployment documentation records the verification outcomes; runtime code matches the published source.

The on-demand discovery release is Sites version **20**. Recommendations return curated company metadata without external requests. Typed search loads the cached directory only; financial facts, filing history and annual documents wait for an explicit report-generation request. Discovery labels show pending coverage in English and French. Directory UI requests have an eight-second timeout and retry; financial generation timeouts are unchanged. No database migration or runtime configuration change was needed.

- Saved version: `appgprj_6adfe53d05bc8191983062a369584a6a~appgver_948691fddbe08191b8d6761bbe99d163`
- Published source: `80f56c374e8caa7639f6b91f2a99d75be666fba9`
- Successful deployment: `appgdep_6ae18425b8ac81918b937830578a5b72`
- Deployment archive: `outputs/finscope-lazy-discovery-v20.tar.gz` (ignored by Git).
- Verification: 140 tests, TypeScript and production build passed. Discovery tests assert zero recommendation network/cache requests, directory-only search and evidence retrieval at explicit generation; FMP international metadata and French aliases remain supported. Local production-build requests returned 12 pending-coverage suggestions in 55 ms and exact NVIDIA metadata in 140 ms. Production checks returned suggestions in 618 ms, the financial sector in 593 ms and NVIDIA metadata in 789 ms; all returned HTTP 200. These are individual observations, not latency guarantees. No paid AI request was used.
- Source checkpoint: `release-lazy-discovery-v20`; the previous `release-admin-access-v19` tag remains available for rollback. Runtime environment revision remains 5.

The workforce-history release is Sites version **21**. Annual-disclosure extraction supports full-time equivalents, full-/part-time counts, full-time people, verified issuer names and fiscal-year labels. Up to five annual periods feed distinct trend series with source links and honest gaps. Metadata retrieval handles frequent filers; annual documents are bounded at 17 MB and parsed sequentially. Compact observations cache for 30 days, missing extractions for 24 hours and transient retrieval failures for one minute. Multi-company requests execute sequentially. Normal account/guest allowances and administrator exemptions remain unchanged.

- Saved version: `appgprj_6adfe53d05bc8191983062a369584a6a~appgver_41895b295bb881919f932b2785df0ed6`
- Published source: `fefeb63f24f353740e5ee8f623d43af82bf4b983`
- Successful deployment: `appgdep_6ae189dc6a5881918c6125d52c08ba41`
- Deployment archive: `outputs/finscope-workforce-history-v21.tar.gz` (ignored by Git).
- Verification: 153 full-suite tests, TypeScript and production build passed. Real-document checks produced five dated observations each for Apple, Microsoft, NVIDIA, Amazon and JPMorganChase (25 observations). This is a sample, not a universal-coverage claim. A new local guest-session test hit the existing shared-network limit; no limit or authentication bypass was applied. Production administrator generation then successfully saved Apple and Microsoft reports; both showed five annual observations, correct workforce bases, charts and individual source links in the browser. No paid AI call was used.
- Source checkpoint: `release-workforce-history-v21`; the previous `release-lazy-discovery-v20` checkpoint remains available. No database migration or runtime environment change; environment revision remains 5.

Fetch the tag, then open it in a separate directory rather than resetting the current checkout:

```sh
git fetch origin --tags
git worktree add --detach ../Finscope-stable stable-2026-10-27
```

Read `MAINTENANCE.md` and `apps/finscope/docs/OPERATIONS.md` in that directory. Install dependencies with Node.js 24, provide local configuration through the established secure process and run typecheck, tests and build. Keep newer uncommitted changes and commits until recovery is verified. Do not force-push `main` or run destructive reset/clean commands as an automatic recovery step.

The local backup folder is `C:\Users\rosem\Finscope-Backups\2026-10-27-stable`. Its manifest records the exact tagged commit and SHA-256 hashes. It contains a source ZIP, a Git bundle, the published version-11 build archive, and an encrypted local runtime-state archive. The Git bundle can be cloned into a fresh directory if the remote is unavailable.

## Published code and data are separate

The optional free-analysis release is Sites version **28**, published on **28 October 2026 (America/New_York)**. It adds owner-selected Gemini or Groq analysis of saved public-company reports. The active production provider is Gemini `gemini-3.5-flash-lite`. Existing OpenAI personal keys, sponsored passes, financial tools, guest restrictions and account data remain intact. Free output is saved independently in `report.freeAi`.

- Saved version: `appgprj_6adfe53d05bc8191983062a369584a6a~appgver_a0a3add3c0a08191b4db354b23f5af92`
- Published source: `b259af8cee664173e12bcfcfe4e99286db584020`
- Successful deployment: `appgdep_6ae1a564a8b88191964c2716775bfa6f`
- Deployment archive: `outputs/finscope-gemini-free-v28.tar.gz` (ignored by Git).
- Source checkpoint: `release-gemini-free-v28`; previous working checkpoint `release-cross-source-workforce-v22` remains available. Versions 23–27 are intermediate integration releases, not the recommended rollback target.
- Verification: all 242 tests, TypeScript and the production build passed. Production Microsoft analysis returned six dimensions and seven source references in English; Apple returned five dimensions and two source references in Canadian French. Both were saved and reopened after a full refresh. Recorded successful usage: Microsoft 1,417 input + 902 output tokens; Apple 1,421 input + 765 output tokens. These are two verified samples, not a universal quality or availability guarantee. The earlier Gemini 3.8 Flash trial timed out once and returned provider HTTP 503 twice; those admitted attempts remain recorded conservatively. The final Flash-Lite path succeeded without an automatic provider fallback.
- The owner connected an existing Google AI Studio Free-tier key through the encrypted administrator form. Neither API keys nor production data are included in this code backup. No billing account, payment setting, paid upgrade, database migration or runtime-environment change was made; environment revision remains 5.
- Native Worker country metadata is captured before routing. This host did not provide it during verification, so the owner explicitly confirmed Canada. The UI permits a per-request Canada/US declaration when location is unknown, clearly labelled as self-declared; it cannot override a known restricted region. The declaration is not stored.
- Provider failures preserve the original report and paid analysis. Minimal diagnostics record provider/status/format categories, never keys, provider error text, prompts or generated financial text. Ordinary accounts have three attempts/day and a shared twenty-attempt site allowance; administrators bypass application daily counts but remain subject to upstream capacity and the shared cooldown.
- Local recovery copy: `C:\Users\rosem\Finscope-Backups\release-gemini-free-v28` contains a source ZIP, verified Git bundle, deployment archive and hash manifest. It excludes production D1 and credentials.

A Git checkout or GitHub push does not change the public website. With authorized hosting access, select the exact saved version above to restore the code/assets after checking compatibility with the current database and environment. Preserve the existing project, domain, audience and runtime configuration. If hosting access is unavailable, prepare the recovery build and request the normal publishing step; do not create another site.

**No full production database or hosted-secret export was obtained for this checkpoint.** Available database inspection is read-only and paginated; it is not a complete backup. The version-11 build archive does not contain production D1 records or runtime secrets. Local D1 and `.dev.vars` are development state and must never overwrite production. Keep `AUTH_SECRET` and `CREDENTIAL_ENCRYPTION_KEY` unchanged: they protect password verification and the encrypted credential vault.

Before a destructive database migration, account-data deletion, host migration or secret rotation, obtain and verify a complete production database/configuration recovery path through the hosting platform. Prefer additive, backward-compatible migrations. Returning to old code does not undo a data migration or restore deleted records.

## Local encrypted state

`local-runtime.dpapi` uses Windows DPAPI CurrentUser protection. Its archive includes the local configuration files present at backup time and a frozen copy of the complete local D1 directory, including SQLite WAL/SHM files. Its exact contents are listed in the private backup manifest. The decrypted bytes were verified without displaying secret values.

Recovery requires the same Windows user profile and its DPAPI keys. This is not a portable credential backup for another computer or a new Windows installation. Keep the encrypted file private. Restore database files together into a fresh, stopped development directory; never merge an old WAL file into a newer database. Run SQLite integrity checks on a separate restored copy before using it. The private backup folder contains a local-state restore script and verification results.
