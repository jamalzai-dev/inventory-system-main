import test from 'node:test';
import assert from 'node:assert/strict';
import { createInventoryRepository } from '../server/inventory.js';
import { startTestServer, testClient } from './helpers/auth-server.mjs';

const id = '12345678-1234-4234-8234-123456789abc';
const categoryId = '22345678-1234-4234-8234-123456789abc';
const supplierId = '32345678-1234-4234-8234-123456789abc';
const timestamp = new Date('2026-10-18T03:45:00.123Z');
const common = { id, name: 'د پوهنتون وسایل', description: null, created_at: timestamp, updated_at: timestamp, version: 'a'.repeat(32) };
const materialRow = { ...common, category_id: categoryId, current_stock: '999999999.999', supplier_id: supplierId,
  unit: 'pieces', serial_number: 'UNI-001', location: 'Lab', condition: 'Good', price: '999999999.99',
  purchase_date: '2026-10-18', responsible_person: 'احمد', reorder_level: '0.001' };
const expectedCommon = { id, name: common.name, description: null, createdAt: timestamp.toISOString(), updatedAt: timestamp.toISOString(), version: common.version };
const expectedMaterial = { ...expectedCommon, categoryId, quantity: '999999999.999', supplierId,
  unit: 'pieces', serial: 'UNI-001', location: 'Lab', condition: 'Good', price: '999999999.99',
  purchaseDate: '2026-10-18', responsible: 'احمد', reorderLevel: '0.001' };
const paths = ['/api/categories', '/api/suppliers', '/api/materials', `/api/materials/${id}`];

async function fixture(t, query = async () => ({ rows: [] })) {
  const calls = [];
  const inventory = createInventoryRepository({ query: async (sql, values) => {
    calls.push({ sql, values }); return query(sql, values);
  } });
  const server = await startTestServer({ inventory });
  t.after(server.close);
  return { ...server, inventory, calls, client: testClient(server.url) };
}

test('all inventory routes deny unauthenticated access before querying', async t => {
  const f = await fixture(t);
  for (const path of [...paths, '/api/materials/not-a-uuid']) {
    const response = await f.client.request(path);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'Authentication required.' });
  }
  assert.equal(f.calls.length, 0);
});

test('authenticated empty lists return data arrays; missing material returns 404', async t => {
  const f = await fixture(t);
  assert.equal((await f.client.login()).status, 200);
  for (const path of paths.slice(0, 3)) {
    const response = await f.client.request(path);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { data: [] });
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  const missing = await f.client.request(paths[3]);
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: 'Material not found.' });
  assert.equal(f.calls.length, 4);
});

test('category and supplier responses map allowed fields and preserve optional NULLs', async t => {
  const f = await fixture(t, async sql => ({ rows: [sql.includes('public.categories') ?
    { ...common, password_hash: 'never-expose', sess: { secret: true } } :
    { ...common, contact: 'IT office', phone: null, email: null, address: null, password_hash: 'never-expose' }] }));
  await f.client.login();
  assert.deepEqual(await (await f.client.request(paths[0])).json(), { data: [expectedCommon] });
  assert.deepEqual(await (await f.client.request(paths[1])).json(), { data: [
    { ...expectedCommon, contact: 'IT office', phone: null, email: null, address: null }
  ] });
});

test('material list and lookup map PostgreSQL names, exact decimals and calendar dates', async t => {
  const f = await fixture(t, async () => ({ rows: [{ ...materialRow, password_hash: 'never-expose', internal: 'private' }] }));
  await f.client.login();
  const list = await f.client.request(paths[2]);
  assert.equal(list.status, 200);
  assert.deepEqual(await list.json(), { data: [expectedMaterial] });
  const detail = await f.client.request(paths[3]);
  assert.equal(detail.status, 200);
  assert.deepEqual(await detail.json(), { data: expectedMaterial });
  const lookup = f.calls.at(-1);
  assert.match(lookup.sql, /WHERE id = \$1::uuid/);
  assert.ok(!lookup.sql.includes(id));
  assert.deepEqual(lookup.values, [id]);
});

test('all nullable material fields remain NULL instead of empty strings or zeros', async t => {
  const row = { ...materialRow, current_stock: '0.000' };
  const fields = ['supplier_id', 'unit', 'serial_number', 'location', 'condition', 'price', 'purchase_date', 'responsible_person', 'reorder_level', 'description'];
  for (const field of fields) row[field] = null;
  const f = await fixture(t, async () => ({ rows: [row] }));
  await f.client.login();
  const { data } = await (await f.client.request(paths[3])).json();
  for (const field of ['supplierId', 'unit', 'serial', 'location', 'condition', 'price', 'purchaseDate', 'responsible', 'reorderLevel', 'description']) assert.equal(data[field], null, field);
  assert.equal(data.quantity, '0.000');
});

