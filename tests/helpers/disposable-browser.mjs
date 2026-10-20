// Runs browser suites against a disposable authentication fixture. Production
// credentials, PostgreSQL, .env files and staff browser storage are never used.
import { fork } from 'node:child_process';
import { resolve } from 'node:path';
import { startTestServer, testCredentials } from './auth-server.mjs';
import { isolatedPostgres } from './isolated-postgres.mjs';
import { createInventoryRepository } from '../../server/inventory.js';
import { fixtureId } from './browser-fixture.mjs';

const suites = process.argv.slice(2);
if (!suites.length) throw new Error('Pass one or more browser suite paths.');
const db = process.env.TEST_PG_BIN ? await isolatedPostgres() : null;
const inventory = db ? createInventoryRepository(db.pool) : null;
const fixture = await startTestServer(inventory ? { inventory } : {});
if (db) await db.owner.query("INSERT INTO public.admin_account(id,username,password_hash) VALUES(1,'test-only','not-a-login-hash')");
async function seed(data) {
  if (!db) throw new Error('TEST_PG_BIN required for inventory browser suites.');
  // Only this helper's disposable cluster; never an external connection.
  await db.owner.query('TRUNCATE public.stock_movements, public.inventory_create_requests, public.materials, public.suppliers, public.categories');
  for (const row of data.categories || []) await db.owner.query('INSERT INTO public.categories(id,name,description) VALUES($1,$2,$3)', [fixtureId(row.id), row.name, row.description ?? null]);
  for (const row of data.suppliers || []) await db.owner.query('INSERT INTO public.suppliers(id,name,contact,phone,email,address,description) VALUES($1,$2,$3,$4,$5,$6,$7)', [fixtureId(row.id), row.name, row.contact ?? null, row.phone ?? null, row.email ?? null, row.address ?? null, row.description ?? null]);
  for (const row of data.materials || []) await db.owner.query(`INSERT INTO public.materials
    (id,name,category_id,supplier_id,current_stock,reorder_level,price,location,condition,serial_number,responsible_person,purchase_date,description,unit,created_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
  [fixtureId(row.id), row.name, fixtureId(row.categoryId), row.supplierId ? fixtureId(row.supplierId) : null, String(row.quantity ?? 0), row.reorderLevel == null ? null : String(row.reorderLevel), row.price == null ? null : String(row.price), row.location ?? null, row.condition ?? null, row.serial ?? null, row.responsible ?? null, row.purchaseDate || null, row.description ?? null, row.unit ?? null, row.createdAt || '2026-10-01T00:00:00Z']);
}
try {
  for (const suite of suites) {
    console.log(`Running ${suite} against disposable authentication and storage`);
    const status = await new Promise((done, reject) => {
      const child = fork(resolve(suite), [], {
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
        env: {
          ...process.env,
          NODE_ENV: 'test',
          TEST_BASE_URL: fixture.url,
          TEST_ADMIN_USERNAME: testCredentials.username,
          TEST_ADMIN_PASSWORD: testCredentials.password
        }
      });
      child.on('message', async message => {
        if (!message?.fixtureId) return;
        try {
          if (!db) throw new Error('TEST_PG_BIN required.');
          let value;
          if (message.command === 'seed') await seed(message.data);
          else if (message.command === 'read') value = { categories: await inventory.listCategories(), suppliers: await inventory.listSuppliers(), materials: await inventory.listMaterials() };
          else throw new Error('Unsupported fixture command');
          if (child.connected) child.send({ fixtureId: message.fixtureId, value });
        } catch (error) { if (child.connected) child.send({ fixtureId: message.fixtureId, error: error.message }); }
      });
      child.once('error', reject);
      child.once('exit', (code, signal) => signal ? reject(new Error(`Browser suite terminated: ${signal}`)) : done(code));
    });
    if (status !== 0) { process.exitCode = status || 1; break; }
  }
} finally { await fixture.close(); if (db) await db.close(); }
