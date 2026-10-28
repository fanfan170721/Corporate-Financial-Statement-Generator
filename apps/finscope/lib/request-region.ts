import { AsyncLocalStorage } from 'node:async_hooks';

type RequestRegion = { country: string | undefined };
const requestRegions = new AsyncLocalStorage<RequestRegion>();

function nativeRequestCountry(request?: Request): string | undefined {
  const country = (request as (Request & { cf?: { country?: unknown } }) | undefined)?.cf?.country;
  return typeof country === 'string' && /^[A-Z]{2}$/.test(country) && country !== 'XX' ? country : undefined;
}

// Capture at the Worker boundary: framework Request reconstruction can discard
// cf metadata. Never derive this capability from headers or browser input.
export function runWithRequestRegion<T>(request: Request, run: () => T): T {
  return requestRegions.run({ country: nativeRequestCountry(request) }, run);
}

export function getRequestCountry(request?: Request): string | undefined {
  const region = requestRegions.getStore();
  // A captured unknown country must remain unknown, even after a reconstruction.
  return region ? region.country : nativeRequestCountry(request);
}
