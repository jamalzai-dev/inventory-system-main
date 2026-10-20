// REAL disposable PostgreSQL + Express + authenticated browser clients.
// Never reads .env or accepts a production URL.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { isolatedPostgres } from './helpers/isolated-postgres.mjs';
import { startTestServer, testCredentials } from './helpers/auth-server.mjs';
import { createInventoryRepository } from '../server/inventory.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const db = await isolatedPostgres();
await db.owner.query("INSERT INTO public.admin_account (id, username, password_hash) VALUES (1, 'synthetic-admin', 'unused-test-hash')");
const server = await startTestServer({ inventory: createInventoryRepository(db.pool) });
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
const contexts = [], checks = [], errors = [], matrix = [];
const artifacts = 'tests/artifacts/phase-3b-3';
await mkdir(artifacts, { recursive: true });
async function client() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  contexts.push(context);
  const token = (await (await context.request.get(server.url + '/api/auth/csrf')).json()).csrfToken;
  assert.equal((await context.request.post(server.url + '/api/auth/login', { headers: { 'X-CSRF-Token': token }, data: testCredentials })).status(), 200);
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  return { context, page };
}
const a = await client(), b = await client();
const page = a.page;
async function api(context, path, method = 'GET', body, headers = {}) {
  const token = (await (await context.request.get(server.url + '/api/auth/csrf')).json()).csrfToken;
  return context.request.fetch(server.url + '/api/' + path, { method, headers: { 'X-CSRF-Token': token, ...headers }, ...(body === undefined ? {} : { data: body }) });
}
async function list(resource, context = a.context) { return (await (await api(context, resource)).json()).data; }
async function ready(p = page) { await p.locator('html[data-inventory-status=ready]').waitFor(); }
async function go(section, p = page) { await p.goto(server.url + '/#' + section); await p.reload(); await ready(p); }
async function create(resource, body) {
  const result = await api(a.context, resource, 'POST', body, { 'Idempotency-Key': randomUUID() });
  assert.equal(result.status(), 201, await result.text()); return (await result.json()).data;
}
async function stock(items, type = 'add', context = a.context) {
  return api(context, 'stock-operations', 'POST', { operationId: randomUUID(), type, items, reason: 'Synthetic integration test' });
}
async function save(p = page) {
  await p.locator('.record-dialog form [type=submit]').click();
  await p.locator('.record-dialog').waitFor({ state: 'hidden' });
  await ready(p);
}
async function edit(id, p = page) { await p.locator(`[data-record-id="${id}"] [data-i18n=edit]`).click(); await p.locator('#field-name').waitFor(); }
async function check(name, action) { await action(); checks.push(name); console.log('PASS', name); }
let category, supplier, material, second;
try {
  await check('empty PostgreSQL is authoritative; legacy records remain untouched and absent from dashboard', async () => {
    await page.goto(server.url); await ready();
    await page.evaluate(() => localStorage.setItem('university_it_inventory_v2', '{"materials":[{"name":"LEGACY ONLY"}]}'));
    await page.reload(); await ready();
    assert.deepEqual(await page.locator('.stat-value').allTextContents(), ['0', '0', '0', '0']);
    assert.equal(await page.getByText('LEGACY ONLY').count(), 0);
    assert.equal((await list('materials')).length, 0);
  });
  await check('loading never presents fabricated zero inventory', async () => {
    let release; const gate = new Promise(resolve => { release = resolve; });
    await b.page.route('**/api/materials', async route => { await gate; await route.continue(); });
    await b.page.goto(server.url); await b.page.locator('[data-i18n=loadingInventory]').first().waitFor();
    assert.equal(await b.page.locator('.stat-value').count(), 0);
    release(); await ready(b.page); await b.page.unroute('**/api/materials');
  });
  await check('category and supplier CRUD use PostgreSQL, normalize names and preserve Unicode', async () => {
    await go('categories'); await page.locator('#page-actions .primary').click();
    await page.locator('#field-name').fill('  Computers · کمپیوټرونه  '); await page.locator('#field-description').fill('Teaching');
    await save(); [category] = await list('categories'); assert.equal(category.name, 'Computers · کمپیوټرونه');
    await edit(category.id); await page.locator('#field-description').fill('Updated'); await save();
    assert.equal((await list('categories'))[0].description, 'Updated');
    await go('suppliers'); await page.locator('#page-actions .primary').click();
    await page.locator('#field-name').fill('Campus Supplier'); await page.locator('#field-email').fill('bad-email');
    await page.locator('form [type=submit]').click(); assert.equal(await page.locator('#field-email').getAttribute('aria-invalid'), 'true');
    await page.locator('#field-email').fill('it@example.edu'); await save(); [supplier] = await list('suppliers');
    await edit(supplier.id); await page.locator('#field-contact').fill('احمد'); await save();
    assert.equal((await list('suppliers'))[0].contact, 'احمد');
  });
  await check('material creates at zero; NULLs and decimal metadata are accepted without legacy requirements', async () => {
    await go('materials'); await page.locator('#page-actions .primary').click();
    assert.equal(await page.locator('#field-quantity').count(), 0);
    await page.locator('#field-name').fill('Teaching cable · کیبل');
    await page.locator('#field-supplierId').selectOption(supplier.id);
    await page.locator('#field-price').fill('0.01'); await page.locator('#field-reorderLevel').fill('0.125');
    await page.locator('#field-unit').fill('metres'); await save();
    [material] = await list('materials'); assert.equal(material.quantity, '0'); assert.equal(material.location, null); assert.equal(material.condition, null);
    assert.equal(material.price, '0.01'); assert.equal(material.reorderLevel, '0.125');
    assert.match(material.version, /^[0-9a-f]{32}$/);
  });
  await check('duplicate creation is rejected and draft remains editable', async () => {
    await go('categories'); await page.locator('#page-actions .primary').click();
    await page.locator('#field-name').fill(category.name); await page.locator('form [type=submit]').click();
    await page.locator('[data-i18n=duplicateRecord]').waitFor(); assert.equal(await page.locator('#field-name').inputValue(), category.name);
    await page.locator('.record-dialog [data-i18n=cancel]').click();
  });
  await check('Add Stock uses decimal strings and one atomic API request; history is displayed', async () => {
    await go('materials'); await page.locator('#page-actions [data-i18n=addStock]').click();
    await page.locator('#removal-material').selectOption(material.id); await page.locator('#add-removal').click();
    await page.locator('[id^=removal-quantity]').fill('0.125');
    await page.locator('#removal-form [type=submit]').click(); await page.locator('.confirm-dialog .primary').dblclick();
    await page.locator('.record-dialog').waitFor({ state: 'hidden' }); await ready();
    assert.equal((await list('materials'))[0].quantity, '0.125');
    assert.equal((await db.owner.query('SELECT count(*) FROM public.stock_movements')).rows[0].count, '1');
    await page.locator('#page-actions [data-i18n=movementHistory]').click();
    await page.locator('.history-dialog td[data-column=quantity]').waitFor();
    assert.equal(await page.locator('.history-dialog td[data-column=quantity]').innerText(), '0.125');
    await page.locator('.history-dialog [data-i18n=close]').click();
  });
  await check('dashboard/search/reports use exact central data, including fractional valuation', async () => {
    await go('dashboard'); assert.deepEqual(await page.locator('.stat-value').allTextContents(), ['1', '0', '1', '0']);
    await page.locator('#global-search-input').fill('کیبل'); await page.locator('[role=option]').waitFor();
    assert.match(await page.locator('[role=option]').innerText(), /Teaching cable/);
    await page.locator('#global-search-input').press('Escape');
    await go('reports'); assert.equal(await page.locator('.value').innerText(), 'AFN 0.00125');
    await page.evaluate(() => { window.print = () => { window.printCalled = true; }; });
    await page.locator('#page-actions [data-i18n=print]').click(); await page.waitForFunction(() => window.printCalled);
    assert.match(await page.locator('#print-area').innerText(), /AFN 0.00125/);
  });
  await check('separate clients see shared creation and stale metadata cannot overwrite a newer edit', async () => {
    await go('materials'); await go('materials', b.page);
    await edit(material.id); await edit(material.id, b.page);
    await page.locator('#field-location').fill('Client A location'); await save();
    await b.page.locator('#field-location').fill('Client B stale location'); await b.page.locator('form [type=submit]').click();
    await b.page.locator('[data-i18n=recordConflict]').waitFor();
    assert.equal(await b.page.locator('#field-location').inputValue(), 'Client B stale location');
    assert.equal((await list('materials'))[0].location, 'Client A location');
    await b.page.locator('[data-i18n=reloadRecord]').click();
    await b.page.waitForFunction(() => document.querySelector('#field-location')?.value === 'Client A location');
    await b.page.locator('.record-dialog [data-i18n=cancel]').click();
  });
  await check('supplier deletion nulls references, keeps materials and refreshes versions', async () => {
    await go('suppliers'); await page.locator('tbody [data-i18n=delete]').click(); await page.locator('.confirm-dialog .primary').click();
    await page.locator('.confirm-dialog').waitFor({ state: 'hidden' });
    assert.equal((await list('suppliers')).length, 0);
    const rows = await list('materials'); assert.equal(rows.length, 1); assert.equal(rows[0].supplierId, null);
    await go('materials'); await edit(material.id); assert.equal(await page.locator('#field-supplierId').inputValue(), '');
    await page.locator('#field-location').fill(''); await save(); assert.equal((await list('materials'))[0].location, null);
  });
  await check('focus refresh updates a keyboard-selected row without losing its focus', async () => {
    await go('dashboard', b.page);
    await b.page.locator('#global-search-input').fill('Teaching cable'); await b.page.locator('#global-search-input').press('ArrowDown'); await b.page.locator('#global-search-input').press('Enter');
    const current = (await list('materials')).find(row => row.id === material.id);
    const result = await api(a.context, 'materials/' + material.id, 'PATCH', { location: 'Shared focus refresh' }, { 'If-Match': `"${current.version}"` }); assert.equal(result.status(), 200);
    await b.page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await b.page.waitForFunction(() => document.querySelector('#page-content tbody')?.textContent.includes('Shared focus refresh'));
    assert.equal(await b.page.locator(`[data-record-id="${material.id}"]`).evaluate(node => node === document.activeElement), true);
  });
  await check('category references and stock/history deletion restrictions are shown meaningfully', async () => {
    await go('categories'); await page.locator('tbody [data-i18n=delete]').click(); await page.locator('.confirm-dialog .primary').click();
    await page.locator('[data-i18n=recordInUse]').waitFor(); await page.locator('.confirm-dialog [data-i18n=cancel]').click();
    await go('materials'); await page.locator('tbody [data-i18n=delete]').click(); await page.locator('.confirm-dialog .primary').click();
    await page.locator('[data-i18n=stockDeleteBlocked]').waitFor(); await page.locator('.confirm-dialog [data-i18n=cancel]').click();
  });
  await check('batch deduction is atomic and insufficient stock leaves every balance unchanged', async () => {
    second = await create('materials', { name: 'Second cable', categoryId: category.id });
    assert.equal((await stock([{ materialId: second.id, quantity: '2.5' }])).status(), 201);
    await go('materials'); await page.locator('#remove-materials').click();
    for (const [id, quantity] of [[material.id, '0.1'], [second.id, '3']]) {
      await page.locator('#removal-material').selectOption(id); await page.locator('#add-removal').click();
      await page.locator(`[data-removal-id="${id}"] input`).fill(quantity);
    }
    await page.locator('#removal-form [type=submit]').click(); await page.locator('.confirm-dialog .primary').click();
    await page.locator('[data-i18n=removalExcess]').waitFor();
    assert.equal((await list('materials')).find(row => row.id === material.id).quantity, '0.125');
    await page.locator('.confirm-dialog [data-i18n=cancel]').click();
    await page.locator(`[data-removal-id="${second.id}"] input`).fill('0.5');
    await page.locator('#removal-form [type=submit]').click(); await page.locator('.confirm-dialog .primary').click();
    await page.locator('.record-dialog').waitFor({ state: 'hidden' });
    const rows = await list('materials'); assert.equal(rows.find(row => row.id === material.id).quantity, '0.025'); assert.equal(rows.find(row => row.id === second.id).quantity, '2.0');
  });
  await check('lost committed stock response is resolved after reload with same UUID and no duplicate deduction', async () => {
    let intercepted, lost = false;
    await page.route('**/api/stock-operations', async route => {
      intercepted = route.request().postDataJSON(); const result = await route.fetch();
      assert.equal(result.status(), 201); lost = true; await route.abort('failed');
    });
    await go('materials'); await page.locator('#remove-materials').click();
    await page.locator('#removal-material').selectOption(second.id); await page.locator('#add-removal').click();
    await page.locator('[id^=removal-quantity]').fill('0.125');
    await page.locator('#removal-form [type=submit]').click(); await page.locator('.confirm-dialog .primary').click();
    await page.locator('.connection-status [data-i18n=outcomeUncertain]').waitFor(); assert.equal(lost, true);
    await page.unroute('**/api/stock-operations'); await page.reload(); await ready();
    const pending = await page.evaluate(() => JSON.parse(sessionStorage.getItem('university_it_pending_request_v1')));
    assert.deepEqual(pending.body, intercepted);
    await page.locator('[data-i18n=retrySafely]').click();
    await page.waitForFunction(() => sessionStorage.getItem('university_it_pending_request_v1') === null);
    assert.equal((await list('materials')).find(row => row.id === second.id).quantity, '1.875');
    assert.equal((await db.owner.query('SELECT count(*) FROM public.stock_movements WHERE operation_id=$1', [intercepted.operationId])).rows[0].count, '1');
  });
  await check('offline state blocks mutations and reconnect refresh restores authoritative balances', async () => {
    await a.context.setOffline(true);
    await page.locator('html[data-inventory-status=stale]').waitFor();
    assert.equal(await page.locator('#page-actions .primary').isDisabled(), true);
    assert.equal(await page.locator('#remove-materials').isDisabled(), true);
    assert.equal(await page.evaluate(() => localStorage.getItem('university_it_inventory_v2')), '{"materials":[{"name":"LEGACY ONLY"}]}');
    await a.context.setOffline(false); await page.locator('#page-actions [data-i18n=refreshInventory]').click(); await ready();
    assert.equal(await page.locator('#remove-materials').isEnabled(), true);
  });
  await check('central export is honest and legacy export is preserved; central restore is disabled', async () => {
    await go('backup'); assert.equal(await page.locator('[data-i18n=restore]').locator('..').isDisabled(), true);
    const waiting = page.waitForEvent('download'); await page.locator('button [data-i18n=centralExport]').click(); const download = await waiting;
    assert.equal(download.suggestedFilename(), 'kdru-central-inventory-export.json');
    await download.saveAs(artifacts + '/central-export.json');
    assert.equal(await page.locator('input[type=file]').count(), 0);
    assert.match(await page.locator('#page-content').innerText(), /not central inventory/);
  });
  await check('lost creation response retains its idempotency key across reload and creates only one record', async () => {
    let original;
    await page.route('**/api/categories', async route => {
      if (route.request().method() !== 'POST') return route.continue();
      original = { body: route.request().postDataJSON(), key: route.request().headers()['idempotency-key'] };
      assert.equal((await route.fetch()).status(), 201); await route.abort('failed');
    });
    await go('categories'); await page.locator('#page-actions .primary').click();
    await page.locator('#field-name').fill('Recovered category'); await page.locator('form [type=submit]').click();
    await page.locator('.connection-status [data-i18n=outcomeUncertain]').waitFor();
    await page.unroute('**/api/categories'); await page.reload(); await ready();
    const pending = await page.evaluate(() => JSON.parse(sessionStorage.getItem('university_it_pending_request_v1')));
    assert.equal(pending.headers['Idempotency-Key'], original.key); assert.deepEqual(pending.body, original.body);
    await page.locator('[data-i18n=retrySafely]').click(); await page.waitForFunction(() => sessionStorage.getItem('university_it_pending_request_v1') === null);
    const matches = (await list('categories')).filter(row => row.name === 'Recovered category'); assert.equal(matches.length, 1);
    assert.equal((await db.owner.query('SELECT count(*) FROM public.inventory_create_requests WHERE request_key=$1', [original.key])).rows[0].count, '1');
  });
  await check('two authenticated UI clients cannot deduct more than available stock', async () => {
    for (const p of [page, b.page]) {
      await go('materials', p); await p.locator('#remove-materials').click();
      await p.locator('#removal-material').selectOption(second.id); await p.locator('#add-removal').click();
      await p.locator('[id^=removal-quantity]').fill('1.5'); await p.locator('#removal-form [type=submit]').click();
    }
    await Promise.all([page.locator('.confirm-dialog .primary').click(), b.page.locator('.confirm-dialog .primary').click()]);
    for (const p of [page, b.page]) await p.waitForFunction(() => !document.querySelector('.confirm-dialog').open || !!document.querySelector('.confirm-dialog [data-i18n=removalExcess]'));
    assert.equal((await list('materials')).find(row => row.id === second.id).quantity, '0.375');
    const failures = await page.locator('.confirm-dialog [data-i18n=removalExcess]').count() + await b.page.locator('.confirm-dialog [data-i18n=removalExcess]').count();
    assert.equal(failures, 1);
    for (const p of [page, b.page]) { await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); }
  });
  await check('service failure differs from empty inventory and an explicit refresh recovers safely', async () => {
    await go('dashboard');
    await page.route('**/api/categories', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Service temporarily unavailable."}' }));
    await page.locator('#page-actions [data-i18n=refreshInventory]').click();
    await page.locator('html[data-inventory-status=stale]').waitFor();
    assert.equal(await page.locator('.stat-value').first().innerText(), '2');
    await page.locator('.connection-status [data-i18n=serviceUnavailable]').waitFor();
    assert.equal(await page.locator('#page-actions .primary').isDisabled(), true);
    await page.reload(); await page.locator('html[data-inventory-status=error]').waitFor();
    assert.equal(await page.locator('.stat-value').count(), 0);
    await page.unroute('**/api/categories'); await page.locator('#page-actions [data-i18n=refreshInventory]').click(); await ready();
    assert.equal(await page.locator('.stat-value').first().innerText(), '2');
  });
  await check('global and per-material history paginate without duplicates and preserve exact signed quantities', async () => {
    for (let i = 0; i < 51; i++) assert.equal((await stock([{ materialId: second.id, quantity: '0.001' }])).status(), 201);
    await go('materials'); await page.locator('#page-actions [data-i18n=movementHistory]').click();
    await page.waitForFunction(() => document.querySelectorAll('.history-dialog tbody tr').length === 50);
    await page.locator('.history-dialog [data-i18n=loadMore]').click();
    await page.locator('.history-dialog button:has([data-i18n=loadMore])').waitFor({ state: 'hidden' });
    const count = Number((await db.owner.query('SELECT count(*) FROM public.stock_movements')).rows[0].count);
    assert.equal(await page.locator('.history-dialog tbody tr').count(), count);
    await page.locator('.history-dialog [data-i18n=close]').click(); await edit(second.id);
    await page.locator('#field-location').fill('Preserved history draft'); await page.locator('.record-dialog [data-i18n=movementHistory]').click();
    await page.waitForFunction(() => document.querySelectorAll('.history-dialog tbody tr').length === 50);
    assert.equal(await page.locator('.history-dialog td[data-column=quantity]').first().innerText(), '0.001');
    assert.ok((await page.locator('.history-dialog td[data-column=material]').allTextContents()).every(name => name === 'Second cable'));
    await page.locator('.history-dialog [data-i18n=close]').click();
    assert.equal(await page.locator('#field-location').inputValue(), 'Preserved history draft'); await page.keyboard.press('Escape');
  });
  await check('224 responsive section/language/theme cases retain search, RTL, mobile actions and containment', async () => {
    for (const width of [320, 375, 390, 428, 720, 768, 1024, 1440]) for (const lang of ['en', 'ps']) for (const dark of [false, true]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(prefs => localStorage.setItem('university_it_preferences', JSON.stringify(prefs)), { lang, dark });
      for (const section of ['dashboard', 'materials', 'categories', 'suppliers', 'reports', 'backup', 'settings']) {
        await go(section); const label = `${width}/${lang}/${dark}/${section}`;
        const size = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth }));
        assert.ok(size.scroll <= size.width + 1, label + JSON.stringify(size));
        assert.equal(await page.locator('html').getAttribute('dir'), lang === 'ps' ? 'rtl' : 'ltr');
        const search = page.locator('#global-search-input'); await search.fill('کیبل'); await search.press('ArrowDown');
        assert.equal(await page.locator('[role=option]').count(), 1, label);
        assert.ok(await search.getAttribute('aria-activedescendant')); await search.press('Escape');
        matrix.push(label);
      }
    }
  });
  await check('keyboard dialogs, short-screen stock form, print colors and screenshots', async () => {
    await page.setViewportSize({ width: 320, height: 400 }); await go('materials');
    await page.locator('#page-actions .primary').click(); await page.locator('#field-name').focus();
    for (let i = 0; i < 20; i++) { await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => document.activeElement.closest('dialog') !== null), true); }
    await page.keyboard.press('Escape'); await page.locator('#page-actions [data-i18n=addStock]').click();
    await page.locator('#removal-material').selectOption(second.id); await page.locator('#add-removal').click();
    await page.screenshot({ path: artifacts + '/stock-320-ps-dark.png' });
    await page.keyboard.press('Escape'); await page.setViewportSize({ width: 1440, height: 1000 }); await go('dashboard');
    await page.screenshot({ path: artifacts + '/dashboard-ps-dark.png', fullPage: true });
    await go('reports'); await page.evaluate(() => { window.print = () => { window.didPrint = true; }; }); await page.locator('#page-actions [data-i18n=print]').click();
    await page.waitForFunction(() => window.didPrint); await page.emulateMedia({ media: 'print' });
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(255, 255, 255)');
    await page.screenshot({ path: artifacts + '/print-ps.png', fullPage: true }); await page.emulateMedia({ media: 'screen' });
  });
  await check('expired session removes protected UI and returns to login; no private response cache', async () => {
    const response = await api(a.context, 'materials'); assert.equal(response.headers()['cache-control'], 'no-store');
    await b.context.clearCookies(); await go('settings');
    await b.page.evaluate(() => window.dispatchEvent(new Event('focus'))); await b.page.waitForURL('**/login');
    assert.equal(await b.page.locator('[data-record-id]').count(), 0);
    assert.deepEqual(await page.evaluate(async () => await caches.keys()), []);
    assert.deepEqual(errors, []);
  });
} finally {
  await writeFile(artifacts + '/results.json', JSON.stringify({ checks, errors, matrix }, null, 2));
  await browser.close(); await server.close(); await db.close();
}
console.log(`${checks.length} real PostgreSQL browser checks passed; ${matrix.length} responsive cases.`);
