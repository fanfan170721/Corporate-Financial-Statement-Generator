// Workers' default PBKDF2 cap is 100,000 (workerd PR #7550 remains open).
// A separate server pepper protects database-only disclosure. Retain the versioned format.
export const PASSWORD_ITERATIONS = 100_000;
const encoder = new TextEncoder();

export function randomHex(bytes = 32): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function digest(value: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hmac(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function equalHash(left: string, right: string): boolean {
  let difference = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++) difference |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  return difference === 0;
}

async function derive(password: string, salt: string, secret: string): Promise<string> {
  const peppered = await hmac(`password:${password}`, secret);
  const key = await crypto.subtle.importKey("raw", encoder.encode(peppered), "PBKDF2", false, ["deriveBits"]);
  const result = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: encoder.encode(salt), iterations: PASSWORD_ITERATIONS, hash: "SHA-256" }, key, 256);
  return Array.from(new Uint8Array(result), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashPassword(password: string, secret: string): Promise<string> {
  const salt = randomHex(16);
  return `pbkdf2-sha256-v1$${PASSWORD_ITERATIONS}$${salt}$${await derive(password, salt, secret)}`;
}

export async function verifyPassword(password: string, stored: string | null, secret: string): Promise<boolean> {
  const parts = stored?.split("$") || [];
  const valid = parts.length === 4 && parts[0] === "pbkdf2-sha256-v1" && parts[1] === String(PASSWORD_ITERATIONS) && /^[a-f0-9]{32}$/.test(parts[2]) && /^[a-f0-9]{64}$/.test(parts[3]);
  // Unknown accounts perform the same expensive derivation as known accounts.
  const candidate = await derive(password, valid ? parts[2] : "0".repeat(32), secret);
  return equalHash(candidate, valid ? parts[3] : "0".repeat(64)) && valid;
}

export function verificationCode(): string {
  const bytes = new Uint32Array(1);
  do { crypto.getRandomValues(bytes); } while (bytes[0] >= 4_294_000_000);
  return (bytes[0] % 1_000_000).toString().padStart(6, "0");
}
