import { z } from "zod";
import { openCredential } from "./credential-vault";

export const MAIL_CREDENTIAL_SCOPE = "__mail_sender__";
export type MailCredentials = { apiKey: string; from: string };
export type MailEnvironment = { DB?: D1Database; RESEND_API_KEY?: string; AUTH_EMAIL_FROM?: string; CREDENTIAL_ENCRYPTION_KEY?: string };
export type MailConfiguration = { source: "environment" | "vault" | "missing"; credentials: MailCredentials | null };

export function validMailSender(value: string): boolean {
  if (!value || value.length > 320 || /[\u0000-\u001f\u007f,;]/.test(value)) return false;
  const match = /^([^<>]{1,80}) <([^<>]+)>$/.exec(value);
  const address = match ? match[2] : value;
  if (!match && /[<>]/.test(value)) return false;
  return z.string().max(254).email().safeParse(address).success;
}

export const mailCredentialsSchema = z.object({
  apiKey: z.string().trim().min(20).max(512).regex(/^re_[A-Za-z0-9_-]+$/),
  from: z.string().trim().max(320).refine(validMailSender, "Enter one sender email, optionally with a display name."),
}).strict();

/** Read-only resolution. Complete environment settings take precedence; sources never mix. */
export async function resolveMailConfiguration(env: MailEnvironment): Promise<MailConfiguration> {
  if (env.RESEND_API_KEY?.trim() && env.AUTH_EMAIL_FROM?.trim()) {
    const parsed = mailCredentialsSchema.safeParse({ apiKey: env.RESEND_API_KEY, from: env.AUTH_EMAIL_FROM });
    return { source: "environment", credentials: parsed.success ? parsed.data : null };
  }
  if (!env.DB) return { source: "missing", credentials: null };
  const row = await env.DB.prepare("SELECT ciphertext FROM ai_credentials WHERE scope=?").bind(MAIL_CREDENTIAL_SCOPE).first<{ ciphertext: string }>();
  if (!row) return { source: "missing", credentials: null };
  try {
    const decrypted = await openCredential(row.ciphertext, MAIL_CREDENTIAL_SCOPE, env.CREDENTIAL_ENCRYPTION_KEY || "");
    const parsed = mailCredentialsSchema.safeParse(JSON.parse(decrypted));
    return { source: "vault", credentials: parsed.success ? parsed.data : null };
  } catch {
    // A missing master key, corruption, wrong AAD, or invalid payload fails closed.
    return { source: "vault", credentials: null };
  }
}
