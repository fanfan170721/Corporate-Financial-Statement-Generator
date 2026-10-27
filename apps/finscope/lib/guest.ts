import { env } from 'cloudflare:workers';
import { headers } from 'next/headers';
import { getUser } from './auth';
import { createGuestService } from './guest-core';
export { GuestError } from './guest-core';
export type { GuestActor } from './guest-core';

const service = createGuestService({ env, signedIn: async () => Boolean(await getUser()) });
export async function getGuest() {
  const incoming = await headers();
  const host = incoming.get('host') || 'finscope.invalid';
  const local = env.AUTH_ALLOW_LOCAL_HTTP === 'true' && /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host);
  return service.getGuest(new Request(`${local ? 'http' : 'https'}://${host}/`, { headers: { Cookie: incoming.get('cookie') || '' } }));
}
export const guestUsage = service.usage;
export const claimGuestJob = service.claim;
export const releaseGuestJob = service.release;
export const guestView = service.publicGuest;
export const handleGuestSession = service.handler;
