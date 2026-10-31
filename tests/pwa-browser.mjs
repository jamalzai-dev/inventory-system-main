// Real Express + PostgreSQL. All credentials, worker upgrades and records are disposable.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import bcrypt from 'bcrypt';
import { createAdminRepository } from '../server/admin.js';
import { randomUUID } from 'node:crypto';
import { isolatedPostgres } from './helpers/isolated-postgres.mjs';
import { startTestServer, testCredentials } from './helpers/auth-server.mjs';
import { createInventoryRepository } from '../server/inventory.js';
import { units } from '../app/decimal.js';
const require = createRequire(import.meta.url), { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const db = await isolatedPostgres();
await db.owner.query(await readFile(new URL('../db/migrations/004-material-archive.sql', import.meta.url), 'utf8'));
await db.owner.query('INSERT INTO public.admin_account(id,username,password_hash) VALUES(1,$1,$2)', [testCredentials.username, await bcrypt.hash(testCredentials.password, 4)]);
await db.owner.query('GRANT SELECT ON public.admin_account TO inventory_app; GRANT SELECT,INSERT,UPDATE,DELETE ON public.inventory_sessions TO inventory_app');
const PgStore = connectPgSimple(session), sessionStore = new PgStore({ pool: db.pool, schemaName: 'public', tableName: 'inventory_sessions', createTableIfMissing: false });
const repository = createInventoryRepository(db.pool), server = await startTestServer({ inventory: repository, store: sessionStore, admins: createAdminRepository(db.pool) });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const checks = [], errors = [], artifacts = 'tests/artifacts/phase-3b-4';
await mkdir(artifacts, { recursive: true });
const profile = await mkdtemp(resolve(artifacts, 'pwa-profile-'));
let persistentContext;
async function client(persistent = false) {
  const context = persistent ? (persistentContext = await chromium.launchPersistentContext(profile, { channel: 'msedge', headless: true })) : await browser.newContext();
  const csrfToken = (await (await context.request.get(server.url + '/api/auth/csrf')).json()).csrfToken;
  assert.equal((await context.request.post(server.url + '/api/auth/login', { headers: { 'X-CSRF-Token': csrfToken }, data: testCredentials })).status(), 200);
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.goto(server.url); await ready(page);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  return { context, page };
}
async function ready(page) { await page.locator('html[data-inventory-status=ready]').waitFor(); }
async function check(name, action) { await action(); checks.push(name); console.log('PASS', name); }
async function cachePaths(page) { return page.evaluate(async () => (await Promise.all((await caches.keys()).map(async name => (await (await caches.open(name)).keys()).map(r => new URL(r.url).pathname)))).flat().sort()); }
const expectedCache = ['/offline.html','/offline.css','/offline.js','/manifest.webmanifest','/assets/icon-192.png','/assets/icon-512.png'].sort();
let installability;
try {
  const a = await client(true), b = await client(), c = await client();
  const category = await repository.create('categories', { name: 'PWA fixture' }, randomUUID());
  await check('manifest, real worker and icons meet Chromium installability checks', async () => {
    const session = await a.context.newCDPSession(a.page);
    await session.send('Page.enable');
    const manifest = await session.send('Page.getAppManifest'); assert.deepEqual(manifest.errors, []);
    installability = await session.send('Page.getInstallabilityErrors'); assert.deepEqual(installability.installabilityErrors, []);
    const parsed = JSON.parse(manifest.data); assert.equal(parsed.name, 'KDRU IT Inventory'); assert.equal(parsed.display, 'standalone');
    for (const size of [192,512]) { const bytes = await readFile(`assets/icon-${size}.png`); assert.equal(bytes.readUInt32BE(16), size); assert.equal(bytes.readUInt32BE(20), size); }
    assert.deepEqual(await cachePaths(a.page), expectedCache);
  });
  let material;
  await check('three independent clients share additions and exact stock deductions', async () => {
    await a.page.goto(server.url + '/#materials'); await a.page.reload(); await ready(a.page);
    await a.page.locator('#page-actions .primary').click(); await a.page.locator('#field-name').fill('Shared cable');
    await a.page.locator('.record-dialog [type=submit]').click(); await a.page.locator('.record-dialog').waitFor({ state: 'hidden' });
    material = (await repository.listMaterials())[0];
    await a.page.locator(`[data-record-id="${material.id}"] [data-i18n=adjustStock]`).click();
    await a.page.locator('[data-type=add]').click(); await a.page.locator('#adjust-quantity').fill('0.500');
    await a.page.locator('#adjust-form [type=submit]').click(); await a.page.locator('.record-dialog').waitFor({ state: 'hidden' });
    for (const { page } of [b,c]) { await page.goto(server.url + '/#materials'); await page.reload(); await ready(page); assert.match(await page.locator(`[data-record-id="${material.id}"]`).innerText(), /0.5/); }
    await b.page.locator(`[data-record-id="${material.id}"] [data-i18n=adjustStock]`).click(); await b.page.locator('#adjust-quantity').fill('۰٫۵۰۰');
    await b.page.locator('#adjust-form [type=submit]').click(); await b.page.locator('.record-dialog').waitFor({ state: 'hidden' });
    await c.page.reload(); await ready(c.page); assert.equal(units((await repository.findMaterial(material.id)).quantity), 0n);
    assert.equal((await repository.listMovements({}, material.id)).data.length, 2);
  });
  await check('archive hides active records, preserves history and supports reactivation', async () => {
    await a.page.reload(); await ready(a.page);
    await a.page.locator(`[data-record-id="${material.id}"] [data-i18n=archiveMaterial]`).click(); await a.page.locator('.confirm-dialog .primary').click(); await a.page.locator('.confirm-dialog').waitFor({ state: 'hidden' });
    assert.equal(await a.page.locator(`[data-record-id="${material.id}"]`).count(), 0);
    await a.page.goto(server.url+'/#categories'); await ready(a.page);
    await a.page.locator(`[data-record-id="${category.id}"] [data-i18n=viewMaterials]`).click();
    assert.equal(await a.page.locator('.archive-filter input').isChecked(),true, 'Category containing only archived materials opens its archived records');
    assert.equal(await a.page.locator(`[data-record-id="${material.id}"] button:has([data-i18n=adjustStock])`).isDisabled(), true);
    await a.page.locator(`[data-record-id="${material.id}"] [data-i18n=restoreMaterial]`).click(); await a.page.locator('.confirm-dialog .primary').click(); await a.page.locator('.confirm-dialog').waitFor({ state: 'hidden' });
    assert.equal((await repository.findMaterial(material.id)).archived, false); assert.equal((await repository.listMovements({}, material.id)).data.length, 2);
  });
  await check('offline navigation shows public fallback, blocks writes and reconnects to a real session', async () => {
    await a.context.setOffline(true); await a.page.reload();
    await a.page.locator('#retry').waitFor(); assert.match(await a.page.locator('h1').innerText(), /Server Unreachable/);
    assert.equal(await a.page.locator('[data-record-id],#adjust-form').count(), 0);
    for (const width of [320,375,390,428,720,768,1024,1440]) { await a.page.setViewportSize({ width, height: 400 }); assert.equal(await a.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); }
    await a.page.screenshot({ path: artifacts + '/offline.png' });
    assert.deepEqual(await cachePaths(a.page), expectedCache);
    await a.context.setOffline(false); await a.page.locator('#retry').click(); await ready(a.page);
  });
  await check('archive-enabled actions and direct adjustment fit 32 bilingual theme/width cases', async () => {
    for (const width of [320,375,390,428,720,768,1024,1440]) for (const lang of ['en','ps']) for (const dark of [false,true]) {
      await a.page.setViewportSize({width,height:width===320?400:900});
      await a.page.evaluate(prefs=>localStorage.setItem('university_it_preferences',JSON.stringify(prefs)),{lang,dark});
      await a.page.goto(server.url+'/#materials'); await a.page.reload(); await ready(a.page);
      const actions=a.page.locator(`[data-record-id="${material.id}"] .row-actions button`);
      const caption=a.page.locator('.archive-filter > span');
      assert.equal(await caption.isVisible(),true);
      const archiveToggle=a.page.locator('.archive-filter input');
      assert.equal(await archiveToggle.isVisible(),true);
      assert.ok(await archiveToggle.evaluate(n=>n.getBoundingClientRect().width>=20));
      assert.ok(await caption.evaluate(n=>n.getBoundingClientRect().height<=2*parseFloat(getComputedStyle(n).lineHeight)),`archive caption must stay readable: ${width}/${lang}/${dark}`);
      assert.equal(await actions.count(),4);
      for (const button of await actions.all()) {
        await button.scrollIntoViewIfNeeded(); const box=await button.boundingBox();
        assert.ok(box.width>=44&&box.height>=44,JSON.stringify({width,lang,dark,box}));
        assert.ok(box.x>=-1&&box.x+box.width<=width+1,JSON.stringify({width,lang,dark,box}));
      }
      await a.page.locator(`[data-record-id="${material.id}"] [data-i18n=adjustStock]`).click();
      await a.page.locator('[data-type=add]').click(); await a.page.locator('#adjust-quantity').fill(lang==='ps'?'۰٫۵۰۰':'0.500');
      assert.equal(await a.page.locator('#adjust-form [type=submit]').isEnabled(),true);
      assert.equal(await a.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
      assert.equal(await a.page.locator('.record-dialog').evaluate(n=>n.scrollWidth<=n.clientWidth+1),true);
      await a.page.locator('#adjust-form [type=submit]').scrollIntoViewIfNeeded();
      const confirm=await a.page.locator('#adjust-form [type=submit]').boundingBox();
      assert.ok(confirm.y>=0&&confirm.y+confirm.height<= (width===320?400:900)+1);
      if((width===320&&lang==='ps'&&dark)||(width===1440&&lang==='en'&&!dark)) await a.page.screenshot({path:`${artifacts}/adjust-${width}-${lang}.png`});
      await a.page.keyboard.press('Escape');
      if(width===320&&lang==='ps'&&dark) {
        await a.page.locator('.record-dialog').waitFor({state:'hidden'});
        await a.page.evaluate(()=>scrollTo(0,0));
        await a.page.screenshot({path:artifacts+'/archive-materials-320-ps.png',fullPage:true});
        await a.page.locator('.archive-filter').screenshot({path:artifacts+'/archive-filter-320-ps.png'});
      }
    }
    await a.page.evaluate(()=>localStorage.setItem('university_it_preferences',JSON.stringify({lang:'en',dark:false})));
    await a.page.reload(); await ready(a.page);
  });
  await check('an open stock form disables confirmation offline and rechecks the server on reconnection', async () => {
    await a.page.locator(`[data-record-id="${material.id}"] [data-i18n=adjustStock]`).click();
    await a.page.locator('[data-type=add]').click(); await a.page.locator('#adjust-quantity').fill('1');
    await a.context.setOffline(true);
    await a.page.waitForFunction(()=>document.querySelector('#adjust-form [type=submit]').disabled);
    assert.equal(await a.page.locator('#adjust-quantity').inputValue(),'1');
    await a.context.setOffline(false); await ready(a.page);
    await a.page.waitForFunction(()=>!document.querySelector('#adjust-form [type=submit]').disabled);
    assert.equal(await a.page.locator('#adjust-quantity').inputValue(),'1');
    assert.equal(units((await repository.findMaterial(material.id)).quantity),0n);
    await a.page.keyboard.press('Escape');
  });
  await check('worker update waits for explicit safe action and never reloads another client draft', async () => {
    await a.page.setViewportSize({ width: 1440, height: 1000 });
    await a.page.goto(server.url + '/#materials'); await ready(a.page); await a.page.locator('#page-actions .primary').click(); await a.page.locator('#field-name').fill('Unsaved draft');
    const otherTab = await a.context.newPage(); await otherTab.goto(server.url + '/#materials'); await ready(otherTab);
    await otherTab.locator('#page-actions .primary').click(); await otherTab.locator('#field-name').fill('Other tab draft');
    const workerSource = (await readFile('service-worker.js', 'utf8')).replace('kdru-public-v1', 'kdru-public-test-v2');
    server.app.use((req,res,next) => req.path === '/service-worker.js' ? res.type('js').set('Cache-Control','no-store').send(workerSource) : next());
    server.app.router.stack.unshift(server.app.router.stack.pop()); // Test-only upgraded worker response.
    await a.page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    await a.page.locator('[data-i18n=updateAvailable]').waitFor({ state: 'attached' });
    await a.page.evaluate(() => document.querySelector('[data-i18n=updateApp]').closest('button').click());
    assert.equal(await a.page.locator('#field-name').inputValue(), 'Unsaved draft');
    assert.equal(await a.page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()).waiting), true);
    await a.page.keyboard.press('Escape');
    await Promise.all([a.page.waitForEvent('domcontentloaded'), a.page.locator('[data-i18n=updateApp]').click()]); await ready(a.page);
    assert.deepEqual(await a.page.evaluate(()=>caches.keys()), ['kdru-public-test-v2']);
    assert.equal(await otherTab.locator('#field-name').inputValue(), 'Other tab draft'); await otherTab.close();
    assert.deepEqual(await cachePaths(a.page), expectedCache);
  });
  await check('logout and offline reload never recover protected inventory from cache', async () => {
    await c.page.goto(server.url + '/#settings'); await c.page.locator('[data-i18n=signOut]').click(); await c.page.waitForURL('**/login');
    assert.equal((await c.context.request.get(server.url + '/api/materials')).status(), 401);
    await c.context.setOffline(true); await c.page.goto(server.url); await c.page.locator('#retry').waitFor();
    assert.equal(await c.page.locator('[data-record-id]').count(), 0); assert.deepEqual(await cachePaths(c.page), expectedCache);
  });
  assert.deepEqual(errors, []);
} finally {
  await writeFile(artifacts + '/pwa-results.json', JSON.stringify({ checks, errors, installability }, null, 2));
  if (persistentContext) await persistentContext.close(); await browser.close(); await server.close(); await sessionStore.close(); await db.close();
  if (!profile.startsWith(resolve(artifacts) + (process.platform === 'win32' ? '\\' : '/'))) throw Error('Unsafe cleanup');
  await rm(profile, { recursive: true, force: true });
}
console.log(`${checks.length} PWA/archive/three-client browser checks passed`);
