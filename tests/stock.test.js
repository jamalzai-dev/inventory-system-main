import test from 'node:test';
import assert from 'node:assert/strict';
import { validateStockOperation, stockUnits, stockDecimal, validateMovementPage, movementCursor } from '../server/stock-validation.js';
import { createInventoryRepository } from '../server/inventory.js';
import { startTestServer, testClient } from './helpers/auth-server.mjs';

const operationId = 'a37edcd9-bfa3-4eb6-b7d5-a4930fca10a2';
const first = '12345678-1234-4234-8234-123456789abc';
const second = '22345678-1234-4234-8234-123456789abc';
const body = () => ({ operationId, type: 'add', items: [{ materialId: first, quantity: '1' }] });

test('stock normalization combines repeated materials exactly, orders UUIDs and canonicalizes decimals', () => {
  const result = validateStockOperation({ operationId: operationId.toUpperCase(), type: 'remove', reason: '  وسایل  ', items: [
    { materialId: second, quantity: '150.750' }, { materialId: first.toUpperCase(), quantity: '2.500' },
    { materialId: first, quantity: '3.125' }, { materialId: second, quantity: '0.250' }
  ] });
  assert.deepEqual(result, { operationId, type: 'remove', reason: 'وسایل', items: [
    { materialId: first, quantity: '5.625' }, { materialId: second, quantity: '151' }
  ] });
  assert.equal(stockUnits('999999999.999'), 999999999999n);
  assert.equal(stockUnits('-0.125'), -125n);
  assert.equal(stockUnits('1.25000'), 1250n);
  assert.equal(stockDecimal(-125n), '-0.125');
  assert.equal(stockDecimal(1000n), '1');
  assert.throws(() => stockUnits('0.0001'));
});

test('zero, negative, malformed, overprecise and over-range stock quantities are rejected', () => {
  for (const quantity of ['0', '0.000', '-0', '-1', '-0.001', '+1', '1.0000', '0.0001', '1000000000', 'NaN', 'Infinity', '1e3', '1,000', '01', '', ' 1', '1\n', '.5', '1.', 1, 0.125, null, {}, true]) {
    assert.throws(() => validateStockOperation({ ...body(), items: [{ materialId: first, quantity }] }), { status: 422 }, String(quantity));
  }
  assert.throws(() => validateStockOperation({ ...body(), items: [
    { materialId: first, quantity: '999999999.999' }, { materialId: first, quantity: '0.001' }
  ] }), { status: 422 });
  assert.equal(validateStockOperation({ ...body(), items: [{ materialId: first, quantity: '999999999.999' }] }).items[0].quantity, '999999999.999');
});

test('stock IDs, operation type, body shape, item count and all fields are validated', () => {
  for (const value of [null, [], 'text', 0]) assert.throws(() => validateStockOperation(value), { status: 422 });
  for (const operationId of [undefined, 'bad', '1', first + '\n']) assert.throws(() => validateStockOperation({ ...body(), operationId }), { status: 400 });
  for (const type of [undefined, 'adjust', 'ADD', 1, null]) assert.throws(() => validateStockOperation({ ...body(), type }), { status: 422 });
  for (const items of [undefined, [], {}, Array(26).fill(body().items[0]), [null], [{ materialId: 'bad', quantity: '1' }]]) {
    assert.throws(() => validateStockOperation({ ...body(), items }));
  }
  for (const field of ['adminId', 'quantityDelta', 'current_stock', 'version', 'createdAt', '__proto__']) {
    assert.throws(() => validateStockOperation(Object.fromEntries([...Object.entries(body()), [field, 'x']])), { status: 422 });
    assert.throws(() => validateStockOperation({ ...body(), items: [Object.fromEntries([...Object.entries(body().items[0]), [field, 'x']])] }), { status: 422 });
  }
});

test('omitted/null reasons are equivalent; blank, Unicode and SQL-looking reason text remain distinct data', () => {
  assert.equal(validateStockOperation(body()).reason, null);
  assert.equal(validateStockOperation({ ...body(), reason: null }).reason, null);
  assert.equal(validateStockOperation({ ...body(), reason: ' ' }).reason, '');
  assert.equal(validateStockOperation({ ...body(), reason: "وسایل '); DROP TABLE materials; --" }).reason, "وسایل '); DROP TABLE materials; --");
  for (const reason of [1, true, [], {}, '\0', '\uD800']) assert.throws(() => validateStockOperation({ ...body(), reason }), { status: 422 });
});

test('movement pagination validates bounds and retains exact microsecond cursor time', () => {
  assert.deepEqual(validateMovementPage({}), { limit: 50, before: null });
  const cursor = movementCursor({ cursor_time: '2026-10-19T04:00:00.123456Z', id: first });
  assert.deepEqual(validateMovementPage({ limit: '100', before: cursor }), { limit: 100, before: { timestamp: '2026-10-19T04:00:00.123456Z', id: first } });
  for (const limit of ['', '0', '-1', '101', '1.5', '01', '1e2', '1\n', ['1','2'], null]) assert.throws(() => validateMovementPage({ limit }), { status: 400 });
  for (const before of ['', '*', 'x'.repeat(161), [], cursor + '=', cursor + '\n',
    Buffer.from(JSON.stringify(['2026-02-30T04:00:00.123456Z', first])).toString('base64url'),
    Buffer.from(JSON.stringify(['2026-10-19T04:00:00.123Z', first])).toString('base64url'),
    Buffer.from(JSON.stringify(['2026-10-19T04:00:00.123456Z', 'bad'])).toString('base64url')]) assert.throws(() => validateMovementPage({ before }), { status: 400 });
  assert.throws(() => validateMovementPage({ sort: 'DROP TABLE materials' }), { status: 400 });
});

