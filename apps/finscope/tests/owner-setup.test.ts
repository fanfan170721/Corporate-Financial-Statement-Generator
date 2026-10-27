import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { OwnerSetupEnvironment, OwnerSetupStatus } from "../lib/owner-setup-core";

type OwnerModule = typeof import("../lib/owner-setup-core") & typeof import("../lib/mail-config") & typeof import("../lib/credential-vault");
type AuthModule = typeof import("../lib/auth-core");
async function load(files: string[]) {
  const token = `ownerFixture${crypto.randomUUID().replaceAll("-", "")}`;
  const store = globalThis as unknown as Record<string, unknown>;
  store[token] = z;
  const source = files.map(file => readFileSync(new URL(`../lib/${file}`, import.meta.url), "utf8").replace(/^import .*;\r?\n/gm, "")).join("\n");
  const compiled = `const z=globalThis[${JSON.stringify(token)}];\n${stripTypeScriptTypes(source, { mode: "transform" })}`;
  const result = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
  delete store[token];
  return result;
}
const ownerModule = await load(["credential-vault.ts", "mail-config.ts", "owner-setup-core.ts"]) as OwnerModule;
const authModule = await load(["auth-crypto.ts", "auth-core.ts"]) as AuthModule;
const aiKey = "sk-test-owner-" + "a".repeat(40);
const mailKey = "re_test_sender_" + "b".repeat(35);
const mailInput = { service: "email", apiKey: mailKey, from: "Finscope <accounts@example.test>" };

function fixture() {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys=ON");
  for (const name of readdirSync(new URL("../drizzle/", import.meta.url)).filter(name => name.endsWith(".sql")).sort()) sql.exec(readFileSync(new URL(`../drizzle/${name}`, import.meta.url), "utf8"));
  function statement(query: string, params: unknown[] = []) {
    const bindings = params as (string | number | null)[];
    return { bind: (...values: unknown[]) => statement(query, values), first: async () => sql.prepare(query).get(...bindings) ?? null, all: async () => ({ results: sql.prepare(query).all(...bindings) }), run: async () => sql.prepare(query).run(...bindings) };
  }
  const db = { prepare: statement, batch: async (statements: ReturnType<typeof statement>[]) => {
    sql.exec("BEGIN");
    try { const results = []; for (const item of statements) results.push(await item.run()); sql.exec("COMMIT"); return results; }
    catch (error) { sql.exec("ROLLBACK"); throw error; }
  } } as unknown as D1Database;
  const env: OwnerSetupEnvironment = { DB: db, ADMIN_EMAIL: "Owner@Example.test", OWNER_SETUP_ENABLED: "true", AUTH_TRUST_SITES_IDENTITY: "true", CREDENTIAL_ENCRYPTION_KEY: "a".repeat(64) };
  let identity: { userId: string; email: string } | null = { userId: "gateway-owner", email: "owner@example.test" };
  const owner = ownerModule.createOwnerSetup({ env, gatewayIdentity: async () => identity });
  function request(method = "GET", input?: unknown, extra: { origin?: string | null; site?: string; base?: string; raw?: string; headers?: Record<string, string> } = {}) {
    const base = extra.base || "https://finscope.test";
    return new Request(`${base}/api/owner/setup`, { method, headers: { "Content-Type": "application/json", ...(extra.origin === null ? {} : { Origin: extra.origin || base }), ...(extra.site ? { "Sec-Fetch-Site": extra.site } : {}), ...extra.headers }, ...(input === undefined && extra.raw === undefined ? {} : { body: extra.raw ?? JSON.stringify(input) }) });
  }
  const call = (method = "GET", input?: unknown, extra?: Parameters<typeof request>[2]) => owner.handler(request(method, input, extra));
  return { env, sql, owner, call, request, setIdentity: (value: typeof identity) => { identity = value; }, close: () => sql.close() };
}

