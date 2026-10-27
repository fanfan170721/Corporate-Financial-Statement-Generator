import { z } from "zod";
import { digest, equalHash, hashPassword, hmac, randomHex, verificationCode, verifyPassword } from "./auth-crypto";
import type { MailCredentials } from "./mail-config";

export type AuthUser = { userId: string; displayName: string; email: string; emailVerified: true };
export type AuthEnvironment = { DB?: D1Database; AUTH_SECRET?: string; RESEND_API_KEY?: string; AUTH_EMAIL_FROM?: string; AUTH_ALLOW_LOCAL_HTTP?: string; AUTH_EMAIL_TEST_MODE?: string; AUTH_TRUST_SITES_IDENTITY?: string };
type LegacyIdentity = { userId: string; email: string } | null;
type Account = { user_id: string; email: string; password_hash: string; password_version: number; name: string };
type Challenge = { id: string; email: string; purpose: string; code_hash: string; payload: string; attempts: number; expires_at: number; consumed_at: number | null; delivery: string; created_at: number };
type ChallengePayload = { name?: string; passwordHash?: string; legacyId?: string; userId?: string; passwordVersion?: number };
const CHALLENGE_TTL = 10 * 60_000;
const DAY = 86_400_000;
const emailSchema = z.string().trim().max(254).email().transform((value) => value.toLowerCase());
const passwordSchema = z.string().min(12, "Use at least 12 characters.").max(128, "Use no more than 128 characters.");
const challengeSchema = z.object({ email: emailSchema, challengeId: z.string().uuid(), code: z.string().regex(/^\d{6}$/) });
const defaultPreferences = JSON.stringify({ theme: "light", interests: [], defaultMode: "live", reducedMotion: false });
const genericDelivery = "If this request is eligible, an email has been queued. Check your inbox and spam folder.";

class AuthError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly retryAfter?: number) { super(message); }
}

export function safeReturnTo(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f]/.test(value)) return "/workspace";
  try {
    const url = new URL(value, "https://finscope.invalid");
    if (url.origin !== "https://finscope.invalid" || /^\/(?:api|signin-with-chatgpt|signout-with-chatgpt|callback)(?:\/|$)/.test(url.pathname)) return "/workspace";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return "/workspace"; }
}

