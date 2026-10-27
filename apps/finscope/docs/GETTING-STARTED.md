# Owner setup and guest access

Visitors use [Finscope](https://finscopehq.com) and its own email/password login. Use `/owner/setup` only to configure providers before your application email account exists. It is restricted to the configured owner through trusted Sites identity; anonymous visitors receive a normal 404. It does not skip registration or email verification.

## 1. Open the private owner setup page

Sign in to the private website through its Sites gateway using the owner account, then open `/owner/setup`. An application email/password login is not required for this one setup page.

The deployment must have `ADMIN_EMAIL` set to that exact owner email, `OWNER_SETUP_ENABLED=true`, and `AUTH_TRUST_SITES_IDENTITY=true`. The gateway identity must be trusted Sites identity, not a client-supplied email. This gate must never be enabled on a directly reachable public Worker origin where gateway identity headers can be forged. A developer must configure the stable server secrets `AUTH_SECRET` and `CREDENTIAL_ENCRYPTION_KEY` before setup; neither belongs in the form or a chat message.

If sponsored AI is not already configured, paste your existing OpenAI API key into the masked sponsored-key field and save it. The form stores the key encrypted on the server; it does not display it again or make a paid validation call. Use your existing API credit for testing. Saving configuration does not require another credit purchase. Keep auto-reload disabled unless you deliberately choose otherwise.

## 2. Connect email, then verify your application account

The domain `finscopehq.com` has been registered, both website hostnames have active TLS, and `mail.finscopehq.com` is verified in Resend. Preserve the [sending-domain DNS records](https://resend.com/docs/dashboard/domains/introduction) already configured rather than repeating domain or key creation.

Check whether email configuration is already saved in `/owner/setup`. Only if it is missing, use a Resend key limited to sending from `mail.finscopehq.com`, with sender `Finscope <accounts@mail.finscopehq.com>`. This encrypts the configuration; it does not send a test email, validate provider access, or create an application account. A complete server-environment pair of `RESEND_API_KEY` and `AUTH_EMAIL_FROM` takes precedence over saved mail settings, so remove or update an obsolete complete pair through deployment settings if necessary.

Register in Finscope using the exact `ADMIN_EMAIL` address. Receive the real email and enter its code. Then test sign-out/sign-in and password reset. `/admin` becomes available to the verified owner account. If preserving older Sites-owned research, follow the proof-based linking instructions in [Operations](OPERATIONS.md) before registration. There is no production verification bypass.

After setup, you may disable `OWNER_SETUP_ENABLED`. Keep `AUTH_TRUST_SITES_IDENTITY` enabled only while owner setup or the documented legacy-account linking is needed. Preserve `AUTH_SECRET` and `CREDENTIAL_ENCRYPTION_KEY` during every deployment: changing them casually breaks password verification or access to encrypted provider keys.

## 3. Verify one hosted AI report

Generate a Microsoft report, open it from your archive, and run AI research using a personal key or an owner-issued pass. Confirm its citations, then reopen the report and check that the analysis was saved. The owner can manage the sponsored key and passes in `/admin` after email verification.

The local integration test on 26 October 2026 (America/New_York; `2026-10-27T02:08:18Z`) succeeded with Microsoft FY2022–FY2026, seven analysis insights and five verified sources using `gpt-6-astra`. Report and AI output were saved and reopened. Provider usage was 22,226 input tokens plus 2,039 output tokens, or 24,265 total. This is a local test result, **not confirmation that the hosted deployment or its email provider has passed**.

OpenAI API billing is [separate from ChatGPT subscriptions](https://help.openai.com/en/articles/9039756-managing-billing-for-chatgpt-and-the-api-platform). Credits are a money balance, not a fixed token bundle; model input, output and web-search charges affect cost. Check the [API billing overview](https://platform.openai.com/settings/organization/billing/overview) after your test. No further purchase or automatic reload is needed just to follow these instructions.

## 4. Guest mode and optional sponsored AI

For financial reports without email or AI, visitors can select **Continue as guest** on the welcome screen. This opens an isolated 24-hour session with three report credits in the current browser. Guest reports can be reopened and exported; they are not automatically imported into an account. Guests cannot use AI, configure keys, redeem passes or schedule daily reports. This entry does not require a working email provider.

### Sponsored AI for a registered visitor

Verify real email delivery and the hosted account flow first. The intended visitor entry is the public website with application email login; this is separate from an AI pass. Check the actual hosting access policy before sharing the link, and do not restore an outer platform login unintentionally.

In `/admin`, create a labelled pass with **one claim** for an individual guest. Copy the code immediately; it is shown once. The default allowance is 100,000 metered tokens and 5 AI requests for 24 hours starting when redeemed. Limits can be changed in the owner console. The token reservation caveat and provider costs are explained in `AI-ACCESS.md`.

Give the visitor the website URL and their pass code. They register, verify their email, open **AI access**, and redeem the code. This uses a verified account, not the no-email guest session. Their financial reports and saved data belong to their own account. Revoking a pass prevents new sponsored AI calls. After expiry, other tools remain available; users may also connect their own API billing account.

## 5. Financial coverage and daily reports

Direct Microsoft statements work without a paid financial-data account. Other companies require a suitable FMP plan or compliant SEC deployment access. Configure the provider and validate several requested tickers before promising broad coverage. Company data entitlements differ from OpenAI billing.

Daily report schedules additionally require the external runner described in Operations. Saving a time does not itself start a background scheduler.

## 6. Maintenance

Give maintainers the GitHub repository, `MAINTENANCE.md` and `docs/HANDOFF.md`. Give deployment access through the hosting platform, never by committing credentials. Keep encrypted-vault and authentication secrets stable during updates.
