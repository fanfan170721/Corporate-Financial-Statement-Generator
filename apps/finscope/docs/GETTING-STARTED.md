# Owner setup and guest access

The source and UI are ready for configuration, but accounts cannot receive real emails and sponsored AI cannot make paid calls until the corresponding services are connected. Keep the site private until the end-to-end hosted checks succeed.

## 1. Email and your owner account

Buy a domain you control. Create a Resend account and [verify a sending domain](https://resend.com/docs/dashboard/domains/introduction) using the DNS records shown in its dashboard. A subdomain such as `accounts.your-domain.example` keeps transactional email separate.

Create a sending API key and configure server secrets `RESEND_API_KEY` and `AUTH_EMAIL_FROM`, for example `Finscope <hello@accounts.your-domain.example>`. Keep the existing `AUTH_SECRET` stable. Ensure `ADMIN_EMAIL` is your email address. Never enable local test-mail flags in production.

Register using that email, receive and enter the verification code, then check sign-out/sign-in and password reset. `/admin` becomes available only to the configured verified owner. If preserving an older Sites account, follow the proof-based linking instructions in Operations before registration.

## 2. Fund API use

OpenAI API billing is [separate from ChatGPT subscriptions](https://help.openai.com/en/articles/9039756-managing-billing-for-chatgpt-and-the-api-platform).

1. Open the [API billing overview](https://platform.openai.com/settings/organization/billing/overview) and add payment details.
2. Start with a small credit purchase for validation. As checked on 27 October 2026, the minimum is US$5. Review **Use auto-reload**, which is enabled by default; turn it off unless intentional.
3. Create a dedicated Finscope API project, configure available spending controls, and create a project API key in [API Keys](https://platform.openai.com/api-keys).
4. Sign into Finscope as owner, open `/admin`, and save that key under **Sponsored AI & access passes**. Do not send the provider key to guests or put it in Git/chat.
5. Generate a real financial report and run one AI explanation. Check the response's citations and the API project's actual usage before distributing passes.

Credits are a money balance, not a fixed token bundle; model input, output and web-search charges affect cost. Official prepaid credits currently expire after one year. A prepaid balance is not an instantaneous spending cutoff, because accounting may be delayed. See [prepaid billing](https://help.openai.com/en/articles/8264644-setting-up-and-managing-prepaid-api-billing) and check the current dashboard before purchasing.

## 3. Give a guest access

Connect and verify email first. Decide the hosting audience explicitly: the current deployment is owner-private, so a link alone does not admit visitors. Use supported external invitations or approve public hosting with application login; this is separate from an AI pass.

In `/admin`, create a labelled pass with **one claim** for an individual guest. Copy the code immediately; it is shown once. The default allowance is 100,000 metered tokens and 5 AI requests for 24 hours starting when redeemed. Limits can be changed in the owner console. The token reservation caveat and provider costs are explained in `AI-ACCESS.md`.

Give the guest the website URL and their pass code. They register, verify their email, open **AI access**, and redeem the code. Their financial reports and saved data belong to their own account. Revoking a pass prevents new sponsored AI calls. After expiry, other tools remain available; users may also connect their own API billing account.

## 4. Financial coverage and daily reports

Direct Microsoft statements work without a paid financial-data account. Other companies require a suitable FMP plan or compliant SEC deployment access. Configure the provider and validate several requested tickers before promising broad coverage. Company data entitlements differ from OpenAI billing.

Daily report schedules additionally require the external runner described in Operations. Saving a time does not itself start a background scheduler.

## 5. Maintenance

Give future developers the GitHub repository and `docs/HANDOFF.md`. `CLAUDE.md` provides a direct starting point for Claude. Give deployment access through the hosting platform, never by committing credentials. Keep encrypted-vault and authentication secrets stable during updates.
