// Storage-independent rules. Keep this boundary when introducing a server API.
export const KEY = 'university_it_inventory_v2';
export const RECOVERY_KEY = `${KEY}_recovery`;
export const LEGACY_KEYS = ['ims_categories', 'ims_suppliers', 'ims_products', 'ims_orders', 'ims_adjustments', 'ims_log'];
export const emptyState = () => ({ materials: [], categories: [], suppliers: [], settings: { lang: 'en', dark: false } });
export const stockStatus = m => m.quantity === 0 ? 'out' : m.quantity <= m.reorderLevel ? 'low' : 'good';
export const clone = value => JSON.parse(JSON.stringify(value));
export function createId(source = globalThis.crypto) {
  if (typeof source.randomUUID === 'function') return source.randomUUID();
  // getRandomValues remains available on HTTP origins; preserve UUID v4 format.
  const bytes = source.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export class InventoryError extends Error {
  constructor(code, detail = '') { super(code); this.code = code; this.detail = detail; }
}
const fail = (code, detail) => { throw new InventoryError(code, detail); };
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const string = (x, required = false) => typeof x === 'string' && (!required || x.trim().length > 0);
export function validate(data) {
  if (!object(data)) fail('invalidBackup');
  const ids = {};
  for (const collection of ['materials', 'categories', 'suppliers']) {
    if (!Array.isArray(data[collection])) fail('invalidBackup', collection);
    ids[collection] = new Set();
    for (const row of data[collection]) {
      if (!object(row) || !string(row.id, true) || !string(row.name, true)) fail('invalidBackup', collection);
      if (ids[collection].has(row.id)) fail('duplicateId', collection);
      ids[collection].add(row.id);
      for (const field of ['description', 'contact', 'phone', 'email', 'address', 'serial', 'responsible', 'createdAt', 'updatedAt', 'purchaseDate']) {
        if (row[field] !== undefined && !string(row[field])) fail('invalidBackup', `${collection}.${field}`);
      }
    }
  }
  for (const m of data.materials) {
    for (const field of ['quantity', 'reorderLevel', 'price']) {
      if (typeof m[field] !== 'number' || !Number.isFinite(m[field]) || m[field] < 0 || m[field] > Number.MAX_SAFE_INTEGER) fail('invalidNumber', field);
    }
    if (!Number.isSafeInteger(m.quantity) || !Number.isSafeInteger(m.reorderLevel)) fail('wholeNumber');
    if (!string(m.location, true) || !['Good', 'Needs Repair', 'Damaged'].includes(m.condition)) fail('invalidBackup', 'location / condition');
    if (!ids.categories.has(m.categoryId) || (m.supplierId && !ids.suppliers.has(m.supplierId))) fail('invalidReference');
    if (m.supplierId !== undefined && !string(m.supplierId)) fail('invalidReference');
    if (m.purchaseDate && (!/^\d{4}-\d{2}-\d{2}$/.test(m.purchaseDate) || !Number.isFinite(Date.parse(m.purchaseDate)) || new Date(m.purchaseDate).toISOString().slice(0,10) !== m.purchaseDate)) fail('invalidDate');
  }
  if (data.settings !== undefined && (!object(data.settings) || !['en', 'ps'].includes(data.settings.lang) || typeof data.settings.dark !== 'boolean')) fail('invalidBackup', 'settings');
  return data;
}
export function parseBackup(text) {
  if (typeof text !== 'string') fail('invalidBackup');
  if (text.length > 10 * 1024 * 1024) fail('fileTooLarge');
  let parsed;
  try { parsed = JSON.parse(text); } catch { fail('invalidBackup'); }
  if (object(parsed) && 'data' in parsed) {
    if (parsed.app !== 'University IT Material Management' || parsed.version !== 2) fail('invalidBackup');
    parsed = parsed.data;
  }
  validate(parsed);
  return clone(parsed);
}
export function backupPayload(data) {
  validate(data);
  return { app: 'University IT Material Management', version: 2, exportedAt: new Date().toISOString(), data: clone(data) };
}
export function upsert(data, collection, record) {
  const next = clone(data);
  const index = next[collection].findIndex(x => x.id === record.id);
  if (collection !== 'materials' && next[collection].some(x => x.id !== record.id && x.name.trim().toLocaleLowerCase() === record.name.trim().toLocaleLowerCase())) fail('duplicateName');
  if (collection === 'materials' && record.serial?.trim() && next.materials.some(x => x.id !== record.id && x.serial?.trim().toLocaleLowerCase() === record.serial.trim().toLocaleLowerCase())) fail('duplicateSerial');
  if (index < 0) next[collection].push(record);
  else next[collection][index] = { ...next[collection][index], ...record };
  return validate(next);
}
export function removeRecord(data, collection, id) {
  if (collection !== 'materials' && data.materials.some(x => x[collection === 'categories' ? 'categoryId' : 'supplierId'] === id)) fail('inUse');
  const next = clone(data);
  next[collection] = next[collection].filter(x => x.id !== id);
  return validate(next);
}
// Validate the entire batch before changing a clone; repeated IDs are combined.
export function deductStock(data, entries) {
  if (!Array.isArray(entries) || !entries.length) fail('removalEmpty');
  const totals = new Map();
  for (const entry of entries) {
    if (!entry || !Number.isSafeInteger(entry.quantity) || entry.quantity <= 0) fail('removalQuantity');
    if (!data.materials.some(material => material.id === entry.id)) fail('removalMissing');
    const total = (totals.get(entry.id) || 0) + entry.quantity;
    if (!Number.isSafeInteger(total) || total > data.materials.find(material => material.id === entry.id).quantity) fail('removalExcess');
    totals.set(entry.id, total);
  }
  const next = clone(data);
  const updatedAt = new Date().toISOString();
  for (const material of next.materials) {
    if (totals.has(material.id)) {
      material.quantity -= totals.get(material.id);
      material.updatedAt = updatedAt;
    }
  }
  return validate(next);
}
export class Repository {
  constructor(storage) { this.storage = storage; this.raw = null; this.blocked = false; }
  load() {
    try {
      this.raw = this.storage.getItem(KEY);
      const data = this.raw === null ? emptyState() : validate(JSON.parse(this.raw));
      this.blocked = false;
      return { data: clone(data), error: null };
    } catch (error) {
      this.blocked = true;
      return { data: emptyState(), error: error instanceof InventoryError ? error : new InventoryError('storageUnreadable') };
    }
  }
  save(data, { recovery = false } = {}) {
    validate(data);
    if (this.blocked && !recovery) fail('storageUnreadable');
    let raw;
    try { raw = this.storage.getItem(KEY); } catch { fail('storageFailed'); }
    if (raw !== this.raw) fail('staleData');
    const serialized = JSON.stringify(data);
    try {
      // Recovery must succeed before the primary dataset can be replaced.
      if (raw !== null) this.storage.setItem(RECOVERY_KEY, JSON.stringify({ savedAt: new Date().toISOString(), raw }));
      this.storage.setItem(KEY, serialized);
    } catch { fail('storageFailed'); }
    this.raw = serialized;
    this.blocked = false;
    return clone(data);
  }
  archive() {
    const records = {};
    try {
      for (const key of [KEY, RECOVERY_KEY, ...LEGACY_KEYS]) records[key] = this.storage.getItem(key);
    } catch { fail('storageFailed'); }
    return { format: 'university-it-raw-archive', version: 1, exportedAt: new Date().toISOString(), records };
  }
}
