import { units } from './decimal.js';

export class ApiError extends Error {
  constructor(code, status = 0, uncertain = false) { super(code); this.code = code; this.status = status; this.uncertain = uncertain; }
}
const messages = new Map([
  ['This record has changed. Reload it before trying again.', 'recordConflict'],
  ['A category with this name already exists.', 'duplicateRecord'],
  ['A supplier with this name already exists.', 'duplicateRecord'],
  ['A material with this serial number already exists.', 'duplicateRecord'],
  ['This record is in use and cannot be deleted.', 'recordInUse'],
  ['Materials with stock cannot be deleted.', 'stockDeleteBlocked'],
  ['Insufficient stock for one or more selected materials.', 'removalExcess'],
  ['The resulting stock would exceed 999999999.999.', 'stockOverflow'],
  ['This operationId was already used for different stock changes.', 'retryConflict'],
  ['This Idempotency-Key was already used for a different request.', 'retryConflict'],
  ['The previously created record was deleted. This Idempotency-Key cannot be reused.', 'retryConflict'],
]);
const fallback = { 400: 'invalidRequest', 401: 'sessionExpired', 403: 'csrfFailed', 404: 'recordMissing', 409: 'recordConflict', 413: 'requestTooLarge', 422: 'invalidRequest', 429: 'tryLater', 503: 'serviceUnavailable' };
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
export function validateRecord(resource, row) {
  if (!row || !uuid(row.id) || typeof row.name !== 'string' || !/^[a-f0-9]{32}$/.test(row.version)) throw new ApiError('invalidResponse');
  for (const key of ['description', 'contact', 'phone', 'email', 'address', 'location', 'condition', 'serial', 'unit', 'responsible', 'purchaseDate']) {
    if (row[key] != null && typeof row[key] !== 'string') throw new ApiError('invalidResponse');
  }
  if (resource === 'materials') {
    if (!uuid(row.categoryId) || (row.supplierId != null && !uuid(row.supplierId))) throw new ApiError('invalidResponse');
    try {
      units(row.quantity);
      if (row.reorderLevel != null) units(row.reorderLevel);
      if (row.price != null) units(row.price, 2);
    } catch { throw new ApiError('invalidResponse'); }
  }
  return row;
}
export function createApi({ fetcher = globalThis.fetch.bind(globalThis), onUnauthorized = () => {}, onUnavailable = () => {}, timeout = 15000 } = {}) {
  async function request(path, { method = 'GET', body, headers = {}, signal } = {}) {
    if (!path.startsWith('/api/') || path.includes('..') || path.includes('\\')) throw new ApiError('invalidRequest');
    const writing = method !== 'GET';
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const timer = setTimeout(abort, timeout);
    let dispatched = false;
    try {
      if (writing) {
        const token = await request('/api/auth/csrf', { signal: controller.signal });
        if (!/^[a-f0-9]{64}$/.test(token.csrfToken)) throw new ApiError('invalidResponse');
        headers = { ...headers, 'X-CSRF-Token': token.csrfToken };
      }
      dispatched = true;
      const response = await fetcher(path, { method, credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: controller.signal,
        headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      if (response.status === 401) onUnauthorized();
      let payload;
      if (response.status !== 204) {
        try { payload = await response.json(); }
        catch { throw new ApiError('invalidResponse', response.status, writing); }
      } else await response.text();
      if (!response.ok) throw new ApiError(messages.get(payload?.error) || fallback[response.status] || 'serviceUnavailable', response.status, writing && response.status >= 500);
      return payload;
    } catch (error) {
      const failure = error instanceof ApiError ? error : new ApiError(signal?.aborted ? 'requestCancelled' : 'serverUnreachable', 0, writing && dispatched);
      if ((!failure.status || failure.status >= 500) && failure.code !== 'requestCancelled') onUnavailable(failure);
      throw failure;
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }
  return {
    request,
    async list(resource, signal) {
      const result = await request(`/api/${resource}`, { signal });
      if (!Array.isArray(result?.data)) throw new ApiError('invalidResponse');
      const records = result.data.map(row => validateRecord(resource, row));
      if (new Set(records.map(row => row.id)).size !== records.length) throw new ApiError('invalidResponse');
      return records;
    },
    async material(id) { return validateRecord('materials', (await request(`/api/materials/${id}`))?.data); },
    async mutate(job) {
      const result = await request(job.path, job);
      try {
        if (job.method === 'DELETE') return null;
        if (job.path === '/api/stock-operations') {
          const data = result?.data;
          if (!data || data.operationId !== job.body.operationId || data.type !== job.body.type || typeof data.replayed !== 'boolean' || !Array.isArray(data.balances) || !Array.isArray(data.movements) || !data.balances.length) throw Error();
          const expected = new Map();
          for (const item of job.body.items) expected.set(item.materialId, (expected.get(item.materialId) || 0n) + units(item.quantity));
          for (const rows of [data.balances, data.movements]) {
            if (rows.length !== expected.size || new Set(rows.map(row => row.materialId)).size !== expected.size || rows.some(row => !expected.has(row.materialId))) throw Error();
          }
          for (const row of data.balances) { if (!uuid(row.materialId) || !/^[a-f0-9]{32}$/.test(row.version)) throw Error(); units(row.quantity); }
          for (const row of data.movements) {
            if (!uuid(row.id) || row.operationId !== job.body.operationId || row.type !== job.body.type ||
              units(row.quantityDelta, 3, { signed: true }) !== expected.get(row.materialId) * (data.type === 'remove' ? -1n : 1n)) throw Error();
          }
          return data;
        }
        return validateRecord(job.path.split('/')[2], result?.data);
      } catch { throw new ApiError('invalidResponse', 200, true); }
    },
    async movements(id = null, cursor = null) {
      const result = await request(`${id ? `/api/materials/${id}/movements` : '/api/stock-movements'}?limit=50${cursor ? '&before=' + encodeURIComponent(cursor) : ''}`);
      if (!Array.isArray(result?.data) || !result.page || !(result.page.nextCursor === null || typeof result.page.nextCursor === 'string')) throw new ApiError('invalidResponse');
      for (const row of result.data) {
        try {
          if (!uuid(row.id) || !uuid(row.materialId) || !uuid(row.operationId) || !['add', 'remove'].includes(row.type) || typeof row.materialName !== 'string' || (row.reason != null && typeof row.reason !== 'string') || !Number.isFinite(Date.parse(row.createdAt))) throw Error();
          units(row.quantityDelta, 3, { signed: true });
        } catch { throw new ApiError('invalidResponse'); }
      }
      return result;
    }
  };
}
