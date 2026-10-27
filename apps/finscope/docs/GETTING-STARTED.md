# Owner setup and guest access

Use `/owner/setup` to connect email and sponsored AI before your application email account exists. This page is restricted to the configured owner through the trusted private Sites gateway. It does not skip registration or email verification. Keep the site private until the hosted checks below succeed.

## 1. Open the private owner setup page

Sign in to the private website through its Sites gateway using the owner account, then open `/owner/setup`. An application email/password login is not required for this one setup page.

The deployment must have `ADMIN_EMAIL` set to that exact owner email, `OWNER_SETUP_ENABLED=true`, and `AUTH_TRUST_SITES_IDENTITY=true`. The gateway identity must be trusted Sites identity, not a client-supplied email. This gate must never be enabled on a directly reachable public Worker origin where gateway identity headers can be forged. A developer must configure the stable server secrets `AUTH_SECRET` and `CREDENTIAL_ENCRYPTION_KEY` before setup; neither belongs in the form or a chat message.

If sponsored AI is not already configured, paste your existing OpenAI API key into the masked sponsored-key field and save it. The form stores the key encrypted on the server; it does not display it again or make a paid validation call. Use your existing API credit for testing. Saving configuration does not require another credit purchase. Keep auto-reload disabled unless you deliberately choose otherwise.

## 2. Connect email, then verify your application account

Create a free Resend account. Buy a domain you control if you do not already have one, then [verify its sending domain](https://resend.com/docs/dashboard/domains/introduction) with the DNS records shown in Resend. A subdomain such as `accounts.your-domain.example` keeps transactional email separate.

Create a Resend sending API key. In `/owner/setup`, enter that key and a sender on your verified domain, for example `Finscope <hello@accounts.your-domain.example>`, then save. This encrypts the configuration; it does not send a test email, verify the domain, validate the provider key, or create an application account. A complete server-environment pair of `RESEND_API_KEY` and `AUTH_EMAIL_FROM` takes precedence over saved mail settings, so remove or update an obsolete complete pair through deployment settings if necessary.

Register in Finscope using the exact `ADMIN_EMAIL` address. Receive the real email and enter its code. Then test sign-out/sign-in and password reset. `/admin` becomes available to the verified owner account. If preserving older Sites-owned research, follow the proof-based linking instructions in [Operations](OPERATIONS.md) before registration. There is no production verification bypass.

After setup, you may disable `OWNER_SETUP_ENABLED`. Keep `AUTH_TRUST_SITES_IDENTITY` enabled only while owner setup or the documented legacy-account linking is needed. Preserve `AUTH_SECRET` and `CREDENTIAL_ENCRYPTION_KEY` during every deployment: changing them casually breaks password verification or access to encrypted provider keys.

## 3. Verify one hosted AI report

Generate a Microsoft report, open it from your archive, and run AI research using a personal key or an owner-issued pass. Confirm its citations, then reopen the report and check that the analysis was saved. The owner can manage the sponsored key and passes in `/admin` after email verification.

The local integration test on 26 October 2026 (America/New_York; `2026-10-27T02:08:18Z`) succeeded with Microsoft FY2022–FY2026, seven analysis insights and five verified sources using `gpt-6-astra`. Report and AI output were saved and reopened. Provider usage was 22,226 input tokens plus 2,039 output tokens, or 24,265 total. This is a local test result, **not confirmation that the hosted deployment or its email provider has passed**.

OpenAI API billing is [separate from ChatGPT subscriptions](https://help.openai.com/en/articles/9039756-managing-billing-for-chatgpt-and-the-api-platform). Credits are a money balance, not a fixed token bundle; model input, output and web-search charges affect cost. Check the [API billing overview](https://platform.openai.com/settings/organization/billing/overview) after your test. No further purchase or automatic reload is needed just to follow these instructions.

## 4. Give a guest access

Connect and verify email first. Decide the hosting audience explicitly: the current deployment is owner-private, so a link alone does not admit visitors. Use supported external invitations or approve public hosting with application login; this is separate from an AI pass.

In `/admin`, create a labelled pass with **one claim** for an individual guest. Copy the code immediately; it is shown once. The default allowance is 100,000 metered tokens and 5 AI requests for 24 hours starting when redeemed. Limits can be changed in the owner console. The token reservation caveat and provider costs are explained in `AI-ACCESS.md`.

Give the guest the website URL and their pass code. They register, verify their email, open **AI access**, and redeem the code. Their financial reports and saved data belong to their own account. Revoking a pass prevents new sponsored AI calls. After expiry, other tools remain available; users may also connect their own API billing account.

## 5. Financial coverage and daily reports

Direct Microsoft statements work without a paid financial-data account. Other companies require a suitable FMP plan or compliant SEC deployment access. Configure the provider and validate several requested tickers before promising broad coverage. Company data entitlements differ from OpenAI billing.

Daily report schedules additionally require the external runner described in Operations. Saving a time does not itself start a background scheduler.

## 6. Maintenance

Give future developers the GitHub repository and `docs/HANDOFF.md`. `CLAUDE.md` provides a direct starting point for Claude. Give deployment access through the hosting platform, never by committing credentials. Keep encrypted-vault and authentication secrets stable during updates.
