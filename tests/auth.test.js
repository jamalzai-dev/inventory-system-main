import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import session from 'express-session';
import { startTestServer, testClient, testCredentials } from './helpers/auth-server.mjs';
import { readServerConfig } from '../server/config.js';
import { setAdminCredentials, validateAdminCredentials, createAdminRepository } from '../server/admin.js';

test('public login assets load while pages, modules and APIs require authentication', async t => {
  const fixture = await startTestServer(); t.after(fixture.close);
  const client = testClient(fixture.url);
  for (const path of ['/login', '/login/login.css', '/login/login.js']) assert.equal((await client.request(path)).status, 200, path);
  for (const path of ['/', '/index.html', '/products.html', '/app/main.js', '/app/styles.css', '/app/search.js', '/app/dashboard.js', '/app/icons.js', '/assets/inventory.svg']) {
    const response = await client.request(path); assert.equal(response.status, 302, path); assert.equal(response.headers.get('location'), '/login');
  }
  for (const path of ['/api/auth/session', '/api/materials']) assert.equal((await client.request(path)).status, 401);
  for (const path of ['/app/config/db.js', '/server/app.js', '/.env', '/.env.example', '/package.json', '/tools/set-admin-credentials.mjs', '/db/migrations/002-inventory-sessions.sql', '/app/config%2fdb.js', '/login/../server/app.js']) assert.equal((await client.request(path)).status, 404, path);
});

test('invalid credentials have a generic response; successful login rotates session and logout invalidates it', async t => {
  const fixture = await startTestServer(); t.after(fixture.close);
  const client = testClient(fixture.url);
  const wrongUser = await client.login({ ...testCredentials, username: 'wrong' });
  const wrongPassword = await client.login({ ...testCredentials, password: 'wrong' });
  assert.equal(wrongUser.status, 401); assert.equal(wrongPassword.status, 401);
  assert.deepEqual(await wrongUser.json(), await wrongPassword.json());
  const previousCookie = client.cookie;
  const login = await client.login(); assert.equal(login.status, 200);
  const authCookie = client.cookie;
  assert.notEqual(authCookie, previousCookie);
  assert.match(login.headers.get('set-cookie'), /HttpOnly/); assert.match(login.headers.get('set-cookie'), /SameSite=Lax/);
  assert.doesNotMatch(login.headers.get('set-cookie'), /Secure/);
  assert.equal((await client.request('/')).status, 200);
  assert.equal((await client.request('/api/auth/session')).status, 200);
  assert.equal((await fetch(fixture.url + '/api/auth/session', { headers: { Cookie: previousCookie } })).status, 401);
  assert.equal((await client.request('/login')).headers.get('location'), '/');
  assert.equal((await client.logout()).status, 200);
  assert.equal((await client.request('/')).status, 302);
  assert.equal((await fetch(fixture.url + '/api/auth/session', { headers: { Cookie: authCookie } })).status, 401);
});

test('CSRF checks block absent tokens, foreign origins, cross-site metadata and stale login tokens', async t => {
  const fixture = await startTestServer(); t.after(fixture.close);
  const client = testClient(fixture.url);
  assert.equal((await client.request('/api/auth/login', { method: 'POST' })).status, 403);
  assert.equal((await client.login(testCredentials, { Origin: 'https://attacker.example' })).status, 403);
  assert.equal((await client.login(testCredentials, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  const oldToken = await client.token();
  assert.equal((await client.login()).status, 200);
  assert.equal((await client.request('/api/auth/logout', { method: 'POST', headers: { 'X-CSRF-Token': oldToken } })).status, 403);
  assert.equal((await client.request('/api/auth/session')).status, 200);
});

test('deleted, expired and credential-changed sessions lose access', async t => {
  const fixture = await startTestServer(); t.after(fixture.close);
  const client = testClient(fixture.url);
  await client.login();
  fixture.state.admin = { ...fixture.state.admin, username: 'updated-admin' };
  assert.equal((await client.request('/api/auth/session')).status, 401);
  fixture.state.admin.username = testCredentials.username;
  await client.login();
  for (const [sid, value] of Object.entries(fixture.store.sessions)) {
    const data = JSON.parse(value); data.cookie.expires = new Date(0).toISOString(); fixture.store.sessions[sid] = JSON.stringify(data);
  }
  assert.equal((await client.request('/api/auth/session')).status, 401);
  await client.login(); fixture.state.admin = null;
  assert.equal((await client.request('/api/auth/session')).status, 401);
});

test('login throttling limits repeated attempts and oversized requests fail safely', async t => {
  const fixture = await startTestServer({ loginLimit: 2 }); t.after(fixture.close);
  const client = testClient(fixture.url);
  assert.equal((await client.login({ ...testCredentials, password: 'bad' })).status, 401);
  assert.equal((await client.login({ ...testCredentials, password: 'bad' })).status, 401);
  assert.equal((await client.login()).status, 429);
  const response = await client.request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'x'.repeat(5000) }) });
  assert.equal(response.status, 413); assert.deepEqual(await response.json(), { error: 'Invalid request.' });
});

