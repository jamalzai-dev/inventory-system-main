import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { validateWrite, decimal, expectedVersion, InventoryApiError } from '../server/inventory-validation.js';
import { createInventoryRepository } from '../server/inventory.js';
import { startTestServer, testClient } from './helpers/auth-server.mjs';

const id = '12345678-1234-4234-8234-123456789abc';
const version = 'a'.repeat(32);
const invalid = action => assert.throws(action, error => error instanceof InventoryApiError && error.status === 422);

test('write validation trims Unicode text and keeps missing, NULL, zero and empty string distinct', () => {
  assert.deepEqual(validateWrite('categories', { name: '  وسایل  ', description: null }, true), { name: 'وسایل', description: null });
  assert.deepEqual(validateWrite('suppliers', { description: '' }, false), { description: '' });
  assert.deepEqual(validateWrite('materials', { name: 'Laptop', categoryId: id, quantity: '0.000', price: '0.00', reorderLevel: null, location: '' }, true),
    { name: 'Laptop', categoryId: id, quantity: '0.000', price: '0.00', reorderLevel: null, location: '' });
  assert.deepEqual(validateWrite('materials', { supplierId: null }, false), { supplierId: null });
});

test('exact decimals reject numbers, exponents, signs, whitespace, precision overflow and out-of-range values', () => {
  for (const [scale, max] of [[3, '999999999.999'], [2, '999999999.99']]) {
    for (const value of ['0', '0.' + '0'.repeat(scale), max]) assert.equal(decimal(value, 'amount', scale), value);
    for (const value of [0, 1.5, NaN, Infinity, '', ' ', '-0', '-1', '+1', '1e2', '1,000', '00', '01.2', '.1', '1.', '1\n', ' 1', '1000000000', `0.${'0'.repeat(scale)}1`, `1.${'0'.repeat(scale + 1)}`]) invalid(() => decimal(value, 'amount', scale));
    assert.equal(decimal(null, 'amount', scale), null);
  }
});

test('validation rejects malformed payloads, required omissions, protected fields and all PATCH stock edits', () => {
  for (const body of [null, [], 'text', 1, {}, { name: '' }, { name: '  ' }, { name: null }, { name: {} }, { name: '\0' }, { name: '\uD800' }]) invalid(() => validateWrite('categories', body, true));
  for (const field of ['id', 'createdAt', 'updatedAt', 'version', 'current_stock', 'category_id', '__proto__', 'constructor', 'name = NULL; DROP TABLE materials']) {
    invalid(() => validateWrite('materials', Object.fromEntries([['name', 'Laptop'], ['categoryId', id], [field, 'x']]), true));
  }
  for (const quantity of ['1', '0.001', null, 0, '']) invalid(() => validateWrite('materials', { name: 'Laptop', categoryId: id, quantity }, true));
  for (const quantity of ['0', '0.000', '1', null]) invalid(() => validateWrite('materials', { quantity }, false));
  invalid(() => validateWrite('materials', {}, false));
  for (const body of [{ name: 'Laptop' }, { name: 'Laptop', categoryId: null }, { name: 'Laptop', categoryId: 'bad' }, { name: 'Laptop', categoryId: id, supplierId: '' }]) invalid(() => validateWrite('materials', body, true));
});

test('dates are calendar-validated without local timezone conversion and optional text types are checked', () => {
  for (const purchaseDate of ['2024-02-29', '2026-10-18', '0001-01-01', null]) assert.equal(validateWrite('materials', { purchaseDate }, false).purchaseDate, purchaseDate);
  for (const purchaseDate of ['2025-02-29', '2026-04-31', '0000-01-01', '2026-13-01', '2026-10-18T00:00:00Z', '', 123]) invalid(() => validateWrite('materials', { purchaseDate }, false));
  for (const field of ['contact', 'phone', 'email', 'address', 'description']) for (const value of [[], {}, true, 3]) invalid(() => validateWrite('suppliers', { [field]: value }, false));
  invalid(() => validateWrite('suppliers', { email: 'broken@' }, false));
  assert.equal(validateWrite('suppliers', { email: ' it@example.test ' }, false).email, 'it@example.test');
  for (const header of [undefined, version, '*', `W/"${version}"`, `"${version}","${version}"`]) assert.throws(() => expectedVersion(header), { status: 400 });
});

