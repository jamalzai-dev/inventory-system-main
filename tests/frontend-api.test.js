import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi, ApiError } from '../app/api.js';
import { InventoryStore } from '../app/store.js';
import { units, decimal, add, subtract, compare, product, inventoryValue, formatDecimal, stockStatus } from '../app/decimal.js';

const id = '00000000-0000-4000-8000-000000000001';
const row = { id, name: 'Test', version: 'a'.repeat(32), categoryId: id, quantity: '1.125', price: null, reorderLevel: null };
const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const memory = () => { const map = new Map(); return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) }; };
test('exact quantities, bounds, comparisons, arithmetic and signed formatting', () => {
  assert.equal(units('999999999.999'), 999999999999n);
  assert.equal(decimal(units('0.125')), '0.125');
  assert.equal(add('0.1', '0.2'), '0.3');
  assert.equal(subtract('1', '0.001'), '0.999');
  assert.equal(compare('10', '2.999'), 1);
  for (const invalid of ['1.0000', '1e3', '-1', '01', ' 1', '1000000000', 1, null]) assert.throws(() => units(invalid));
  assert.equal(formatDecimal('-0.125'), '-0.125');
  assert.match(formatDecimal('123.125', 'ps-AF'), /۱۲۳٫۱۲۵/);
});
test('reports preserve five-place products and large totals; unknown prices excluded explicitly', () => {
  assert.equal(product('0.125', '0.01'), '0.00125');
  assert.equal(inventoryValue([{ quantity: '0.125', price: '0.01' }, { quantity: '999999999.999', price: '999999999.99' }, { quantity: '10', price: null }]), '999999999989000000.00126');
  assert.equal(formatDecimal('999999999989000000.00126'), '999,999,999,989,000,000.00126');
});
test('zero, nullable thresholds and decimal stock classifications are exclusive', () => {
  assert.equal(stockStatus({ quantity: '0.000', reorderLevel: null }), 'out');
  assert.equal(stockStatus({ quantity: '0.001', reorderLevel: null }), 'good');
  assert.equal(stockStatus({ quantity: '1.125', reorderLevel: '1.125' }), 'low');
  assert.equal(stockStatus({ quantity: '1.126', reorderLevel: '1.125' }), 'good');
});
test('API authenticates same-origin reads/writes, supplies fresh CSRF, preserves exact text and versions', async () => {
  const calls = [];
  const api = createApi({ fetcher: async (path, options) => { calls.push([path, options]); return response(path.endsWith('/csrf') ? { csrfToken: 'c'.repeat(64) } : { data: path === '/api/materials' && options.method === 'GET' ? [row] : row }); } });
  assert.equal((await api.list('materials'))[0].quantity, '1.125');
  await api.mutate({ path: '/api/materials/' + id, method: 'PATCH', headers: { 'If-Match': `"${row.version}"` }, body: { price: '0.01', location: null } });
  assert.equal(calls[2][1].headers['X-CSRF-Token'], 'c'.repeat(64));
  assert.equal(calls[2][1].headers['If-Match'], `"${row.version}"`);
  assert.deepEqual(JSON.parse(calls[2][1].body), { price: '0.01', location: null });
  for (const [, options] of calls) { assert.equal(options.cache, 'no-store'); assert.equal(options.credentials, 'same-origin'); }
});
test('API rejects malformed records, duplicate IDs and invalid responses', async () => {
  for (const data of [[{ ...row, quantity: 1.125 }], [row, row], null, [{ ...row, version: null }]]) {
    const api = createApi({ fetcher: async () => response({ data }) });
    await assert.rejects(api.list('materials'), { code: 'invalidResponse' });
  }
});
test('API maps safe errors, clears unauthorized UI, rejects cross-origin paths and detects network uncertainty', async () => {
  let cleared = 0;
  const api = createApi({ onUnauthorized: () => cleared++, fetcher: async () => response({ error: 'private SQL must never be displayed' }, 401) });
  await assert.rejects(api.list('materials'), { code: 'sessionExpired' }); assert.equal(cleared, 1);
  await assert.rejects(api.request('https://example.org/api/materials'), { code: 'invalidRequest' });
  const broken = createApi({ fetcher: async path => { if (path.endsWith('/csrf')) return response({ csrfToken: 'a'.repeat(64) }); throw Error('network'); } });
  await assert.rejects(broken.mutate({ path: '/api/categories', method: 'POST', body: {} }), { code: 'serverUnreachable', uncertain: true });
});
test('store distinguishes loading, empty, stale and auth; never uses legacy data as fallback', async () => {
  let failed = false;
  const store = new InventoryStore({ list: async () => { if (failed) throw new ApiError('serverUnreachable'); return []; } }, memory());
  assert.equal(store.status, 'loading'); assert.equal(store.blocked, true);
  assert.equal(await store.refresh(), true); assert.equal(store.ready, true); assert.equal(store.data.materials.length, 0);
  failed = true; assert.equal(await store.refresh(), false); assert.equal(store.status, 'stale'); assert.equal(store.blocked, true);
  store.clear(); assert.equal(store.status, 'auth'); assert.equal(store.ready, false);
});
test('store coalesces reads and cannot replace cleared authenticated state with a late response', async () => {
  let finish;
  const gate = new Promise(resolve => { finish = resolve; }); let count = 0;
  const store = new InventoryStore({ list: async () => { count++; await gate; return []; } }, memory());
  const a = store.refresh(), b = store.refresh(); assert.equal(a, b); assert.equal(count, 3);
  store.clear(); finish(); await a; assert.equal(store.status, 'auth'); assert.equal(store.ready, false);
});
test('uncertain POST survives reload with unchanged identity/payload; double submits are blocked', async () => {
  const storage = memory(); const jobs = [];
  let uncertain = true;
  const api = { list: async () => [], mutate: async job => { jobs.push(structuredClone(job)); if (uncertain) throw new ApiError('serverUnreachable', 0, true); return row; } };
  const first = new InventoryStore(api, storage); await first.refresh();
  await assert.rejects(first.stock('remove', [{ materialId: id, quantity: '0.125' }], null), { uncertain: true });
  assert.ok(first.pending); await assert.rejects(first.create('categories', { name: 'Other' }), { code: 'mutationBlocked' });
  const second = new InventoryStore(api, storage); await second.refresh(); uncertain = false;
  await second.retry(); assert.deepEqual(jobs[0], jobs[1]); assert.equal(second.pending, null);
});
test('expired-session retry preserves original request; confirmed validation rejection allows correction', async () => {
  const storage = memory(); let error = new ApiError('serverUnreachable', 0, true);
  const api = { list: async () => [], mutate: async () => { throw error; } };
  const store = new InventoryStore(api, storage); await store.refresh();
  await assert.rejects(store.create('categories', { name: 'Name' })); const key = store.pending.headers['Idempotency-Key'];
  await store.refresh(); error = new ApiError('sessionExpired', 401);
  await assert.rejects(store.retry()); assert.equal(store.pending.headers['Idempotency-Key'], key);
  const resumed = new InventoryStore(api, storage); await resumed.refresh(); error = new ApiError('invalidRequest', 422);
  await assert.rejects(resumed.retry()); assert.equal(resumed.pending, null);
});
test('CSRF rejection is localized; no write retries occur automatically', async () => {
  let writes = 0;
  const api = createApi({ fetcher: async path => path.endsWith('/csrf') ? response({ csrfToken: 'a'.repeat(64) })
    : (writes++, response({ error: 'Request could not be verified. Refresh and try again.' }, 403)) });
  await assert.rejects(api.mutate({ path: '/api/categories', method: 'POST', body: { name: 'Test' } }), { code: 'csrfFailed', uncertain: false });
  assert.equal(writes, 1);
});
test('cancellation and timeout produce safe errors without inventing empty records', async () => {
  const api = createApi({ timeout: 5, fetcher: async (path, options) => new Promise((resolve, reject) => {
    if (options.signal.aborted) reject(new Error('aborted'));
    options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  }) });
  await assert.rejects(api.list('materials'), { code: 'serverUnreachable' });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(api.list('materials', controller.signal), { code: 'requestCancelled' });
});
test('invalid success acknowledgement remains uncertain and cannot release the retry identity', async () => {
  const api = createApi({ fetcher: async path => response(path.endsWith('/csrf') ? { csrfToken: 'a'.repeat(64) } : { data: { id } }) });
  await assert.rejects(api.mutate({ path: '/api/categories', method: 'POST', body: { name: 'Test' } }), { code: 'invalidResponse', uncertain: true });
});
test('write serialization rejects double submit while retaining one request key', async () => {
  let finish, writes = 0;
  const gate = new Promise(resolve => { finish = resolve; });
  const store = new InventoryStore({ list: async () => [], mutate: async () => { writes++; await gate; return row; } }, memory());
  await store.refresh(); const first = store.create('categories', { name: 'Test' });
  await assert.rejects(store.create('categories', { name: 'Test' }), { code: 'mutationBlocked' });
  finish(); await first; assert.equal(writes, 1); assert.equal(store.pending, null);
});
test('journal failure blocks dispatch; confirmed commits remain successful when refresh fails', async () => {
  let writes = 0;
  const broken = new InventoryStore({ list: async () => [], mutate: async () => { writes++; } }, { getItem: () => null, setItem: () => { throw Error(); } });
  await broken.refresh(); await assert.rejects(broken.create('categories', { name: 'Test' }), { code: 'recoveryUnavailable' }); assert.equal(writes, 0);
  let committed = false;
  const store = new InventoryStore({ list: async () => { if (committed) throw new ApiError('serverUnreachable'); return []; },
    mutate: async () => { committed = true; return row; } }, memory());
  await store.refresh(); assert.deepEqual(await store.create('categories', { name: 'Test' }), row);
  assert.equal(store.status, 'stale'); assert.equal(store.pending, null); assert.equal(store.blocked, true);
});
