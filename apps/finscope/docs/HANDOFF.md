# Developer handoff

This document is for any developer or coding assistant maintaining Finscope. No conversation history or particular AI provider is required.

## Repository and application

- Repository: https://github.com/fanfan170721/Corporate-Financial-Statement-Generator
- Application: `apps/finscope`
- Runtime: Node.js 24 for tooling; Cloudflare Workers for production; D1/SQLite for persistence.
- UI: React 19, TypeScript, Vinext, Recharts, Lucide and CSS.
- Hosted identity: read `.openai/hosting.json`; do not create a replacement project when updating this one.
- GitHub CI: `.github/workflows/check.yml`.

Start with README, `docs/OPERATIONS.md`, `docs/AI-ACCESS.md` and `docs/DATA.md`. Install with `npm ci`, initialize the local database, then run `npm run dev`. Run typecheck, tests and build before release.

## Boundaries to preserve

1. Private data is scoped to verified application users. Never accept a user ID or role from a browser request body.
2. Email sessions are independent of the hosting gateway. Do not restore the old implicit ChatGPT identity fallback.
3. Financial statements have dates, currencies and source URLs. Missing observations remain null. Demo fixtures cannot become live reports by changing a label.
4. `lib/ai-access.ts` is the admission path for paid AI. Do not call `generateAIAnalysis` directly from routes and bypass its controls.
5. `lib/credential-vault.ts` uses AES-GCM and scope-bound authenticated data. Keep the master key outside D1 and Git.
6. Native links in `components/app-link.tsx` are intentional. The deployed Vinext client router failed on clicks despite valid routes. Do not restore `next/link` without production navigation checks.
7. Database changes require new ordered migrations. Never edit deployed migrations. Preserve the handwritten AI grant-counter SQL trigger.
8. Product copy stays natural English and describes practical financial analysis and planning.

## Change map

| Area | Locations |
| --- | --- |
| Welcome and fish | `components/workspace.tsx`, `components/shell.tsx`, `components/fish-school.tsx`, `app/globals.css` |
| Accounts | `lib/auth*.ts`, `app/api/auth/`, `components/email-auth.tsx` |
| Reports and sources | `lib/market.ts`, issuer/statement adapters, `components/research.tsx`, `lib/types.ts` |
| Account data | `lib/server.ts`, `db/schema.ts`, `app/api/` |
| AI and encryption | `lib/ai-access.ts`, `lib/credential-vault.ts`, `lib/ai.ts`, `components/ai-settings.tsx` |
| Planning | `components/research-scenarios.tsx`, `components/liquidity-lab.tsx`, financial-model helpers |
| Scheduling | `app/api/jobs/daily/`, `.github/workflows/morning-brief.yml`, runner scripts |

## Release

- Update readiness documentation when service dependencies change.
- Run tests/typecheck/build. Check desktop and mobile for navigation, authentication or chart changes.
- Verify entry→tool→save→reopen, not just HTTP200 or screenshots.
- Keep `.dev.vars`, `.env*`, `.wrangler`, `.sites-runtime` and `outputs` out of Git.
- Push source to GitHub and publish the same source/build to the existing Sites project.
- Preserve the hosting audience; public access is a separate owner decision.
- Verify migrations, deployed routes and service errors. Report unavailable providers honestly.

## Moving hosts

Source is ordinary TypeScript/React/Worker code. Another Cloudflare deployment requires a D1 binding, migrations, environment variables, Worker build and compatible asset serving. A non-Worker host also needs the `cloudflare:workers`/D1 layer adapted. Export/import D1 and transfer the encryption master key securely; replacing that key without re-encryption makes saved API keys unreadable. Review session and gateway differences explicitly.

## Next operational work

Connect verified email delivery and funded API billing; verify the complete hosted account flow. Configure broader financial coverage, source-backed issuer adapters and scheduler operation. Add retention and account-deletion tooling before expanding usage. These are follow-ups, not claims that unconfigured services already work.
