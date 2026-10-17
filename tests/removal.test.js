import test from 'node:test';
import assert from 'node:assert/strict';
import { deductStock, emptyState, Repository, KEY, RECOVERY_KEY } from '../app/data.js';
const fixture = () => ({ ...emptyState(), categories:[{id:'c',name:'IT'}], materials:[
  {id:'a',name:'Laptop',categoryId:'c',quantity:10,reorderLevel:2,price:100,location:'Lab',condition:'Good'},
  {id:'b',name:'Cable',categoryId:'c',quantity:4,reorderLevel:1,price:10,location:'Store',condition:'Good'}
] });
test('single and multiple deductions are immutable and preserve records at zero',()=>{
  const original=fixture();const next=deductStock(original,[{id:'a',quantity:3},{id:'b',quantity:4}]);
  assert.deepEqual(original.materials.map(m=>m.quantity),[10,4]);assert.deepEqual(next.materials.map(m=>m.quantity),[7,0]);assert.equal(next.materials.length,2);
  assert.ok(next.materials.every(m=>m.updatedAt));assert.equal(deductStock(original,[{id:'a',quantity:1}]).materials[0].quantity,9);
});
test('repeated material entries combine safely and cannot exceed stock',()=>{
  assert.equal(deductStock(fixture(),[{id:'a',quantity:4},{id:'a',quantity:6}]).materials[0].quantity,0);
  assert.throws(()=>deductStock(fixture(),[{id:'a',quantity:6},{id:'a',quantity:5}]),/removalExcess/);
});
test('empty, zero, negative, fractional, nonnumeric and excessive removals are rejected',()=>{
  assert.throws(()=>deductStock(fixture(),[]),/removalEmpty/);
  for(const quantity of ['', '2', 'abc', undefined, null, 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER+1])assert.throws(()=>deductStock(fixture(),[{id:'a',quantity}]),/removalQuantity/);
  assert.throws(()=>deductStock(fixture(),[{id:'a',quantity:11}]),/removalExcess/);
  assert.throws(()=>deductStock(fixture(),[{id:'missing',quantity:1}]),/removalMissing/);
});
test('one invalid entry prevents every deduction',()=>{
  const original=fixture();const before=JSON.stringify(original);
  assert.throws(()=>deductStock(original,[{id:'a',quantity:2},{id:'b',quantity:5}]));assert.equal(JSON.stringify(original),before);
});
test('a batch persists in one state write, survives reload, and snapshots previous stock',()=>{
  const values=new Map([[KEY,JSON.stringify(fixture())]]);let primaryWrites=0;
  const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>{values.set(k,v);if(k===KEY)primaryWrites++;}};
  const repo=new Repository(storage);const {data}=repo.load();repo.save(deductStock(data,[{id:'a',quantity:3},{id:'b',quantity:4}]));
  assert.equal(primaryWrites,1);assert.deepEqual(new Repository(storage).load().data.materials.map(m=>m.quantity),[7,0]);assert.deepEqual(JSON.parse(JSON.parse(values.get(RECOVERY_KEY)).raw).materials.map(m=>m.quantity),[10,4]);
});
test('stale and failed writes leave the complete original batch unchanged',()=>{
  const original=JSON.stringify(fixture());const values=new Map([[KEY,original]]);
  const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>{if(k===KEY)throw Error('quota');values.set(k,v);}};
  const repo=new Repository(storage);const {data}=repo.load();assert.throws(()=>repo.save(deductStock(data,[{id:'a',quantity:3},{id:'b',quantity:4}])),/storageFailed/);assert.equal(values.get(KEY),original);
  values.set(KEY,JSON.stringify(emptyState()));assert.throws(()=>repo.save(deductStock(data,[{id:'a',quantity:1}])),/staleData/);
});
