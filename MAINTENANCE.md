# Finscope development

The application is in `apps/finscope`. Read `README.md` and `apps/finscope/docs/HANDOFF.md` before changing it. The repository contains the complete application source, tests, database migrations, configuration templates and operational documentation.

Read `RECOVERY.md` before changes that could affect existing data or deployment. Preserve the immutable `stable-2026-10-27` tag. Keep work in small, reviewable commits and use backward-compatible database changes until a complete production data backup is verified.

## Current owner priority: broad company coverage

Read the dated takeover brief at the top of `apps/finscope/docs/HANDOFF.md` first. The owner explicitly prioritizes universal company lookup over feature count, elaborate reports or visual polish. Simplify or remove secondary features if necessary; a broadly usable company/stock-price tool is preferable to a sophisticated Microsoft-only report. At least 100 real companies must be tested as an acceptance sample, not hard-coded as the coverage ceiling. Main search and recommendations must reflect actual provider coverage. Do not present a catalogue, fixtures or untested API configuration as working coverage.

The existing production baseline is documented, including outstanding account/email/AI checks and the distinction between GitHub source and Sites deployment. Do not rebuild or migrate hosting before evaluating the reusable code and data-provider path. No purchases, payment-method changes or automatic billing are authorized. Existing OpenAI credit may be used only for relevant tests; guest market-data lookup must not require paid AI.

Use Node.js 24. From the application directory: `npm ci`, configure ignored `.dev.vars`, apply pending local migrations, then `npm run dev`. Validate changes with `npm run typecheck`, `npm test` and `npm run build`.

Preserve verified email authentication, account ownership, source provenance, native full-page navigation, server-side AI admission controls and encrypted credentials. Never print or commit secrets. Keep product copy in natural English. Follow the handoff and operations documentation for deployment to the existing site.

Owner bootstrap at `/owner/setup` is authorized only through explicitly enabled trusted Sites identity matching `ADMIN_EMAIL`; it is not an application-auth fallback or email-verification bypass. Keep this gate disabled on untrusted direct Worker origins. Preserve `AUTH_SECRET`, the credential-vault master key, and documented environment-versus-vault precedence. A successful local AI test is recorded in the handoff; it does not establish hosted-provider readiness or justify another paid test.
