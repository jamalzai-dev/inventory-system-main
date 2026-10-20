import { seedInventory, serverInventory, readyInventory, fixtureId } from './helpers/browser-fixture.mjs';
// Edge cases beyond the primary workflow suite. Uses disposable authenticated storage.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { authenticateContext } from './helpers/browser-auth.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await authenticateContext(context);
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8080';
const key = 'university_it_inventory_v2';
const page = await context.newPage();
const errors = [], checks = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.setDefaultTimeout(15000);
await mkdir('tests/artifacts', { recursive: true });
const empty = { materials: [], categories: [], suppliers: [], settings: {lang:'en',dark:false} };
async function seed(data, prefs = data.settings) {
  await seedInventory(data);
  await page.evaluate(({key,data,prefs}) => { localStorage.setItem(key,JSON.stringify(data)); localStorage.setItem('university_it_preferences',JSON.stringify(prefs)); },{key,data,prefs});
  await page.goto(base+'/#dashboard'); await page.reload(); await readyInventory(page); await page.locator('h1').waitFor(); await readyInventory(page);
}
async function check(name, action) { await action(); checks.push(name); console.log('PASS',name); }
const search = page.locator('#global-search-input');
async function find(value) { await search.fill(value); await page.waitForFunction(() => document.querySelector('#global-search-input').getAttribute('aria-expanded') === 'true'); }
try {
  await page.goto(base); await page.locator('h1').waitFor(); await readyInventory(page);
  await check('empty inventory shows zero counts, honest empty charts and no writes', async () => {
    await seed(empty);
    assert.deepEqual(await page.locator('.stat-value').allTextContents(),['0','0','0','0']);
    assert.equal(await page.locator('.donut-chart [data-status]').count(),0);
    assert.equal(await page.locator('.bar-column').count(),0);
    assert.equal(await page.locator('.chart-empty').count(),2);
    await page.screenshot({path:'tests/artifacts/redesign-empty.png',fullPage:true});
    assert.deepEqual(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key),empty);
  });
  const data={...empty,categories:Array.from({length:24},(_,i)=>({id:`c${i}`,name:`د پوهنتون د تجهیزاتو کټګوري ${i} — Long category ${i}`})),suppliers:[{id:'s',name:'Unique supplier',contact:'Staff contact'}]};
  data.materials=data.categories.map((c,i)=>({id:`m${i}`,name:`Laptop ${i}`,categoryId:c.id,supplierId:'s',quantity:i===23?0:i%3===0?0:i%3===1?2:8,reorderLevel:2,price:0,location:'Lab',condition:'Good',serial:`CODE-${i}`}));
  await check('many long category labels stay readable in contained scrolling across LTR and RTL', async () => {
    for (const width of [320,768,1440]) for (const lang of ['en','ps']) {
      await page.setViewportSize({width,height:900}); await seed(data,{lang,dark:lang==='ps'});
      assert.equal(await page.locator('.bar-column').count(),24);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`${width}/${lang}`);
      const chart=page.locator('.category-chart');
      assert.equal(await chart.evaluate(n=>n.scrollWidth>n.clientWidth),true);
      assert.equal(await page.locator('.bar-label').first().evaluate(n=>n.getBoundingClientRect().width>=60),true);
      if(width===320) await page.screenshot({path:`tests/artifacts/redesign-many-categories-${lang}.png`,fullPage:true});
    }
  });
  await check('category and supplier result selection clears old filters and focuses the exact record', async () => {
    await page.setViewportSize({width:1440,height:1000}); await seed(data);
    await find('Unique supplier');
    await page.locator('[role=option]').filter({hasText:'Unique supplier'}).click();
    assert.equal(await page.locator('[data-page=suppliers]').getAttribute('aria-current'),'page');
    assert.equal(await page.locator('.record-highlight').getAttribute('data-record-id'),fixtureId('s'));
    assert.equal(await page.locator('.record-highlight').evaluate(n=>n===document.activeElement),true);
    await find('Long category 13');
    await page.locator('.search-group[aria-labelledby=global-search-group-categories] [role=option]').click();
    assert.equal(await page.locator('[data-page=categories]').getAttribute('aria-current'),'page');
    assert.equal(await page.locator('.record-highlight').getAttribute('data-record-id'),fixtureId('c13'));
    assert.equal(await search.inputValue(),'');
  });
  await check('rapid queries, Escape and clear cannot reveal stale results', async () => {
    await search.fill('Laptop 0'); await search.fill('CODE-23');
    await page.waitForFunction(()=>document.querySelectorAll('[role=option]').length===1);
    assert.match(await page.locator('[role=option]').innerText(),/Laptop 23/);
    await search.fill('Laptop'); await search.press('Escape'); await page.waitForTimeout(180);
    assert.equal(await search.getAttribute('aria-expanded'),'false');
    await find('CODE-2'); await page.locator('.search-clear').click();
    assert.equal(await search.inputValue(),''); assert.equal(await page.locator('[role=option]').count(),0);
    await search.press('Escape');
  });
  await check('320px material edit and confirmed deletion work without changing other records', async () => {
    await page.setViewportSize({width:320,height:620});
    await page.goto(base+'/#materials'); await page.locator('.filters input').fill('CODE-23');
    await page.locator('tbody .row-actions button').first().click(); await page.locator('#field-location').fill('Reassigned lab');
    await page.locator('dialog form [type=submit]').click(); await page.locator('.record-dialog').waitFor({state:'hidden'});
    assert.equal((await serverInventory()).materials.find(m=>m.id===fixtureId('m23')).location,'Reassigned lab');
    await page.locator('tbody .row-actions button').last().click(); await page.locator('.confirm-dialog .primary').click(); await page.locator('.confirm-dialog').waitFor({state:'hidden'});
    assert.equal((await serverInventory()).materials.length,23);
    await find('CODE-23'); assert.equal(await page.locator('[role=option]').count(),0); await search.press('Escape');
  });
  await check('search refreshes shared server data after another client changes inventory', async () => {
    const other=await context.newPage(); await other.goto(base+'/#materials'); await readyInventory(other);
    await other.locator('.filters input').fill('CODE-0'); await other.locator('tbody .row-actions button').first().click();
    await other.locator('#field-name').fill('Changed in another tab'); await other.locator('form [type=submit]').click(); await other.locator('.record-dialog').waitFor({state:'hidden'});
    await page.locator('#page-actions [data-i18n=refreshInventory]').click();
    await page.waitForResponse(r=>r.url().endsWith('/api/materials')&&r.status()===200);
    await find('Changed in another tab'); assert.equal(await page.locator('[role=option]').count(),1);
    await search.press('Escape'); await other.close();
  });
  await check('200 percent layout equivalent keeps search, navigation and dialog controls reachable', async () => {
    // 1440px desktop at 200% zoom gives a 720 CSS-pixel layout viewport.
    await page.setViewportSize({width:720,height:450}); await seed(data);
    await page.goto(base+'/#materials'); await page.locator('#page-actions .primary').click();
    await page.locator('#field-description').fill('Zoom layout check');
    const save=page.locator('dialog form [type=submit]'); await save.scrollIntoViewIfNeeded();
    const bounds=await save.boundingBox(); assert.ok(bounds.y>=0&&bounds.y+bounds.height<=450);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
    await page.keyboard.press('Escape'); assert.equal(await search.isVisible(),true);
  });
  assert.deepEqual(errors,[]);
  await writeFile('tests/artifacts/redesign-edge-results.json',JSON.stringify({browser:browser.version(),checks,errors},null,2));
  console.log(`${checks.length} redesign edge checks passed`);
} finally { await context.close(); await browser.close(); }
