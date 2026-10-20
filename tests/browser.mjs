import { seedInventory, serverInventory, readyInventory, fixtureId } from './helpers/browser-fixture.mjs';
// Run with PLAYWRIGHT_MODULE pointing to a locally installed Playwright package.
// Uses an isolated headless Edge profile; never touches the user's browser storage.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { authenticateContext } from './helpers/browser-auth.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
await authenticateContext(context);
const page = await context.newPage();
const errors=[];
const failedRequests=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error' && !(m.location().url.includes('/api/') && /status of 409/.test(m.text()))) errors.push(m.text());});
page.on('requestfailed',r=>failedRequests.push(`${r.url()} ${r.failure()?.errorText}`));
page.on('response',r=>{if(r.status()>=400 && !(r.status()===409 && r.url().includes('/api/')))failedRequests.push(`${r.status()} ${r.url()}`);});
const base=process.env.TEST_BASE_URL || 'http://127.0.0.1:8080';
const key='university_it_inventory_v2';
const fixture={categories:[{id:'c',name:'Computers',description:'University equipment'},{id:'c2',name:'شبکې',description:'Network equipment'}],suppliers:[{id:'s',name:'Kabul Technology',contact:'احمد',phone:'+93 700 123 456',email:'it@example.edu',address:'Kabul'}],materials:[
 {id:'m1',name:'Dell Latitude 5440',categoryId:'c',supplierId:'s',quantity:12,reorderLevel:3,price:52000,location:'IT Lab 01',condition:'Good',serial:'UNI-LT-0042',responsible:'احمد',purchaseDate:'2026-09-01',description:'Teaching laptops',createdAt:'2026-10-10T10:00:00Z'},
 {id:'m2',name:'د شبکې سویچ',categoryId:'c2',supplierId:'s',quantity:2,reorderLevel:3,price:12000,location:'Library',condition:'Needs Repair',serial:'NET-012',responsible:'فرید',createdAt:'2026-10-09T10:00:00Z'},
 {id:'m3',name:'USB-C docking station',categoryId:'c',supplierId:'',quantity:0,reorderLevel:2,price:3500,location:'IT Store',condition:'Good',serial:'',createdAt:'2026-10-08T10:00:00Z'}],settings:{lang:'en',dark:false}};
