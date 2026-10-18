// Creates its OWN cluster. Never reads .env or accepts a target database URL.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import pg from 'pg';

const run = promisify(execFile);
export async function isolatedPostgres() {
  const bin = process.env.TEST_PG_BIN;
  if (!bin) throw new Error('TEST_PG_BIN must point to the local PostgreSQL binaries.');
  const executable = name => join(bin, name + (process.platform === 'win32' ? '.exe' : ''));
  const artifacts = resolve(import.meta.dirname, '../artifacts');
  await mkdir(artifacts, { recursive: true });
  const root = await mkdtemp(join(artifacts, 'isolated-pg-'));
  const data = join(root, 'data');
  const password = randomBytes(32).toString('hex');
  const passwordFile = join(root, 'password');
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^PG/i.test(name)));
  const exec = (name, args) => run(executable(name), args, { windowsHide: true, env, timeout: 30000 });
  let started = false, owner, pool;
  async function close() {
    if (pool) await pool.end();
    if (owner) await owner.end();
    if (started) await exec('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    // Root is a unique mkdtemp directory under tests/artifacts, never a supplied path.
    if (!root.startsWith(artifacts + (process.platform === 'win32' ? '\\' : '/'))) throw new Error('Unsafe test cleanup path.');
    await rm(root, { recursive: true, force: true });
  }
  try {
    await writeFile(passwordFile, password, { mode: 0o600 });
    await exec('initdb', ['-D', data, '--username=test_owner', '--pwfile=' + passwordFile,
      '--auth=scram-sha-256', '--encoding=UTF8', '--no-locale']);
    await rm(passwordFile);
    const socket = createServer();
    await new Promise((done, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', done); });
    const port = socket.address().port;
    await new Promise(done => socket.close(done));
    await exec('pg_ctl', ['-D', data, '-l', join(root, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start']);
    started = true;
    const connection = { host: '127.0.0.1', port, user: 'test_owner', password, database: 'postgres', connectionTimeoutMillis: 5000 };
    owner = new pg.Pool(connection);
    await owner.query('CREATE DATABASE inventory_api_test');
    await owner.end();
    owner = new pg.Pool({ ...connection, database: 'inventory_api_test' });
    // The application role deliberately has no SUPERUSER/CREATEDB/BYPASSRLS powers.
    await owner.query('CREATE ROLE inventory_app NOLOGIN');
    await owner.query(await readFile(resolve(import.meta.dirname, '../fixtures/inventory-schema.sql'), 'utf8'));
    await owner.query(await readFile(resolve(import.meta.dirname, '../../db/migrations/003-inventory-create-requests.sql'), 'utf8'));
    await owner.query('GRANT USAGE ON SCHEMA public TO inventory_app');
    await owner.query('GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories, public.suppliers, public.materials, public.stock_movements TO inventory_app');
    // Each application connection begins in the limited role, including pool.connect().
    pool = new pg.Pool({ ...connection, database: 'inventory_api_test', options: '-c role=inventory_app', max: 5 });
    return { pool, owner, close };
  } catch (error) {
    await close();
    throw error;
  }
}
