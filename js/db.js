// Compatibility guard for retired legacy modules. Active data access is app/data.js.
const keys = ['ims_categories', 'ims_suppliers', 'ims_products', 'ims_orders', 'ims_adjustments', 'ims_log'];
const DB = {
  seed() { return false; },
  clear() { throw new Error('Legacy inventory is read-only. Export its archive from index.html.'); },
  _get(key) {
    const raw = localStorage.getItem(key);
    if (raw === null) return [];
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) throw new Error('Invalid legacy collection; original data is preserved.');
    return value;
  },
  _set() { throw new Error('Legacy inventory is read-only. Use index.html.'); }
};
for (const key of keys) {
  const collection = key.slice(4);
  const name = collection[0].toUpperCase() + collection.slice(1);
  DB['get' + name] = () => DB._get(key);
  DB['save' + name] = () => DB._set();
}
export default DB;
