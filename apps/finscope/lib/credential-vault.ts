/** Server-side envelope encryption. The master key lives outside the database. */
const encoder = new TextEncoder();
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const decode = (value: string) => Uint8Array.from(atob(value), char => char.charCodeAt(0));

async function masterKey(secret: string) {
  if (!/^[a-f0-9]{64}$/i.test(secret)) throw new Error('Credential storage is not configured.');
  const bytes = Uint8Array.from(secret.match(/../g)!, pair => parseInt(pair, 16));
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function sealCredential(value: string, scope: string, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(scope) }, await masterKey(secret), encoder.encode(value));
  return `v1.${encode(iv)}.${encode(new Uint8Array(encrypted))}`;
}

export async function openCredential(value: string, scope: string, secret: string): Promise<string> {
  const [version, iv, encrypted] = value.split('.');
  if (version !== 'v1' || !iv || !encrypted) throw new Error('The saved credential cannot be opened.');
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(iv), additionalData: encoder.encode(scope) }, await masterKey(secret), decode(encrypted));
  return new TextDecoder().decode(decrypted);
}

export async function hashAccessCode(code: string): Promise<string> {
  const result = await crypto.subtle.digest('SHA-256', encoder.encode(code.trim()));
  return Array.from(new Uint8Array(result), n => n.toString(16).padStart(2, '0')).join('');
}

export function newAccessCode(): string {
  return 'FS-' + Array.from(crypto.getRandomValues(new Uint8Array(18)), n => n.toString(16).padStart(2, '0')).join('');
}
