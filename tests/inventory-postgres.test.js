import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { isolatedPostgres } from './helpers/isolated-postgres.mjs';
import { createInventoryRepository } from '../server/inventory.js';
import { startTestServer, testClient } from './helpers/auth-server.mjs';

test('real PostgreSQL writes in a separately initialized disposable cluster', {
  skip: !process.env.TEST_PG_BIN ? 'Set TEST_PG_BIN to run isolated PostgreSQL integration tests.' : false,
  timeout: 120000
}, async t => {
  const db = await isolatedPostgres();
  const inventory = createInventoryRepository(db.pool);
  let fixture;
  try {
    fixture = await startTestServer({ inventory });
    const client = testClient(fixture.url);
    assert.equal((await client.login()).status, 200);
    const csrf = await client.token();
    async function write(resource, method, body, record, key = randomUUID()) {
      const response = await client.request(`/api/${resource}${method === 'POST' ? '' : '/' + record.id}`, {
        method, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf,
          'Idempotency-Key': key, 'If-Match': `"${record?.version}"` },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
      assert.equal(response.headers.get('cache-control'), 'no-store');
      return { status: response.status, ...(response.status === 204 ? {} : await response.json()) };
    }
    async function create(resource, body, key) {
      const result = await write(resource, 'POST', body, null, key);
      assert.equal(result.status, 201, JSON.stringify(result));
      assert.match(result.data.version, /^[a-f0-9]{32}$/);
      return result.data;
    }
    const absent = { id: randomUUID(), version: 'a'.repeat(32) };
    let category, supplier, material;

    await t.test('runtime has limited role; create Unicode category, normalized uniqueness and required validation', async () => {
      assert.equal((await db.pool.query('SELECT current_user')).rows[0].current_user, 'inventory_app');
      assert.equal((await db.pool.query("SELECT rolsuper FROM pg_roles WHERE rolname=current_user")).rows[0].rolsuper, false);
      category = await create('categories', { name: '  وسایل Computers  ', description: null });
      assert.equal(category.name, 'وسایل Computers');
      assert.equal(category.description, null);
      assert.equal((await write('categories', 'POST', { name: 'وسایل COMPUTERS' })).status, 409);
      assert.equal((await write('categories', 'POST', {})).status, 422);
      assert.equal((await write('categories', 'PATCH', { name: 'Missing' }, absent)).status, 404);
      assert.equal((await write('categories', 'DELETE', undefined, absent)).status, 404);
    });

    await t.test('category PATCH updates supplied fields, timestamps and version; stale PATCH/DELETE conflict', async () => {
      const before = category;
      const updated = await write('categories', 'PATCH', { description: '' }, before);
      assert.equal(updated.status, 200);
      category = updated.data;
      assert.equal(category.name, before.name);
      assert.equal(category.description, '');
      assert.equal(category.createdAt, before.createdAt);
      assert.notEqual(category.version, before.version);
      assert.equal((await write('categories', 'PATCH', { name: 'Stale' }, before)).status, 409);
      assert.equal((await write('categories', 'DELETE', undefined, before)).status, 409);
      assert.equal((await write('categories', 'PATCH', {}, category)).status, 422);
    });

    await t.test('supplier create/update keeps optional NULL and empty text, prevents duplicate names', async () => {
      supplier = await create('suppliers', { name: '  Supplier One ', contact: 'احمد', email: null, phone: '', address: null });
      assert.equal(supplier.contact, 'احمد'); assert.equal(supplier.email, null); assert.equal(supplier.phone, '');
      assert.equal(supplier.description, null);
      assert.equal((await write('suppliers', 'POST', { name: 'supplier ONE' })).status, 409);
      const result = await write('suppliers', 'PATCH', { contact: null, email: 'staff@example.test' }, supplier);
      assert.equal(result.status, 200); supplier = result.data;
      assert.equal(supplier.name, 'Supplier One'); assert.equal(supplier.contact, null); assert.equal(supplier.phone, '');
      assert.equal((await write('suppliers', 'PATCH', { phone: 'x' }, absent)).status, 404);
    });

    await t.test('material creates at database zero with missing optional fields and exact nullable metadata', async () => {
      material = await create('materials', { name: 'Laptop', categoryId: category.id, supplierId: supplier.id });
      assert.equal(material.quantity, '0');
      for (const field of ['serial', 'location', 'condition', 'price', 'purchaseDate', 'responsible', 'unit', 'reorderLevel', 'description']) assert.equal(material[field], null, field);
      const updated = await write('materials', 'PATCH', { serial: ' SERIAL-1 ', price: '999999999.99', reorderLevel: '999999999.999', purchaseDate: '2024-02-29', location: '', condition: null }, material);
      assert.equal(updated.status, 200); material = updated.data;
      assert.equal(material.price, '999999999.99'); assert.equal(material.reorderLevel, '999999999.999');
      assert.equal(material.purchaseDate, '2024-02-29'); assert.equal(material.quantity, '0');
      assert.equal(material.serial, 'SERIAL-1'); assert.equal(material.location, ''); assert.equal(material.condition, null);
      const read = await (await client.request(`/api/materials/${material.id}`)).json();
      assert.deepEqual(read.data, material);
    });

    await t.test('invalid references/decimals/dates/stock fail without creating records or receipts', async () => {
      const base = { name: 'Invalid material', categoryId: category.id };
      const invalidBodies = [
        { ...base, categoryId: randomUUID() }, { ...base, supplierId: randomUUID() },
        ...['-0.01', '1.001', '1000000000', 12.5].map(price => ({ ...base, price })),
        ...['-1', '1.0001', 2].map(reorderLevel => ({ ...base, reorderLevel })),
        { ...base, purchaseDate: '2025-02-29' }, { ...base, quantity: '0.001' }, { ...base, current_stock: '2' }
      ];
      for (const body of invalidBodies) {
        const key = randomUUID();
        assert.equal((await write('materials', 'POST', body, null, key)).status, 422);
        assert.equal((await db.pool.query('SELECT count(*) FROM public.inventory_create_requests WHERE request_key=$1', [key])).rows[0].count, '0');
      }
      for (const body of [{ quantity: '0' }, { categoryId: randomUUID() }, { supplierId: randomUUID() }, { updatedAt: '2026-01-01' }]) assert.equal((await write('materials', 'PATCH', body, material)).status, 422);
      assert.equal((await inventory.findMaterial(material.id)).quantity, '0');
      assert.equal((await write('materials', 'PATCH', { name: 'Missing' }, absent)).status, 404);
    });

    await t.test('serial uniqueness is trimmed/case-insensitive while NULL and blank serials remain allowed', async () => {
      assert.equal((await write('materials', 'POST', { name: 'Duplicate', categoryId: category.id, serial: ' serial-1 ' })).status, 409);
      const other = await create('materials', { name: 'Other', categoryId: category.id, serial: '' });
      assert.equal((await write('materials', 'PATCH', { serial: 'serial-1' }, other)).status, 409);
      await create('materials', { name: 'Other blank', categoryId: category.id, serial: '' });
      const updated = await write('materials', 'PATCH', { price: null, reorderLevel: '0.000', purchaseDate: null, description: '' }, material);
      assert.equal(updated.status, 200); material = updated.data;
      assert.equal(material.price, null); assert.equal(material.reorderLevel, '0.000'); assert.equal(material.purchaseDate, null);
    });

    await t.test('category RESTRICT preserves dependents; supplier deletion SET NULL preserves materials and invalidates versions', async () => {
      await assert.rejects(inventory.remove('categories', category.id, category.version), error => ['23001', '23503'].includes(error.code));
      assert.equal((await write('categories', 'DELETE', undefined, category)).status, 409);
      assert.equal((await write('suppliers', 'DELETE', undefined, supplier)).status, 204);
      const fresh = await inventory.findMaterial(material.id);
      assert.equal(fresh.supplierId, null); assert.equal(fresh.name, material.name); assert.equal(fresh.categoryId, category.id);
      assert.notEqual(fresh.version, material.version);
      assert.equal((await write('materials', 'PATCH', { name: 'Old supplier data' }, material)).status, 409);
      material = JSON.parse(JSON.stringify(fresh));
      assert.equal((await write('suppliers', 'DELETE', undefined, supplier)).status, 404);
      const unused = await create('categories', { name: 'Unused' });
      assert.equal((await write('categories', 'DELETE', undefined, unused)).status, 204);
    });

    await t.test('zero-stock materials delete; positive stock and history restrict deletion without losing records', async () => {
      const removable = await create('materials', { name: 'Disposable', categoryId: category.id, quantity: '0.000' });
      assert.equal((await write('materials', 'DELETE', undefined, removable)).status, 204);
      assert.equal(await inventory.findMaterial(removable.id), null);
      const stocked = await create('materials', { name: 'Stocked fixture', categoryId: category.id });
      // Test-only SQL simulates future Phase 3B-2 state; never sent to production.
      await db.owner.query('UPDATE public.materials SET current_stock=$1 WHERE id=$2', ['0.001', stocked.id]);
      const fresh = await inventory.findMaterial(stocked.id);
      assert.equal((await write('materials', 'DELETE', undefined, fresh)).status, 409);
      await db.owner.query("INSERT INTO public.admin_account(id,username,password_hash) VALUES(1,'test-only','not-a-login-hash')");
      await db.owner.query('INSERT INTO public.stock_movements(material_id,quantity_delta,operation_id) VALUES($1,$2,$3)', [material.id, '1', randomUUID()]);
      assert.equal((await write('materials', 'DELETE', undefined, material)).status, 409);
      assert.equal((await db.pool.query('SELECT count(*) FROM public.stock_movements WHERE material_id=$1', [material.id])).rows[0].count, '1');
      assert.ok(await inventory.findMaterial(material.id));
    });

    await t.test('three concurrent updates with the same version produce one winner and two stale conflicts', async () => {
      const results = await Promise.all(['A', 'B', 'C'].map(name => write('materials', 'PATCH', { name }, material)));
      assert.deepEqual(results.map(r => r.status).sort(), [200,409,409]);
      const winner = results.find(r => r.status === 200).data;
      assert.equal((await inventory.findMaterial(material.id)).name, winner.name);
      assert.equal((await write('materials', 'DELETE', undefined, material)).status, 409);
      material = winner;
    });

    await t.test('concurrent POST retries create one material and one durable receipt even without a serial', async () => {
      const key = randomUUID();
      const body = { name: 'No serial retry', categoryId: category.id, price: '0.00' };
      const results = await Promise.all([1,2,3].map(() => write('materials', 'POST', body, null, key)));
      for (const result of results) { assert.equal(result.status,201); assert.deepEqual(result.data, results[0].data); }
      assert.equal((await db.pool.query('SELECT count(*) FROM public.materials WHERE name=$1', [body.name])).rows[0].count, '1');
      assert.equal((await db.pool.query('SELECT count(*) FROM public.inventory_create_requests WHERE request_key=$1', [key])).rows[0].count, '1');
      const receipt = (await db.pool.query('SELECT * FROM public.inventory_create_requests WHERE request_key=$1', [key])).rows[0];
      assert.deepEqual(Object.keys(receipt).sort(), ['created_at', 'record_id', 'request_hash', 'request_key', 'resource']);
      assert.equal(receipt.record_id, results[0].data.id);
      // Recreated repository/server simulates loss of all process-local retry state.
      const freshRepository = createInventoryRepository(db.pool);
      assert.deepEqual(JSON.parse(JSON.stringify(await freshRepository.create('materials', { price:'0.00', categoryId: category.id, name: body.name }, key))), results[0].data);
      const edited = await write('materials', 'PATCH', { description: 'Changed after creation' }, results[0].data);
      assert.equal(edited.status, 200);
      assert.deepEqual((await write('materials', 'POST', body, null, key)).data, edited.data, 'replay returns current record, never reapplies the old payload');
      assert.equal((await write('materials', 'POST', { ...body, price: null }, null, key)).status, 409);
      assert.equal((await write('categories', 'POST', { name: 'Different resource' }, null, key)).status, 409);
      assert.equal((await write('materials', 'DELETE', undefined, edited.data)).status, 204);
      assert.equal((await write('materials', 'POST', body, null, key)).status, 409);
      assert.equal(await inventory.findMaterial(results[0].data.id), null, 'retry after deletion must not recreate data');
    });

    await t.test('conflicting concurrent requests sharing a key yield one creation and one conflict', async () => {
      const key = randomUUID();
      const results = await Promise.all(['First', 'Second'].map(name => write('categories', 'POST', { name }, null, key)));
      assert.deepEqual(results.map(r => r.status).sort(), [201,409]);
      assert.equal((await db.pool.query('SELECT count(*) FROM public.categories WHERE name=ANY($1)', [['First','Second']])).rows[0].count, '1');
    });

    await t.test('receipt INSERT failure rolls back the inventory INSERT; corrected retry succeeds exactly once', async () => {
      const key = randomUUID();
      await db.owner.query(`CREATE FUNCTION public.reject_test_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failure' USING ERRCODE='23514'; END $$;
        CREATE TRIGGER test_receipt_failure BEFORE INSERT ON public.inventory_create_requests FOR EACH ROW EXECUTE FUNCTION public.reject_test_receipt()`);
      try {
        assert.equal((await write('categories', 'POST', { name: 'Atomic failure' }, null, key)).status, 422);
        assert.equal((await db.pool.query("SELECT count(*) FROM public.categories WHERE name='Atomic failure'")).rows[0].count, '0');
        assert.equal((await db.pool.query('SELECT count(*) FROM public.inventory_create_requests WHERE request_key=$1', [key])).rows[0].count, '0');
      } finally { await db.owner.query('DROP TRIGGER test_receipt_failure ON public.inventory_create_requests; DROP FUNCTION public.reject_test_receipt()'); }
      await create('categories', { name: 'Atomic failure' }, key);
      assert.equal((await db.pool.query('SELECT count(*) FROM public.inventory_create_requests WHERE request_key=$1', [key])).rows[0].count, '1');
    });

    await t.test('missing receipt permissions fail closed before inventory insertion, reads remain available', async () => {
      await db.owner.query('REVOKE SELECT ON public.inventory_create_requests FROM inventory_app');
      try {
        assert.equal((await write('categories', 'POST', { name: 'Permission failure' })).status, 503);
        assert.equal((await client.request('/api/categories')).status, 200);
        assert.equal((await db.pool.query("SELECT count(*) FROM public.categories WHERE name='Permission failure'")).rows[0].count, '0');
      } finally { await db.owner.query('GRANT SELECT ON public.inventory_create_requests TO inventory_app'); }
    });

    await t.test('unapplied receipt migration fails closed without a partial creation', async () => {
      await db.owner.query('ALTER TABLE public.inventory_create_requests RENAME TO held_test_receipts');
      try {
        assert.equal((await write('categories', 'POST', { name: 'Missing migration' })).status, 503);
        assert.equal((await db.pool.query("SELECT count(*) FROM public.categories WHERE name='Missing migration'")).rows[0].count, '0');
        assert.equal((await client.request('/api/materials')).status, 200);
      } finally { await db.owner.query('ALTER TABLE public.held_test_receipts RENAME TO inventory_create_requests'); }
    });

    await t.test('SQL-looking Unicode values remain text and domain checks still enforce database integrity', async () => {
      const name = "وسایل '); DROP TABLE materials; --";
      const row = await create('categories', { name }); assert.equal(row.name, name);
      assert.equal((await db.pool.query("SELECT to_regclass('public.materials') AS table_exists")).rows[0].table_exists, 'materials');
      await assert.rejects(db.pool.query('UPDATE public.materials SET current_stock=$1 WHERE id=$2', ['-1', material.id]), { code: '23514' });
      assert.equal((await inventory.findMaterial(material.id)).quantity, '0');
    });

    await t.test('DELETE waits for a concurrent stock change and then rejects the stale version', async () => {
      const row = await create('materials', { name: 'Race fixture', categoryId: category.id });
      const blocker = await db.pool.connect();
      let pending;
      try {
        await blocker.query('BEGIN');
        await blocker.query('UPDATE public.materials SET current_stock=$1 WHERE id=$2', ['1', row.id]);
        pending = write('materials', 'DELETE', undefined, row);
        let blocked = false;
        for (let i=0; i<100; i++) {
          const waiting = await db.owner.query("SELECT count(*) FROM pg_stat_activity WHERE datname='inventory_api_test' AND wait_event_type='Lock' AND query LIKE '%FOR UPDATE%'");
          if (waiting.rows[0].count !== '0') { blocked = true; break; }
          await new Promise(done => setTimeout(done, 10));
        }
        assert.equal(blocked, true, 'DELETE must acquire a real PostgreSQL row lock');
        await blocker.query('COMMIT');
        assert.equal((await pending).status, 409);
        assert.equal((await inventory.findMaterial(row.id)).quantity, '1');
      } finally { await blocker.query('ROLLBACK'); blocker.release(); if (pending) await pending; }
    });

    await t.test('all application clients are released after successes, conflicts and rollback', async () => {
      assert.equal(db.pool.waitingCount, 0);
      assert.equal(db.pool.idleCount, db.pool.totalCount);
      const active = await db.owner.query("SELECT count(*) FROM pg_stat_activity WHERE datname='inventory_api_test' AND state='idle in transaction'");
      assert.equal(active.rows[0].count, '0');
    });
  } finally {
    if (fixture) await fixture.close();
    await db.close();
  }
});
