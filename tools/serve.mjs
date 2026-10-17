import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { readServerConfig } from '../server/config.js';
import { createApp } from '../server/app.js';
import { createAdminRepository } from '../server/admin.js';

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), override: false, quiet: true });
let database, store;
try {
  let config;
  try { config = readServerConfig(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
  if (config) {
    database = await import('../app/config/db.js');
    await database.checkDatabaseConnection();
    // Read-only checks: no automatic schema creation or admin seeding.
    await database.pool.query('SELECT sid, sess, expire FROM public.inventory_sessions LIMIT 0');
    await database.pool.query('SELECT id, username, password_hash FROM public.admin_account LIMIT 0');
    const PgStore = connectPgSimple(session);
    store = new PgStore({ pool: database.pool, schemaName: 'public', tableName: 'inventory_sessions', createTableIfMissing: false,
      errorLog: () => console.error('Session storage unavailable. Check PostgreSQL and permissions.') });
    const app = await createApp({ config, store, admins: createAdminRepository(database.pool) });
    const server = app.listen(config.port, '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${server.address().port}`));
    let closing = false;
    async function shutdown() {
      if (closing) return;
      closing = true;
      const deadline = setTimeout(() => { console.error('Server shutdown timed out.'); process.exit(1); }, 10000);
      deadline.unref();
      server.close(async () => {
        try { await store.close(); await database.closeDatabase(); }
        catch { console.error('Could not close database resources cleanly.'); process.exitCode = 1; }
        clearTimeout(deadline);
      });
    }
    server.on('error', error => {
      console.error(error.code === 'EADDRINUSE' ? `Port ${config.port} is already in use. Set PORT to a different port.` : 'Server could not start.');
      process.exitCode = 1;
      void shutdown();
    });
    process.once('SIGTERM', shutdown);
    process.once('SIGINT', shutdown);
  }
} catch {
  console.error('Server startup failed. Verify database configuration, admin_account access, and the session-table migration/permissions.');
  process.exitCode = 1;
  try { if (store) await store.close(); if (database) await database.closeDatabase(); }
  catch { console.error('Database cleanup failed.'); }
}