async function fixture(t, inventory) {
  const f = await startTestServer({ inventory }); t.after(f.close);
  return { ...f, client: testClient(f.url) };
}
test('all nine writes authenticate before CSRF and preserve credential revocation', async t => {
  let calls = 0;
  const inventory = { create: async () => calls++, update: async () => calls++, remove: async () => calls++ };
  const f = await fixture(t, inventory);
  const paths = ['categories', 'suppliers', 'materials'].flatMap(resource => [['POST', `/api/${resource}`], ['PATCH', `/api/${resource}/${id}`], ['DELETE', `/api/${resource}/${id}`]]);
  for (const [method, path] of paths) assert.equal((await f.client.request(path, { method })).status, 401);
  await f.client.login();
  for (const [method, path] of paths) {
    for (const headers of [{}, { 'X-CSRF-Token': 'bad' }, { 'X-CSRF-Token': await f.client.token(), Origin: 'https://attacker.test' }, { 'X-CSRF-Token': await f.client.token(), 'Sec-Fetch-Site': 'cross-site' }]) {
      assert.equal((await f.client.request(path, { method, headers })).status, 403);
    }
  }
  f.state.admin.username = 'changed';
  for (const [method, path] of paths) assert.equal((await f.client.request(path, { method })).status, 401);
  assert.equal(calls, 0);
});

test('request syntax, payload limit, IDs and preconditions fail safely before repository writes', async t => {
  let calls = 0;
  const f = await fixture(t, { create: async () => calls++, update: async () => calls++, remove: async () => calls++ });
  await f.client.login();
  const headers = { 'X-CSRF-Token': await f.client.token(), 'Content-Type': 'application/json' };
  assert.equal((await f.client.request('/api/categories', { method: 'POST', headers, body: '{' })).status, 400);
  assert.equal((await f.client.request('/api/categories', { method: 'POST', headers, body: JSON.stringify({ name: 'x'.repeat(5000) }) })).status, 413);
  assert.equal((await f.client.request('/api/categories', { method: 'POST', headers, body: '{"name":"Valid"}' })).status, 400);
  for (const resource of ['categories', 'suppliers', 'materials']) for (const method of ['PATCH', 'DELETE']) {
    assert.equal((await f.client.request(`/api/${resource}/bad`, { method, headers })).status, 400);
    assert.equal((await f.client.request(`/api/${resource}/${id}`, { method, headers })).status, 400);
  }
  assert.equal(calls, 0);
});

test('constraint and infrastructure errors have safe status/messages and never disclose driver detail', async t => {
  let error;
  const f = await fixture(t, { create: async () => { throw error; } });
  await f.client.login();
  t.mock.method(console, 'error', () => {});
  const headers = { 'X-CSRF-Token': await f.client.token(), 'Idempotency-Key': randomUUID(), 'Content-Type': 'application/json' };
  for (const [code, status] of [['23505',409], ['23503',422], ['23001',409], ['23514',422], ['23502',422], ['22003',422], ['22007',422], ['22P02',422], ['40001',409], ['40P01',409], ['ECONNREFUSED',503], ['42501',503], ['42P01',503]]) {
    error = Object.assign(new Error('private-password SQL sensitive record'), { code, constraint: 'private-table' });
    const response = await f.client.request('/api/categories', { method: 'POST', headers, body: '{}' });
    assert.equal(response.status, status, code);
    assert.doesNotMatch(await response.text(), /private|SQL|sensitive/);
  }
});

test('transaction failures roll back on the same client and release/discard failed connections', async () => {
  for (const failAt of ['BEGIN', 'SELECT', 'UPDATE', 'COMMIT']) for (const rollbackFails of [false, true]) {
    const commands = []; let released;
    const client = {
      async query(sql, values) {
        commands.push({ sql, values });
        if (sql.startsWith(failAt) || (sql === 'ROLLBACK' && rollbackFails)) throw new Error('injected');
        return { rows: [{ id, name: 'Name', version, current_stock: '0', created_at: new Date(), updated_at: new Date() }] };
      }, release(discard) { released = discard; }
    };
    const repository = createInventoryRepository({ connect: async () => client, query: () => assert.fail('pool.query used inside transaction') });
    await assert.rejects(repository.update('categories', id, { name: 'New' }, version));
    assert.equal(commands.at(-1).sql, 'ROLLBACK');
    assert.equal(released, rollbackFails);
    assert.equal(commands[0].sql, 'BEGIN ISOLATION LEVEL READ COMMITTED');
  }
});
