-- Shared public evidence cache. Never stores credentials or account records.
CREATE TABLE IF NOT EXISTS market_evidence_cache (
  cache_key TEXT PRIMARY KEY NOT NULL,
  payload TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS market_evidence_expiry ON market_evidence_cache(expires_at);
-- Aggregate admission across Worker instances, rather than per-isolate throttling.
CREATE TABLE IF NOT EXISTS market_request_limits (
  bucket TEXT PRIMARY KEY NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL
);
