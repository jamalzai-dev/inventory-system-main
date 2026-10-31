import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { startTestServer, testClient } from './helpers/auth-server.mjs';

test('public offline assets issue no session cookies while private pages and APIs stay protected', async t => {
  const server = await startTestServer(); t.after(server.close); const client = testClient(server.url);
  for (const path of ['/offline.html','/offline.css','/offline.js','/service-worker.js','/manifest.webmanifest','/assets/icon-192.png','/assets/icon-512.png']) {
    const response = await client.request(path); assert.equal(response.status, 200, path); assert.equal(response.headers.get('set-cookie'), null, path);
    assert.equal(response.headers.get('cache-control'), 'no-store'); await response.arrayBuffer();
  }
  for (const path of ['/', '/app/main.js','/app/pwa.js','/app/api.js']) assert.equal((await client.request(path)).status, 302);
  for (const path of ['/api/materials','/api/stock-movements']) assert.equal((await client.request(path)).status, 401);
});
test('worker ignores API traffic, all writes, protected assets and cross-origin requests', async () => {
  const events = {}, origin = 'https://inventory.test';
  vm.runInNewContext(await readFile('service-worker.js','utf8'), { URL, Set, self: { location: { origin }, addEventListener: (name, handler) => { events[name] = handler; } } });
  for (const [path, method, mode] of [['/api/materials','GET','cors'],['/api/auth/session','GET','navigate'],['/api/stock-operations','POST','cors'],['/offline.html','POST','cors'],['/app/main.js','GET','cors'],['https://other.test/offline.html','GET','cors']]) {
    let handled = false; events.fetch({ request: { url: new URL(path,origin).href, method, mode }, respondWith: () => { handled = true; } });
    assert.equal(handled, false, `${method} ${path}`);
  }
});
test('503 navigation returns only the public fallback and never stores protected HTML', async () => {
  const events = {}, fallback = new Response('Public offline screen'); let result;
  vm.runInNewContext(await readFile('service-worker.js','utf8'), { URL, Set, fetch: async () => new Response('private failure', {status:503}), caches: { open: async () => ({ match: async path => { assert.equal(path, '/offline.html'); return fallback; }, put: () => { throw Error('Must not cache navigation'); } }) }, self: { location: { origin:'https://inventory.test' }, addEventListener: (name,handler) => { events[name]=handler; } } });
  events.fetch({request:{url:'https://inventory.test/',method:'GET',mode:'navigate'},respondWith: promise => { result=promise; }});
  assert.equal(await (await result).text(),'Public offline screen');
});