function response(value: unknown, status = 200, extra?: HeadersInit): Response {
  const headers = new Headers({ "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
  if (extra) new Headers(extra).forEach((value, key) => headers.set(key, value));
  return Response.json(value, { status, headers });
}

export function createAuth(options: { env: AuthEnvironment; fetcher?: typeof fetch; now?: () => number; legacyIdentity?: () => Promise<LegacyIdentity>; resolveMail?: () => Promise<MailCredentials | null> }) {
  const { env } = options;
  const fetcher = options.fetcher || fetch;
  const now = options.now || Date.now;
  const localOutbox: { email: string; purpose: string; code: string | null; createdAt: number }[] = [];
  function db(): D1Database {
    if (!env.DB) throw new AuthError(503, "AUTH_STORAGE_UNAVAILABLE", "Account storage is temporarily unavailable.");
    return env.DB;
  }
  function secret(): string {
    if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32) throw new AuthError(503, "AUTH_NOT_CONFIGURED", "Account security is not configured yet. Please contact the site administrator.");
    return env.AUTH_SECRET;
  }
  async function mailCredentials(): Promise<MailCredentials | null> {
    if (options.resolveMail) return options.resolveMail();
    return env.RESEND_API_KEY?.trim() && env.AUTH_EMAIL_FROM?.trim() ? { apiKey: env.RESEND_API_KEY.trim(), from: env.AUTH_EMAIL_FROM.trim() } : null;
  }
  async function emailReady(): Promise<boolean> {
    if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32) return false;
    try { return Boolean(await mailCredentials()); } catch { return false; }
  }
  function testEmail(request: Request): boolean { return env.AUTH_EMAIL_TEST_MODE === "true" && localHttp(new URL(request.url)); }
  async function requireEmail(request: Request): Promise<void> {
    secret();
    if (!testEmail(request) && !await emailReady()) throw new AuthError(503, "EMAIL_NOT_CONFIGURED", "Email verification is not available yet. No email was sent. Please contact the site administrator.");
  }
  function localHttp(url: URL): boolean { return env.AUTH_ALLOW_LOCAL_HTTP === "true" && url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname); }
  function cookieName(url: URL): string { return localHttp(url) ? "finscope_dev_session" : "__Host-finscope_session"; }
  function cookie(url: URL, token: string, maxAge?: number): string {
    if (url.protocol !== "https:" && !localHttp(url)) throw new AuthError(400, "HTTPS_REQUIRED", "Secure HTTPS is required to sign in.");
    return `${cookieName(url)}=${token}; Path=/; HttpOnly; SameSite=Lax${localHttp(url) ? "" : "; Secure"}${maxAge === undefined ? "" : `; Max-Age=${maxAge}`}`;
  }
  function cookieToken(request: Request): string | null {
    const name = cookieName(new URL(request.url));
    const matches = (request.headers.get("Cookie") || "").split(";").map((part) => part.trim()).filter((part) => part.startsWith(`${name}=`));
    if (matches.length !== 1) return null;
    const value = matches[0].slice(name.length + 1);
    return /^[a-f0-9]{64}$/.test(value) ? value : null;
  }
  function mutation(request: Request): void {
    const url = new URL(request.url);
    if (url.protocol !== "https:" && !localHttp(url)) throw new AuthError(400, "HTTPS_REQUIRED", "Secure HTTPS is required for account requests.");
    const site = request.headers.get("Sec-Fetch-Site");
    if (request.headers.get("Origin") !== url.origin || (site && site !== "same-origin" && site !== "none")) throw new AuthError(403, "ORIGIN_REJECTED", "Submit this request from Finscope.");
  }
  async function parse<T extends z.ZodTypeAny>(request: Request, schema: T): Promise<z.infer<T>> {
    if (!request.headers.get("Content-Type")?.toLowerCase().includes("application/json")) throw new AuthError(415, "JSON_REQUIRED", "A JSON request is required.");
    if (Number(request.headers.get("Content-Length") || 0) > 4096) throw new AuthError(413, "BODY_TOO_LARGE", "This account request is too large.");
    const reader = request.body?.getReader();
    if (!reader) throw new AuthError(400, "INVALID_JSON", "The request body could not be read.");
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        length += next.value.byteLength;
        if (length > 4096) { await reader.cancel(); throw new AuthError(413, "BODY_TOO_LARGE", "This account request is too large."); }
        chunks.push(next.value);
      }
    } finally { reader.releaseLock(); }
    const joined = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
    let data: unknown;
    try { data = JSON.parse(new TextDecoder().decode(joined)); } catch { throw new AuthError(400, "INVALID_JSON", "The request body could not be read."); }
    return schema.parse(data);
  }
  async function limit(scope: string, value: string, maximum: number, windowMs: number): Promise<void> {
    const time = now();
    const window = Math.floor(time / windowMs);
    const key = await hmac(`rate:${scope}:${value}:${window}`, secret());
    const expires = (window + 1) * windowMs;
    const admitted = await db().prepare(`INSERT INTO auth_rate_limits (key,count,expires_at) VALUES (?,1,?)
      ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<? RETURNING count`).bind(key, expires, maximum).first();
    if (!admitted) throw new AuthError(429, "AUTH_RATE_LIMIT", "Too many attempts. Please wait before trying again.", Math.max(1, Math.ceil((expires - time) / 1000)));
  }
  function ip(request: Request): string { return request.headers.get("CF-Connecting-IP") || "unknown-client"; }
  async function mailLimits(request: Request, email: string): Promise<void> {
    await limit("mail-global", "all", 120, 3_600_000);
    await limit("mail-ip", ip(request), 20, 3_600_000);
    await limit("mail-email", email, 5, 3_600_000);
    // Sliding cooldown is separate from fixed-window counters.
    const key = await hmac(`mail-cooldown:${email}`, secret());
    const admitted = await db().prepare(`INSERT INTO auth_rate_limits (key,count,expires_at) VALUES (?,1,?)
      ON CONFLICT(key) DO UPDATE SET expires_at=excluded.expires_at WHERE expires_at<=? RETURNING key`).bind(key, now() + 60_000, now()).first();
    if (!admitted) throw new AuthError(429, "RESEND_COOLDOWN", "Wait 60 seconds before requesting another email.", 60);
  }
  async function findAccount(email: string): Promise<Account | null> {
    return db().prepare("SELECT a.*,p.name FROM auth_accounts a JOIN profiles p ON p.user_id=a.user_id WHERE a.email=?").bind(email).first<Account>();
  }
  function publicUser(account: Account): AuthUser { return { userId: account.user_id, displayName: account.name, email: account.email, emailVerified: true }; }
  function userPayload(user: AuthUser) { return { id: user.userId, name: user.displayName, email: user.email }; }
  async function sendEmail(email: string, purpose: "register" | "reset", id: string, code: string | null): Promise<void> {
    const action = purpose === "register" ? "verify your email" : "reset your password";
    const text = code ? `Your Finscope code is ${code}.\n\nUse it to ${action}. It expires in 10 minutes. Never share this code. If you did not request it, ignore this email.`
      : purpose === "register" ? "This email address already has a Finscope account. Sign in or request a password reset. If you did not request this email, you can ignore it."
        : "A Finscope password reset was requested for this address, but no verified account is available. You can create an account from the registration page. If you did not request this email, ignore it.";
    try {
      const sender = await mailCredentials();
      if (!sender) throw new Error("mail not configured");
      // Workers supports manual/follow redirect modes. Manual plus !ok rejects all 3xx
      // without forwarding the API credential to a redirected destination.
      const result = await fetcher("https://api.resend.com/emails", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${sender.apiKey}`, "Idempotency-Key": `finscope-auth/${id}` }, body: JSON.stringify({ from: sender.from, to: [email], subject: code ? `Your Finscope ${purpose === "register" ? "verification" : "password reset"} code` : "Your Finscope account request", text }), signal: AbortSignal.timeout(12_000), redirect: "manual" });
      if (!result.ok) throw new Error("mail rejected");
      const accepted = await result.json() as { id?: unknown };
      if (typeof accepted.id !== "string" || !accepted.id) throw new Error("mail not acknowledged");
    } catch { throw new AuthError(503, "EMAIL_DELIVERY_FAILED", "The email provider could not confirm this message. Please try again later; no verification has been completed."); }
  }
  async function issueChallenge(request: Request, email: string, purpose: "register" | "reset", payload: ChallengePayload | null): Promise<Response> {
    const id = crypto.randomUUID();
    const code = payload ? verificationCode() : null;
    if (code) await db().prepare("INSERT INTO auth_challenges (id,email,purpose,code_hash,payload,attempts,expires_at,delivery,created_at) VALUES (?,?,?,?,?,0,?,'pending',?)").bind(id, email, purpose, await hmac(`code:${id}:${email}:${purpose}:${code}`, secret()), JSON.stringify(payload), now() + CHALLENGE_TTL, now()).run();
    try {
      if (testEmail(request)) {
        localOutbox.push({ email, purpose, code, createdAt: now() });
        if (localOutbox.length > 20) localOutbox.shift();
      } else await sendEmail(email, purpose, id, code);
      if (code) await db().batch([
        db().prepare("UPDATE auth_challenges SET delivery='sent' WHERE id=?").bind(id),
        db().prepare("UPDATE auth_challenges SET consumed_at=? WHERE email=? AND purpose=? AND id<>? AND consumed_at IS NULL").bind(now(), email, purpose, id),
      ]);
    } catch (error) {
      if (code) await db().prepare("UPDATE auth_challenges SET delivery='failed',consumed_at=? WHERE id=?").bind(now(), id).run();
      throw error;
    }
    return response({ message: testEmail(request) ? "Local test mode: no email was sent. Use the development outbox to read the code." : genericDelivery, deliveryMode: testEmail(request) ? "local-test" : "email", challengeId: id, expiresIn: CHALLENGE_TTL / 1000 }, 202);
  }
  async function consumeChallenge(request: Request, input: z.infer<typeof challengeSchema>, purpose: "register" | "reset"): Promise<ChallengePayload> {
    await limit("code-ip", ip(request), 40, 900_000);
    await limit("code-email", input.email, 15, 900_000);
    const row = await db().prepare(`UPDATE auth_challenges SET attempts=attempts+1 WHERE id=? AND email=? AND purpose=?
      AND consumed_at IS NULL AND delivery='sent' AND expires_at>? AND attempts<5 RETURNING *`).bind(input.challengeId, input.email, purpose, now()).first<Challenge>();
    const candidate = await hmac(`code:${input.challengeId}:${input.email}:${purpose}:${input.code}`, secret());
    if (!row || !equalHash(candidate, row.code_hash)) throw new AuthError(400, "INVALID_CODE", "This code is invalid or expired. Request a new code if needed.");
    const consumed = await db().prepare("UPDATE auth_challenges SET consumed_at=? WHERE id=? AND consumed_at IS NULL AND expires_at>? RETURNING id").bind(now(), row.id, now()).first();
    if (!consumed) throw new AuthError(400, "INVALID_CODE", "This code is invalid or expired. Request a new code if needed.");
    return JSON.parse(row.payload) as ChallengePayload;
  }
  async function sessionResponse(request: Request, account: Account, remember: boolean, returnTo?: string): Promise<Response> {
    const token = randomHex();
    const lifetime = remember ? 30 * DAY : DAY;
    // Validate cookie transport before creating durable state.
    const setCookie = cookie(new URL(request.url), token, remember ? lifetime / 1000 : undefined);
    const old = cookieToken(request);
    const statements = [db().prepare("INSERT INTO auth_sessions (id,token_hash,user_id,password_version,expires_at,created_at) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(), await digest(token), account.user_id, account.password_version, now() + lifetime, now())];
    if (old) statements.push(db().prepare("DELETE FROM auth_sessions WHERE token_hash=?").bind(await digest(old)));
    statements.push(db().prepare("DELETE FROM auth_sessions WHERE user_id=? AND (expires_at<=? OR id IN (SELECT id FROM auth_sessions WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT -1 OFFSET 10))").bind(account.user_id, now(), account.user_id));
    await db().batch(statements);
    return response({ user: userPayload(publicUser(account)), redirectTo: safeReturnTo(returnTo) }, 200, { "Set-Cookie": setCookie });
  }
  async function getUser(request: Request): Promise<AuthUser | null> {
    const token = cookieToken(request);
    if (!token || !env.DB || !env.AUTH_SECRET || env.AUTH_SECRET.length < 32) return null;
    const account = await db().prepare(`SELECT a.*,p.name FROM auth_sessions s JOIN auth_accounts a ON a.user_id=s.user_id
      JOIN profiles p ON p.user_id=a.user_id WHERE s.token_hash=? AND s.expires_at>? AND s.password_version=a.password_version`).bind(await digest(token), now()).first<Account>();
    return account ? publicUser(account) : null;
  }
  async function handler(request: Request, action: string): Promise<Response> {
    try {
      if (action === "config" && request.method === "GET") return response({ emailDeliveryAvailable: await emailReady() || (testEmail(request) && Boolean(env.AUTH_SECRET && env.AUTH_SECRET.length >= 32)), deliveryMode: testEmail(request) ? "local-test" : "email", password: { minLength: 12, maxLength: 128 }, codeLength: 6, expiresIn: CHALLENGE_TTL / 1000 });
      if (action === "dev-outbox" && request.method === "GET") {
        if (!testEmail(request)) return response({ error: "Not found.", code: "NOT_FOUND" }, 404);
        return response({ mode: "local-test", messages: localOutbox.filter((mail) => mail.createdAt > now() - CHALLENGE_TTL) });
      }
      if (action === "session" && request.method === "GET") { const user = await getUser(request); return response({ user: user ? userPayload(user) : null }); }
      if (action === "sessions" && request.method === "GET") {
        const user = await getUser(request);
        if (!user) throw new AuthError(401, "SIGN_IN_REQUIRED", "Sign in to view your sessions.");
        const current = await digest(cookieToken(request)!);
        const { results } = await db().prepare("SELECT id,token_hash,created_at,expires_at FROM auth_sessions WHERE user_id=? AND expires_at>? ORDER BY created_at DESC").bind(user.userId, now()).all<{ id: string; token_hash: string; created_at: number; expires_at: number }>();
        return response({ sessions: results.map((session) => ({ id: session.id, current: session.token_hash === current, createdAt: new Date(session.created_at).toISOString(), expiresAt: new Date(session.expires_at).toISOString() })) });
      }
      if (request.method !== "POST") throw new AuthError(405, "METHOD_NOT_ALLOWED", "This method is not supported.");
      mutation(request);
      if (action === "logout" || action === "logout-all") {
        const token = cookieToken(request);
        if (token && env.DB) {
          if (action === "logout-all") { const user = await getUser(request); if (user) await db().prepare("DELETE FROM auth_sessions WHERE user_id=?").bind(user.userId).run(); }
          else await db().prepare("DELETE FROM auth_sessions WHERE token_hash=?").bind(await digest(token)).run();
        }
        return response({ ok: true }, 200, { "Set-Cookie": cookie(new URL(request.url), "", 0) });
      }
      secret();
      if (action === "register") {
        const input = await parse(request, z.object({ name: z.string().trim().min(1).max(80), email: emailSchema, password: passwordSchema }).strict());
        await requireEmail(request);
        await mailLimits(request, input.email);
        const passwordHash = await hashPassword(input.password, secret());
        const existing = await findAccount(input.email);
        let legacyId: string | undefined;
        if (!existing && env.AUTH_TRUST_SITES_IDENTITY === "true" && options.legacyIdentity) {
          const legacy = await options.legacyIdentity();
          if (legacy && legacy.email.trim().toLowerCase() === input.email) {
            const profile = await db().prepare("SELECT user_id FROM profiles WHERE user_id=? AND lower(email)=? AND NOT EXISTS(SELECT 1 FROM auth_accounts WHERE user_id=?)").bind(legacy.userId, input.email, legacy.userId).first();
            if (profile) legacyId = legacy.userId;
          }
        }
        return await issueChallenge(request, input.email, "register", existing ? null : { name: input.name, passwordHash, legacyId });
      }
      if (action === "resend-verification") {
        const input = await parse(request, z.object({ email: emailSchema, challengeId: z.string().uuid() }).strict());
        await requireEmail(request);
        await mailLimits(request, input.email);
        const previous = await db().prepare("SELECT payload FROM auth_challenges WHERE id=? AND email=? AND purpose='register' AND created_at>? AND delivery='sent' AND consumed_at IS NULL").bind(input.challengeId, input.email, now() - DAY).first<{ payload: string }>();
        const exists = await findAccount(input.email);
        return await issueChallenge(request, input.email, "register", previous && !exists ? JSON.parse(previous.payload) as ChallengePayload : null);
      }
      if (action === "verify-email") {
        const input = await parse(request, challengeSchema.extend({ returnTo: z.string().max(1000).optional() }).strict());
        const payload = await consumeChallenge(request, input, "register");
        if (!payload.passwordHash || !payload.name) throw new AuthError(400, "INVALID_CODE", "This code is invalid or expired.");
        if (await findAccount(input.email)) throw new AuthError(409, "ACCOUNT_ALREADY_VERIFIED", "This email is already verified. Sign in or reset your password.");
        const userId = payload.legacyId || crypto.randomUUID();
        const stamp = new Date(now()).toISOString();
        await db().batch([
          db().prepare("INSERT INTO profiles (user_id,name,email,preferences,created_at,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET name=excluded.name,email=excluded.email,updated_at=excluded.updated_at").bind(userId, payload.name, input.email, defaultPreferences, stamp, stamp),
          db().prepare("INSERT INTO auth_accounts (user_id,email,password_hash,verified_at,password_version,created_at,updated_at) VALUES (?,?,?,?,1,?,?)").bind(userId, input.email, payload.passwordHash, now(), now(), now()),
        ]);
        return await sessionResponse(request, (await findAccount(input.email))!, false, input.returnTo);
      }
      if (action === "login") {
        const input = await parse(request, z.object({ email: emailSchema, password: z.string().min(1).max(128), rememberMe: z.boolean().optional(), returnTo: z.string().max(1000).optional() }).strict());
        await limit("login-ip", ip(request), 40, 900_000);
        await limit("login-email", input.email, 10, 900_000);
        const account = await findAccount(input.email);
        if (!await verifyPassword(input.password, account?.password_hash || null, secret()) || !account) throw new AuthError(401, "INVALID_CREDENTIALS", "The email or password is incorrect. Verify your email before signing in.");
        return await sessionResponse(request, account, Boolean(input.rememberMe), input.returnTo);
      }
      if (action === "forgot-password") {
        const input = await parse(request, z.object({ email: emailSchema }).strict());
        await requireEmail(request);
        await mailLimits(request, input.email);
        const account = await findAccount(input.email);
        return await issueChallenge(request, input.email, "reset", account ? { userId: account.user_id, passwordVersion: account.password_version } : null);
      }
      if (action === "reset-password") {
        const input = await parse(request, challengeSchema.extend({ password: passwordSchema }).strict());
        const payload = await consumeChallenge(request, input, "reset");
        const passwordHash = await hashPassword(input.password, secret());
        const updated = await db().prepare("UPDATE auth_accounts SET password_hash=?,password_version=password_version+1,updated_at=? WHERE user_id=? AND email=? AND password_version=? RETURNING user_id").bind(passwordHash, now(), payload.userId || "", input.email, payload.passwordVersion ?? -1).first();
        if (!updated) throw new AuthError(400, "INVALID_CODE", "This code is invalid or expired. Request another reset.");
        await db().batch([
          db().prepare("DELETE FROM auth_sessions WHERE user_id=?").bind(payload.userId!),
          db().prepare("UPDATE auth_challenges SET consumed_at=? WHERE email=? AND consumed_at IS NULL").bind(now(), input.email),
        ]);
        return response({ message: "Your password has been reset and all sessions have been signed out. Sign in with your new password." }, 200, { "Set-Cookie": cookie(new URL(request.url), "", 0) });
      }
      throw new AuthError(404, "AUTH_ROUTE_NOT_FOUND", "This account action was not found.");
    } catch (error) {
      if (error instanceof AuthError) return response({ error: error.message, code: error.code, ...(error.retryAfter ? { retryAfter: error.retryAfter } : {}) }, error.status, error.retryAfter ? { "Retry-After": String(error.retryAfter) } : undefined);
      if (error instanceof z.ZodError) return response({ error: "Please check the account fields and try again. Passwords need 12–128 characters.", code: "INVALID_INPUT", fields: error.issues.map((issue) => issue.path.join(".")) }, 400);
      // Never echo credentials, verification codes, provider response bodies, or raw errors.
      return response({ error: "The account request could not be completed. Please try again shortly.", code: "AUTH_REQUEST_FAILED" }, 503);
    }
  }
  return { handler, getUser };
}