test("owner setup hides its existence unless both flags and the exact trusted owner identity match", async () => {
  const f = fixture();
  try {
    const rejected = async () => {
      assert.equal(await f.owner.getAccess(), false);
      for (const method of ["GET", "PUT"]) {
        const result = await f.call(method, method === "PUT" ? { service: "ai", apiKey: aiKey } : undefined, { headers: { "oai-authenticated-user-id": "gateway-owner", "oai-authenticated-user-email": "owner@example.test" } });
        assert.equal(result.status, 404);
        assert.equal(result.headers.get("Cache-Control"), "private, no-store");
        const text = await result.text();
        assert.deepEqual(JSON.parse(text), { error: "Not found.", code: "NOT_FOUND" });
        assert.ok(!text.includes("owner@example.test"));
        assert.ok(!text.includes(aiKey));
      }
    };
    f.env.OWNER_SETUP_ENABLED = "false"; await rejected();
    f.env.OWNER_SETUP_ENABLED = "true"; f.env.AUTH_TRUST_SITES_IDENTITY = "false"; await rejected();
    f.env.AUTH_TRUST_SITES_IDENTITY = "true"; f.setIdentity(null); await rejected();
    f.setIdentity({ userId: "", email: "owner@example.test" }); await rejected();
    f.setIdentity({ userId: "other", email: "owner@example.test.evil" }); await rejected();
    f.setIdentity({ userId: "other", email: "someone@example.test" }); await rejected();
    const database = f.env.DB;
    delete f.env.DB;
    await rejected(); // Denial must not reveal whether the credential store is available.
    f.env.DB = database;
    f.setIdentity({ userId: "gateway-owner", email: " OWNER@example.test " });
    assert.equal(await f.owner.getAccess(), true);
    const result = await f.call();
    assert.equal(result.status, 200);
    assert.equal((await result.json() as OwnerSetupStatus).ownerEmail, "owner@example.test");
    assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM ai_credentials").get()!.n, 0);
    assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM auth_accounts").get()!.n, 0);
    assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM auth_sessions").get()!.n, 0);
  } finally { f.close(); }
});

test("owner saves require same-origin secure transport and never trust forged headers", async () => {
  const f = fixture();
  try {
    const input = { service: "ai", apiKey: aiKey };
    for (const extra of [{ origin: null }, { origin: "https://other.test" }, { site: "cross-site" }, { site: "same-site" }]) assert.equal((await f.call("PUT", input, extra)).status, 403);
    assert.equal((await f.call("PUT", input, { base: "http://finscope.test" })).status, 400);
    f.env.AUTH_ALLOW_LOCAL_HTTP = "true";
    assert.equal((await f.call("PUT", input, { base: "http://finscope.test" })).status, 400);
    assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM ai_credentials").get()!.n, 0);
    assert.equal((await f.call("POST", input)).status, 405);
  } finally { f.close(); }
});

test("AI credentials are encrypted with scope binding, return metadata only, and never create a login", async () => {
  const f = fixture();
  try {
    const result = await f.call("PUT", { service: "ai", apiKey: aiKey });
    assert.equal(result.status, 200);
    assert.equal(result.headers.get("Cache-Control"), "private, no-store");
    const text = await result.text();
    assert.ok(!text.includes(aiKey));
    assert.deepEqual(JSON.parse(text).ai, { configured: true, source: "vault", suffix: aiKey.slice(-4) });
    const row = f.sql.prepare("SELECT * FROM ai_credentials WHERE scope='__site_sponsor__'").get()!;
    assert.ok(!JSON.stringify(row).includes(aiKey));
    assert.equal(await ownerModule.openCredential(String(row.ciphertext), "__site_sponsor__", f.env.CREDENTIAL_ENCRYPTION_KEY!), aiKey);
    await assert.rejects(ownerModule.openCredential(String(row.ciphertext), "__mail_sender__", f.env.CREDENTIAL_ENCRYPTION_KEY!));
    assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM auth_accounts").get()!.n, 0);
    assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM profiles").get()!.n, 0);
    const firstCipher = row.ciphertext;
    await f.call("PUT", { service: "ai", apiKey: aiKey });
    assert.notEqual(f.sql.prepare("SELECT ciphertext FROM ai_credentials").get()!.ciphertext, firstCipher);
  } finally { f.close(); }
});

