import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

const source = stripTypeScriptTypes(await readFile(new URL('../lib/company-directory-request.ts', import.meta.url), 'utf8'));
const {loadCompanyDirectory} = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`) as typeof import('../lib/company-directory-request');

test('company directory times out without marking the component as unmounted', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const caller = new AbortController();
  let requestSignal: AbortSignal | undefined;
  t.mock.method(globalThis, 'fetch', (_path: string, options: RequestInit) => new Promise((_resolve, reject) => {
    requestSignal = options.signal as AbortSignal;
    requestSignal.addEventListener('abort', () => reject(requestSignal?.reason), {once: true});
  }));
  const pending = loadCompanyDirectory('/api/companies?q=', caller.signal);
  const rejected = assert.rejects(pending, /taking longer than expected/);
  t.mock.timers.tick(8000);
  await rejected;
  assert.equal(requestSignal?.aborted, true);
  assert.equal(caller.signal.aborted, false);
});

test('navigating away cancels the request without a timeout error', async t => {
  const caller = new AbortController();
  const reason = new DOMException('Navigated away', 'AbortError');
  t.mock.method(globalThis, 'fetch', (_path: string, options: RequestInit) => new Promise((_resolve, reject) => {
    options.signal?.addEventListener('abort', () => reject(options.signal?.reason), {once: true});
  }));
  const pending = loadCompanyDirectory('/api/companies?q=Apple', caller.signal);
  caller.abort(reason);
  await assert.rejects(pending, error => error === reason);
});

test('successful directory lookup keeps metadata and releases its abort listener', async t => {
  const caller = new AbortController();
  let requestSignal: AbortSignal | undefined;
  const companies = [{symbol: 'AAPL', name: 'Apple Inc.', cik: '0000320193', discoveryOnly: true}];
  t.mock.method(globalThis, 'fetch', async (_path: string, options: RequestInit) => {
    requestSignal = options.signal as AbortSignal;
    return Response.json({companies});
  });
  assert.deepEqual(await loadCompanyDirectory('/api/companies?q=Apple', caller.signal), {companies});
  caller.abort();
  assert.equal(requestSignal?.aborted, false);
});

test('directory connection failures provide a retryable message', async t => {
  t.mock.method(globalThis, 'fetch', async () => {throw new TypeError('Failed to fetch');});
  await assert.rejects(loadCompanyDirectory('/api/companies?q='), /could not be loaded\. Please try again\./);
});
