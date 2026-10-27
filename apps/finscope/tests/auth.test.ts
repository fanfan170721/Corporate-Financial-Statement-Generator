import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { AuthEnvironment } from "../lib/auth-core";

type AuthModule = typeof import("../lib/auth-core") & typeof import("../lib/auth-crypto");
const token = `authFixture${crypto.randomUUID().replaceAll("-", "")}`;
const store = globalThis as unknown as Record<string, unknown>;
store[token] = z;
const combined = ["auth-crypto.ts", "auth-core.ts"].map((file) => readFileSync(new URL(`../lib/${file}`, import.meta.url), "utf8").replace(/^import .*;\r?\n/gm, "")).join("\n");
const compiled = `const z=globalThis[${JSON.stringify(token)}];\n${stripTypeScriptTypes(combined, { mode: "transform" })}`;
const authModule = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`) as AuthModule;
delete store[token];

function fixture() {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys=ON");
  for (const name of readdirSync(new URL("../drizzle/", import.meta.url)).filter((name) => name.endsWith(".sql")).sort()) sql.exec(readFileSync(new URL(`../drizzle/${name}`, import.meta.url), "utf8"));
  function statement(query: string, params: unknown[] = []) {
    const bindings = params as (string | number | null)[];
    return { bind: (...values: unknown[]) => statement(query, values), first: async () => sql.prepare(query).get(...bindings) ?? null, all: async () => ({ results: sql.prepare(query).all(...bindings) }), run: async () => sql.prepare(query).run(...bindings) };
  }
  const db = { prepare: statement, batch: async (statements: ReturnType<typeof statement>[]) => {
    sql.exec("BEGIN");
    try { const results = []; for (const statement of statements) results.push(await statement.run()); sql.exec("COMMIT"); return results; }
    catch (error) { sql.exec("ROLLBACK"); throw error; }
  } } as unknown as D1Database;
  const env: AuthEnvironment = { DB: db, AUTH_SECRET: "test-pepper-".repeat(5), RESEND_API_KEY: "test-mail-key", AUTH_EMAIL_FROM: "Finscope <test@example.test>" };
  let timestamp = Date.parse("2026-10-26T12:00:00.000Z");
  let mailFailureStatus = 0;
  let legacy: { userId: string; email: string } | null = null;
  const mail: { from: string; to: string[]; text: string; subject: string }[] = [];
  const auth = authModule.createAuth({ env, now: () => timestamp, legacyIdentity: async () => legacy, fetcher: (async (url: string, init: RequestInit) => {
    assert.equal(url, "https://api.resend.com/emails");
    assert.equal(new Headers(init.headers).get("Authorization"), "Bearer test-mail-key");
    assert.ok(new Headers(init.headers).get("Idempotency-Key"));
    assert.equal(init.redirect, "manual", "Use a Workers-supported mode and never follow credential-bearing redirects.");
    if (mailFailureStatus) return Response.json({ message: "secret provider detail" }, { status: mailFailureStatus });
    mail.push(JSON.parse(String(init.body)));
    return Response.json({ id: crypto.randomUUID() });
  }) as typeof fetch });
  const request = (action: string, value?: unknown, extra: { cookie?: string; method?: string; origin?: string; base?: string; ip?: string } = {}) => {
    const base = extra.base || "https://finscope.test";
    return new Request(`${base}/api/auth/${action}`, { method: extra.method || "POST", headers: { "Content-Type": "application/json", Origin: extra.origin || base, "CF-Connecting-IP": extra.ip || "127.0.0.2", ...(extra.cookie ? { Cookie: extra.cookie } : {}) }, ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
  };
  const call = (action: string, value?: unknown, extra?: Parameters<typeof request>[2]) => auth.handler(request(action, value, extra), action);
  const code = () => mail.at(-1)?.text.match(/code is (\d{6})/)?.[1] || "";
  async function register(email = "alice@example.test") {
    const registration = await call("register", { name: "Alice", email, password: "correct horse battery" });
    assert.equal(registration.status, 202);
    const body = await registration.json() as { challengeId: string };
    return { email, challengeId: body.challengeId, code: code() };
  }
  async function verified(email = "alice@example.test") {
    const input = await register(email);
    const result = await call("verify-email", input);
    assert.equal(result.status, 200, JSON.stringify(await result.clone().json()));
    return { ...input, cookie: result.headers.get("set-cookie")!.split(";")[0], user: (await result.json() as { user: { id: string } }).user };
  }
  return { sql, env, mail, auth, request, call, code, register, verified, advance: (ms: number) => { timestamp += ms; }, setLegacy: (value: typeof legacy) => { legacy = value; }, failMail: (status = 401) => { mailFailureStatus = status; }, close: () => sql.close() };
}

test("registration verifies real provider acknowledgement and only then creates an account/session", async () => {
  const f = fixture();
  try {
    const input = await f.register("Alice@EXAMPLE.test");
    assert.equal(f.mail[0].to[0], "alice@example.test");
    assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM auth_accounts").get()!.n, 0);
    const challenge = f.sql.prepare("SELECT * FROM auth_challenges").get()!;
    assert.notEqual(challenge.code_hash, input.code);
    assert.ok(!String(challenge.payload).includes("correct horse battery"));
    const verify = await f.call("verify-email", { ...input, returnTo: "//evil.test" });
    assert.equal(verify.status, 200);
    assert.equal((await verify.clone().json() as { redirectTo: string }).redirectTo, "/workspace");
    const cookie = verify.headers.get("set-cookie")!;
    assert.match(cookie, /^__Host-finscope_session=[a-f0-9]{64};/);
    for (const option of ["HttpOnly", "Secure", "SameSite=Lax", "Path=/"]) assert.ok(cookie.includes(option));
    const user = await f.auth.getUser(f.request("session", undefined, { cookie: cookie.split(";")[0] }));
    assert.equal(user?.email, "alice@example.test");
    const session = f.sql.prepare("SELECT token_hash FROM auth_sessions").get()!;
    assert.ok(!cookie.includes(String(session.token_hash)));
    assert.equal((await f.call("verify-email", input)).status, 400);
  } finally { f.close(); }
});

test("missing and rejected mail service never claim success or verify accounts", async () => {
  const f = fixture();
  try {
    delete f.env.RESEND_API_KEY;
    const missing = await f.call("register", { name: "Alice", email: "alice@example.test", password: "correct horse battery" });
    assert.equal(missing.status, 503);
    assert.match(await missing.text(), /No email was sent/);
    assert.equal(f.mail.length, 0);
    f.env.RESEND_API_KEY = "test-mail-key";
    f.failMail();
    const failed = await f.call("register", { name: "Alice", email: "alice@example.test", password: "correct horse battery" });
    assert.equal(failed.status, 503);
    assert.ok(!(await failed.text()).includes("secret provider detail"));
    assert.equal(f.sql.prepare("SELECT delivery FROM auth_challenges").get()!.delivery, "failed");
    assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM auth_accounts").get()!.n, 0);
  } finally { f.close(); }
});

test("mail redirects are rejected without following or claiming delivery", async () => {
  const f = fixture();
  try {
    f.failMail(307);
    const result = await f.call("register", { name: "Alice", email: "alice@example.test", password: "correct horse battery" });
    assert.equal(result.status, 503);
    assert.equal((await result.json() as { code: string }).code, "EMAIL_DELIVERY_FAILED");
    assert.equal(f.mail.length, 0);
    assert.equal(f.sql.prepare("SELECT delivery FROM auth_challenges").get()!.delivery, "failed");
  } finally { f.close(); }
});

test("code attempts, expiry, purpose binding, resend cooldown, and old-code invalidation are enforced", async () => {
  const f = fixture();
  try {
    const input = await f.register();
    assert.equal((await f.call("resend-verification", { email: input.email, challengeId: input.challengeId })).status, 429);
    for (let i = 0; i < 5; i++) assert.equal((await f.call("verify-email", { ...input, code: input.code === "000000" ? "111111" : "000000" })).status, 400);
    assert.equal((await f.call("verify-email", input)).status, 400);
    f.advance(61_000);
    const resend = await f.call("resend-verification", { email: input.email, challengeId: input.challengeId });
    assert.equal(resend.status, 202);
    const next = { email: input.email, challengeId: (await resend.json() as { challengeId: string }).challengeId, code: f.code() };
    assert.equal((await f.call("verify-email", input)).status, 400);
    assert.equal((await f.call("reset-password", { ...next, password: "another safe password" })).status, 400);
    f.advance(601_000);
    assert.equal((await f.call("verify-email", next)).status, 400);
  } finally { f.close(); }
});

test("unknown and wrong-password login responses match; repeated guesses are throttled", async () => {
  const f = fixture();
  try {
    await f.verified();
    const known = await f.call("login", { email: "alice@example.test", password: "wrong password" });
    const unknown = await f.call("login", { email: "missing@example.test", password: "wrong password" });
    assert.equal(known.status, 401);
    assert.deepEqual(await known.json(), await unknown.json());
    for (let i = 1; i < 10; i++) assert.equal((await f.call("login", { email: "alice@example.test", password: "bad" })).status, 401);
    const limited = await f.call("login", { email: "alice@example.test", password: "correct horse battery" });
    assert.equal(limited.status, 429);
    assert.ok(limited.headers.get("Retry-After"));
  } finally { f.close(); }
});

test("password reset invalidates every device, old password, and replayed code", async () => {
  const f = fixture();
  try {
    const first = await f.verified();
    const login = await f.call("login", { email: first.email, password: "correct horse battery", rememberMe: true });
    const secondCookie = login.headers.get("set-cookie")!.split(";")[0];
    assert.ok(login.headers.get("set-cookie")!.includes("Max-Age=2592000"));
    f.advance(61_000);
    const reset = await f.call("forgot-password", { email: first.email });
    const challengeId = (await reset.json() as { challengeId: string }).challengeId;
    const input = { email: first.email, challengeId, code: f.code(), password: "a better fresh password" };
    assert.equal((await f.call("reset-password", input)).status, 200);
    for (const cookie of [first.cookie, secondCookie]) assert.equal(await f.auth.getUser(f.request("session", undefined, { cookie })), null);
    assert.equal((await f.call("reset-password", input)).status, 400);
    assert.equal((await f.call("login", { email: first.email, password: "correct horse battery" })).status, 401);
    assert.equal((await f.call("login", { email: first.email, password: input.password })).status, 200);
  } finally { f.close(); }
});

test("logout revokes the current token while logout-all revokes other devices", async () => {
  const f = fixture();
  try {
    const first = await f.verified();
    const login = await f.call("login", { email: first.email, password: "correct horse battery" });
    const secondCookie = login.headers.get("set-cookie")!.split(";")[0];
    const listed = await f.call("sessions", undefined, { method: "GET", cookie: first.cookie });
    const data = await listed.json() as { sessions: { current: boolean; token_hash?: string }[] };
    assert.equal(data.sessions.length, 2);
    assert.equal(data.sessions.filter((session) => session.current).length, 1);
    assert.ok(!JSON.stringify(data).includes("token_hash"));
    assert.equal((await f.call("logout", undefined, { cookie: first.cookie })).status, 200);
    assert.equal(await f.auth.getUser(f.request("session", undefined, { cookie: first.cookie })), null);
    assert.ok(await f.auth.getUser(f.request("session", undefined, { cookie: secondCookie })));
    assert.equal((await f.call("logout-all", undefined, { cookie: secondCookie })).status, 200);
    assert.equal(await f.auth.getUser(f.request("session", undefined, { cookie: secondCookie })), null);
  } finally { f.close(); }
});

test("CSRF, insecure transport, weak passwords, and oversized bodies fail before email", async () => {
  const f = fixture();
  try {
    const data = { name: "Alice", email: "alice@example.test", password: "correct horse battery" };
    assert.equal((await f.call("register", data, { origin: "https://attacker.test" })).status, 403);
    assert.equal((await f.call("register", data, { base: "http://finscope.test" })).status, 400);
    assert.equal((await f.call("register", { ...data, password: "short" })).status, 400);
    assert.equal((await f.call("register", { ...data, name: "x".repeat(5000) })).status, 413);
    assert.equal(f.mail.length, 0);
    assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM auth_accounts").get()!.n, 0);
  } finally { f.close(); }
});

test("only a matching trusted legacy identity plus independent verification preserves the old profile", async () => {
  const f = fixture();
  try {
    f.sql.prepare("INSERT INTO profiles VALUES (?,?,?,?,?,?)").run("legacy-owner", "Old name", "alice@example.test", '{"theme":"dark"}', "old", "old");
    f.sql.prepare("INSERT INTO favorites VALUES (?,?,?)").run("legacy-owner", "MSFT", "old");
    f.env.AUTH_TRUST_SITES_IDENTITY = "true";
    f.setLegacy({ userId: "legacy-owner", email: "alice@example.test" });
    const owner = await f.verified();
    assert.equal(owner.user.id, "legacy-owner");
    assert.equal(f.sql.prepare("SELECT preferences FROM profiles WHERE user_id='legacy-owner'").get()!.preferences, '{"theme":"dark"}');
    assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM favorites WHERE user_id='legacy-owner'").get()!.n, 1);
  } finally { f.close(); }
});

test("matching email alone does not claim legacy data and gateway headers never authenticate", async () => {
  const f = fixture();
  try {
    f.sql.prepare("INSERT INTO profiles VALUES (?,?,?,?,?,?)").run("legacy-owner", "Old", "alice@example.test", "{}", "old", "old");
    f.setLegacy({ userId: "legacy-owner", email: "alice@example.test" });
    const user = await f.verified();
    assert.notEqual(user.user.id, "legacy-owner");
    const req = f.request("session");
    req.headers.set("oai-authenticated-user-id", "legacy-owner");
    req.headers.set("oai-authenticated-user-email", "alice@example.test");
    assert.equal(await f.auth.getUser(req), null);
  } finally { f.close(); }
});

test("local outbox needs both explicit flags and loopback and never activates for a hosted URL", async () => {
  const f = fixture();
  try {
    delete f.env.RESEND_API_KEY;
    f.env.AUTH_EMAIL_TEST_MODE = "true";
    assert.equal((await f.call("dev-outbox", undefined, { method: "GET", base: "http://127.0.0.1:5173" })).status, 404);
    f.env.AUTH_ALLOW_LOCAL_HTTP = "true";
    assert.equal((await f.call("dev-outbox", undefined, { method: "GET" })).status, 404);
    const local = { base: "http://127.0.0.1:5173" };
    const created = await f.call("register", { name: "Local user", email: "local@example.test", password: "correct horse battery" }, local);
    const data = await created.json() as { challengeId: string; deliveryMode: string };
    assert.equal(data.deliveryMode, "local-test");
    assert.equal(f.mail.length, 0);
    const outbox = await f.call("dev-outbox", undefined, { ...local, method: "GET" });
    const messages = (await outbox.json() as { messages: { code: string }[] }).messages;
    const verified = await f.call("verify-email", { email: "local@example.test", challengeId: data.challengeId, code: messages[0].code }, local);
    assert.equal(verified.status, 200);
    assert.match(verified.headers.get("set-cookie")!, /^finscope_dev_session=/);
    const hosted = await f.call("register", { name: "Hosted user", email: "hosted@example.test", password: "correct horse battery" });
    assert.equal(hosted.status, 503);
  } finally { f.close(); }
});

test("sessions expire and duplicate cookie tokens are rejected", async () => {
  const f = fixture();
  try {
    const user = await f.verified();
    assert.equal(await f.auth.getUser(f.request("session", undefined, { cookie: `${user.cookie}; ${user.cookie}` })), null);
    f.advance(86_400_001);
    assert.equal(await f.auth.getUser(f.request("session", undefined, { cookie: user.cookie })), null);
  } finally { f.close(); }
});

test("password salts differ, pepper is required, and return URLs stay within application routes", async () => {
  const password = "correct horse battery";
  const first = await authModule.hashPassword(password, "a".repeat(32));
  const second = await authModule.hashPassword(password, "a".repeat(32));
  assert.notEqual(first, second);
  assert.equal(await authModule.verifyPassword(password, first, "a".repeat(32)), true);
  assert.equal(await authModule.verifyPassword(password, first, "b".repeat(32)), false);
  for (const path of ["https://evil.test", "//evil.test", "/\\evil.test", "/api/auth/logout", "/signin-with-chatgpt", "\n/evil"]) assert.equal(authModule.safeReturnTo(path), "/workspace");
  assert.equal(authModule.safeReturnTo("/memos?id=123#section"), "/memos?id=123#section");
});
