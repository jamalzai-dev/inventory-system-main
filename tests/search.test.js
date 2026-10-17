import test from 'node:test';
import assert from 'node:assert/strict';
import { searchRecords } from '../app/search.js';

const fixture = () => ({
  materials: [
    { id: 'm1', name: 'Office Laptop', serial: 'KDRU-001', categoryId: 'c1', supplierId: 's1', location: 'IT Laboratory', description: 'Staff workstation', responsible: 'Ahmad' },
    { id: 'm2', name: 'د شبکې سویچ', serial: 'NET-07', categoryId: 'c2', supplierId: '', location: 'کندهار', description: 'د شبکې وسایل', responsible: 'شریف' },
    { id: 'm3', name: 'Café terminal', serial: 'CAF-03', categoryId: 'c1', supplierId: '', location: 'Library', description: '', responsible: '' }
  ],
  categories: [{ id: 'c1', name: 'Computers', description: 'Teaching equipment' }, { id: 'c2', name: 'شبکه', description: 'Network devices' }],
  suppliers: [{ id: 's1', name: 'Kabul Technology', description: 'Equipment support', contact: 'Farid', phone: '+93 700 123456', email: 'sales@example.test', address: 'University Road' }],
  authentication: { username: 'private-admin', password: 'super-secret-password' },
  settings: { lang: 'en', dark: false }
});
const ids = rows => rows.map(row => `${row.collection}:${row.id}`);

test('global search matches material fields and linked category/supplier names', () => {
  const data = fixture();
  for (const query of ['OFFICE', 'kdru-001', 'IT Laboratory', 'workstation', 'ahmad', 'laptop computers', 'laptop kabul']) {
    assert.deepEqual(ids(searchRecords(data, query)), ['materials:m1'], query);
  }
  assert.deepEqual(ids(searchRecords(data, 'Computers')), ['materials:m1', 'materials:m3', 'categories:c1']);
  assert.deepEqual(ids(searchRecords(data, 'Kabul')), ['materials:m1', 'suppliers:s1']);
});

test('Unicode normalization supports Pashto and canonically equivalent English text', () => {
  const data = fixture();
  assert.deepEqual(ids(searchRecords(data, 'د شبکې')), ['materials:m2']);
  assert.deepEqual(ids(searchRecords(data, 'شریف')), ['materials:m2']);
  assert.deepEqual(ids(searchRecords(data, 'کندهار')), ['materials:m2']);
  assert.deepEqual(ids(searchRecords(data, '  CAFE\u0301\tTERMINAL  ')), ['materials:m3']);
  assert.deepEqual(ids(searchRecords(data, 'ＫＤＲＵ-００１')), ['materials:m1']);
});

test('distinct category and supplier results include only permitted contact fields', () => {
  const data = fixture();
  assert.deepEqual(ids(searchRecords(data, 'teaching')), ['categories:c1']);
  for (const query of ['farid', '700 123456', 'sales@example.test', 'university road', 'support']) {
    assert.deepEqual(ids(searchRecords(data, query)), ['suppliers:s1'], query);
  }
  assert.deepEqual(Object.keys(searchRecords(data, 'laptop')[0]).sort(), ['collection', 'detail', 'id', 'name']);
  assert.equal(searchRecords(data, 'laptop')[0].detail, 'KDRU-001 · Computers · IT Laboratory');
});

test('authentication data, record IDs, and arbitrary fields are never searchable', () => {
  const data = fixture();
  data.materials[0].password = 'hidden-password';
  data.categories[0].secret = 'hidden-category';
  data.suppliers[0].sessionToken = 'hidden-session';
  for (const query of ['private-admin', 'super-secret-password', 'hidden-password', 'hidden-category', 'hidden-session', 'm1']) {
    assert.deepEqual(searchRecords(data, query), [], query);
  }
});

test('empty input, no matches, result caps, and duplicates produce predictable results', () => {
  const data = fixture();
  assert.deepEqual(searchRecords(data, '  \n\t '), []);
  assert.deepEqual(searchRecords(data, 'not found'), []);
  assert.deepEqual(searchRecords(data, 'computers', 0), []);
  assert.deepEqual(ids(searchRecords(data, 'computers', 2)), ['materials:m1', 'categories:c1']);
  data.materials.push({ ...data.materials[0] });
  assert.deepEqual(ids(searchRecords(data, 'laptop')), ['materials:m1']);
  data.materials = Array.from({ length: 45 }, (_, index) => ({ ...data.materials[0], id: `m${index}` }));
  assert.equal(searchRecords(data, 'laptop').length, 30);
});

test('search is pure and reflects edits, deletion, and renamed references immediately', () => {
  const data = fixture();
  const original = JSON.stringify(data);
  searchRecords(data, 'laptop');
  assert.equal(JSON.stringify(data), original);
  data.materials[0].name = 'New workstation';
  assert.deepEqual(searchRecords(data, 'laptop'), []);
  data.categories[0].name = 'Endpoints';
  assert.deepEqual(searchRecords(data, 'computers'), []);
  assert.deepEqual(ids(searchRecords(data, 'endpoints')), ['materials:m1', 'materials:m3', 'categories:c1']);
  data.materials = data.materials.filter(row => row.id !== 'm1');
  assert.deepEqual(searchRecords(data, 'new workstation'), []);
});

test('user-provided markup remains plain result text without interpretation', () => {
  const data = fixture();
  data.materials[0].name = '<img src=x onerror=alert(1)>';
  assert.equal(searchRecords(data, '<img')[0].name, '<img src=x onerror=alert(1)>');
});

test('large matching material groups do not hide distinct categories and suppliers', () => {
  const data = fixture();
  data.categories[0].name = 'Shared name';
  data.suppliers[0].name = 'Shared name';
  data.materials = Array.from({length: 80}, (_, index) => ({...data.materials[0], id: `m${index}`}));
  const rows = searchRecords(data, 'Shared name');
  assert.equal(rows.length, 30);
  assert.deepEqual(rows.slice(-2).map(row => row.collection), ['categories', 'suppliers']);
  assert.equal(searchRecords(data, 'Shared name', 1).length, 1);
});
