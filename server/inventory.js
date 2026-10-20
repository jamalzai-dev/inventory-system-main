// Server-only repository. SQL identifiers/order are fixed, never user input.
import { createInventoryWrites } from './inventory-writes.js';
import { validUuid } from './inventory-validation.js';
import { createStockRepository } from './stock.js';
// Combine row transaction and exact timestamp, avoiding millisecond truncation
// and transaction-ID-only tokens. Each API transaction updates a row at most once.
const versionColumn = "md5(xmin::text || ':' || extract(epoch FROM updated_at)::text) AS version";
const categoryColumns = `id, name, description, created_at, updated_at, ${versionColumn}`;
const supplierColumns = `id, name, contact, phone, email, address, description, created_at, updated_at, ${versionColumn}`;
const materialColumns = `id, name, category_id, current_stock::text AS current_stock,
  supplier_id, unit, serial_number, location, condition, price::text AS price,
  to_char(purchase_date, 'YYYY-MM-DD') AS purchase_date, responsible_person,
  reorder_level::text AS reorder_level, description, created_at, updated_at, ${versionColumn}`;

function common(row) {
  return { id: row.id, name: row.name, description: row.description,
    createdAt: row.created_at, updatedAt: row.updated_at, version: row.version };
}
function supplier(row) {
  return { ...common(row), contact: row.contact, phone: row.phone, email: row.email, address: row.address };
}
function material(row) {
  return { ...common(row), categoryId: row.category_id, quantity: row.current_stock,
    supplierId: row.supplier_id, unit: row.unit, serial: row.serial_number,
    location: row.location, condition: row.condition, price: row.price,
    purchaseDate: row.purchase_date, responsible: row.responsible_person, reorderLevel: row.reorder_level };
}

// Accept canonical PostgreSQL UUID text (any version), not arbitrary castable input.
export const validMaterialId = validUuid;

const definitions = {
  categories: { table: 'public.categories', columns: categoryColumns, map: common,
    fields: { name: 'name', description: 'description' } },
  suppliers: { table: 'public.suppliers', columns: supplierColumns, map: supplier,
    fields: { name: 'name', contact: 'contact', phone: 'phone', email: 'email', address: 'address', description: 'description' } },
  materials: { table: 'public.materials', columns: materialColumns, map: material,
    fields: { name: 'name', categoryId: 'category_id', supplierId: 'supplier_id', unit: 'unit', serial: 'serial_number',
      location: 'location', condition: 'condition', price: 'price', purchaseDate: 'purchase_date',
      responsible: 'responsible_person', reorderLevel: 'reorder_level', description: 'description' } }
};

export function createInventoryRepository(pool) {
  return {
    ...createInventoryWrites(pool, definitions),
    ...createStockRepository(pool, definitions.materials),
    async listCategories() {
      const { rows } = await pool.query(`SELECT ${categoryColumns} FROM public.categories ORDER BY name, id`, []);
      return rows.map(common);
    },
    async listSuppliers() {
      const { rows } = await pool.query(`SELECT ${supplierColumns} FROM public.suppliers ORDER BY name, id`, []);
      return rows.map(supplier);
    },
    async listMaterials() {
      const { rows } = await pool.query(`SELECT ${materialColumns} FROM public.materials ORDER BY name, id`, []);
      return rows.map(material);
    },
    async findMaterial(id) {
      // Also guard direct callers so invalid IDs never reach PostgreSQL.
      if (!validMaterialId(id)) throw new TypeError('Invalid material ID.');
      const { rows } = await pool.query(`SELECT ${materialColumns} FROM public.materials WHERE id = $1::uuid`, [id]);
      return rows[0] ? material(rows[0]) : null;
    }
  };
}