test('PostgreSQL session failures return sanitized errors and never grant access', async t => {
  const store = new session.MemoryStore();
  const fixture = await startTestServer({ store }); t.after(fixture.close);
  const client = testClient(fixture.url);
  await client.login();
  store.get = (_sid, callback) => callback(new Error('postgres://private-password sensitive records'));
  const response = await client.request('/api/auth/session');
  assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: 'Service temporarily unavailable.' });
});

test('HTTPS proxy configuration uses secure cookies and ignores untrusted forwarded headers by default', async t => {
  const fixture = await startTestServer({ config: { secure: true, trustProxy: true, origin: 'https://inventory.example.edu' } }); t.after(fixture.close);
  const response = await fetch(fixture.url + '/api/auth/csrf', { headers: { 'X-Forwarded-Proto': 'https' } });
  assert.match(response.headers.get('set-cookie'), /Secure/);
  const direct = await fetch(fixture.url + '/api/auth/csrf'); assert.equal(direct.headers.get('set-cookie'), null);
  const local = await startTestServer({ config: { secure: true, trustProxy: false } }); t.after(local.close);
  assert.equal((await fetch(local.url + '/api/auth/csrf', { headers: { 'X-Forwarded-Proto': 'https' } })).headers.get('set-cookie'), null);
});

test('failed session writes never return a successful CSRF initialization or login', async t => {
  const store = new session.MemoryStore();
  const fixture = await startTestServer({ store }); t.after(fixture.close);
  const client = testClient(fixture.url);
  const token = await client.token();
  store.set = (_sid, _data, callback) => callback(new Error('private session-store diagnostic'));
  const login = await client.request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token }, body: JSON.stringify(testCredentials) });
  assert.equal(login.status, 503); assert.deepEqual(await login.json(), { error: 'Service temporarily unavailable.' });
  const csrf = await client.request('/api/auth/csrf');
  assert.equal(csrf.status, 503); assert.deepEqual(await csrf.json(), { error: 'Service temporarily unavailable.' });
  assert.equal((await client.request('/api/auth/session')).status, 401);
});

test('server configuration fails safely for missing secrets and non-HTTPS production', () => {
  assert.throws(() => readServerConfig({}), /SESSION_SECRET/);
  const base = { SESSION_SECRET: 'test-only-secret-of-at-least-32-bytes' };
  assert.throws(() => readServerConfig({ ...base, NODE_ENV: 'production' }), /HTTPS/);
  assert.throws(() => readServerConfig({ ...base, APP_ORIGIN: 'https://user:secret@example.edu' }), /APP_ORIGIN/);
  const config = readServerConfig({ ...base, NODE_ENV: 'production', APP_ORIGIN: 'https://inventory.example.edu', TRUST_PROXY: '1' });
  assert.equal(config.secure, true); assert.equal(config.trustProxy, true);
});

test('admin bootstrap hashes credentials, parameterizes its singleton upsert and rejects unsafe input', async () => {
  let recorded;
  const pool = { query: async (sql, values) => { recorded = { sql, values }; } };
  await setAdminCredentials(pool, testCredentials.username, testCredentials.password);
  assert.match(recorded.sql, /ON CONFLICT \(id\) DO UPDATE/);
  assert.equal(recorded.values[0], testCredentials.username);
  assert.notEqual(recorded.values[1], testCredentials.password);
  assert.equal(await bcrypt.compare(testCredentials.password, recorded.values[1]), true);
  assert.equal(bcrypt.getRounds(recorded.values[1]), 12);
  for (const values of [['', testCredentials.password], [' admin ', testCredentials.password], ['admin', 'short'], ['admin', 'پ'.repeat(40)]]) assert.throws(() => validateAdminCredentials(...values));
  const admins = createAdminRepository({ query: async sql => { assert.match(sql, /WHERE id = 1/); return { rows: [] }; } });
  assert.equal(await admins.findAdmin(), null);
});
