import { createHash } from 'node:crypto';
import { InventoryApiError, validateWrite, recordId, requestKey } from './inventory-validation.js';
import { transaction } from './transaction.js';

export function createInventoryWrites(pool, definitions) {
  function definition(resource) {
    if (!Object.hasOwn(definitions, resource)) throw new TypeError('Unsupported inventory resource.');
    return definitions[resource];
  }
  async function lockedRecord(client, spec, id, version) {
    const { rows } = await client.query(`SELECT ${spec.columns} FROM ${spec.table} WHERE id = $1::uuid FOR UPDATE`, [id]);
    if (!rows[0]) throw new InventoryApiError(404, 'Record not found.');
    if (rows[0].version !== version) throw new InventoryApiError(409, 'This record has changed. Reload it before trying again.');
    return rows[0];
  }
  return {
    async create(resource, body, key) {
      const spec = definition(resource);
      const values = validateWrite(resource, body, true);
      key = requestKey(key);
      // Sort keys so transport object order does not affect retry identity.
      const hash = createHash('sha256').update(JSON.stringify([resource,
        Object.keys(values).sort().map(name => [name, values[name]])])).digest('hex');
      return transaction(pool, async client => {
        // Serialize even before a receipt exists; a hash collision only adds waiting.
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [key]);
        const receipt = (await client.query('SELECT request_hash, resource, record_id FROM public.inventory_create_requests WHERE request_key = $1::uuid', [key])).rows[0];
        if (receipt) {
          if (receipt.request_hash !== hash || receipt.resource !== resource) throw new InventoryApiError(409, 'This Idempotency-Key was already used for a different request.');
          const existing = (await client.query(`SELECT ${spec.columns} FROM ${spec.table} WHERE id = $1::uuid`, [receipt.record_id])).rows[0];
          if (!existing) throw new InventoryApiError(409, 'The previously created record was deleted. This Idempotency-Key cannot be reused.');
          return spec.map(existing);
        }
        // Only fixed, allowlisted columns; stock is always the database default zero.
        const names = Object.keys(values).filter(name => Object.hasOwn(spec.fields, name));
        const { rows } = await client.query(`INSERT INTO ${spec.table} (${names.map(name => spec.fields[name]).join(', ')})
          VALUES (${names.map((_, index) => `$${index + 1}`).join(', ')}) RETURNING ${spec.columns}`, names.map(name => values[name]));
        const response = spec.map(rows[0]);
        await client.query('INSERT INTO public.inventory_create_requests (request_key, request_hash, resource, record_id) VALUES ($1::uuid, $2, $3, $4::uuid)', [key, hash, resource, response.id]);
        return response;
      });
    },
    async update(resource, id, body, version) {
      const spec = definition(resource);
      id = recordId(id);
      const values = validateWrite(resource, body, false);
      return transaction(pool, async client => {
        await lockedRecord(client, spec, id, version);
        const names = Object.keys(values);
        const { rows } = await client.query(`UPDATE ${spec.table} SET ${names.map((name, index) => `${spec.fields[name]} = $${index + 1}`).join(', ')}
          WHERE id = $${names.length + 1}::uuid RETURNING ${spec.columns}`, [...names.map(name => values[name]), id]);
        return spec.map(rows[0]);
      });
    },
    async remove(resource, id, version) {
      const spec = definition(resource);
      id = recordId(id);
      return transaction(pool, async client => {
        const row = await lockedRecord(client, spec, id, version);
        // Exact NUMERIC output: no floating point conversion. Row remains locked
        // until deletion/commit, so concurrent stock updates cannot race this check.
        if (resource === 'materials' && !/^0(?:\.0+)?$/.test(row.current_stock)) {
          throw new InventoryApiError(409, 'Materials with stock cannot be deleted.');
        }
        await client.query(`DELETE FROM ${spec.table} WHERE id = $1::uuid`, [id]);
      });
    }
  };
}
