import { ApiError } from './api.js';
import { createId } from './data.js';

const pendingKey = 'university_it_pending_request_v1';
const empty = () => ({ materials: [], categories: [], suppliers: [] });
// Only an unresolved request is journaled in sessionStorage, never API responses.
// No background/offline queue: every submission/retry requires a user's action.
export class InventoryStore {
  constructor(api, storage) {
    this.api = api; this.storage = storage; this.data = empty();
    this.status = 'loading'; this.ready = false; this.busy = false; this.pending = null;
    this.listeners = new Set(); this.flight = null; this.generation = 0;
    try {
      const saved = storage?.getItem(pendingKey);
      if (saved) {
        const job = JSON.parse(saved);
        if (job.method !== 'POST' || !['/api/categories', '/api/suppliers', '/api/materials', '/api/stock-operations'].includes(job.path) || !job.body || !job.headers) throw Error();
        this.pending = job;
      }
    } catch { this.journalError = true; }
  }
  get blocked() { return this.status !== 'ready' || this.busy || !!this.pending || this.journalError; }
  subscribe(callback) { this.listeners.add(callback); return () => this.listeners.delete(callback); }
  emit() { this.listeners.forEach(callback => callback(this)); }
  clear() { this.generation++; this.data = empty(); this.ready = false; this.status = 'auth'; this.emit(); }
  refresh() {
    if (this.flight) return this.flight;
    if (this.busy || this.status === 'auth') return Promise.resolve(false);
    const generation = this.generation;
    this.flight = (async () => {
      try {
        const [categories, suppliers, materials] = await Promise.all(['categories', 'suppliers', 'materials'].map(resource => this.api.list(resource)));
        if (generation !== this.generation) return false;
        const next = { categories, suppliers, materials };
        if (JSON.stringify(next) !== JSON.stringify(this.data)) this.data = next;
        this.ready = true; this.status = 'ready'; this.error = null;
        return true;
      } catch (error) {
        if (generation !== this.generation) return false;
        this.error = error; this.status = error.status === 401 ? 'auth' : this.ready ? 'stale' : 'error';
        if (this.status === 'auth') { this.data = empty(); this.ready = false; }
        return false;
      } finally { this.flight = null; this.emit(); }
    })();
    return this.flight;
  }
  async submit(job, retry = false) {
    if (this.busy || this.journalError || (!retry && this.blocked)) throw new ApiError('mutationBlocked');
    if (retry) {
      if (!this.pending || this.status !== 'ready') throw new ApiError('mutationBlocked');
      job = this.pending;
    }
    this.busy = true;
    if (this.flight) await this.flight;
    if (this.status !== 'ready') { this.busy = false; this.emit(); throw new ApiError('mutationBlocked'); }
    if (job.method === 'POST' && !retry) {
      job = JSON.parse(JSON.stringify(job));
      try { this.storage.setItem(pendingKey, JSON.stringify(job)); }
      catch { this.busy = false; this.emit(); throw new ApiError('recoveryUnavailable'); }
      this.pending = job;
    }
    this.emit();
    try {
      const result = await this.api.mutate(job);
      this.resolvePending();
      this.busy = false;
      await this.refresh();
      return result; // A committed mutation remains successful if the refresh failed.
    } catch (error) {
      // A rejected retry (including an expired session/token) says nothing about
      // the previous attempt. Keep its identity until a confirmed replay.
      if (!error.uncertain && !(retry && [0, 401, 403, 429].includes(error.status))) this.resolvePending();
      this.busy = false;
      if (error.status === 401) this.clear();
      else if (error.uncertain || !error.status || error.status >= 500) { this.status = 'stale'; this.error = error; }
      else if ([404, 409].includes(error.status)) await this.refresh();
      this.emit();
      throw error;
    }
  }
  resolvePending() {
    if (!this.pending) return;
    try { this.storage.removeItem(pendingKey); this.pending = null; }
    catch { this.journalError = true; }
  }
  create(resource, body) { return this.submit({ method: 'POST', path: `/api/${resource}`, headers: { 'Idempotency-Key': createId() }, body }); }
  update(resource, record, body) { return this.submit({ method: 'PATCH', path: `/api/${resource}/${record.id}`, headers: { 'If-Match': `"${record.version}"` }, body }); }
  remove(resource, record) { return this.submit({ method: 'DELETE', path: `/api/${resource}/${record.id}`, headers: { 'If-Match': `"${record.version}"` } }); }
  stock(type, items, reason) { return this.submit({ method: 'POST', path: '/api/stock-operations', headers: {}, body: { operationId: createId(), type, items, reason } }); }
  retry() { return this.submit(null, true); }
}
