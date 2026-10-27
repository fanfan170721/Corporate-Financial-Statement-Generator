# Finscope development

The application is in `apps/finscope`. Read `README.md` and `apps/finscope/docs/HANDOFF.md` before changing it. The repository contains the complete application source, tests, database migrations, configuration templates and operational documentation.

Use Node.js 24. From the application directory: `npm ci`, configure ignored `.dev.vars`, apply pending local migrations, then `npm run dev`. Validate changes with `npm run typecheck`, `npm test` and `npm run build`.

Preserve verified email authentication, account ownership, source provenance, native full-page navigation, server-side AI admission controls and encrypted credentials. Never print or commit secrets. Keep product copy in natural English. Follow the handoff and operations documentation for deployment to the existing site.

Owner bootstrap at `/owner/setup` is authorized only through explicitly enabled trusted Sites identity matching `ADMIN_EMAIL`; it is not an application-auth fallback or email-verification bypass. Keep this gate disabled on untrusted direct Worker origins. Preserve `AUTH_SECRET`, the credential-vault master key, and documented environment-versus-vault precedence. A successful local AI test is recorded in the handoff; it does not establish hosted-provider readiness or justify another paid test.
