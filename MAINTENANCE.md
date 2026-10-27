# Finscope development

The application is in `apps/finscope`. Read `README.md` and `apps/finscope/docs/HANDOFF.md` before changing it. The repository contains the complete application source, tests, database migrations, configuration templates and operational documentation.

Read `RECOVERY.md` before changes that could affect existing data or deployment. Preserve the immutable `stable-2026-10-27` tag. Keep work in small, reviewable commits and use backward-compatible database changes until a complete production data backup is verified.

## Current owner priority: broad company coverage

Read the dated release brief at the top of `apps/finscope/docs/HANDOFF.md` first. The priority is broad, useful company analysis with financial evidence first. Discovery uses SEC's current issuer directory rather than a fixed company allowlist. Reports use normalized company facts, exact periods, disclosed currencies and per-field filing provenance. Company context is supplementary; no broad employee, hiring, salary or review coverage is promised.

The availability denominator is fixed at 11 core fields across all displayed annual periods. Require strictly more than 90% completeness, at least two years, the six latest primary totals, at most one latest missing field and a valid reporting date no older than 550 days. Do not lower the gate after failures, infer absent numbers or treat directory matches as verified coverage. Recommendations must pass the gate; unsupported search results stay labelled and disabled. The 350-issuer local adapter audit in `apps/finscope/docs/coverage/2026-10-27-local.json` is an acceptance sample, not a coverage ceiling or proof of production-browser success. Regenerate it after parser changes and compare its `parserSha256` to the released source.

The production baseline and outstanding account/email/AI checks remain documented separately from this source release. GitHub push and Sites deployment are distinct. Preserve the existing host, database, secrets and immutable rollback tag. No purchases, payment-method changes or automatic billing are authorized. Existing API credit may be used only for relevant tests; guest financial lookup must not require paid AI.

Use Node.js 24. From the application directory: `npm ci`, configure ignored `.dev.vars`, apply pending local migrations, then `npm run dev`. Validate changes with `npm run typecheck`, `npm test` and `npm run build`.

Preserve verified email authentication, account ownership, source provenance, native full-page navigation, server-side AI admission controls and encrypted credentials. Never print or commit secrets. Keep product copy in natural English and Canadian French through the curated translation catalogues; preserve company names, source quotations and user-authored notes. Follow the handoff and operations documentation for deployment to the existing site.

Owner bootstrap at `/owner/setup` is authorized only through explicitly enabled trusted Sites identity matching `ADMIN_EMAIL`; it is not an application-auth fallback or email-verification bypass. Keep this gate disabled on untrusted direct Worker origins. Preserve `AUTH_SECRET`, the credential-vault master key, and documented environment-versus-vault precedence. A successful local AI test is recorded in the handoff; it does not establish hosted-provider readiness or justify another paid test.
