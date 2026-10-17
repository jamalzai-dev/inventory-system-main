import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

const root = resolve(import.meta.dirname, '..');
// Disposable configuration lets these tests run without reading a developer's .env.
const artifacts = resolve(root, 'tests/artifacts');
await mkdir(artifacts, { recursive: true });
const fixture = await mkdtemp(resolve(artifacts, 'db-config-'));
await mkdir(resolve(fixture, 'app/config'), { recursive: true });
await mkdir(resolve(fixture, 'tools'));
await copyFile(resolve(root, 'app/config/db.js'), resolve(fixture, 'app/config/db.js'));
await copyFile(resolve(root, 'tools/check-db.mjs'), resolve(fixture, 'tools/check-db.mjs'));
after(() => rm(fixture, { recursive: true, force: true }));
const moduleUrl = pathToFileURL(resolve(fixture, 'app/config/db.js')).href;
const cleanEnvironment = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^PG/i.test(name)));
const configured = { PGDATABASE: 'test_database', PGUSER: 'test_user', PGPASSWORD: 'synthetic-test-password' };
function run(source, overrides = configured) {
  return spawnSync(process.execPath, ['--input-type=module', '-e', source], {
    cwd: resolve(root, 'tools'), env: { ...cleanEnvironment, ...overrides },
    encoding: 'utf8', timeout: 10000
  });
}
function succeeds(result) {
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
}

test('database configuration uses one lazy pool with loopback defaults and exact NUMERIC strings', () => {
  const result = run(`
    import assert from 'node:assert/strict';
    const db = await import(${JSON.stringify(moduleUrl)});
    assert.equal(db.pool, (await import(${JSON.stringify(moduleUrl)})).pool);
    const options = db.pool.options;
    for (const [key, value] of Object.entries({host:'127.0.0.1',port:5432,max:5,idleTimeoutMillis:30000,connectionTimeoutMillis:5000,ssl:false,application_name:'university-it-inventory'})) assert.equal(options[key],value);
    assert.equal(db.pool.totalCount, 0);
    await db.closeDatabase();
  `);
  succeeds(result);
  assert.equal(pg.types.getTypeParser(1700)('12345678901234567890.123456789'), '12345678901234567890.123456789');
});

test('database configuration rejects missing, empty, nonlocal and invalid port values safely', () => {
  const cases = [
    ...['PGDATABASE', 'PGUSER', 'PGPASSWORD'].flatMap(name => [{ [name]: undefined }, { [name]: '' }, { [name]: '   ' }]),
    ...['', '0', '65536', '-1', '5432.1', 'abc', '1e3'].map(PGPORT => ({ PGPORT })),
    ...['', 'database.example.edu', 'postgres://private-password@host/db', '192.168.1.1'].map(PGHOST => ({ PGHOST }))
  ];
  for (const invalid of cases) {
    const environment = { ...configured, ...invalid };
    for (const key of Object.keys(environment)) if (environment[key] === undefined) delete environment[key];
    const name = Object.keys(invalid)[0];
    const result = run(`
      import assert from 'node:assert/strict';
      await assert.rejects(import(${JSON.stringify(moduleUrl)}), error => {
        assert.equal(error.name, 'DatabaseConfigurationError');
        assert.ok(error.message.includes(${JSON.stringify(name)}));
        assert.ok(!error.message.includes('private-password'));
        assert.ok(!error.message.includes('synthetic-test-password'));
        return true;
      });
    `, environment);
    succeeds(result);
  }
});

test('database configuration accepts each supported loopback host and port boundaries', () => {
  for (const [PGHOST, PGPORT] of [['127.0.0.1', '1'], ['localhost', '5432'], ['::1', '65535']]) {
    succeeds(run(`
      import assert from 'node:assert/strict';
      const db = await import(${JSON.stringify(moduleUrl)});
      assert.equal(db.pool.options.host, process.env.PGHOST);
      assert.equal(db.pool.options.port, Number(process.env.PGPORT));
      await db.closeDatabase();
    `, { ...configured, PGHOST, PGPORT }));
  }
});

test('connection checks use SELECT 1, sanitize driver errors and close the pool', () => {
  succeeds(run(`
    import assert from 'node:assert/strict';
    const db = await import(${JSON.stringify(moduleUrl)});
    let queries = 0;
    db.pool.query = async sql => { assert.equal(sql, 'SELECT 1'); queries++; };
    await db.checkDatabaseConnection();
    assert.equal(queries, 1);
    db.pool.query = async () => { throw Object.assign(new Error('password=private-password; sensitive record'), {code:'28P01'}); };
    await assert.rejects(db.checkDatabaseConnection(), error => {
      assert.equal(error.name, 'DatabaseConnectionError');
      assert.match(error.message, /28P01/);
      assert.doesNotMatch(error.message, /private-password|sensitive record/);
      assert.equal(error.cause, undefined);
      return true;
    });
    const logs = [];
    const original = console.error;
    console.error = message => logs.push(message);
    try {
      db.pool.emit('error', Object.assign(new Error('private-password'), {code:'ECONNRESET'}));
      db.pool.emit('error', Object.assign(new Error('private-password'), {code:'postgres://private-password'}));
    } finally { console.error = original; }
    assert.match(logs[0], /ECONNRESET/);
    assert.doesNotMatch(logs.join(' '), /private-password|postgres:/);
    await db.closeDatabase();
    assert.equal(db.pool.ended, true);
  `));
});

test('connection CLI handles missing configuration with a safe nonzero exit', () => {
  const result = spawnSync(process.execPath, [resolve(fixture, 'tools/check-db.mjs')], {
    cwd: resolve(root, 'tools'), env: cleanEnvironment, encoding: 'utf8', timeout: 10000
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /PGDATABASE is required/);
  assert.doesNotMatch(result.stderr, /at file:|password=/);
  assert.equal(result.stdout, '');
});

test('dotenv resolves the module-relative root and preserves operating-system values', async () => {
  await writeFile(resolve(fixture, '.env'), 'PGHOST=localhost\nPGPORT=5433\nPGDATABASE=file_database\nPGUSER=file_user\nPGPASSWORD=synthetic-file-password\n');
  try {
    succeeds(run(`
      import assert from 'node:assert/strict';
      const db = await import(${JSON.stringify(moduleUrl)});
      assert.equal(db.pool.options.host, 'localhost');
      assert.equal(db.pool.options.port, 5433);
      assert.equal(db.pool.options.database, 'os_database');
      assert.equal(db.pool.options.user, 'file_user');
      assert.equal(db.pool.options.password, 'synthetic-file-password');
      await db.closeDatabase();
    `, { PGDATABASE: 'os_database' }));
  } finally { await rm(resolve(fixture, '.env')); }
});
