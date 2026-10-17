import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, upsert, removeRecord, deductStock } from '../app/data.js';
import { summarizeInventory, filterMaterials } from '../app/dashboard.js';

function fixture() {
  const material = (id, overrides = {}) => ({
    id, name: `Material ${id}`, categoryId: 'computers', supplierId: '', quantity: 4,
    reorderLevel: 2, price: 100, location: 'IT office', condition: 'Good', ...overrides
  });
  return {
    ...emptyState(),
    categories: [
      { id: 'computers', name: 'Computers' }, { id: 'network', name: 'Networking' },
      { id: 'empty', name: 'Unused category with a very long name' }
    ],
    suppliers: [{ id: 'supplier', name: 'Kabul Equipment' }],
    materials: [
      material('a', { name: 'Alpha laptop', quantity: 8, serial: 'SER-123', supplierId: 'supplier', createdAt: '2026-01-03T00:00:00Z' }),
      material('b', { name: 'Beta cable', quantity: 2, categoryId: 'network', unit: 'metres', description: 'Conference room connection', createdAt: '2026-01-02T00:00:00Z' }),
      material('c', { name: 'لپټاپ', quantity: 0, reorderLevel: 0, responsible: 'احمد', createdAt: '2026-01-01T00:00:00Z' }),
      material('d', { name: 'Delta monitor', quantity: 1, reorderLevel: 0, createdAt: '2026-01-02T00:00:00Z' })
    ]
  };
}

test('dashboard counts are record counts with exclusive stock groups and zero-count categories', () => {
  const state = fixture();
  const original = structuredClone(state);
  const summary = summarizeInventory(state);
  assert.deepEqual(summary, {
    total: 4, good: 2, low: 1, out: 1,
    categories: [
      { id: 'computers', name: 'Computers', count: 3 },
      { id: 'network', name: 'Networking', count: 1 },
      { id: 'empty', name: 'Unused category with a very long name', count: 0 }
    ]
  });
  assert.equal(summary.good + summary.low + summary.out, summary.total);
  assert.equal(summary.categories.reduce((sum, item) => sum + item.count, 0), summary.total);
  assert.deepEqual(state, original);
});

test('dashboard values stay consistent with filters after stock removal and material CRUD', () => {
  const initial = fixture();
  const reduced = deductStock(initial, [{ id: 'a', quantity: 6 }, { id: 'b', quantity: 2 }]);
  const added = upsert(reduced, 'materials', { ...reduced.materials[0], id: 'e', name: 'Extra laptop', serial: 'NEW-1', categoryId: 'empty' });
  const edited = upsert(added, 'materials', { ...added.materials[2], categoryId: 'network', quantity: 10 });
  const deleted = removeRecord(edited, 'materials', 'd');
  for (const state of [initial, reduced, added, edited, deleted]) {
    const summary = summarizeInventory(state);
    assert.equal(summary.total, filterMaterials(state).length);
    for (const status of ['good', 'low', 'out']) assert.equal(summary[status], filterMaterials(state, { status }).length);
    for (const category of summary.categories) assert.equal(category.count, filterMaterials(state, { category: category.id }).length);
  }
  assert.deepEqual([summarizeInventory(reduced).good, summarizeInventory(reduced).low, summarizeInventory(reduced).out], [1, 1, 2]);
});

test('empty inventory remains zero and retains existing empty categories', () => {
  assert.deepEqual(summarizeInventory(emptyState()), { total: 0, good: 0, low: 0, out: 0, categories: [] });
  const state = fixture(); state.materials = [];
  const summary = summarizeInventory(state);
  assert.equal(summary.total, 0);
  assert.deepEqual(summary.categories.map(category => category.count), [0, 0, 0]);
  assert.deepEqual(filterMaterials(state), []);
});

test('material search covers useful fields and related names without indexing internal IDs', () => {
  const state = fixture();
  const ids = query => filterMaterials(state, { query }).map(material => material.id);
  assert.deepEqual(ids('  ALPHA  '), ['a']);
  assert.deepEqual(ids('ser-123'), ['a']);
  assert.deepEqual(ids('KABUL equipment'), ['a']);
  assert.deepEqual(ids('Networking'), ['b']);
  assert.deepEqual(ids('conference'), ['b']);
  assert.deepEqual(ids('metres'), ['b']);
  assert.deepEqual(ids('احمد'), ['c']);
  assert.deepEqual(ids('لپټاپ'), ['c']);
  assert.deepEqual(ids('IT OFFICE'), ['a', 'b', 'd', 'c']);
  assert.deepEqual(ids('supplier'), []);
  assert.deepEqual(ids('not present'), []);
  assert.deepEqual(ids('ＳＥＲ-１２３'), ['a']);
});

test('category and stock filters compose with search without changing the source array', () => {
  const state = fixture();
  const original = structuredClone(state);
  assert.deepEqual(filterMaterials(state, { query: 'IT office', category: 'computers', status: 'good' }).map(material => material.id), ['a', 'd']);
  assert.deepEqual(filterMaterials(state, { category: 'network', status: 'good' }), []);
  assert.deepEqual(filterMaterials(state, { category: 'empty' }), []);
  assert.deepEqual(filterMaterials(state, { status: 'out' }).map(material => material.id), ['c']);
  assert.deepEqual(state, original);
});

test('sorting uses actual fields, deterministic ties, and a recent default independent of input order', () => {
  const state = fixture();
  state.materials = [state.materials[3], state.materials[2], state.materials[1], state.materials[0]];
  const ids = sort => filterMaterials(state, { sort }).map(material => material.id);
  assert.deepEqual(ids('recent'), ['a', 'b', 'd', 'c']);
  assert.deepEqual(ids('category'), ['a', 'c', 'd', 'b']);
  assert.deepEqual(ids('quantity'), ['c', 'd', 'b', 'a']);
  assert.deepEqual(ids('status'), ['a', 'd', 'b', 'c']);
  assert.deepEqual(ids('unknown'), ids('recent'));
  const same = { ...state.materials[0], name: 'same', createdAt: '2026-03-01T00:00:00Z' };
  state.materials = [{ ...same, id: 'z' }, { ...same, id: 'x' }, { ...same, id: 'y' }];
  for (const sort of ['recent', 'name', 'category', 'quantity', 'status']) assert.deepEqual(ids(sort), ['x', 'y', 'z']);
});

test('recent sorting compares dates as instants and places absent timestamps after dated records', () => {
  const state = fixture();
  state.materials = [
    { ...state.materials[0], id: 'old', createdAt: '2026-01-03T02:00:00+04:30' },
    { ...state.materials[0], id: 'new', createdAt: '2026-01-03T00:00:00Z' },
    { ...state.materials[0], id: 'missing', name: 'Missing date', createdAt: '' },
    { ...state.materials[0], id: 'invalid', name: 'Invalid date', createdAt: 'not a date' }
  ];
  assert.deepEqual(filterMaterials(state).map(material => material.id), ['new', 'old', 'invalid', 'missing']);
});
