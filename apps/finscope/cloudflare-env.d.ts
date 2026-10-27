declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    OPENAI_API_KEY?: string;
    OPENAI_MODEL?: string;
    FMP_API_KEY?: string;
    SEC_USER_AGENT?: string;
    ADMIN_USER_ID?: string;
    ADMIN_EMAIL?: string;
    AUTH_SECRET?: string;
    RESEND_API_KEY?: string;
    AUTH_EMAIL_FROM?: string;
    AUTH_ALLOW_LOCAL_HTTP?: string;
    AUTH_EMAIL_TEST_MODE?: string;
    AUTH_TRUST_SITES_IDENTITY?: string;
    CRON_SECRET?: string;
    SCHEDULER_ENABLED?: string;
    CREDENTIAL_ENCRYPTION_KEY?: string;
  }
}