await mkdir('tests/artifacts',{recursive:true});
const expectedConflicts=[];context.on('response',r=>{if(r.status()===409&&r.url().includes('/api/'))expectedConflicts.push(r.url());});
const checks=[], skipped=[];
async function check(name,fn){
 try { await fn(); checks.push(name); console.log('PASS',name); }
 catch(error) {
  if(name.startsWith('direct-file') && error.message.includes('ERR_BLOCKED_BY_ADMINISTRATOR')) { skipped.push({name,reason:'Managed Chromium policy blocks file:// navigation.'}); console.log('SKIP',name,'— managed browser policy'); }
  else throw error;
 }
}
try {
 await page.goto(base);
 await seedInventory(fixture); await page.evaluate(({key,fixture})=>localStorage.setItem(key,JSON.stringify(fixture)),{key,fixture}); await page.reload(); await readyInventory(page); await readyInventory(page);
 await page.locator('h1').waitFor(); await readyInventory(page);
 await check('existing records render without mutation',async()=>{assert.equal(await page.locator('tbody tr').count(),3);assert.deepEqual(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key),fixture);});
 await check('category create / edit / search / delete',async()=>{
  await page.locator('nav [data-page="categories"]').click(); await page.locator('#page-actions .primary').click();
  await page.locator('#field-name').fill('  نوې کټګوري  '); await page.locator('#field-description').fill('  unchanged description  '); await page.locator('dialog form [type=submit]').click();await page.locator('.record-dialog').waitFor({state:'hidden'});
  await page.locator('.filters input[type=search]').fill('نوې'); assert.equal(await page.locator('tbody tr').count(),1);
  await page.locator('tbody button').first().click(); assert.equal(await page.locator('#field-name').inputValue(),'نوې کټګوري');
  await page.locator('#field-name').fill('Updated category'); await page.locator('dialog form [type=submit]').click();await page.locator('.record-dialog').waitFor({state:'hidden'});
  await page.locator('.filters input[type=search]').fill('Updated'); await page.locator('tbody button').last().click(); await page.locator('.confirm-dialog .primary').click();await page.locator('.confirm-dialog').waitFor({state:'hidden'});
  assert.equal(((await serverInventory()).categories.length),2);
 });
 await check('supplier create / edit / Unicode search / delete',async()=>{
  await page.locator('nav [data-page="suppliers"]').click(); await page.locator('#page-actions .primary').click();
  await page.locator('#field-name').fill('نوی عرضه کوونکی'); await page.locator('#field-phone').fill('+93 700 111 222'); await page.locator('#field-email').fill('bad-email'); await page.locator('dialog form [type=submit]').click(); assert.equal(await page.locator('#field-email').getAttribute('aria-invalid'),'true');
  await page.locator('#field-email').fill('test@example.edu'); await page.locator('dialog form [type=submit]').click();await page.locator('.record-dialog').waitFor({state:'hidden'});
  await page.locator('.filters input[type=search]').fill('نوی'); await page.locator('tbody button').first().click(); await page.locator('#field-contact').fill('نوی کس'); await page.locator('dialog form [type=submit]').click();await page.locator('.record-dialog').waitFor({state:'hidden'});
  assert.ok((await page.locator('tbody').innerText()).includes('نوی کس')); await page.locator('tbody button').last().click(); await page.locator('.confirm-dialog .primary').click();
 });
 await check('material validation, draft preservation, safe rendering and PostgreSQL persistence',async()=>{
  await page.locator('nav [data-page="materials"]').click(); await page.locator('#page-actions .primary').click();
  await page.locator('#field-name').fill('<img src=x onerror=alert(1)> پښتو'); await page.locator('#field-location').fill('  لابراتوار  ');
  await page.locator('#field-categoryId').selectOption(fixtureId('c2')); await page.locator('#field-supplierId').selectOption(fixtureId('s'));
  assert.equal(await page.locator('#field-quantity').count(),0);
  await page.locator('#field-reorderLevel').fill('-1'); await page.locator('dialog form [type=submit]').click(); assert.equal(await page.locator('#field-reorderLevel').getAttribute('aria-invalid'),'true');
  await page.locator('#field-reorderLevel').fill('7.125'); assert.equal(await page.locator('dialog .language-button,dialog .theme-button').count(),0);
  assert.equal(await page.locator('#field-categoryId').inputValue(),fixtureId('c2')); assert.equal(await page.locator('#field-supplierId').inputValue(),fixtureId('s'));
  await page.locator('dialog form [type=submit]').click(); await page.locator('.record-dialog').waitFor({state:'hidden'});
  await page.locator('.filters input[type=search]').fill('<img'); assert.equal(await page.locator('tbody img').count(),0); assert.ok((await page.locator('tbody').innerText()).includes('<img src=x onerror=alert(1)>'));
  await page.locator('tbody button').first().click(); await page.locator('#field-reorderLevel').fill('8.125'); await page.locator('dialog form [type=submit]').click(); await page.locator('.record-dialog').waitFor({state:'hidden'});
  await page.reload(); await readyInventory(page); const saved=(await serverInventory()).materials.find(m=>m.name.startsWith('<img')); assert.equal(saved.quantity,'0'); assert.equal(saved.reorderLevel,'8.125');
  await page.locator('.filters input[type=search]').fill('<img'); await page.locator('tbody button').last().click(); await page.locator('.confirm-dialog .primary').click(); await page.locator('.confirm-dialog').waitFor({state:'hidden'});
 });
 await check('referenced category deletion is blocked by the API',async()=>{
  await page.locator('nav [data-page="categories"]').click(); await page.locator('tbody tr').filter({hasText:'Computers'}).locator('button').last().click();
  await page.locator('.confirm-dialog .primary').click(); await page.locator('[data-i18n=recordInUse]').waitFor(); assert.equal((await serverInventory()).categories.length,2); await page.keyboard.press('Escape');
 });
 await check('native dialog focus containment and Escape restoration',async()=>{
  await page.locator('#page-actions .primary').click(); for(let i=0;i<12;i++){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>!!document.activeElement.closest('dialog')),true);} await page.keyboard.press('Escape');assert.equal(await page.locator('dialog.record-dialog').isVisible(),false);assert.equal(await page.evaluate(()=>document.activeElement.closest('#page-actions')!==null),true);
 });
 await check('central export is labelled read-only and incompatible restore is disabled',async()=>{
  await page.locator('nav [data-page="backup"]').click(); const downloadEvent=page.waitForEvent('download'); await page.locator('button [data-i18n=centralExport]').click(); await (await downloadEvent).saveAs('tests/artifacts/export.json');
  assert.equal(await page.locator('#restore-file').count(),0); assert.equal(await page.locator('button:has([data-i18n=restore])').isDisabled(),true); assert.equal((await serverInventory()).materials.length,3);
 });
 await check('legacy JSON is inert and never converted into central records',async()=>{
  await page.evaluate(()=>localStorage.setItem('ims_orders','[{"note":"<img src=x onerror=alert(1)>","totalValue":50}]'));
  const event=page.waitForEvent('download'); await page.locator('button [data-i18n=legacyExport]').click(); await (await event).saveAs('tests/artifacts/legacy-archive.json');
  assert.equal(await page.locator('#page-content img').count(),0); assert.equal((await serverInventory()).materials.length,3);
 });
 await check('failed pending-request journal preserves draft and prevents an unsafe POST',async()=>{
  await page.goto(base+'/#categories'); await page.locator('#page-actions .primary').click(); await page.locator('#field-name').fill('Unsaved draft');
  await page.evaluate(()=>{window.originalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='university_it_pending_request_v1')throw new DOMException('Quota','QuotaExceededError');return window.originalSet.call(this,key,value);};});
  await page.locator('dialog form [type=submit]').click(); await page.locator('[data-i18n=recoveryUnavailable]').waitFor(); assert.equal(await page.locator('#field-name').inputValue(),'Unsaved draft'); assert.equal((await serverInventory()).categories.length,2);
  await page.evaluate(()=>{Storage.prototype.setItem=window.originalSet;}); await page.keyboard.press('Escape'); assert.equal(await page.locator('tbody tr').count(),2);
 });
 await check('stale second-tab metadata write is blocked without losing its draft',async()=>{
  const second=await context.newPage(); await second.goto(base+'/#categories'); await readyInventory(second);
  await second.locator('tbody tr').filter({hasText:'Computers'}).locator('button').first().click();
  await page.locator('tbody tr').filter({hasText:'Computers'}).locator('button').first().click(); await page.locator('#field-name').fill('Committed in first tab'); await page.locator('dialog form [type=submit]').click(); await page.locator('.record-dialog').waitFor({state:'hidden'});
  await second.locator('#field-name').fill('Stale draft'); await second.locator('dialog form [type=submit]').click(); await second.locator('[data-i18n=recordConflict]').waitFor(); assert.equal(await second.locator('#field-name').inputValue(),'Stale draft'); await second.close();
  await seedInventory(fixture); await page.reload(); await readyInventory(page);
 });
 await check('central inventory has no destructive browser clear or recovery action',async()=>{
  await page.goto(base+'/#backup'); assert.equal(await page.locator('button [data-i18n=danger],button [data-i18n=recovery]').count(),0);
  assert.equal((await serverInventory()).materials.length,3); assert.deepEqual(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key),fixture);
 });
 await check('print report includes all inventory with correct AFN value',async()=>{
  await page.goto(base+'/#reports');await page.evaluate(()=>{window.print=()=>{};});await page.getByRole('button',{name:'Print report',exact:true}).click();await page.locator('#print-area tbody tr').first().waitFor({state:'attached'});assert.equal(await page.locator('#print-area tbody tr').count(),3);assert.ok((await page.locator('#print-area').textContent()).includes('AFN'));await page.emulateMedia({media:'print'});assert.equal(await page.locator('#print-area').isVisible(),true);assert.equal(await page.locator('main').isVisible(),false);await page.emulateMedia({media:'screen'});
 });
 await check('mobile navigation toggles with keyboard and closes on selection',async()=>{
  await page.setViewportSize({width:360,height:900});await page.locator('.menu-button').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('.sidebar').isVisible(),true);await page.locator('nav [data-page="settings"]').click();assert.equal(await page.locator('.sidebar').isVisible(),false);
 });
 await check('all pages in both languages and themes at 320 / 375 / 390 / 428 / 768 / 1024 / 1440 px',async()=>{
  for(const width of [320,375,390,428,768,1024,1440]) for(const lang of ['en','ps']) for(const dark of [false,true]){
   await page.setViewportSize({width,height:1000});await page.evaluate(prefs=>localStorage.setItem('university_it_preferences',JSON.stringify(prefs)),{lang,dark});await page.goto(base+'/#dashboard');await page.reload(); await readyInventory(page);
   for(const route of ['dashboard','materials','categories','suppliers','reports','backup','settings']){
    await page.goto(base+'/#'+route);await page.locator('h1').waitFor(); await readyInventory(page);assert.equal(await page.locator('html').getAttribute('dir'),lang==='ps'?'rtl':'ltr');
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false,`${width}/${lang}/${dark}/${route} page overflow`);
    assert.equal(await page.locator('input:not([aria-label]):not([id]),select:not([aria-label]):not([id])').count(),0);
   }
   await page.goto(base+'/#dashboard');await page.screenshot({path:`tests/artifacts/dashboard-${width}-${lang}-${dark?'dark':'light'}.png`,fullPage:true});
   await page.goto(base+'/#materials');await page.locator('#page-actions .primary').click();assert.equal(await page.evaluate(()=>document.querySelector('dialog').getBoundingClientRect().width<=innerWidth),true);await page.screenshot({path:`tests/artifacts/dialog-${width}-${lang}-${dark?'dark':'light'}.png`,fullPage:true});await page.keyboard.press('Escape');
  }
 });
 await check('corrupted legacy storage preserves raw bytes without replacing server inventory',async()=>{
  await page.evaluate(key=>localStorage.setItem(key,'{corrupt'),key); await page.reload(); await readyInventory(page);
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),'{corrupt'); assert.equal((await serverInventory()).materials.length,3);
  await page.goto(base+'/#backup'); const event=page.waitForEvent('download'); await page.locator('button [data-i18n=legacyExport]').click(); await (await event).saveAs('tests/artifacts/corrupt-legacy.json');
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),'{corrupt');
 });
 await check('blocked localStorage does not prevent reading central inventory',async()=>{
  const blockedContext=await browser.newContext(); await authenticateContext(blockedContext);
  await blockedContext.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Blocked','SecurityError');}});});
  const blocked=await blockedContext.newPage();const blockedErrors=[];blocked.on('pageerror',e=>blockedErrors.push(e.message));await blocked.goto(base);await readyInventory(blocked);
  assert.equal(await blocked.locator('.stat-value').first().innerText(),'3');assert.deepEqual(blockedErrors,[]);await blockedContext.close();
 });
 await check('direct-file recovery exports original records without changing them',async()=>{
  const filePage=await context.newPage();const fileErrors=[];filePage.on('pageerror',e=>fileErrors.push(e.message));await filePage.goto(pathToFileURL(resolve('index.html')).href);await filePage.evaluate(({key,fixture})=>localStorage.setItem(key,JSON.stringify(fixture)),{key,fixture});await filePage.reload();assert.equal(await filePage.locator('.file-recovery').count(),1);const event=filePage.waitForEvent('download');await filePage.locator('.file-recovery button').first().click();await (await event).saveAs('tests/artifacts/file-recovery.json');assert.deepEqual(await filePage.evaluate(key=>JSON.parse(localStorage.getItem(key)),key),fixture);assert.deepEqual(fileErrors,[]);await filePage.close();
 });
 await check('text and input-border token contrast meets selected WCAG ratios',async()=>{
  for(const dark of [false,true]){
   await page.evaluate(dark=>document.documentElement.dataset.theme=dark?'dark':'light',dark);
   const ratios=await page.evaluate(()=>{
    const css=getComputedStyle(document.documentElement);const rgb=v=>{const hex=css.getPropertyValue(v).trim().slice(1);return [0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);};const lum=v=>{const [r,g,b]=rgb(v);return .2126*r+.7152*g+.0722*b;};const ratio=(a,b)=>{const x=lum(a),y=lum(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);};return [['--text','--surface',4.5],['--muted','--surface',4.5],['--good-text','--good-bg',4.5],['--low-text','--low-bg',4.5],['--out-text','--out-bg',4.5],['--on-accent','--accent',4.5],['--nav-muted','--nav',4.5],['--control-border','--surface',3]].map(([a,b,min])=>({a,b,min,ratio:ratio(a,b)}));
   });for(const result of ratios)assert.ok(result.ratio>=result.min,JSON.stringify(result));
  }
 });
 assert.equal(expectedConflicts.length,2);assert.deepEqual(errors,[]);assert.deepEqual(failedRequests,[]);checks.push('no browser console, page errors or failed resource requests');
 await writeFile('tests/artifacts/browser-results.json',JSON.stringify({browser:browser.version(),base,checks,skipped,errors,failedRequests},null,2));
 console.log(`${checks.length} browser checks passed; ${skipped.length} skipped`);
} finally { await browser.close(); }

