import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { authenticateContext } from './helpers/browser-auth.mjs';
const require = createRequire(import.meta.url);
const { chromium, devices } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({channel: process.env.BROWSER_CHANNEL || 'msedge', headless:true});
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8080';
const key = 'university_it_inventory_v2';
const fixture = {materials:[{id:'m',name:'لپټاپ ABC',categoryId:'c',supplierId:'s',quantity:0,reorderLevel:2,price:12,location:'Room 01',condition:'Good',serial:'ABC-001',responsible:'احمد'}],categories:[{id:'c',name:'کمپیوټر'},{id:'c2',name:'Networking'}],suppliers:[{id:'s',name:'Kabul supplier',phone:'+93 700 123 456',email:'it@example.edu'}],settings:{lang:'ps',dark:true}};
const checks=[], skipped=[], errors=[], failedRequests=[];
function observe(context) {
  context.on('page',page=>{page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(`${m.text()} ${m.location().url || ""}`);});});
  context.on('requestfailed',r=>failedRequests.push(`${r.url()} ${r.failure()?.errorText}`));
  context.on('response',r=>{if(r.status()>=400)failedRequests.push(`${r.status()} ${r.url()}`);});
}
async function check(name, action, options={}) {
  const context=await browser.newContext(options); await authenticateContext(context); observe(context);const page=await context.newPage();
  try { await page.goto(base);await page.locator('h1').waitFor();await page.evaluate(({key,fixture})=>{localStorage.setItem(key,JSON.stringify(fixture));localStorage.setItem('university_it_preferences',JSON.stringify({lang:'en',dark:false}));},{key,fixture});await page.reload();await page.locator('h1').waitFor();await action(page,context);checks.push(name);console.log('PASS',name); }
  catch(error) {
    if(name.startsWith('direct-file') && error.message.includes('ERR_BLOCKED_BY_ADMINISTRATOR')) {
      skipped.push({name,reason:'Managed Chromium policy blocks file:// navigation.'});
      for(let i=failedRequests.length-1;i>=0;i--) if(failedRequests[i].startsWith('file:') && failedRequests[i].includes('ERR_BLOCKED_BY_ADMINISTRATOR')) failedRequests.splice(i,1);
      console.log('SKIP',name,'— managed browser policy');
    } else throw error;
  }
  finally { await context.close(); }
}
await mkdir('tests/artifacts',{recursive:true});
try {
  await check('record creation works when secure-context randomUUID is unavailable',async page=>{
    await page.evaluate(()=>Object.defineProperty(crypto,'randomUUID',{value:undefined,configurable:true}));await page.goto(base+'/#categories');await page.locator('#page-actions .primary').click();await page.locator('#field-name').fill('HTTP-compatible category');await page.locator('dialog form [type=submit]').click();
    assert.equal(await page.locator('.record-dialog').isVisible(),false,await page.locator('#form-errors').textContent());
    const id=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).categories.at(-1).id,key);assert.match(id,/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
  });
  await check('opening mobile navigation puts keyboard focus on a navigation item',async page=>{
    await page.locator('.menu-button').focus();await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>!!document.activeElement.closest('nav')),true);await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.activeElement.classList.contains('menu-button')),true);
  },{viewport:{width:360,height:800}});
  await check('damaged preference JSON falls back to valid inventory preferences',async page=>{
    await page.evaluate(()=>localStorage.setItem('university_it_preferences','{broken'));await page.reload();await page.locator('h1').waitFor();assert.equal(await page.locator('html').getAttribute('lang'),'ps');assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');assert.deepEqual(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key),fixture);
  });
  await check('search and combined category/status filters preserve original data',async page=>{
    await page.goto(base+'/#materials');await page.locator('.filters input[type=search]').fill('لپټاپ');await page.locator('.filters select').first().selectOption('c');await page.locator('.filters select[data-label=status]').selectOption('out');assert.equal(await page.locator('tbody tr .record-name').count(),1);
    await page.locator('.filters select[data-label=status]').selectOption('good');assert.equal(await page.locator('tbody tr .record-name').count(),0);assert.equal(await page.locator('.filters select').first().inputValue(),'c');assert.equal(await page.locator('.filters input[type=search]').inputValue(),'لپټاپ');assert.deepEqual(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key),fixture);
  });
  await check('supplier relationship blocks deletion until material is reassigned',async page=>{
    await page.goto(base+'/#suppliers');await page.locator('tbody button').last().click();assert.equal(await page.locator('.confirm-dialog').isVisible(),false);assert.match(await page.locator('[role=alert]').first().innerText(),/used by materials/);
    await page.goto(base+'/#materials');await page.locator('tbody button').first().click();await page.locator('#field-supplierId').selectOption('');await page.locator('dialog form [type=submit]').click();await page.goto(base+'/#suppliers');await page.locator('tbody button').last().click();await page.locator('.confirm-dialog .primary').click();assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).suppliers.length,key),0);
  });
  await check('selected restore file survives language/theme changes; exported JSON matches records',async page=>{
    await page.goto(base+'/#backup');await page.locator('#restore-file').setInputFiles({name:'fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});await page.goto(base+'/#settings');await page.locator('.settings [data-language=ps]').click();await page.locator('.settings [data-theme-choice=dark]').click();await page.goto(base+'/#backup');await page.locator('[data-i18n=preview]').click();await page.locator('.confirm-dialog').waitFor({state:'visible'});await page.locator('.confirm-dialog .primary').click();
    const event=page.waitForEvent('download');await page.locator('[data-i18n=backupAction]').click();const path='tests/artifacts/qa-export.json';await(await event).saveAs(path);const payload=JSON.parse(await readFile(path,'utf8'));assert.deepEqual(payload.data.materials,fixture.materials);assert.deepEqual(payload.data.categories,fixture.categories);assert.deepEqual(payload.data.suppliers,fixture.suppliers);
  });
  await check('Android touch emulation: all pages, both languages/themes, mixed directions and CRUD',async page=>{
    for(const lang of ['en','ps'])for(const dark of [false,true]){
      await page.evaluate(p=>localStorage.setItem('university_it_preferences',JSON.stringify(p)),{lang,dark});await page.reload();await page.locator('h1').waitFor();
      for(const route of ['dashboard','materials','categories','suppliers','reports','backup','settings']){
        await page.goto(base+'/#'+route);assert.equal(await page.locator('html').getAttribute('dir'),lang==='ps'?'rtl':'ltr');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
      }
      await page.goto(base+'/#materials');await page.locator('tbody button').first().tap();assert.equal(await page.locator('#field-serial').getAttribute('dir'),'ltr');assert.equal(await page.locator('#field-name').getAttribute('dir'),'auto');await page.locator('#field-responsible').fill('مسؤل ABC');await page.locator('dialog form [type=submit]').tap();
    }
    await page.goto(base+'/#categories');await page.locator('#page-actions .primary').tap();await page.locator('#field-name').fill('Android category');await page.locator('dialog form [type=submit]').tap();await page.locator('.filters input[type=search]').fill('Android category');await page.locator('tbody button').last().tap();await page.locator('.confirm-dialog .primary').tap();
    await page.screenshot({path:'tests/artifacts/android-ps-dark.png',fullPage:true});
  },devices['Pixel 7']);
  await check('short mobile viewport keeps form footer reachable and every control labelled',async page=>{
    await page.goto(base+'/#materials');await page.locator('#page-actions .primary').click();
    for(const input of await page.locator('dialog input,dialog select,dialog textarea').all())assert.equal(await input.evaluate(n=>n.labels.length>0),true);
    await page.locator('#field-description').fill('Keyboard-height viewport');await page.locator('dialog form [type=submit]').scrollIntoViewIfNeeded();const rect=await page.locator('dialog form [type=submit]').boundingBox();assert.ok(rect.y>=0&&rect.y+rect.height<=400);await page.keyboard.press('Escape');
  },{viewport:{width:360,height:400}});
  await check('direct-file recovery has no failed resources',async page=>{
    await page.goto(pathToFileURL(resolve('index.html')).href);await page.locator('.file-recovery').waitFor();
  });
  // Map a synthetic hostname only inside this disposable browser, keeping the
  // server loopback-only while exercising a genuine insecure HTTP origin.
  const httpBrowser=await chromium.launch({channel:process.env.BROWSER_CHANNEL || 'msedge',headless:true,args:['--host-resolver-rules=MAP inventory.test 127.0.0.1','--no-proxy-server']});
  try {
    const context=await httpBrowser.newContext();observe(context);const page=await context.newPage();const url=new URL(base);url.hostname='inventory.test';await page.goto(url.origin+'/login');await page.locator('#username').fill(process.env.TEST_ADMIN_USERNAME);await page.locator('#password').fill(process.env.TEST_ADMIN_PASSWORD);await page.locator('#login-submit').click();await page.waitForURL(url.origin+'/');await page.locator('h1').waitFor();
    assert.equal(await page.evaluate(()=>isSecureContext),false);assert.equal(await page.evaluate(()=>typeof crypto.randomUUID),'undefined');await page.goto(url.href+'#categories');await page.locator('#page-actions .primary').click();await page.locator('#field-name').fill('HTTP origin');await page.locator('dialog form [type=submit]').click();assert.equal(await page.locator('.record-dialog').isVisible(),false);assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).categories.length,key),1);
    checks.push('genuine insecure HTTP origin supports record creation');console.log('PASS genuine insecure HTTP origin supports record creation');
  } finally { await httpBrowser.close(); }
  assert.deepEqual(errors,[], JSON.stringify({errors,failedRequests}));assert.deepEqual(failedRequests,[]);checks.push('no console errors or failed resource requests across QA contexts');
  await writeFile('tests/artifacts/qa-results.json',JSON.stringify({browser:browser.version(),checks,skipped,errors,failedRequests},null,2));console.log(`${checks.length} QA checks passed; ${skipped.length} skipped`);
} finally {await browser.close();}
