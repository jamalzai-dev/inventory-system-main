export class InventoryApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const invalid = message => { throw new InventoryApiError(422, message); };
export const validUuid = value => typeof value === 'string' && value.length === 36 &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function recordId(value) {
  if (!validUuid(value)) throw new InventoryApiError(400, 'Invalid record ID.');
  return value.toLowerCase();
}
export function expectedVersion(header) {
  if (typeof header !== 'string' || header.length !== 34 || !/^"[a-f0-9]{32}"$/.test(header)) {
    throw new InventoryApiError(400, 'Send the current record version in a quoted If-Match header.');
  }
  return header.slice(1, -1);
}
export function requestKey(header) {
  if (!validUuid(header)) throw new InventoryApiError(400, 'A UUID Idempotency-Key header is required for creation.');
  return header.toLowerCase();
}
export function text(value, field, required = false) {
  if (value === null && !required) return null;
  if (typeof value !== 'string' || value.includes('\0') || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) {
    invalid(`${field} must be ${required ? 'a string' : 'a string or null'}.`);
  }
  const normalized = value.trim();
  if (required && !normalized) invalid(`${field} must not be empty.`);
  return normalized;
}
export function decimal(value, field, scale, nullable = true) {
  if (value === null && nullable) return null;
  // At most nine integral digits; compare/validate as text, never floating point.
  const pattern = new RegExp(`^(0|[1-9][0-9]{0,8})(\\.[0-9]{1,${scale}})?$`);
  if (typeof value !== 'string' || value.length > 10 + scale || !pattern.test(value) || /\s/.test(value)) {
    invalid(`${field} must be an unsigned decimal string from 0 to 999999999.${'9'.repeat(scale)}, with at most ${scale} fractional places.`);
  }
  return value;
}
function date(value) {
  if (value === null) return null;
  if (typeof value !== 'string' || value.length !== 10 || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value) || value.startsWith('0000')) invalid('purchaseDate must be a valid YYYY-MM-DD date or null.');
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) invalid('purchaseDate must be a valid YYYY-MM-DD date or null.');
  return value;
}
const fields = {
  categories: ['name', 'description'],
  suppliers: ['name', 'contact', 'phone', 'email', 'address', 'description'],
  materials: ['name', 'categoryId', 'supplierId', 'unit', 'serial', 'location', 'condition', 'price', 'purchaseDate', 'responsible', 'reorderLevel', 'description']
};
export function validateWrite(resource, body, creating) {
  if (!Object.hasOwn(fields, resource)) throw new TypeError('Unsupported inventory resource.');
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalid('A JSON object is required.');
  const allowed = fields[resource];
  const result = {};
  for (const key of Object.keys(body)) {
    if (key === 'quantity' && resource === 'materials' && creating) {
      const quantity = decimal(body[key], 'quantity', 3, false);
      if (!/^0(?:\.0{1,3})?$/.test(quantity)) invalid('Initial stock must be zero. Use a stock operation after creating the material.');
      result.quantity = quantity;
      continue;
    }
    if (!allowed.includes(key)) invalid(key === 'quantity' ? 'Stock cannot be changed through material editing.' : 'Unknown or protected fields are not allowed.');
    const value = body[key];
    if (key === 'categoryId' || key === 'supplierId') {
      if (value === null && key === 'supplierId') result[key] = null;
      else { if (!validUuid(value)) invalid(`${key} must be a valid UUID${key === 'supplierId' ? ' or null' : ''}.`); result[key] = value.toLowerCase(); }
    } else if (key === 'price' || key === 'reorderLevel') result[key] = decimal(value, key, key === 'price' ? 2 : 3);
    else if (key === 'purchaseDate') result[key] = date(value);
    else {
      result[key] = text(value, key, key === 'name');
      if (key === 'email' && result[key] !== null && result[key] !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(result[key])) invalid('email must be a valid email address, an empty string or null.');
    }
  }
  if (creating) {
    if (!Object.hasOwn(result, 'name')) invalid('name is required.');
    if (resource === 'materials' && !Object.hasOwn(result, 'categoryId')) invalid('categoryId is required.');
  } else if (!Object.keys(result).length) invalid('Supply at least one editable field.');
  return result;
}
