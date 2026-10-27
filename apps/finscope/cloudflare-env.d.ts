declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    OPENAI_API_KEY?: string;
    OPENAI_MODEL?: string;
    FMP_API_KEY?: string;
    SEC_USER_AGENT?: string;
    ADMIN_USER_ID?: string;
    CRON_SECRET?: string;
    SCHEDULER_ENABLED?: string;
  }
}
