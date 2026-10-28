export type EvidenceCache = {
  get(key: string): Promise<unknown | undefined>;
  set(key: string, value: unknown, ttl: number): Promise<void>;
  reserveSec(deadline?: number): Promise<void>;
  reservePublic?(deadline?: number): Promise<void>;
};

/** Stores only compact normalized public evidence, not large raw XBRL objects. */
export function evidenceStorage(db: D1Database): EvidenceCache {
  return {
    async get(key) {
      const row = await db.prepare('SELECT payload FROM market_evidence_cache WHERE cache_key=? AND expires_at>?').bind(key, Date.now()).first<{ payload: string }>();
      if (!row) return undefined;
      try { return JSON.parse(row.payload); } catch { return undefined; }
    },
    async set(key, value, ttl) {
      await db.prepare('INSERT INTO market_evidence_cache(cache_key,payload,expires_at) VALUES(?,?,?) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,expires_at=excluded.expires_at').bind(key, JSON.stringify(value), Date.now() + ttl).run();
    },
    async reserveSec(deadline = Infinity) {
      // Two requests per second globally, well below SEC's aggregate maximum.
      for (let attempt = 0; attempt < 24; attempt++) {
        const now = Date.now();
        if (now >= deadline) break;
        const row = await db.prepare(`INSERT INTO market_request_limits(bucket,count,expires_at) VALUES('sec-outbound',1,?)
          ON CONFLICT(bucket) DO UPDATE SET count=1,expires_at=excluded.expires_at WHERE market_request_limits.expires_at<=? RETURNING bucket`).bind(now + 500, now).first();
        if (row) return;
        await new Promise(resolve => setTimeout(resolve, Math.min(500, deadline - now)));
      }
      throw new Error('The public filing service is busy.');
    },
    async reservePublic(deadline = Infinity) {
      // Shared across users: a supplement must not create a burst at its source.
      for (let attempt = 0; attempt < 5; attempt++) {
        const now = Date.now();
        if (now >= deadline) break;
        const row = await db.prepare(`INSERT INTO market_request_limits(bucket,count,expires_at) VALUES('public-workforce-outbound',1,?)
          ON CONFLICT(bucket) DO UPDATE SET count=1,expires_at=excluded.expires_at WHERE market_request_limits.expires_at<=? RETURNING bucket`).bind(now + 1000, now).first();
        if (row) return;
        await new Promise(resolve => setTimeout(resolve, Math.min(1000, deadline - now)));
      }
      throw new Error('The supplementary source is busy.');
    },
  };
}

/** A fixed-window IP limit covers guests and anonymous autocomplete as well as accounts. */
export async function admitMarketSearch(db: D1Database, address: string): Promise<boolean> {
  const now = Date.now();
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(address)))).map(b => b.toString(16).padStart(2, '0')).join('');
  const bucket = `search:${hash}:${Math.floor(now / 60_000)}`;
  const row = await db.prepare(`INSERT INTO market_request_limits(bucket,count,expires_at) VALUES(?,1,?)
    ON CONFLICT(bucket) DO UPDATE SET count=count+1 WHERE count<30 RETURNING bucket`).bind(bucket, now + 120_000).first();
  // Bounded cleanup keeps transient anonymous request keys from growing forever.
  await db.prepare('DELETE FROM market_request_limits WHERE bucket IN (SELECT bucket FROM market_request_limits WHERE expires_at<? LIMIT 40)').bind(now - 120_000).run();
  return Boolean(row);
}
