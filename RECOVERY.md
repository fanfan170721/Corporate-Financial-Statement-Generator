# Recovery reference

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

Fetch the tag, then open it in a separate directory rather than resetting the current checkout:

```sh
git fetch origin --tags
git worktree add --detach ../Finscope-stable stable-2026-10-27
```

Read `MAINTENANCE.md` and `apps/finscope/docs/OPERATIONS.md` in that directory. Install dependencies with Node.js 24, provide local configuration through the established secure process and run typecheck, tests and build. Keep newer uncommitted changes and commits until recovery is verified. Do not force-push `main` or run destructive reset/clean commands as an automatic recovery step.

The local backup folder is `C:\Users\rosem\Finscope-Backups\2026-10-27-stable`. Its manifest records the exact tagged commit and SHA-256 hashes. It contains a source ZIP, a Git bundle, the published version-11 build archive, and an encrypted local runtime-state archive. The Git bundle can be cloned into a fresh directory if the remote is unavailable.

## Published code and data are separate

A Git checkout or GitHub push does not change the public website. With authorized hosting access, select the exact saved version above to restore the code/assets after checking compatibility with the current database and environment. Preserve the existing project, domain, audience and runtime configuration. If hosting access is unavailable, prepare the recovery build and request the normal publishing step; do not create another site.

**No full production database or hosted-secret export was obtained for this checkpoint.** Available database inspection is read-only and paginated; it is not a complete backup. The version-11 build archive does not contain production D1 records or runtime secrets. Local D1 and `.dev.vars` are development state and must never overwrite production. Keep `AUTH_SECRET` and `CREDENTIAL_ENCRYPTION_KEY` unchanged: they protect password verification and the encrypted credential vault.

Before a destructive database migration, account-data deletion, host migration or secret rotation, obtain and verify a complete production database/configuration recovery path through the hosting platform. Prefer additive, backward-compatible migrations. Returning to old code does not undo a data migration or restore deleted records.

## Local encrypted state

`local-runtime.dpapi` uses Windows DPAPI CurrentUser protection. Its archive includes the local configuration files present at backup time and a frozen copy of the complete local D1 directory, including SQLite WAL/SHM files. Its exact contents are listed in the private backup manifest. The decrypted bytes were verified without displaying secret values.

Recovery requires the same Windows user profile and its DPAPI keys. This is not a portable credential backup for another computer or a new Windows installation. Keep the encrypted file private. Restore database files together into a fresh, stopped development directory; never merge an old WAL file into a newer database. Run SQLite integrity checks on a separate restored copy before using it. The private backup folder contains a local-state restore script and verification results.