test('repository never rounds or converts exact NUMERIC text to JavaScript numbers', async () => {
  const exact = '12345678901234567890.12345678901234567890';
  // Deliberately beyond the current domains, to detect future unsafe conversion.
  const repository = createInventoryRepository({ query: async () => ({ rows: [{ ...materialRow,
    current_stock: exact, price: '12345678901234567890.00', reorder_level: '0.000000001' }] }) });
  const result = await repository.findMaterial(id);
  assert.equal(result.quantity, exact);
  assert.equal(result.price, '12345678901234567890.00');
  assert.equal(result.reorderLevel, '0.000000001');
});

test('invalid and injection-shaped UUIDs fail with 400 before querying; uppercase UUIDs work', async t => {
  const f = await fixture(t);
  await f.client.login();
  for (const invalid of ['1', '0', '-1', '1.5', 'null', 'undefined', ' '.repeat(3), id.replaceAll('-', ''), `{${id}}`, `${id}x`, 'g' + id.slice(1), `${id}\n`, "' OR 1=1 --", '1; DROP TABLE materials']) {
    const response = await f.client.request(`/api/materials/${encodeURIComponent(invalid)}`);
    assert.equal(response.status, 400, invalid);
    assert.deepEqual(await response.json(), { error: 'Invalid material ID.' });
    await assert.rejects(f.inventory.findMaterial(invalid), /Invalid material ID/);
  }
  assert.equal(f.calls.length, 0);
  assert.equal((await f.client.request(`/api/materials/${id.toUpperCase()}`)).status, 404);
  assert.deepEqual(f.calls[0].values, [id.toUpperCase()]);
});

test('list queries have fixed ordering, explicit columns, and ignore unimplemented query parameters', async t => {
  const f = await fixture(t);
  await f.client.login();
  for (const path of paths.slice(0, 3)) {
    const response = await f.client.request(path + '?sort=DROP%20TABLE%20materials&filter=%27%20OR%201=1&limit=1&categoryId=invalid');
    assert.equal(response.status, 200);
  }
  for (const { sql, values } of f.calls) {
    assert.match(sql, /^SELECT /);
    assert.match(sql, /ORDER BY name, id$/);
    assert.doesNotMatch(sql, /SELECT \*|DROP|INSERT|UPDATE|DELETE|admin_account|inventory_sessions/);
    assert.deepEqual(values, []);
  }
  const sql = f.calls[2].sql;
  for (const field of ['current_stock', 'price', 'reorder_level']) assert.ok(sql.includes(`${field}::text AS ${field}`));
  assert.ok(sql.includes("to_char(purchase_date, 'YYYY-MM-DD')"));
});

test('database errors return sanitized 503 responses and logs while keeping authentication usable', async t => {
  const f = await fixture(t, async () => { throw new Error('password=secret SQL SELECT private-record postgres://private-host'); });
  await f.client.login();
  const logs = [];
  t.mock.method(console, 'error', (...args) => logs.push(args.join(' ')));
  for (const path of paths) {
    const response = await f.client.request(path);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'Service temporarily unavailable.' });
  }
  assert.equal(logs.length, 4);
  assert.doesNotMatch(logs.join(' '), /secret|private-record|private-host|SELECT/);
  assert.equal((await f.client.request('/api/auth/session')).status, 200);
});

test('logout and credential changes revoke inventory access without querying inventory', async t => {
  const f = await fixture(t);
  await f.client.login();
  assert.equal((await f.client.request(paths[0])).status, 200);
  await f.client.logout();
  for (const path of paths) assert.equal((await f.client.request(path)).status, 401);
  await f.client.login();
  f.state.admin = { ...f.state.admin, username: 'changed-admin' };
  for (const path of paths) assert.equal((await f.client.request(path)).status, 401);
  assert.equal(f.calls.length, 1);
});

test('unsupported write methods stay unavailable, supported writes require CSRF, and server source remains private', async t => {
  const f = await fixture(t);
  await f.client.login();
  for (const path of paths) for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const supported = (method === 'POST' && path !== paths[3]) || (['PATCH', 'DELETE'].includes(method) && path === paths[3]);
    assert.equal((await f.client.request(path, { method })).status, supported ? 403 : 404);
  }
  for (const path of ['/server/inventory.js', '/server/inventory-routes.js', '/server/inventory-writes.js', '/server/inventory-validation.js', '/db/migrations/003-inventory-create-requests.sql']) assert.equal((await f.client.request(path)).status, 404);
  assert.equal(f.calls.length, 0);
});
