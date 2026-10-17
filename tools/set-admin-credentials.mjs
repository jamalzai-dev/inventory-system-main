import { setAdminCredentials } from '../server/admin.js';

let database;
try {
  database = await import('../app/config/db.js');
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) {
    console.error('Set ADMIN_USERNAME and ADMIN_PASSWORD privately before running this command.');
    process.exitCode = 1;
  } else {
    await setAdminCredentials(database.pool, username, password);
    console.log('Shared Admin credentials saved. Existing sessions will require a new sign-in.');
  }
} catch {
  console.error('Could not save Admin credentials. Check PostgreSQL, table permissions, a 1–100 character username, and a password of at least 12 characters (maximum 72 UTF-8 bytes).');
  process.exitCode = 1;
} finally {
  delete process.env.ADMIN_PASSWORD;
  if (database) {
    try { await database.closeDatabase(); }
    catch { console.error('Database pool could not close cleanly.'); process.exitCode = 1; }
  }
}
