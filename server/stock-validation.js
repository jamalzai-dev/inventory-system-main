import { InventoryApiError, decimal, recordId, text, validUuid } from './inventory-validation.js';

export const maxStockUnits = 999999999999n;
const invalid = message => { throw new InventoryApiError(422, message); };

// Internal exact conversion, including valid database NUMERIC values with trailing
// fractional zeros beyond scale 3. Never silently discard a nonzero decimal digit.
export function stockUnits(value) {
  if (typeof value !== 'string' || !/^-?(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(value) || /\s/.test(value)) throw new TypeError('Invalid stored stock decimal.');
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.');
  if (/[1-9]/.test(fraction.slice(3))) throw new TypeError('Invalid stored stock precision.');
  const units = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0').slice(0, 3));
  return negative ? -units : units;
}
export function stockDecimal(units) {
  const sign = units < 0n ? '-' : '';
  const absolute = units < 0n ? -units : units;
  const fraction = (absolute % 1000n).toString().padStart(3, '0').replace(/0+$/, '');
  return `${sign}${absolute / 1000n}${fraction ? '.' + fraction : ''}`;
}
function objectWithFields(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('A JSON object is required.');
  if (Object.keys(value).some(key => !fields.includes(key))) invalid('Unknown or protected stock fields are not allowed.');
}
export function validateStockOperation(body) {
  objectWithFields(body, ['operationId', 'type', 'reason', 'items']);
  const operationId = recordId(body.operationId);
  if (!['add', 'remove'].includes(body.type)) invalid('type must be add or remove.');
  const reason = Object.hasOwn(body, 'reason') ? text(body.reason, 'reason') : null;
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 25) invalid('items must contain between 1 and 25 selections.');
  const totals = new Map();
  for (const item of body.items) {
    objectWithFields(item, ['materialId', 'quantity']);
    const materialId = recordId(item.materialId);
    const units = stockUnits(decimal(item.quantity, 'quantity', 3, false));
    if (units === 0n) invalid('Stock movement quantities must be greater than zero.');
    const total = (totals.get(materialId) ?? 0n) + units;
    if (total > maxStockUnits) invalid('Combined quantity for a material exceeds 999999999.999.');
    totals.set(materialId, total);
  }
  return { operationId, type: body.type, reason,
    items: [...totals].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([materialId, units]) => ({ materialId, quantity: stockDecimal(units) })) };
}

export function validateMovementPage(query) {
  const bad = () => { throw new InventoryApiError(400, 'Invalid movement pagination parameters.'); };
  if (Object.keys(query).some(key => !['limit', 'before'].includes(key))) bad();
  let limit = 50, before = null;
  if (Object.hasOwn(query, 'limit')) {
    if (typeof query.limit !== 'string' || !/^[1-9][0-9]{0,2}$/.test(query.limit) || query.limit.length > 3 || /\s/.test(query.limit)) bad();
    limit = Number(query.limit); // Pagination only; never used for stock arithmetic.
    if (limit > 100) bad();
  }
  if (Object.hasOwn(query, 'before')) {
    const value = query.before;
    if (typeof value !== 'string' || !value.length || value.length > 160 || !/^[a-zA-Z0-9_-]+$/.test(value)) bad();
    try {
      if (Buffer.from(value, 'base64url').toString('base64url') !== value) bad();
      const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
      if (!Array.isArray(parsed) || parsed.length !== 2 || typeof parsed[0] !== 'string' || parsed[0].length !== 27 ||
        !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z$/.test(parsed[0]) || parsed[0].startsWith('0000') || !validUuid(parsed[1])) bad();
      const milliseconds = parsed[0].slice(0, 23) + 'Z';
      if (new Date(milliseconds).toISOString() !== milliseconds) bad();
      before = { timestamp: parsed[0], id: parsed[1].toLowerCase() };
    } catch { bad(); }
  }
  return { limit, before };
}
export function movementCursor(row) {
  return Buffer.from(JSON.stringify([row.cursor_time, row.id])).toString('base64url');
}
