import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { isolatedPostgres } from './helpers/isolated-postgres.mjs';
import { createInventoryRepository } from '../server/inventory.js';
import { startTestServer, testClient } from './helpers/auth-server.mjs';

test('optional archive migration and history safety on real PostgreSQL', { skip: !process.env.TEST_PG_BIN }, async t => {
  const db = await isolatedPostgres(); t.after(db.close);
  await db.owner.query("INSERT INTO public.admin_account(id,username,password_hash) VALUES(1,'test','test-hash')");
  const repo = createInventoryRepository(db.pool);
  const category = await repo.create('categories', { name: 'Archive fixture' }, randomUUID());
  let material = await repo.create('materials', { name: 'Cable', categoryId: category.id }, randomUUID());
  await t.test('old schema continues working and rejects archive explicitly', async () => {
    assert.equal(material.archiveSupported, false);
    await assert.rejects(repo.archiveMaterial(material.id, { archived: true }, material.version), /reviewed database migration/);
    assert.equal((await repo.findMaterial(material.id)).archived, false);
  });
  await db.owner.query(await readFile(new URL('../db/migrations/004-material-archive.sql', import.meta.url), 'utf8'));
  await t.test('positive stock cannot be archived; zero stock history is preserved', async () => {
    await repo.operateStock({ operationId: randomUUID(), type: 'add', items: [{ materialId: material.id, quantity: '0.500' }] }, 1);
    material = await repo.findMaterial(material.id);
    assert.equal(material.archiveSupported, true);
    await assert.rejects(repo.archiveMaterial(material.id, { archived: true }, material.version), /zero-stock/);
    await repo.operateStock({ operationId: randomUUID(), type: 'remove', items: [{ materialId: material.id, quantity: '0.500' }] }, 1);
    material = await repo.findMaterial(material.id);
    const before = await repo.listMovements({}, material.id);
    const archived = await repo.archiveMaterial(material.id, { archived: true }, material.version);
    assert.equal(archived.archived, true); assert.equal(archived.hasHistory, true);
    assert.deepEqual(await repo.listMovements({}, material.id), before);
    await assert.rejects(repo.remove('materials', material.id, archived.version), error => ['23001','23503'].includes(error.code));
  });
  await t.test('archive blocks new stock but old UUID replay stays safe; reactivation is versioned', async () => {
    const operation = (await repo.listMovements({}, material.id)).data[0];
    const replay = await repo.operateStock({ operationId: operation.operationId, type: 'remove', items: [{ materialId: material.id, quantity: '0.500' }] }, 1);
    assert.equal(replay.replayed, true);
    await assert.rejects(repo.operateStock({ operationId: randomUUID(), type: 'add', items: [{ materialId: material.id, quantity: '1' }] }, 1), /Archived/);
    await assert.rejects(repo.archiveMaterial(material.id, { archived: false }, material.version), /changed/);
    material = await repo.findMaterial(material.id);
    material = await repo.archiveMaterial(material.id, { archived: false }, material.version);
    assert.equal(material.archived, false);
    await repo.operateStock({ operationId: randomUUID(), type: 'add', items: [{ materialId: material.id, quantity: '1' }] }, 1);
  });
  await t.test('archive HTTP endpoint requires authentication, CSRF and a valid version', async () => {
    const server = await startTestServer({ inventory: repo }); t.after(server.close);
    const client = testClient(server.url), path = `/api/materials/${material.id}/archive`;
    assert.equal((await client.request(path, { method: 'PATCH' })).status, 401);
    await client.login();
    assert.equal((await client.request(path, { method: 'PATCH' })).status, 403);
    const token = await client.token();
    assert.equal((await client.request(path, { method: 'PATCH', headers: { 'X-CSRF-Token': token, 'Content-Type': 'application/json' }, body: JSON.stringify({ archived: true }) })).status, 400);
  });
});
