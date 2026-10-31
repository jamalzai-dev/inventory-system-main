import { InventoryApiError, recordId } from './inventory-validation.js';
import { transaction } from './transaction.js';

export function createArchiveRepository(pool, spec) {
  return { async archiveMaterial(id, body, version) {
    id = recordId(id);
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || typeof body.archived !== 'boolean') throw new InventoryApiError(422, 'Supply only an archived boolean.');
    return transaction(pool, async client => {
      const row = (await client.query(`SELECT ${spec.columns} FROM public.materials WHERE id=$1::uuid FOR UPDATE`, [id])).rows[0];
      if (!row) throw new InventoryApiError(404, 'Record not found.');
      if (!row.archive_supported) throw new InventoryApiError(409, 'Material archiving requires the reviewed database migration.');
      if (row.version !== version) throw new InventoryApiError(409, 'This record has changed. Reload it before trying again.');
      if (body.archived && !/^0(?:\.0+)?$/.test(row.current_stock)) throw new InventoryApiError(409, 'Only zero-stock materials can be archived.');
      const updated = (await client.query(`UPDATE public.materials SET archived=$1 WHERE id=$2::uuid RETURNING ${spec.columns}`, [body.archived, id])).rows[0];
      return spec.map(updated);
    });
  } };
}
