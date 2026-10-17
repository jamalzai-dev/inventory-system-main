import session from 'express-session';
import bcrypt from 'bcrypt';
import { createApp } from '../../server/app.js';

export const testCredentials = { username: 'test-admin', password: 'Synthetic-test-password-2026' };
const hash = await bcrypt.hash(testCredentials.password, 4);

export async function startTestServer(options = {}) {
  const store = options.store || new session.MemoryStore();
  const state = { admin: { id: 1, username: testCredentials.username, password_hash: hash } };
  const app = await createApp({
    config: { secret: 'test-only-session-secret-with-at-least-32-bytes', secure: false, trustProxy: false, ...options.config },
    store, admins: options.admins || { findAdmin: async () => state.admin }, loginLimit: options.loginLimit ?? 1000
  });
  const server = app.listen(options.port ?? 0, '127.0.0.1');
  await new Promise((done, reject) => { server.once('listening', done); server.once('error', reject); });
  return { app, store, state, server, url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((done, reject) => { server.close(error => error ? reject(error) : done()); server.closeAllConnections(); }) };
}

export function testClient(url) {
  let cookie = '', csrfToken;
  const request = async (path, options = {}) => {
    const response = await fetch(url + path, { redirect: 'manual', ...options, headers: { Cookie: cookie, ...options.headers } });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    return response;
  };
  return {
    request,
    get cookie() { return cookie; },
    async token() { const response = await request('/api/auth/csrf'); csrfToken = (await response.json()).csrfToken; return csrfToken; },
    async login(credentials = testCredentials, headers = {}) {
      await this.token();
      return request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken, ...headers }, body: JSON.stringify(credentials) });
    },
    async logout() {
      await this.token();
      return request('/api/auth/logout', { method: 'POST', headers: { 'X-CSRF-Token': csrfToken } });
    }
  };
}
