import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { startTestServer, testClient } from './helpers/auth-server.mjs';

const root = resolve(import.meta.dirname, '..');
const read = path => readFile(resolve(root, path), 'utf8');
async function exists(path) { await access(path); }

test('document links, application imports, HTML resources and manifest assets exist', async () => {
  for (const file of ['README.md', ...(await readdir(resolve(root, 'docs'))).map(name => `docs/${name}`)]) {
    const source = await read(file);
    for (const [, link] of source.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      if (/^(https?:|#)/.test(link)) continue;
      await exists(resolve(root, dirname(file), link.split('#')[0]));
    }
  }
  for (const file of (await readdir(resolve(root, 'app'))).filter(name => name.endsWith('.js'))) {
    for (const [, dependency] of (await read(`app/${file}`)).matchAll(/(?:from\s*|import\s*\()\s*['"](\.\.?\/[^'"]+)['"]/g)) await exists(resolve(root, 'app', dependency));
  }
  for (const [, resource] of (await read('index.html')).matchAll(/(?:src|href)="([^"#]+)"/g)) await exists(resolve(root, resource));
  const manifest = JSON.parse(await read('manifest.webmanifest'));
  await exists(resolve(root, manifest.start_url));
  for (const icon of manifest.icons) await exists(resolve(root, icon.src));
  assert.match(await read('assets/inventory.svg'), /<svg\s/);
  for (const [, resource] of (await read('service-worker.js')).matchAll(/'\.\/([^']+)'/g)) await exists(resolve(root, resource));
});

test('authenticated server serves complete resources, excludes private files and supports an available port', async t => {
  const fixture = await startTestServer(); t.after(fixture.close);
  const { url } = fixture;
  const client = testClient(url);
  assert.equal((await client.login()).status, 200);
  for (const path of ['index.html','manifest.webmanifest','service-worker.js','assets/inventory.svg', ...(await readdir(resolve(root,'app'), {withFileTypes:true})).filter(entry=>entry.isFile()).map(entry=>`app/${entry.name}`), 'products.html','categories.html','suppliers.html','reports.html','orders.html','adjustments.html','log.html']) {
    const response = await client.request(`/${path}`);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.ok((await response.text()).length > 0, path);
    if (path.endsWith('.svg')) assert.match(response.headers.get('content-type'), /image\/svg\+xml/);
    if (path.endsWith('.js')) assert.match(response.headers.get('content-type'), /text\/javascript/);
  }
  for (const path of ['archive/index.html','Archive/index.html','tests/artifacts/export.json','README.md','%2e%2e/package.json','app/%2e%2e/package.json','missing.svg','%ZZ','app/config','app/config/db.js','app/config%2fdb.js','.env','.env.example','.env.local','package.json','package-lock.json','tools/check-db.mjs','server/app.js','db/migrations/002-inventory-sessions.sql']) assert.equal((await client.request(`/${path}`)).status,404,path);
  await assert.rejects(startTestServer({port:Number(new URL(url).port)}), {code:'EADDRINUSE'});
});

test('invalid server ports fail with a useful message', () => {
  for (const port of ['-1','65536','abc','8080.5','']) {
    const result = spawnSync(process.execPath,[resolve(root,'tools/serve.mjs')],{env:{...process.env,PORT:port},windowsHide:true,encoding:'utf8',timeout:5000});
    assert.equal(result.status,1,port); assert.match(result.stderr,/PORT must be/);
  }
});