async function fixture(t, inventory) {
  const f = await startTestServer({ inventory }); t.after(f.close);
  return { ...f, client: testClient(f.url) };
}
test('stock POST and both history routes require authentication; stock POST reuses all CSRF checks', async t => {
  let calls = 0;
  const f = await fixture(t, { operateStock: async () => { calls++; }, listMovements: async () => { calls++; } });
  for (const path of ['/api/stock-movements', `/api/materials/${first}/movements`]) assert.equal((await f.client.request(path)).status, 401);
  assert.equal((await f.client.request('/api/stock-operations', { method: 'POST' })).status, 401);
  await f.client.login();
  for (const headers of [{}, { 'X-CSRF-Token': 'bad' }, { 'X-CSRF-Token': await f.client.token(), Origin: 'https://attacker.test' }, { 'X-CSRF-Token': await f.client.token(), 'Sec-Fetch-Site': 'cross-site' }]) {
    assert.equal((await f.client.request('/api/stock-operations', { method: 'POST', headers })).status, 403);
  }
  f.state.admin.username = 'new-admin';
  assert.equal((await f.client.request('/api/stock-operations', { method: 'POST', headers: { 'X-CSRF-Token': await f.client.token() } })).status, 401);
  assert.equal(calls, 0);
});

test('stock responses distinguish first application/replay and pass only the authenticated Admin identity', async t => {
  let replayed = false;
  const f = await fixture(t, { operateStock: async (input, adminId) => {
    assert.deepEqual(input, body()); assert.equal(adminId, 1);
    return { operationId, replayed, balances: [], movements: [] };
  }, listMovements: async () => ({ data: [], page: { limit: 50, nextCursor: null } }) });
  await f.client.login();
  for (const status of [201, 200]) {
    const response = await f.client.request('/api/stock-operations', { method: 'POST', headers: { 'X-CSRF-Token': await f.client.token(), 'Content-Type': 'application/json' }, body: JSON.stringify(body()) });
    assert.equal(response.status, status); assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal((await response.json()).data.replayed, replayed); replayed = true;
  }
  for (const path of ['/api/stock-movements', `/api/materials/${first}/movements`]) {
    const response = await f.client.request(path); assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { data: [], page: { limit: 50, nextCursor: null } });
  }
  await f.client.logout();
  assert.equal((await f.client.request('/api/stock-movements')).status, 401);
});

test('stock request limits and validation errors reject unsafe requests without querying', async t => {
  let calls = 0;
  const repository = createInventoryRepository({ query: async () => { calls++; assert.fail(); }, connect: async () => { calls++; assert.fail(); } });
  const f = await fixture(t, repository); await f.client.login();
  const headers = { 'X-CSRF-Token': await f.client.token(), 'Content-Type': 'application/json' };
  for (const [payload, status] of [['{',400], [JSON.stringify({ ...body(), reason: 'x'.repeat(5000) }),413],
    [JSON.stringify({ ...body(), items: [{ materialId: first, quantity: '0.0001' }] }),422],
    [JSON.stringify({ ...body(), operationId:'bad' }),400], [JSON.stringify({ ...body(), adminId:1 }),422]]) {
    const response = await f.client.request('/api/stock-operations', { method:'POST',headers,body:payload });
    assert.equal(response.status, status);
  }
  for (const path of ['/api/stock-movements?limit=0', '/api/stock-movements?limit=1&limit=2', '/api/stock-movements?sort=bad', '/api/materials/bad/movements']) assert.equal((await f.client.request(path)).status,400);
  assert.equal(calls,0);
  for(const path of ['/server/stock.js','/server/stock-validation.js','/server/transaction.js']) assert.equal((await f.client.request(path)).status,404);
  for(const method of ['POST','PATCH','DELETE']) assert.equal((await f.client.request('/api/stock-movements',{method})).status,404);
});

test('unconfirmed stock outcomes instruct safe same-ID retries without exposing SQL or secrets', async t => {
  let code = 'ECONNRESET'; const logs=[];
  const f = await fixture(t, { operateStock: async () => { throw Object.assign(new Error('password=private SQL SELECT sensitive-record'), { code }); } });
  t.mock.method(console, 'error', message => logs.push(message));
  await f.client.login();
  for (const [errorCode,status] of [['ECONNRESET',503],['23503',409],['23505',409],['40P01',409]]) {
    code=errorCode;
    const response=await f.client.request('/api/stock-operations',{method:'POST',headers:{'X-CSRF-Token':await f.client.token(),'Content-Type':'application/json'},body:JSON.stringify(body())});
    assert.equal(response.status,status);
    const error=(await response.json()).error;
    assert.doesNotMatch(error,/private|SELECT|sensitive-record/);
    if(status===503) assert.match(error,/could not be confirmed.*same operationId/);
  }
  assert.doesNotMatch(logs.join(' '),/private|\bSQL\b|sensitive-record/);
});
