import { seedInventory, serverInventory, readyInventory, fixtureId } from './helpers/browser-fixture.mjs';
// Run through helpers/disposable-browser.mjs; only synthetic browser-local data.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { authenticateContext } from './helpers/browser-auth.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8080';
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const key = 'university_it_inventory_v2';
const fixture = {
  categories: [{ id: 'c', name: 'Computers' }, { id: 'n', name: 'Networking · د پوهنتون شبکې' }, { id: 's', name: 'Storage and accessories' }],
  suppliers: [{ id: 's', name: 'Campus Technology', email: 'it@example.edu', contact: 'احمد', phone: '+93 700 123 456', address: 'University campus' }],
  materials: [
    { id: 'm', name: 'Teaching laptop', categoryId: 'c', supplierId: 's', quantity: 12, reorderLevel: 2, price: 25000, location: 'IT Laboratory 01', condition: 'Good', responsible: 'IT Department', serial: 'KDRU-001' },
    { id: 'n', name: 'Network switch · د شبکې سویچ', categoryId: 'n', supplierId: 's', quantity: 2, reorderLevel: 4, price: 12000, location: 'Library', condition: 'Good', serial: 'KDRU-002' },
    { id: 'o', name: 'External storage drive', categoryId: 's', supplierId: '', quantity: 0, reorderLevel: 2, price: 3000, location: 'IT Store', condition: 'Needs Repair', serial: 'KDRU-003' }
  ], settings: { lang: 'en', dark: false }
};
const pages = ['dashboard', 'materials', 'categories', 'suppliers', 'reports', 'backup', 'settings'];
const widths = [320, 375, 390, 428, 720, 768, 1024, 1440];
const artifacts = 'tests/artifacts/phase-3b-2-1';
const checks = [], errors = [], failures = [], screenshots = [], matrix = [];
await mkdir(artifacts, { recursive: true });
await authenticateContext(context, base);
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('requestfailed', request => failures.push(request.url()));
async function route(name) {
  await page.goto(`${base}/#${name}`);
  await page.locator(`nav [data-page="${name}"][aria-current="page"]`).waitFor({ state: 'attached' }); await readyInventory(page);
}
async function preferences(width, lang, dark, height = 900) {
  await page.setViewportSize({ width, height });
  await page.evaluate(prefs => localStorage.setItem('university_it_preferences', JSON.stringify(prefs)), { lang, dark });
  await page.reload(); await readyInventory(page);
  await page.locator('h1').waitFor(); await readyInventory(page);
}
async function screenshot(name, fullPage = true) {
  const path = `${artifacts}/${name}.png`;
  await page.screenshot({ path, fullPage }); screenshots.push(path);
}
async function noOverflow(label) {
  const dimensions = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
  assert.ok(dimensions.scroll <= dimensions.width + 1, `${label}: ${JSON.stringify(dimensions)}`);
}
async function visibleInViewport(locator, label) {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  assert.ok(box && box.x >= -1 && box.y >= -1 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1, `${label}: ${JSON.stringify(box)}`);
}
async function check(name, action) { await action(); checks.push(name); console.log('PASS', name); }
try {
  await page.goto(base);
  await seedInventory(fixture);
  await page.evaluate(({ key, fixture }) => localStorage.setItem(key, JSON.stringify(fixture)), { key, fixture });
  await page.reload(); await readyInventory(page);

  await check('224 section/viewport/language/theme combinations keep layout and shared search usable', async () => {
    for (const width of widths) for (const lang of ['en', 'ps']) for (const dark of [false, true]) {
      await preferences(width, lang, dark);
      for (const name of pages) {
        await route(name);
        const label = `${width}/${lang}/${dark ? 'dark' : 'light'}/${name}`;
        await noOverflow(label);
        assert.equal(await page.locator('html').getAttribute('dir'), lang === 'ps' ? 'rtl' : 'ltr');
        const search = page.locator('#global-search-input');
        await visibleInViewport(search, label + '/search');
        await search.fill('KDRU-001'); await search.press('ArrowDown');
        assert.equal(await page.locator('[role=option]').count(), 1);
        await visibleInViewport(page.locator('#global-search-results'), label + '/results');
        assert.ok(await search.getAttribute('aria-activedescendant'));
        await search.press('Escape');
        assert.equal(await search.getAttribute('aria-expanded'), 'false');
        await page.locator('.search-clear').click(); await search.press('Escape');
        await search.blur();
        matrix.push(label);
        if (width === 1440 && lang === 'en' && !dark && ['dashboard', 'reports', 'backup'].includes(name)) await screenshot(`after-${name}-desktop`);
        if (width === 768 && lang === 'en' && !dark && name === 'materials') await screenshot('after-materials-tablet');
        if (width === 375 && lang === 'en' && !dark && name === 'materials') await screenshot('after-materials-mobile');
        if (width === 390 && lang === 'ps' && dark && ['dashboard', 'settings'].includes(name)) await screenshot(`after-${name}-ps-dark`);
      }
    }
    assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key), fixture);
  });

  await check('adjacent breakpoints retain table scrolling, sticky actions and accessible mobile table relationships', async () => {
    for (const width of [649, 650, 651, 699, 700, 701, 719, 721, 767, 769, 899, 900, 901]) for (const lang of ['en', 'ps']) {
      await preferences(width, lang, true); await route('materials'); await noOverflow(`${width}/${lang}`);
      assert.equal(await page.getByRole('table').count(), 1);
      assert.equal(await page.getByRole('columnheader').count(), 8);
      const actions = page.locator('tbody tr').first().locator('.row-actions button');
      for (const action of await actions.all()) {
        const box = await action.boundingBox();
        assert.ok(box.width >= 44 && box.height >= 44);
        assert.ok(box.x >= 0 && box.x + box.width <= width + 1, 'Actions must be reachable without document scrolling');
        assert.ok(await action.getAttribute('aria-label'));
      }
      if (width > 650) {
        const wrap = page.locator('.table-wrap');
        await wrap.evaluate(node => { node.scrollLeft = document.dir === 'rtl' ? -node.scrollWidth : node.scrollWidth; });
        const box = await actions.last().boundingBox();
        assert.ok(box.x >= 0 && box.x + box.width <= width + 1);
        await noOverflow('after table scroll');
      }
    }
  });

  await check('short-screen search, form validation, sticky dialog actions and focus restoration work in both languages/themes', async () => {
    for (const lang of ['en', 'ps']) for (const dark of [false, true]) {
      await preferences(320, lang, dark, 400); await route('materials');
      const search = page.locator('#global-search-input');
      await search.fill('KDRU'); await search.press('ArrowDown');
      await visibleInViewport(page.locator('#global-search-results'), 'short search');
      await screenshot(`after-search-short-${lang}-${dark ? 'dark' : 'light'}`, false);
      await search.press('Escape');
      for (const name of ['materials', 'categories', 'suppliers']) {
        await route(name); await page.locator('#page-actions .primary').click();
        const dialog = page.locator('.record-dialog');
        assert.equal(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1), true);
        for (const input of await dialog.locator('input,select,textarea').all()) assert.ok(await input.evaluate(node => node.labels.length > 0));
        assert.equal(await page.locator('#field-name').evaluate(node => node === document.activeElement), true);
        await page.locator('dialog form [type=submit]').click();
        assert.equal(await page.locator('#field-name').getAttribute('aria-invalid'), 'true');
        assert.equal(await page.locator('#form-errors').getAttribute('role'), 'alert');
        await page.locator('#field-name').fill('Unsaved draft');
        const last = dialog.locator('input,select,textarea').last(); await last.focus();
        await visibleInViewport(dialog.locator('[type=submit]'), 'short form save');
        if (name === 'materials') {
          assert.equal(await page.locator('#field-quantity').count(), 0);
          assert.equal(await page.locator('#field-reorderLevel').getAttribute('inputmode'), 'decimal');
          assert.equal(await page.locator('#field-price').getAttribute('inputmode'), 'decimal');
          await screenshot(`after-form-short-${lang}-${dark ? 'dark' : 'light'}`, false);
        }
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#page-actions .primary').evaluate(node => node === document.activeElement), true);
      }
    }
    assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key), fixture);
  });

  await check('chart contrast, keyboard focus indicators, Settings selections and reduced motion remain accessible', async () => {
    for (const dark of [false, true]) {
      await preferences(1440, 'en', dark); await route('dashboard');
      const contrasts = await page.evaluate(() => {
        const css = getComputedStyle(document.documentElement);
        const luminance = token => {
          const hex = css.getPropertyValue(token).trim().slice(1);
          const values = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
          return values[0] * .2126 + values[1] * .7152 + values[2] * .0722;
        };
        return ['--chart-blue', '--chart-blue-soft', '--chart-good', '--chart-low', '--chart-out'].map(token => {
          const a = luminance(token), b = luminance('--surface');
          return { token, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
        });
      });
      for (const contrast of contrasts) assert.ok(contrast.ratio >= 3, JSON.stringify({ dark, ...contrast }));
      await page.locator('.table-wrap').focus();
      assert.equal(await page.locator('.table-wrap').evaluate(node => getComputedStyle(node).outlineStyle), 'solid');
      assert.ok((await page.locator('.table-wrap').ariaSnapshot()).includes('columnheader'));
      await route('settings');
      await page.locator('[data-language=ps]').click();
      assert.equal(await page.locator('[data-language=ps]').getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('[data-language=ps]').evaluate(node => node === document.activeElement), true);
      assert.ok(await page.locator('.translation-note').innerText());
      assert.equal(await page.locator('.topbar .language-button,.topbar .theme-button,.topbar [data-i18n=signOut]').count(), 0);
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('nav button').first().focus();
    assert.equal(await page.locator('nav button').first().evaluate(node => getComputedStyle(node).transitionDuration), '0s');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  });

  await check('long names, empty inventory and print output retain information without page overflow', async () => {
    const long = structuredClone(fixture);
    long.materials[0].name = 'وسایل' + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.repeat(8);
    long.categories[0].name = 'Long university department category '.repeat(5);
    await seedInventory(long);
    await page.evaluate(({ key, long }) => localStorage.setItem(key, JSON.stringify(long)), { key, long });
    for (const width of [320, 720, 1440]) {
      await preferences(width, 'ps', true);
      for (const name of ['dashboard', 'materials', 'categories', 'suppliers']) { await route(name); await noOverflow('long data/' + width + '/' + name); }
    }
    await route('reports'); await page.evaluate(() => { window.print = () => {}; });
    await page.locator('#page-actions [data-i18n=print]').click(); await page.locator('#print-area tbody tr').first().waitFor({state:'attached'});
    await page.emulateMedia({ media: 'print' });
    assert.equal(await page.locator('#print-area tbody tr').count(), fixture.materials.length);
    assert.equal(await page.locator('nav').isVisible(), false);
    assert.equal(await page.locator('body').evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(255, 255, 255)', 'Dark appearance must still print on white paper');
    assert.equal(await page.locator('#print-area').evaluate(node => getComputedStyle(node).color), 'rgb(17, 17, 17)');
    await page.pdf({ path: `${artifacts}/inventory-print.pdf`, preferCSSPageSize: true, printBackground: true });
    await screenshot('after-print-ps', true);
    await page.emulateMedia({ media: 'screen' });
    await seedInventory({ categories: [], suppliers: [], materials: [] });
    await page.evaluate(key => localStorage.setItem(key, JSON.stringify({ categories: [], suppliers: [], materials: [], settings: { lang: 'en', dark: false } })), key);
    await preferences(320, 'en', false);
    for (const name of pages) { await route(name); await noOverflow('empty/' + name); }
    await route('dashboard');
    assert.deepEqual(await page.locator('.stat-value').allTextContents(), ['0', '0', '0', '0']);
    for (const width of widths) for (const lang of ['en', 'ps']) for (const dark of [false, true]) {
      await preferences(width, lang, dark); await route('dashboard'); await noOverflow('empty charts');
      for (const label of await page.locator('.chart-legend dt').all()) {
        assert.ok(await label.evaluate(node => node.getBoundingClientRect().height <= 2 * parseFloat(getComputedStyle(node).lineHeight)), 'Empty legend labels must fit within two readable lines, not stack letter by letter');
      }
      const note = await page.locator('.donut-layout > .chart-empty').boundingBox();
      const legend = await page.locator('.chart-legend').boundingBox();
      assert.ok(note.y >= legend.y + legend.height, 'Empty-state explanation needs its own row');
      if (width === 320 && lang === 'en' && !dark) await screenshot('after-empty-mobile');
      if (width === 320 && lang === 'ps' && dark) await screenshot('after-empty-ps-dark');
      if (width === 1440 && lang === 'en' && !dark) await screenshot('after-empty-desktop');
    }
  });

  assert.deepEqual(errors, []); assert.deepEqual(failures, []);
  checks.push('no page/console errors or failed requests');
  await writeFile(`${artifacts}/results.json`, JSON.stringify({ browser: browser.version(), checks, matrix, screenshots, errors, failures }, null, 2));
  console.log(`${checks.length} stabilization checks passed; ${matrix.length} primary layout combinations`);
} finally { await context.close(); await browser.close(); }
