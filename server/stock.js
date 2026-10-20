import { InventoryApiError, recordId } from './inventory-validation.js';
import { transaction } from './transaction.js';
import { validateStockOperation, stockUnits, maxStockUnits, validateMovementPage, movementCursor } from './stock-validation.js';

const movementColumns = `sm.id, sm.material_id, sm.operation_id, sm.quantity_delta::text AS quantity_delta,
  sm.reason, sm.created_at, m.name AS material_name`;
const movementFrom = 'FROM public.stock_movements sm JOIN public.materials m ON m.id = sm.material_id';
function movement(row) {
  return { id: row.id, materialId: row.material_id, materialName: row.material_name,
    operationId: row.operation_id, quantityDelta: row.quantity_delta,
    type: row.quantity_delta.startsWith('-') ? 'remove' : 'add', reason: row.reason, createdAt: row.created_at };
}
function balance(row) {
  return { materialId: row.id, quantity: row.current_stock, updatedAt: row.updated_at, version: row.version };
}

export function createStockRepository(pool, materialSpec) {
  return {
    async operateStock(body, adminId) {
      const operation = validateStockOperation(body);
      const { operationId, type, reason, items } = operation;
      const ids = items.map(item => item.materialId);
      const deltas = items.map(item => (type === 'remove' ? '-' : '') + item.quantity);
      return transaction(pool, async client => {
        // This namespace is separate from metadata creation receipt locks.
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', ['stock-operation:' + operationId]);
        const previous = (await client.query(`SELECT ${movementColumns} ${movementFrom}
          WHERE sm.operation_id = $1::uuid ORDER BY sm.material_id`, [operationId])).rows;
        if (previous.length) {
          // Whole-batch comparison, not just uniqueness of (operation, material).
          const equivalent = previous.length === items.length && previous.every((row, index) =>
            row.material_id === ids[index] && stockUnits(row.quantity_delta) === stockUnits(deltas[index]) && row.reason === reason);
          if (!equivalent) throw new InventoryApiError(409, 'This operationId was already used for different stock changes.');
          const current = (await client.query(`SELECT ${materialSpec.columns} FROM public.materials
            WHERE id = ANY($1::uuid[]) ORDER BY id`, [ids])).rows;
          return { operationId, type, reason, replayed: true, movements: previous.map(movement), balances: current.map(balance) };
        }
        // PostgreSQL acquires all material row locks in UUID order, independent of
        // request order. The returned balances are authoritative after any wait.
        const locked = (await client.query(`SELECT ${materialSpec.columns} FROM public.materials
          WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`, [ids])).rows;
        if (locked.length !== items.length) throw new InventoryApiError(404, 'One or more selected materials were not found.');
        for (let index = 0; index < locked.length; index++) {
          const next = stockUnits(locked[index].current_stock) + stockUnits(deltas[index]);
          if (next < 0n) throw new InventoryApiError(409, 'Insufficient stock for one or more selected materials.');
          if (next > maxStockUnits) throw new InventoryApiError(409, 'The resulting stock would exceed 999999999.999.');
        }
        const balances = [];
        for (let index = 0; index < items.length; index++) {
          const updated = (await client.query(`UPDATE public.materials SET current_stock = current_stock + $1::numeric
            WHERE id = $2::uuid RETURNING ${materialSpec.columns}`, [deltas[index], ids[index]])).rows[0];
          balances.push(balance(updated));
          await client.query(`INSERT INTO public.stock_movements (material_id, quantity_delta, reason, admin_id, operation_id)
            VALUES ($1::uuid, $2::numeric, $3, $4, $5::uuid)`, [ids[index], deltas[index], reason, adminId, operationId]);
        }
        const committed = (await client.query(`SELECT ${movementColumns} ${movementFrom}
          WHERE sm.operation_id = $1::uuid ORDER BY sm.material_id`, [operationId])).rows;
        return { operationId, type, reason, replayed: false, movements: committed.map(movement), balances };
      });
    },
    async listMovements(query = {}, materialId = null) {
      const { limit, before } = validateMovementPage(query);
      if (materialId !== null) {
        materialId = recordId(materialId);
        const exists = await pool.query('SELECT id FROM public.materials WHERE id = $1::uuid', [materialId]);
        if (!exists.rows.length) throw new InventoryApiError(404, 'Material not found.');
      }
      const { rows } = await pool.query(`SELECT ${movementColumns},
        to_char(sm.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_time
        ${movementFrom}
        WHERE ($1::uuid IS NULL OR sm.material_id = $1::uuid)
          AND ($2::timestamptz IS NULL OR (sm.created_at, sm.id) < ($2::timestamptz, $3::uuid))
        ORDER BY sm.created_at DESC, sm.id DESC LIMIT $4`, [materialId, before?.timestamp ?? null, before?.id ?? null, limit + 1]);
      const page = rows.slice(0, limit);
      return { data: page.map(movement), page: { limit, nextCursor: rows.length > limit ? movementCursor(page.at(-1)) : null } };
    }
  };
}