test("sender validation and bounded strict bodies reject malformed requests before storage", async () => {
  const f = fixture();
  try {
    for (const input of [
      { service: "ai", apiKey: "sk-short" }, { service: "ai", apiKey: aiKey, owner: true },
      { service: "ai", apiKey: aiKey + "\nAuthorization: bad" }, { ...mailInput, apiKey: "bad" },
      { ...mailInput, from: "Name <accounts@example.test>\r\nBcc: bad@example.test" },
      { ...mailInput, from: "a@example.test,b@example.test" }, { ...mailInput, from: "not an email" },
    ]) assert.equal((await f.call("PUT", input)).status, 400);
    assert.equal((await f.call("PUT", undefined, { raw: "{" })).status, 400);
    assert.equal((await f.call("PUT", undefined, { raw: "x".repeat(4097) })).status, 413);
    assert.equal((await f.call("PUT", mailInput, { headers: { "Content-Type": "text/plain" } })).status, 415);
    assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM ai_credentials").get()!.n, 0);
  } finally { f.close(); }
});

test("mail resolution uses complete environment pairs or encrypted vault pairs without mixing", async () => {
  const f = fixture();
  try {
    const saved = await f.call("PUT", mailInput);
    assert.equal(saved.status, 200);
    assert.deepEqual((await saved.json() as OwnerSetupStatus).email, { configured: true, source: "vault", sender: mailInput.from });
    const row = f.sql.prepare("SELECT * FROM ai_credentials WHERE scope='__mail_sender__'").get()!;
    assert.ok(!JSON.stringify(row).includes(mailKey));
    assert.ok(!String(row.ciphertext).includes(mailInput.from));
    assert.deepEqual((await ownerModule.resolveMailConfiguration(f.env)).credentials, { apiKey: mailKey, from: mailInput.from });
    f.env.RESEND_API_KEY = "re_environment_" + "c".repeat(30);
    assert.equal((await ownerModule.resolveMailConfiguration(f.env)).credentials?.apiKey, mailKey);
    f.env.AUTH_EMAIL_FROM = "environment@example.test";
    assert.deepEqual(await ownerModule.resolveMailConfiguration(f.env), { source: "environment", credentials: { apiKey: f.env.RESEND_API_KEY, from: f.env.AUTH_EMAIL_FROM } });
    f.env.AUTH_EMAIL_FROM = "malformed";
    assert.deepEqual(await ownerModule.resolveMailConfiguration(f.env), { source: "environment", credentials: null });
    const text = await (await f.call()).text();
    assert.ok(!text.includes(mailKey) && !text.includes(f.env.RESEND_API_KEY));
  } finally { f.close(); }
});

test("missing storage and unreadable or invalid saved credentials fail closed", async () => {
  const f = fixture();
  try {
    f.env.CREDENTIAL_ENCRYPTION_KEY = "invalid";
    assert.equal((await f.call("PUT", mailInput)).status, 503);
    assert.equal((await (await f.call()).json() as OwnerSetupStatus).storageReady, false);
    f.env.CREDENTIAL_ENCRYPTION_KEY = "a".repeat(64);
    await f.call("PUT", mailInput);
    await f.call("PUT", { service: "ai", apiKey: aiKey });
    f.env.CREDENTIAL_ENCRYPTION_KEY = "b".repeat(64);
    assert.deepEqual(await ownerModule.resolveMailConfiguration(f.env), { source: "vault", credentials: null });
    assert.equal((await (await f.call()).json() as OwnerSetupStatus).ai.configured, false);
    f.env.CREDENTIAL_ENCRYPTION_KEY = "a".repeat(64);
    for (const ciphertext of ["corrupt", await ownerModule.sealCredential(JSON.stringify({ apiKey: mailKey, from: mailInput.from }), "wrong-scope", f.env.CREDENTIAL_ENCRYPTION_KEY), await ownerModule.sealCredential(JSON.stringify({ apiKey: mailKey, from: "invalid" }), "__mail_sender__", f.env.CREDENTIAL_ENCRYPTION_KEY)]) {
      f.sql.prepare("UPDATE ai_credentials SET ciphertext=? WHERE scope='__mail_sender__'").run(ciphertext);
      assert.deepEqual(await ownerModule.resolveMailConfiguration(f.env), { source: "vault", credentials: null });
    }
    delete f.env.DB;
    assert.equal((await f.call("PUT", mailInput)).status, 503);
    assert.deepEqual(await ownerModule.resolveMailConfiguration(f.env), { source: "missing", credentials: null });
  } finally { f.close(); }
});

