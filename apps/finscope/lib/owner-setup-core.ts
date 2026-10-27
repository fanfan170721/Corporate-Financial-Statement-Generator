import { z } from "zod";
import { openCredential, sealCredential } from "./credential-vault";
import { MAIL_CREDENTIAL_SCOPE, mailCredentialsSchema, resolveMailConfiguration, type MailEnvironment } from "./mail-config";

const OWNER_AI_SCOPE = "__site_sponsor__";
export type OwnerSetupEnvironment = MailEnvironment & { OWNER_SETUP_ENABLED?: string; AUTH_TRUST_SITES_IDENTITY?: string; ADMIN_EMAIL?: string; OPENAI_API_KEY?: string; AUTH_ALLOW_LOCAL_HTTP?: string };
type OwnerGatewayIdentity = { userId: string; email: string } | null;
export type OwnerSetupStatus = {
  ownerEmail: string;
  storageReady: boolean;
  ai: { configured: boolean; source: "vault" | "environment" | "missing"; suffix?: string };
  email: { configured: boolean; source: "vault" | "environment" | "missing"; sender?: string };
};
const ownerAIKeySchema = z.string().trim().min(30).max(512).regex(/^sk-[A-Za-z0-9_-]+$/);
const ownerSetupInput = z.discriminatedUnion("service", [
  z.object({ service: z.literal("ai"), apiKey: ownerAIKeySchema }).strict(),
  mailCredentialsSchema.extend({ service: z.literal("email") }).strict(),
]);

class OwnerSetupError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
function ownerResponse(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" } });
}

/** This factory never promotes a gateway identity into an application account. */
export function createOwnerSetup(options: { env: OwnerSetupEnvironment; gatewayIdentity: () => Promise<OwnerGatewayIdentity> }) {
  const { env } = options;
  async function getAccess(): Promise<boolean> {
    if (env.OWNER_SETUP_ENABLED !== "true" || env.AUTH_TRUST_SITES_IDENTITY !== "true" || !env.ADMIN_EMAIL?.trim()) return false;
    try {
      const user = await options.gatewayIdentity();
      return Boolean(user?.userId.trim() && user.email.trim().toLowerCase() === env.ADMIN_EMAIL.trim().toLowerCase());
    } catch { return false; }
  }
  function storageReady(): boolean { return Boolean(env.DB && /^[a-f0-9]{64}$/i.test(env.CREDENTIAL_ENCRYPTION_KEY || "")); }
  async function status(): Promise<OwnerSetupStatus> {
    const savedAI = env.DB ? await env.DB.prepare("SELECT ciphertext FROM ai_credentials WHERE scope=?").bind(OWNER_AI_SCOPE).first<{ ciphertext: string }>() : null;
    let ai: OwnerSetupStatus["ai"] = { configured: false, source: "missing" };
    if (savedAI) {
      ai = { configured: false, source: "vault" };
      try {
        const key = await openCredential(savedAI.ciphertext, OWNER_AI_SCOPE, env.CREDENTIAL_ENCRYPTION_KEY || "");
        if (ownerAIKeySchema.safeParse(key).success) ai = { configured: true, source: "vault", suffix: key.slice(-4) };
      } catch { /* Report unusable storage without leaking decryption details. */ }
    } else if (env.OPENAI_API_KEY?.trim()) {
      const key = env.OPENAI_API_KEY.trim();
      ai = ownerAIKeySchema.safeParse(key).success ? { configured: true, source: "environment", suffix: key.slice(-4) } : { configured: false, source: "environment" };
    }
    const mail = await resolveMailConfiguration(env);
    return { ownerEmail: env.ADMIN_EMAIL!.trim().toLowerCase(), storageReady: storageReady(), ai, email: { configured: Boolean(mail.credentials), source: mail.source, ...(mail.credentials ? { sender: mail.credentials.from } : {}) } };
  }
  async function input(request: Request) {
    if (!request.headers.get("Content-Type")?.toLowerCase().includes("application/json")) throw new OwnerSetupError(415, "JSON_REQUIRED", "Submit a JSON configuration request.");
    if (Number(request.headers.get("Content-Length") || 0) > 4096) throw new OwnerSetupError(413, "BODY_TOO_LARGE", "This configuration request is too large.");
    const reader = request.body?.getReader();
    if (!reader) throw new OwnerSetupError(400, "INVALID_JSON", "The configuration request could not be read.");
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        length += next.value.byteLength;
        if (length > 4096) { await reader.cancel(); throw new OwnerSetupError(413, "BODY_TOO_LARGE", "This configuration request is too large."); }
        chunks.push(next.value);
      }
    } finally { reader.releaseLock(); }
    const joined = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.length; }
    let value: unknown;
    try { value = JSON.parse(new TextDecoder().decode(joined)); } catch { throw new OwnerSetupError(400, "INVALID_JSON", "The configuration request could not be read."); }
    return ownerSetupInput.parse(value);
  }
  async function handler(request: Request): Promise<Response> {
    try {
      if (!await getAccess()) throw new OwnerSetupError(404, "NOT_FOUND", "Not found.");
      if (request.method === "GET") return ownerResponse(await status());
      if (request.method !== "PUT") throw new OwnerSetupError(405, "METHOD_NOT_ALLOWED", "This setup action is not supported.");
      const url = new URL(request.url);
      const local = env.AUTH_ALLOW_LOCAL_HTTP === "true" && url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
      if (url.protocol !== "https:" && !local) throw new OwnerSetupError(400, "HTTPS_REQUIRED", "Use secure HTTPS to save credentials.");
      const fetchSite = request.headers.get("Sec-Fetch-Site");
      if (request.headers.get("Origin") !== url.origin || (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none")) throw new OwnerSetupError(403, "ORIGIN_REJECTED", "Save configuration from the owner setup page.");
      if (!storageReady()) throw new OwnerSetupError(503, "VAULT_UNAVAILABLE", "Secure credential storage is not configured. The database binding and encryption key are required.");
      const value = await input(request);
      const scope = value.service === "ai" ? OWNER_AI_SCOPE : MAIL_CREDENTIAL_SCOPE;
      const plaintext = value.service === "ai" ? value.apiKey : JSON.stringify({ apiKey: value.apiKey, from: value.from });
      const ciphertext = await sealCredential(plaintext, scope, env.CREDENTIAL_ENCRYPTION_KEY!);
      await env.DB!.prepare(`INSERT INTO ai_credentials (scope,ciphertext,suffix,updated_at) VALUES (?,?,?,?)
        ON CONFLICT(scope) DO UPDATE SET ciphertext=excluded.ciphertext,suffix=excluded.suffix,updated_at=excluded.updated_at`).bind(scope, ciphertext, value.apiKey.slice(-4), new Date().toISOString()).run();
      return ownerResponse(await status());
    } catch (error) {
      if (error instanceof OwnerSetupError) return ownerResponse({ error: error.message, code: error.code }, error.status);
      if (error instanceof z.ZodError) return ownerResponse({ error: "Check the credential format and sender address. Nothing was saved.", code: "INVALID_INPUT", fields: error.issues.map((issue) => issue.path.join(".")) }, 400);
      return ownerResponse({ error: "Owner configuration could not be completed. Check secure storage and try again.", code: "OWNER_SETUP_UNAVAILABLE" }, 503);
    }
  }
  return { getAccess, handler };
}
