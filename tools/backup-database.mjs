// Read-only database export. No restore, production connection defaults or scheduler.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, open, rename, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const execute = promisify(execFile);

export async function backupDatabase({ bin, directory, database, username, host = '127.0.0.1', port = '5432', env = process.env }) {
  if (!bin || !directory || !database || !username || !['127.0.0.1','localhost','::1'].includes(host) || !/^\d{1,5}$/.test(String(port)) || +port < 1 || +port > 65535 || [database, username].some(value => typeof value !== 'string' || value.startsWith('-') || /[\r\n]/.test(value))) throw new Error('Supply PostgreSQL bin, protected backup directory, database, username and a valid loopback port.');
  await mkdir(directory, { recursive: true });
  const file = join(resolve(directory), `inventory-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.dump`);
  const partial = file + '.partial';
  await (await open(partial, 'wx', 0o600)).close();
  const command = name => join(bin, name + (process.platform === 'win32' ? '.exe' : ''));
  const options = { env, windowsHide: true, timeout: 30 * 60 * 1000, maxBuffer: 8 * 1024 * 1024 };
  try {
    await execute(command('pg_dump'), ['--host', host, '--port', String(port), '--username', username, '--dbname', database, '--no-password', '--format=custom', '--exclude-table-data=public.inventory_sessions', '--file', partial], options);
    const { stdout } = await execute(command('pg_restore'), ['--list', partial], options);
    for (const table of ['materials','categories','suppliers','stock_movements','inventory_create_requests','admin_account']) if (!stdout.includes(`TABLE DATA public ${table} `)) throw new Error('Incomplete inventory archive.');
    if (stdout.includes('TABLE DATA public inventory_sessions ')) throw new Error('Session data must not be in this archive.');
    const sha256 = createHash('sha256').update(await readFile(partial)).digest('hex');
    await rename(partial, file);
    await writeFile(file + '.sha256', sha256 + '\n', { flag: 'wx', mode: 0o600 });
    return { file, sha256 };
  } catch { throw new Error('Backup failed. A .partial file may remain; do not treat it as a backup. Check PostgreSQL tools, pgpass permissions, free space and database access locally.'); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [bin, directory, database, username, port = '5432'] = process.argv.slice(2);
  try { const result = await backupDatabase({ bin, directory, database, username, port }); console.log(`Verified archive: ${result.file}\nSHA-256: ${result.sha256}\nA restore rehearsal is still required. Keep this archive protected; it contains Admin password hashes.`); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
