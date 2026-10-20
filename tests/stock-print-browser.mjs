import { seedInventory, serverInventory, readyInventory, fixtureId } from './helpers/browser-fixture.mjs';
// Feature verification uses disposable browser contexts and synthetic storage only.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { authenticateContext } from './helpers/browser-auth.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL || 'msedge',headless:true});
const base=process.env.TEST_BASE_URL || 'http://127.0.0.1:8080';
const key='university_it_inventory_v2';
const fixture={materials:[
  {id:'a',name:'Laptop لپټاپ',serial:'LT-001',categoryId:'c',quantity:10,reorderLevel:2,price:100,condition:'Good',location:'Lab'},
  {id:'b',name:'Cable',categoryId:'c',quantity:4,reorderLevel:1,price:10,condition:'Good',location:'Store',unit:'rolls'},
  {id:'d',name:'Monitor',categoryId:'d',quantity:2,reorderLevel:1,price:500,condition:'Good',location:'Office'}
],categories:[{id:'c',name:'Computers کمپیوټر'},{id:'d',name:'Displays'},{id:'empty',name:'Empty category'}],suppliers:[],settings:{lang:'en',dark:false}};
const checks=[],errors=[],requests=[],expectedConflicts=[];
async function check(name,action){
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await authenticateContext(context);
 context.on('page',p=>{p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error' && !(m.location().url.includes('/api/') && /status of 409/.test(m.text())))errors.push(m.text());});});
 context.on('response',r=>{if(r.status()===409&&r.url().includes('/api/'))expectedConflicts.push(r.url());});
 context.on('requestfailed',r=>requests.push(r.url()));context.on('response',r=>{if(r.status()>=400 && !(r.status()===409 && r.url().includes('/api/')))requests.push(`${r.status()} ${r.url()}`);});
 const page=await context.newPage();
 try{
  await seedInventory(fixture);await page.goto(base);await readyInventory(page);await page.evaluate(({key,fixture})=>localStorage.setItem(key,JSON.stringify(fixture)),{key,fixture});await page.reload();await readyInventory(page);
  await action(page,context);checks.push(name);console.log('PASS',name);
 }finally{await context.close();}
}
const quantities=async p=>{const state=await serverInventory();return fixture.materials.map(m=>Number(state.materials.find(row=>row.id===fixtureId(m.id)).quantity));};
async function open(p){await p.goto(base+'/#materials');await p.locator('#remove-materials').click();}
async function add(p,id,quantity){id=fixtureId(id);await p.locator('#removal-material').selectOption(id);await p.locator('#add-removal').click();if(quantity!==undefined)await p.locator(`[data-removal-id="${id}"] input`).fill(String(quantity));}
async function review(p){await p.locator('#removal-form [type=submit]').click();await p.locator('.confirm-dialog').waitFor({state:'visible'});}
async function confirm(p){await p.locator('.confirm-dialog .primary').click();await p.locator('.record-dialog').waitFor({state:'hidden'});}
await mkdir('tests/artifacts',{recursive:true});
try{
 await check('single removal persists after reload and preserves the record',async p=>{
  await open(p);await p.locator('#removal-search').fill('LT-001');assert.equal(await p.locator('#removal-material option').count(),2);await add(p,'a',3);assert.match(await p.locator(`[data-removal-id="${fixtureId('a')}"]`).innerText(),/10 Units/);await review(p);assert.deepEqual(await quantities(p),[10,4,2]);await confirm(p);assert.deepEqual(await quantities(p),[7,4,2]);await p.reload();assert.deepEqual(await quantities(p),[7,4,2]);
 });
 await check('multiple removals, full stock to zero, summaries and duplicate submission guard',async p=>{
  await open(p);await add(p,'a',3);await add(p,'b',4);assert.match(await p.locator(`[data-removal-id="${fixtureId('b')}"]`).innerText(),/4 rolls/);await review(p);
  await p.evaluate(()=>{const submit=document.querySelector('.confirm-dialog .primary');const form=document.querySelector('#removal-form');submit.click();submit.click();form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
  await p.locator('.record-dialog').waitFor({state:'hidden'}); assert.deepEqual(await quantities(p),[7,0,2]);assert.equal((await serverInventory()).materials.length,3);assert.equal(await p.evaluate(key=>localStorage.getItem(key+'_recovery'),key),null);
  await p.reload();assert.deepEqual(await quantities(p),[7,0,2]);await p.goto(base+'/#dashboard');assert.equal(await p.locator('.stat').nth(1).locator('strong').innerText(),'2');await p.goto(base+'/#reports');assert.match(await p.locator('.value').innerText(),/1,700/);
 });
 await check('empty and invalid batches never partially deduct; repeated selections remain one row',async p=>{
  await open(p);await p.locator('#removal-form [type=submit]').click();assert.equal(await p.locator('.confirm-dialog').isVisible(),false);await add(p,'a',3);await add(p,'b');await add(p,'a');assert.equal(await p.locator(`[data-removal-id="${fixtureId('a')}"]`).count(),1);assert.equal(await p.locator(`[data-removal-id="${fixtureId('a')}"] input`).inputValue(),'3');
  for(const invalid of ['', '0','-1','1.0001','1000000000']){await p.locator(`[data-removal-id="${fixtureId('b')}"] input`).fill(invalid);await p.locator('#removal-form [type=submit]').click();assert.equal(await p.locator('.confirm-dialog').isVisible(),false);assert.deepEqual(await quantities(p),[10,4,2]);}
  await p.locator(`[data-removal-id="${fixtureId('b')}"] input`).evaluate(n=>{n.type='text';n.value='nonnumeric';});await p.locator('#removal-form [type=submit]').click();assert.deepEqual(await quantities(p),[10,4,2]);assert.equal(await p.locator('.confirm-dialog').isVisible(),false);
  await p.locator(`[data-removal-id="${fixtureId('b')}"] button`).click();await review(p);await p.locator('.confirm-dialog [data-i18n=cancel]').click();assert.deepEqual(await quantities(p),[10,4,2]);await p.locator(`[data-removal-id="${fixtureId('a')}"] input`).fill('10');await review(p);await confirm(p);assert.deepEqual(await quantities(p),[0,4,2]);
 });
 await check('write failure retains the entire batch and can be retried safely',async p=>{
  await open(p);await add(p,'a',2);await add(p,'b',1);await review(p);await p.evaluate(()=>{window.savedSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='university_it_pending_request_v1')throw Error('Quota');return window.savedSet.call(this,k,v);};});await p.locator('.confirm-dialog .primary').click();await p.locator('.confirm-dialog [data-i18n=recoveryUnavailable]').waitFor();assert.deepEqual(await quantities(p),[10,4,2]);assert.equal(await p.locator('.confirm-dialog [role=alert]').isVisible(),true);await p.evaluate(()=>{Storage.prototype.setItem=window.savedSet;});await confirm(p);assert.deepEqual(await quantities(p),[8,3,2]);
 });
 await check('a concurrent stock deduction is checked against current server balances',async(p,context)=>{
  await open(p);await add(p,'a',2);await add(p,'b',1);await review(p);
  const csrf=(await (await context.request.get(base+'/api/auth/csrf')).json()).csrfToken;
  const response=await context.request.post(base+'/api/stock-operations',{headers:{'X-CSRF-Token':csrf},data:{operationId:crypto.randomUUID(),type:'remove',items:[{materialId:fixtureId('a'),quantity:'9'}]}});assert.equal(response.status(),201);
  await p.locator('.confirm-dialog .primary').click();await p.locator('[data-i18n=removalExcess]').waitFor();assert.deepEqual(await quantities(p),[1,4,2]);
 });
 await check('selected category report filters rows/value, empty categories are clear, Print All is unchanged',async p=>{
  await p.goto(base+'/#reports');await p.evaluate(()=>{window.printCalls=0;window.print=()=>window.printCalls++;});await p.locator('[data-i18n=printCategory]').click();assert.equal(await p.evaluate(()=>window.printCalls),0);
  await p.locator('#print-category').selectOption(fixtureId('c'));await p.locator('[data-i18n=printCategory]').click();await p.waitForFunction(()=>window.printCalls===1);assert.equal(await p.locator('#print-area tbody tr').count(),2);assert.match(await p.locator('#print-area h2').innerText(),/Computers کمپیوټر/);assert.match(await p.locator('#print-area').innerText(),/1,040/);assert.doesNotMatch(await p.locator('#print-area').innerText(),/Monitor/);assert.deepEqual(await p.locator('#print-area tbody tr td:nth-child(3)').allTextContents(),['4','10']);
  await p.locator('#print-category').selectOption(fixtureId('empty'));await p.locator('[data-i18n=printCategory]').click();await p.waitForFunction(()=>window.printCalls===2);assert.match(await p.locator('#print-area').innerText(),/This category has no materials/);assert.match(await p.locator('#print-area').innerText(),/AFN\s*0/);
  await p.locator('#page-actions [data-i18n=print]').click();await p.waitForFunction(()=>window.printCalls===3);assert.equal(await p.locator('#print-area tbody tr').count(),3);assert.equal(await p.locator('#print-area h2').count(),0);assert.match(await p.locator('#print-area').innerText(),/2,040/);
  await p.emulateMedia({media:'print'});assert.equal(await p.locator('#print-category').isVisible(),false);assert.equal(await p.locator('nav').isVisible(),false);assert.equal(await p.locator('#print-area button,#print-area select').count(),0);await p.emulateMedia({media:'screen'});
 });
 await check('new controls support 12 width/language/theme combinations and keep removal drafts',async p=>{
  for(const width of [360,768,1440])for(const lang of ['en','ps'])for(const dark of [false,true]){
   await p.setViewportSize({width,height:900});await p.evaluate(pref=>localStorage.setItem('university_it_preferences',JSON.stringify(pref)),{lang,dark});await p.reload();await readyInventory(p);await open(p);await add(p,'a',1);await add(p,'b',2);
   assert.equal(await p.locator('.record-dialog .language-button,.record-dialog .theme-button').count(),0);assert.equal(await p.locator(`[data-removal-id="${fixtureId('a')}"] input`).inputValue(),'1');assert.equal(await p.locator(`[data-removal-id="${fixtureId('b')}"] input`).inputValue(),'2');assert.equal(await p.locator('html').getAttribute('dir'),lang==='ps'?'rtl':'ltr');
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);assert.equal(await p.locator('.record-dialog').evaluate(n=>n.scrollWidth<=n.clientWidth+1),true);await review(p);assert.equal(await p.locator('.confirm-dialog').evaluate(n=>n.scrollWidth<=n.clientWidth+1),true);
   if(width===360&&lang==='ps'&&dark)await p.screenshot({path:'tests/artifacts/removal-360-ps-dark.png'});
   await p.keyboard.press('Escape');await p.keyboard.press('Escape');await p.goto(base+'/#reports');await p.locator('#print-category').selectOption(fixtureId('c'));await p.evaluate(()=>{window.didPrint=false;window.print=()=>{window.didPrint=true;};});await p.locator('[data-i18n=printCategory]').click();await p.waitForFunction(()=>window.didPrint);assert.equal(await p.locator('#print-area tbody tr').count(),2);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  }
  assert.deepEqual(await quantities(p),[10,4,2]);
 });
 assert.equal(expectedConflicts.length,1);assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);checks.push('no console errors or failed resource requests');
 await writeFile('tests/artifacts/stock-print-results.json',JSON.stringify({checks,errors,requests},null,2));console.log(`${checks.length} feature browser checks passed`);
}finally{await browser.close();}
