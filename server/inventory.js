// Server-only read repository. SQL identifiers/order are fixed, never user input.
const categoryColumns = 'id, name, description, created_at, updated_at';
const supplierColumns = 'id, name, contact, phone, email, address, description, created_at, updated_at';
const materialColumns = `id, name, category_id, current_stock::text AS current_stock,
  supplier_id, unit, serial_number, location, condition, price::text AS price,
  to_char(purchase_date, 'YYYY-MM-DD') AS purchase_date, responsible_person,
  reorder_level::text AS reorder_level, description, created_at, updated_at`;

function common(row) {
  return { id: row.id, name: row.name, description: row.description,
    createdAt: row.created_at, updatedAt: row.updated_at };
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
export const validMaterialId = id => typeof id === 'string' && id.length === 36 &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

export function createInventoryRepository(pool) {
  return {
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