test("authentication sends through saved mail settings but still requires email verification", async () => {
  const f = fixture();
  try {
    await f.call("PUT", mailInput);
    let calls = 0;
    let deliveredCode = "";
    const auth = authModule.createAuth({ env: { ...f.env, AUTH_SECRET: "test-pepper-".repeat(5) }, resolveMail: async () => (await ownerModule.resolveMailConfiguration(f.env)).credentials, fetcher: (async (url: string, init: RequestInit) => {
      calls++;
      assert.equal(url, "https://api.resend.com/emails");
      assert.equal(new Headers(init.headers).get("Authorization"), `Bearer ${mailKey}`);
      assert.equal(init.redirect, "manual");
      const body = JSON.parse(String(init.body));
      assert.equal(body.from, mailInput.from);
      deliveredCode = body.text.match(/code is (\d{6})/)[1];
      return Response.json({ id: "test-delivery-acknowledged" });
    }) as typeof fetch });
    const authRequest = (action: string, input?: unknown) => new Request(`https://finscope.test/api/auth/${action}`, { method: input ? "POST" : "GET", headers: { Origin: "https://finscope.test", "Content-Type": "application/json" }, ...(input ? { body: JSON.stringify(input) } : {}) });
    const config = await auth.handler(authRequest("config"), "config");
    assert.equal((await config.json() as { emailDeliveryAvailable: boolean }).emailDeliveryAvailable, true);
    const result = await auth.handler(authRequest("register", { name: "Owner", email: "owner@example.test", password: "correct horse battery" }), "register");
    assert.equal(result.status, 202);
    assert.equal(calls, 1);
    assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM auth_accounts").get()!.n, 0);
    assert.equal(result.headers.get("Set-Cookie"), null);
    const { challengeId } = await result.json() as { challengeId: string };
    const verified = await auth.handler(authRequest("verify-email", { email: "owner@example.test", challengeId, code: deliveredCode }), "verify-email");
    assert.equal(verified.status, 200);
    assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM auth_accounts").get()!.n, 1);
    f.sql.prepare("UPDATE ai_credentials SET ciphertext='corrupt' WHERE scope='__mail_sender__'").run();
    assert.equal((await (await auth.handler(authRequest("config"), "config")).json() as { emailDeliveryAvailable: boolean }).emailDeliveryAvailable, false);
    const blocked = await auth.handler(authRequest("register", { name: "Other", email: "other@example.test", password: "correct horse battery" }), "register");
    assert.equal(blocked.status, 503);
    assert.equal((await blocked.json() as { code: string }).code, "EMAIL_NOT_CONFIGURED");
    assert.equal(calls, 1);
  } finally { f.close(); }
});

test("resolver storage failures cannot enable authentication email or leak provider details", async () => {
  const f = fixture();
  try {
    let calls = 0;
    const auth = authModule.createAuth({ env: { DB: f.env.DB, AUTH_SECRET: "test-pepper-".repeat(5) }, resolveMail: async () => { throw new Error("private database details"); }, fetcher: (async () => { calls++; throw new Error("unexpected mail send"); }) as typeof fetch });
    const config = await auth.handler(new Request("https://finscope.test/api/auth/config"), "config");
    assert.equal((await config.json() as { emailDeliveryAvailable: boolean }).emailDeliveryAvailable, false);
    const request = new Request("https://finscope.test/api/auth/register", { method: "POST", headers: { Origin: "https://finscope.test", "Content-Type": "application/json" }, body: JSON.stringify({ name: "Owner", email: "owner@example.test", password: "correct horse battery" }) });
    const result = await auth.handler(request, "register");
    assert.equal(result.status, 503);
    assert.ok(!(await result.text()).includes("private database details"));
    assert.equal(calls, 0);
  } finally { f.close(); }
});
