import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const source = readFileSync(new URL('../lib/request-region.ts', import.meta.url), 'utf8');
const api = await import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(source, { mode: 'transform' })).toString('base64')) as typeof import('../lib/request-region');

function request(country?: unknown): Request {
  const request = new Request('https://finscope.test/api/ai/free');
  if (country !== undefined) Object.defineProperty(request, 'cf', { value: { country } });
  return request;
}

test('trusted country survives a framework request reconstruction', async () => {
  const original = request('CA');
  await api.runWithRequestRegion(original, async () => {
    await Promise.resolve();
    const reconstructed = new Request(original.url, { headers: original.headers });
    assert.equal(Reflect.get(reconstructed, 'cf'), undefined);
    assert.equal(api.getRequestCountry(reconstructed), 'CA');
  });
  assert.equal(api.getRequestCountry(), undefined);
});

test('request headers cannot supply country and captured unknown cannot become allowed', async () => {
  const original = request();
  original.headers.set('CF-IPCountry', 'CA');
  original.headers.set('X-Vercel-IP-Country', 'CA');
  assert.equal(api.getRequestCountry(original), undefined);
  await api.runWithRequestRegion(original, async () => {
    assert.equal(api.getRequestCountry(request('CA')), undefined);
  });
  for (const country of ['XX', 'T1', 'ca', '', null, 123]) assert.equal(api.getRequestCountry(request(country)), undefined);
});

test('overlapping requests retain separate countries and leave no global region', async () => {
  let release = () => {};
  let entered = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  const ready = new Promise<void>(resolve => { entered = resolve; });
  const first = api.runWithRequestRegion(request('CA'), async () => {
    entered();
    await gate;
    assert.equal(api.getRequestCountry(), 'CA');
  });
  await ready;
  await api.runWithRequestRegion(request('GB'), async () => {
    await Promise.resolve();
    assert.equal(api.getRequestCountry(), 'GB');
    release();
  });
  await first;
  assert.equal(api.getRequestCountry(), undefined);
});
