// Integration coverage uses real application routes in a fresh browser context.
// Run via tests/helpers/disposable-browser.mjs to avoid production credentials.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { authenticateContext } from './helpers/browser-auth.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8080';
const key = 'university_it_inventory_v2';
const fixture = {
  categories: [{ id: 'computers', name: 'Computers', description: 'Teaching equipment' }, { id: 'network', name: 'شبکې', description: 'Networks' }, { id: 'empty', name: 'No assigned materials' }],
  suppliers: [{ id: 'kabul', name: 'Kabul Technology', contact: 'احمد', email: 'it@example.edu' }],
  materials: [
    { id: 'laptop', name: 'Dell Latitude 5440', serial: 'UNI-LT-0042', categoryId: 'computers', supplierId: 'kabul', quantity: 8, reorderLevel: 2, price: 50000, location: 'IT Lab 01', condition: 'Good', description: 'Teaching laptops', createdAt: '2026-10-10T10:00:00Z' },
    { id: 'switch', name: 'د شبکې سویچ', serial: 'NET-012', categoryId: 'network', supplierId: 'kabul', quantity: 2, reorderLevel: 3, price: 12000, location: 'Library', condition: 'Needs Repair', createdAt: '2026-10-09T10:00:00Z' },
    { id: 'dock', name: 'USB-C docking station', serial: '', categoryId: 'computers', supplierId: '', quantity: 0, reorderLevel: 2, price: 3500, location: 'IT Store', condition: 'Good', createdAt: '2026-10-08T10:00:00Z' },
    { id: 'safe', name: '<img src=x onerror=alert(1)> کابل', serial: 'SAFE-001', categoryId: 'network', supplierId: '', quantity: 1, reorderLevel: 0, price: 100, location: 'Store', condition: 'Good', createdAt: '2026-10-07T10:00:00Z' }
  ],
  settings: { lang: 'en', dark: false }
};
await authenticateContext(context, base);
const page = await context.newPage();
const errors = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await mkdir('tests/artifacts', { recursive: true });
async function check(name, action) { await action(); checks.push(name); console.log('PASS', name); }
async function route(name) { await page.goto(`${base}/#${name}`); await page.locator(`nav [data-page="${name}"][aria-current="page"]`).waitFor({ state: 'attached' }); }
const search = page.locator('#global-search-input');
const options = page.locator('[role=listbox] [role=option]');
async function searchFor(value) {
  await search.fill(value);
  await page.waitForFunction(() => document.querySelector('#global-search-input').getAttribute('aria-expanded') === 'true');
  // A changed query clears the old panel until its debounce completes.
}
try {
  await page.goto(base);
  await page.evaluate(({ key, fixture }) => { localStorage.setItem(key, JSON.stringify(fixture)); localStorage.setItem('university_it_preferences', JSON.stringify(fixture.settings)); }, { key, fixture });
  await page.reload();
  await page.locator('h1').waitFor();

  await check('dashboard counts and chart labels use real records without mutation', async () => {
    assert.deepEqual(await page.locator('.stat .stat-value').allTextContents(), ['4', '2', '1', '1']);
    assert.equal(await page.locator('.chart-card').count(), 2);
    assert.equal(await page.locator('.bar-column').count(), 3);
    assert.deepEqual((await page.locator('.bar-column .bar-value').allTextContents()).sort(), ['0', '2', '2']);
    assert.equal(await page.locator('.donut-center strong').innerText(), '4');
    for (const [status, count] of [['good', '2'], ['low', '1'], ['out', '1']]) assert.equal(await page.locator(`.legend-item[data-status=${status}] strong`).innerText(), count);
    assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key), fixture);
    assert.equal(await page.locator('.brand .logo-space > *').count(), 0);
    await page.screenshot({ path: 'tests/artifacts/redesign-overview-desktop.png', fullPage: true });
  });

  await check('dashboard category/status filtering, sort and See All preserve context', async () => {
    await page.locator('.inventory-preview [aria-controls=preview-filters]').click();
    await page.locator('#preview-filters [data-label=categoryId]').selectOption('computers');
    await page.locator('#preview-filters [data-label=status]').selectOption('out');
    assert.deepEqual(await page.locator('.inventory-preview tbody tr').getAttribute('data-record-id'), 'dock');
    await page.locator('.inventory-preview [data-i18n=seeAll]').click();
    await page.locator('nav [data-page=materials][aria-current=page]').waitFor({ state: 'attached' });
    assert.equal(await page.locator('.filters [data-label=categoryId]').inputValue(), 'computers');
    assert.equal(await page.locator('.filters [data-label=status]').inputValue(), 'out');
    assert.equal(await page.locator('tbody tr').getAttribute('data-record-id'), 'dock');
    await route('dashboard');
    await page.locator('.inventory-preview [aria-controls=preview-filters]').click();
    await page.locator('#preview-filters .material-sort').selectOption('quantity');
    assert.deepEqual(await page.locator('.inventory-preview tbody tr').evaluateAll(rows => rows.map(row => row.dataset.recordId)), ['dock', 'safe', 'switch', 'laptop']);
    await page.locator('#preview-filters [data-label=categoryId]').selectOption('empty');
    assert.equal(await page.locator('.inventory-preview tbody .row-actions').count(), 0);
    assert.equal(await page.locator('.inventory-preview .empty').isVisible(), true);
    await route('materials');
  });

  await check('the same shared header and search remain available on every section', async () => {
    await page.evaluate(() => { window.originalSearch = document.querySelector('#global-search-input'); window.originalHeader = document.querySelector('.topbar'); });
    for (const section of ['dashboard', 'materials', 'categories', 'suppliers', 'reports', 'backup', 'settings']) {
      await route(section);
      assert.equal(await search.isVisible(), true, section);
      assert.equal(await page.evaluate(() => window.originalSearch === document.querySelector('#global-search-input') && window.originalHeader === document.querySelector('.topbar')), true, section);
      assert.equal(await page.locator('.topbar .language-button,.topbar .theme-button,.topbar [data-i18n=signOut]').count(), 0);
      await searchFor('UNI-LT-0042');
      assert.equal(await options.count(), 1, section);
      assert.match(await options.first().innerText(), /Dell Latitude/);
      await search.press('Escape');
      assert.equal(await search.getAttribute('aria-expanded'), 'false');
    }
  });

  await check('global search supports relationships, locations, descriptions and Pashto', async () => {
    for (const [query, expected] of [['IT Lab 01', 'Dell Latitude'], ['teaching laptops', 'Dell Latitude'], ['شبکې', 'د شبکې سویچ'], ['Kabul Technology', 'Kabul Technology'], ['Computers', 'Computers']]) {
      await searchFor(query);
      assert.match(await page.locator('[role=listbox]').innerText(), new RegExp(expected));
    }
    await page.screenshot({ path: 'tests/artifacts/redesign-global-search.png', fullPage: true });
    await searchFor('<img');
    assert.equal(await options.count(), 1);
    assert.equal(await page.locator('[role=listbox] img').count(), 0);
    assert.match(await options.first().innerText(), /<img src=x/);
    await searchFor('no-match-for-this-inventory');
    assert.equal(await options.count(), 0);
    assert.match(await page.locator('.global-search').innerText(), /No matching records/i);
    await searchFor('');
    assert.equal(await options.count(), 0);
    assert.ok(await page.locator('.search-empty').innerText());
    await search.press('Escape');
    assert.equal(await search.getAttribute('aria-expanded'), 'false');
  });

  await check('search keyboard selection navigates and identifies the selected record', async () => {
    await searchFor('UNI-LT-0042');
    await search.press('ArrowDown');
    const activeId = await search.getAttribute('aria-activedescendant');
    assert.ok(activeId);
    assert.equal(await page.locator(`[id="${activeId}"]`).getAttribute('aria-selected'), 'true');
    await search.press('Enter');
    await page.locator('nav [data-page=materials][aria-current=page]').waitFor({ state: 'attached' });
    assert.match(await page.locator('tbody').innerText(), /Dell Latitude/);
    assert.equal(await search.getAttribute('aria-expanded'), 'false');
    await page.screenshot({ path: 'tests/artifacts/redesign-materials-desktop.png', fullPage: true });
  });

  await check('search reflects record edits and deletes immediately', async () => {
    await route('materials');
    await page.locator('.filters input[type=search]').fill('Dell Latitude');
    await page.locator('tbody .row-actions button').first().click();
    await page.locator('#field-name').fill('Renamed teaching laptop');
    await page.locator('dialog form [type=submit]').click();
    await searchFor('Renamed teaching laptop');
    assert.equal(await options.count(), 1);
    await searchFor('Dell Latitude');
    assert.equal(await options.count(), 0);
    await search.press('Escape');
    await page.locator('.filters input[type=search]').fill('Renamed teaching laptop');
    await page.locator('tbody .row-actions button').last().click();
    await page.locator('.confirm-dialog .primary').click();
    await searchFor('Renamed teaching laptop');
    assert.equal(await options.count(), 0);
    await search.press('Escape');
    await page.evaluate(({ key, fixture }) => localStorage.setItem(key, JSON.stringify(fixture)), { key, fixture });
    await page.reload();
  });

  await check('Settings alone controls persistent language and appearance', async () => {
    await route('settings');
    await page.locator('.settings [data-language=ps]').click();
    await page.locator('.settings [data-theme-choice=dark]').click();
    assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    assert.equal(await page.locator('.settings [data-language=ps]').getAttribute('aria-pressed'), 'true');
    await page.reload();
    assert.equal(await page.locator('html').getAttribute('lang'), 'ps');
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    await searchFor('شبکې');
    assert.ok(await options.count() > 0);
    await search.press('Escape');
    await page.screenshot({ path: 'tests/artifacts/redesign-settings-ps-dark.png', fullPage: true });
    await route('dashboard');
    await page.screenshot({ path: 'tests/artifacts/redesign-overview-ps-dark.png', fullPage: true });
    await route('settings');
    await page.locator('.settings [data-language=en]').click();
    await page.locator('.settings [data-theme-choice=light]').click();
    await page.screenshot({ path: 'tests/artifacts/redesign-settings.png', fullPage: true });
  });

  await check('narrow Materials actions are visible touch targets and preserve confirmations', async () => {
    for (const width of [320, 375, 390, 428]) for (const lang of ['en', 'ps']) {
      await page.setViewportSize({ width, height: 800 });
      await page.evaluate(lang => localStorage.setItem('university_it_preferences', JSON.stringify({ lang, dark: false })), lang);
      await page.reload();
      await route('materials');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${width}/${lang}`);
      const actions = page.locator('tbody tr').first().locator('.row-actions button');
      assert.equal(await actions.count(), 2);
      for (const button of await actions.all()) {
        await button.scrollIntoViewIfNeeded();
        const bounds = await button.boundingBox();
        assert.ok(bounds.width >= 44 && bounds.height >= 44, `${width}/${lang}: touch target ${JSON.stringify(bounds)}`);
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1, `${width}/${lang}: clipped action`);
      }
      await actions.first().click();
      assert.equal(await page.locator('#field-name').inputValue(), fixture.materials[0].name);
      assert.equal(await page.locator('dialog').first().evaluate(node => node.scrollWidth <= node.clientWidth + 1), true);
      await page.keyboard.press('Escape');
      assert.equal(await actions.first().evaluate(node => node === document.activeElement), true);
      await actions.last().click();
      assert.equal(await page.locator('.confirm-dialog').isVisible(), true);
      await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).materials.length, key), 4);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `tests/artifacts/redesign-materials-${width}-${lang}.png`, fullPage: true });
      await route('dashboard');
      await searchFor('UNI-LT-0042');
      assert.equal(await options.count(), 1);
      const panel = await page.locator('[role=listbox]').boundingBox();
      assert.ok(panel.x >= 0 && panel.x + panel.width <= width + 1);
      await search.press('Escape');
      if (width === 390) await page.screenshot({ path: `tests/artifacts/redesign-overview-mobile-${lang}.png`, fullPage: true });
    }
  });

  await check('mobile navigation traps focus, closes with Escape and restores its trigger', async () => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.locator('.menu-button').click();
    assert.equal(await page.locator('.menu-button').getAttribute('aria-expanded'), 'true');
    for (let i = 0; i < 12; i++) { await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => !!document.activeElement.closest('.sidebar')), true); }
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.menu-button').getAttribute('aria-expanded'), 'false');
    assert.equal(await page.locator('.menu-button').evaluate(node => node === document.activeElement), true);
  });

  assert.deepEqual(errors, []);
  await writeFile('tests/artifacts/redesign-results.json', JSON.stringify({ browser: browser.version(), checks, errors }, null, 2));
  console.log(`${checks.length} redesign browser checks passed`);
} finally { await context.close(); await browser.close(); }
