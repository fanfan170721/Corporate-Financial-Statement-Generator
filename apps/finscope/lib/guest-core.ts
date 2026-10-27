import { digest, hmac, randomHex } from './auth-crypto';

export type GuestEnvironment = { DB?: D1Database; AUTH_SECRET?: string; AUTH_ALLOW_LOCAL_HTTP?: string };
export type GuestActor = { kind: 'guest'; id: string; ipHash: string; expiresAt: number };
type GuestRow = { id: string; ip_hash: string; expires_at: number };
export const GUEST_LIMIT = 3;
const GUEST_IP_LIMIT = 6;
const GUEST_GLOBAL_LIMIT = 200;
const GUEST_DAY = 86_400_000;
const GUEST_LEASE = 600_000;
export class GuestError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

/** Report-only identities. A guest never satisfies the application's verified-user gate. */
export function createGuestService(options: { env: GuestEnvironment; now?: () => number; signedIn?: () => Promise<boolean> }) {
  const { env } = options;
  const now = options.now || Date.now;
  function db() {
    if (!env.DB) throw new GuestError(503, 'GUEST_UNAVAILABLE', 'Guest research is temporarily unavailable.');
    return env.DB;
  }
  function local(url: URL) { return env.AUTH_ALLOW_LOCAL_HTTP === 'true' && url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname); }
  function cookieName(url: URL) { return local(url) ? 'finscope_dev_guest' : '__Host-finscope_guest'; }
  function cookie(url: URL, token: string, age: number) {
    if (url.protocol !== 'https:' && !local(url)) throw new GuestError(400, 'HTTPS_REQUIRED', 'Use secure HTTPS to start guest research.');
    return `${cookieName(url)}=${token}; Path=/; HttpOnly; SameSite=Lax${local(url) ? '' : '; Secure'}; Max-Age=${age}`;
  }
  function token(request: Request): string | null {
    const name = cookieName(new URL(request.url));
    const parts = (request.headers.get('Cookie') || '').split(';').map(value => value.trim()).filter(value => value.startsWith(`${name}=`));
    const value = parts.length === 1 ? parts[0].slice(name.length + 1) : '';
    return /^[a-f0-9]{64}$/.test(value) ? value : null;
  }
  function mutation(request: Request) {
    const url = new URL(request.url);
    if (url.protocol !== 'https:' && !local(url)) throw new GuestError(400, 'HTTPS_REQUIRED', 'Use secure HTTPS to start guest research.');
    const site = request.headers.get('Sec-Fetch-Site');
    if (request.headers.get('Origin') !== url.origin || (site && site !== 'same-origin' && site !== 'none')) throw new GuestError(403, 'ORIGIN_REJECTED', 'Start guest research from Finscope.');
  }
  function respond(value: unknown, status = 200, setCookie?: string) {
    return Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', ...(setCookie ? { 'Set-Cookie': setCookie } : {}) } });
  }
  async function getGuest(request: Request): Promise<GuestActor | null> {
    const value = token(request);
    if (!value || !env.DB) return null;
    const row = await db().prepare('SELECT id,ip_hash,expires_at FROM guest_sessions WHERE token_hash=? AND expires_at>? AND revoked_at IS NULL').bind(await digest(value), now()).first<GuestRow>();
    return row ? { kind: 'guest', id: row.id, ipHash: row.ip_hash, expiresAt: row.expires_at } : null;
  }
  async function usage(guest: GuestActor) {
    const row = await db().prepare("SELECT COALESCE(SUM(units),0) used,COALESCE(SUM(CASE WHEN state='active' AND expires_at>? THEN units ELSE 0 END),0) active FROM guest_report_jobs WHERE session_id=?").bind(now(), guest.id).first<{ used: number; active: number }>();
    return { used: row?.used || 0, active: row?.active || 0, limit: GUEST_LIMIT };
  }
  async function claim(guest: GuestActor, units: number): Promise<string> {
    if (!Number.isInteger(units) || units < 1 || units > GUEST_LIMIT) throw new GuestError(400, 'INVALID_JOB', 'Choose up to three companies.');
    const stamp = now();
    const id = crypto.randomUUID();
    // One atomic admission protects session, shared-network and global budgets,
    // even if cookies are deleted, sessions are revoked, or requests race.
    const accepted = await db().prepare(`INSERT INTO guest_report_jobs(id,session_id,ip_hash,units,state,expires_at,created_at)
      SELECT ?,?,?,?,'active',?,?
      WHERE EXISTS(SELECT 1 FROM guest_sessions WHERE id=? AND expires_at>? AND revoked_at IS NULL)
      AND COALESCE((SELECT SUM(units) FROM guest_report_jobs WHERE session_id=?),0)+?<=?
      AND NOT EXISTS(SELECT 1 FROM guest_report_jobs WHERE session_id=? AND state='active' AND expires_at>?)
      AND COALESCE((SELECT SUM(units) FROM guest_report_jobs WHERE ip_hash=? AND created_at>?),0)+?<=?
      AND COALESCE((SELECT SUM(units) FROM guest_report_jobs WHERE ip_hash=? AND state='active' AND expires_at>?),0)+?<=3
      AND COALESCE((SELECT SUM(units) FROM guest_report_jobs WHERE created_at>?),0)+?<=? RETURNING id`)
      .bind(id, guest.id, guest.ipHash, units, stamp + GUEST_LEASE, stamp, guest.id, stamp, guest.id, units, GUEST_LIMIT,
        guest.id, stamp, guest.ipHash, stamp - GUEST_DAY, units, GUEST_IP_LIMIT, guest.ipHash, stamp, units, stamp - GUEST_DAY, units, GUEST_GLOBAL_LIMIT).first();
    if (!accepted) throw new GuestError(429, 'GUEST_LIMIT', 'Guest research is limited to three reports per session, with shared-network limits. Wait for a running report or sign in for your account allowance.');
    return id;
  }
  async function release(guest: GuestActor, id: string) {
    await db().prepare("UPDATE guest_report_jobs SET state='released' WHERE id=? AND session_id=?").bind(id, guest.id).run();
  }
  function publicGuest(guest: GuestActor) { return { id: guest.id, expiresAt: new Date(guest.expiresAt).toISOString() }; }
  async function pruneExpiredReports() {
    // Remove at most 50 payloads per session action. Keep session/job ledgers:
    // recent jobs from an expired or revoked session still count towards IP limits.
    await db().prepare(`DELETE FROM guest_reports WHERE id IN (
      SELECT r.id FROM guest_reports r JOIN guest_sessions s ON s.id=r.session_id
      WHERE s.expires_at<=? OR s.revoked_at IS NOT NULL LIMIT 50)`).bind(now()).run();
  }
  async function handler(request: Request): Promise<Response> {
    try {
      mutation(request);
      const url = new URL(request.url);
      if (request.method === 'DELETE') {
        const value = token(request);
        if (value && env.DB) await db().prepare('UPDATE guest_sessions SET revoked_at=? WHERE token_hash=? AND revoked_at IS NULL').bind(now(), await digest(value)).run();
        if (env.DB) await pruneExpiredReports();
        return respond({ ok: true }, 200, cookie(url, '', 0));
      }
      if (request.method !== 'POST') throw new GuestError(405, 'METHOD_NOT_ALLOWED', 'This action is not supported.');
      if (await options.signedIn?.()) throw new GuestError(409, 'ALREADY_SIGNED_IN', 'Your account is already signed in. Continue with your account workspace.');
      await pruneExpiredReports();
      const current = await getGuest(request);
      if (current) return respond({ guest: publicGuest(current), usage: await usage(current) });
      if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32) throw new GuestError(503, 'GUEST_UNAVAILABLE', 'Guest research is temporarily unavailable.');
      const stamp = now();
      const rawIp = request.headers.get('CF-Connecting-IP')?.trim() || '';
      const ip = rawIp.length <= 64 && /^[0-9a-f:.]+$/i.test(rawIp) ? rawIp.toLowerCase() : 'unknown-shared-network';
      const ipHash = await hmac(`guest-network:${ip}`, env.AUTH_SECRET);
      const value = randomHex();
      const guest: GuestActor = { kind: 'guest', id: crypto.randomUUID(), ipHash, expiresAt: stamp + GUEST_DAY };
      const accepted = await db().prepare(`INSERT INTO guest_sessions(id,token_hash,ip_hash,expires_at,created_at)
        SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM guest_sessions WHERE ip_hash=? AND created_at>?)<4
        AND (SELECT COUNT(*) FROM guest_sessions WHERE created_at>?)<500 RETURNING id`)
        .bind(guest.id, await digest(value), ipHash, guest.expiresAt, stamp, ipHash, stamp - GUEST_DAY, stamp - GUEST_DAY).first();
      if (!accepted) throw new GuestError(429, 'GUEST_SESSION_LIMIT', 'Guest sessions are temporarily limited on this network. Sign in or try again later.');
      return respond({ guest: publicGuest(guest), usage: { used: 0, active: 0, limit: GUEST_LIMIT } }, 200, cookie(url, value, GUEST_DAY / 1000));
    } catch (error) {
      if (error instanceof GuestError) return respond({ error: error.message, code: error.code }, error.status);
      return respond({ error: 'Guest research is temporarily unavailable. Please try again shortly.', code: 'GUEST_UNAVAILABLE' }, 503);
    }
  }
  return { getGuest, usage, claim, release, publicGuest, handler };
}
