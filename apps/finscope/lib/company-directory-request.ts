import type { Company } from './types';

export async function loadCompanyDirectory(path: string, signal?: AbortSignal): Promise<{companies: Company[]}> {
  signal?.throwIfAborted();
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', cancel, {once: true});
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 8000);
  try {
    const response = await fetch(path, {signal: controller.signal, headers: {'Content-Type': 'application/json'}});
    if (!response.ok) throw new Error('Company directory could not be loaded. Please try again.');
    return await response.json() as {companies: Company[]};
  } catch (failure) {
    if (timedOut) throw new Error('Company directory is taking longer than expected. Please try again.');
    if (signal?.aborted) throw failure;
    throw new Error('Company directory could not be loaded. Please try again.');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}
