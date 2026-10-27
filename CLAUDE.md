# Finscope development

The application is in `apps/finscope`. Read `README.md` and `apps/finscope/docs/HANDOFF.md` before changing it. The repository contains the complete application source, tests, database migrations, configuration templates and operational documentation.

Use Node.js 24. From the application directory: `npm ci`, configure ignored `.dev.vars`, apply pending local migrations, then `npm run dev`. Validate changes with `npm run typecheck`, `npm test` and `npm run build`.

Preserve verified email authentication, account ownership, source provenance, native full-page navigation, server-side AI admission controls and encrypted credentials. Never print or commit secrets. Keep product copy in natural English. Follow the handoff and operations documentation for deployment to the existing site.
