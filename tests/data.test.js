import test from 'node:test';
import assert from 'node:assert/strict';
import { Repository, KEY, RECOVERY_KEY, LEGACY_KEYS, emptyState, validate, parseBackup, backupPayload, upsert, removeRecord, stockStatus } from '../app/data.js';
import { messages, setLanguage, t } from '../app/i18n.js';
import legacyDB from '../js/db.js';
import { createId } from '../app/data.js';

function fixture() {
  return { ...emptyState(), categories: [{id:'c',name:'کمپیوټر'}], suppliers: [{id:'s',name:'Supplier'}], materials: [{ id:'m', name:'  لپټاپ <script>  ', categoryId:'c', supplierId:'s', quantity:3, reorderLevel:2, price:100, location:'لابراتوار', condition:'Good', serial:'ABC-123', description:'  exact\ntext  ', purchaseDate:'2026-10-11' }] };
}
class MemoryStorage {
  values = new Map(); failOn = null;
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { if (key === this.failOn) throw Error('Quota'); this.values.set(key,value); }
}
test('existing v2 records and Unicode remain exactly unchanged', () => {
  const data = fixture(); assert.deepEqual(parseBackup(JSON.stringify(backupPayload(data))), data);
  assert.equal(validate(data).materials[0].name,'  لپټاپ <script>  ');
});
test('missing collections, unsupported versions and wrong collection types are rejected', () => {
  for (const bad of [{materials:[],categories:[]}, { ...fixture(), suppliers:{} }, { app:'University IT Material Management',version:3,data:fixture() }, null]) assert.throws(() => parseBackup(JSON.stringify(bad)));
});
test('duplicate IDs and orphaned references are rejected', () => {
  const duplicate=fixture(); duplicate.categories.push({...duplicate.categories[0]}); assert.throws(()=>validate(duplicate),/duplicateId/);
  for (const field of ['categoryId','supplierId']) { const data=fixture(); data.materials[0][field]='missing'; assert.throws(()=>validate(data),/invalidReference/); }
});
test('negative, nonfinite, fractional quantities and impossible dates are rejected', () => {
  for (const quantity of [-1, Infinity, NaN, .5, '1', Number.MAX_SAFE_INTEGER+1]) { const data=fixture(); data.materials[0].quantity=quantity; assert.throws(()=>validate(data)); }
  const data=fixture(); data.materials[0].purchaseDate='2026-02-30'; assert.throws(()=>validate(data),/invalidDate/);
});
test('CRUD is immutable, blocks dependent deletion and enforces new duplicates', () => {
  const original=fixture(); const next=upsert(original,'materials',{...original.materials[0],quantity:8});
  assert.equal(original.materials[0].quantity,3); assert.equal(next.materials[0].quantity,8);
  assert.throws(()=>removeRecord(original,'categories','c'),/inUse/); assert.throws(()=>removeRecord(original,'suppliers','s'),/inUse/);
  assert.throws(()=>upsert(original,'materials',{...original.materials[0],id:'m2'}),/duplicateSerial/);
  assert.throws(()=>upsert(original,'categories',{id:'c2',name:'کمپیوټر'}),/duplicateName/);
  assert.equal(removeRecord(original,'materials','m').materials.length,0);
});
test('stock classifications are disjoint at boundaries', () => {
  assert.equal(stockStatus({quantity:0,reorderLevel:2}),'out');
  assert.equal(stockStatus({quantity:2,reorderLevel:2}),'low');
  assert.equal(stockStatus({quantity:3,reorderLevel:2}),'good');
});
test('save snapshots raw bytes and never touches legacy collections', () => {
  const storage=new MemoryStorage(); const raw=JSON.stringify(fixture(),null,2); storage.setItem(KEY,raw); LEGACY_KEYS.forEach(k=>storage.setItem(k,'["legacy"]'));
  const repo=new Repository(storage); repo.load(); repo.save(emptyState());
  assert.equal(JSON.parse(storage.getItem(RECOVERY_KEY)).raw,raw);
  LEGACY_KEYS.forEach(k=>assert.equal(storage.getItem(k),'["legacy"]'));
  assert.equal(JSON.parse(storage.getItem(KEY)).categories.length,0);
});
test('snapshot failure or main-write failure cannot change the primary dataset', () => {
  for (const failOn of [RECOVERY_KEY,KEY]) {
    const storage=new MemoryStorage(); const raw=JSON.stringify(fixture()); storage.setItem(KEY,raw);
    const repo=new Repository(storage); repo.load(); storage.failOn=failOn;
    assert.throws(()=>repo.save(emptyState()),/storageFailed/); assert.equal(storage.getItem(KEY),raw); assert.equal(repo.raw,raw);
  }
});
test('corruption is preserved and requires an explicit validated restore', () => {
  const storage=new MemoryStorage(); storage.setItem(KEY,'{broken'); const repo=new Repository(storage);
  assert.ok(repo.load().error); assert.throws(()=>repo.save(emptyState()),/storageUnreadable/);
  assert.equal(repo.archive().records[KEY],'{broken'); repo.save(fixture(),{recovery:true});
  assert.equal(JSON.parse(storage.getItem(RECOVERY_KEY)).raw,'{broken'); assert.equal(repo.blocked,false);
});
test('stale writers cannot overwrite newer records or their snapshot', () => {
  const storage=new MemoryStorage(); const a=new Repository(storage), b=new Repository(storage); a.load(); b.load(); a.save(fixture());
  assert.throws(()=>b.save(emptyState()),/staleData/); assert.equal(JSON.parse(storage.getItem(KEY)).materials.length,1);
});
test('both language dictionaries have complete, nonempty entries', () => {
  for (const [key,pair] of Object.entries(messages)) {
    assert.equal(pair.length,2);
    assert.ok(pair.every(x=>typeof x==='string'&&x.length));
    const placeholders = value => [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
    assert.deepEqual(placeholders(pair[0]), placeholders(pair[1]), `${key} placeholders differ by language`);
    setLanguage('ps');
    assert.equal(t(key),pair[1].replace(/\{\w+\}/g,''));
  }
  setLanguage('en');
});
test('legacy seed and write entry points cannot overwrite records', () => {
  assert.equal(legacyDB.seed(),false);
  assert.throws(()=>legacyDB.saveProducts([]),/read-only/);
  assert.throws(()=>legacyDB.clear(),/read-only/);
});
test('UUID fallback retains v4 format and uses the supplied random bytes', () => {
  const source = { getRandomValues: bytes => { bytes.fill(255); return bytes; } };
  assert.equal(createId(source),'ffffffff-ffff-4fff-bfff-ffffffffffff');
  assert.equal(createId({randomUUID:()=> 'native-uuid'}),'native-uuid');
});
test('malformed recovery payloads produce validation errors rather than type errors', () => {
  for (const input of [undefined, null, 123, {}]) assert.throws(()=>parseBackup(input),/invalidBackup/);
});
