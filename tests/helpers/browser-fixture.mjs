// IPC exists only when launched by disposable-browser.mjs. Never uses an HTTP
// maintenance endpoint or a configured database. Production cannot receive seeds.
import { createHash } from 'node:crypto';
let sequence = 0;
const waiting = new Map();
process.on('message', message => {
  const pending = waiting.get(message?.fixtureId);
  if (!pending) return;
  waiting.delete(message.fixtureId);
  if (message.error) pending.reject(new Error(message.error)); else pending.resolve(message.value);
});
process.channel?.unref();
export function fixtureId(alias) {
  if (/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(alias)) return alias;
  const hex = createHash('sha256').update(alias).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
export function fixtureCommand(command, data) {
  if (!process.send) throw new Error('Run with tests/helpers/disposable-browser.mjs and TEST_PG_BIN. No production fixture fallback.');
  return new Promise((resolve, reject) => {
    const fixtureId = ++sequence; waiting.set(fixtureId, { resolve, reject }); process.send({ fixtureId, command, data });
  });
}
export const seedInventory = data => fixtureCommand('seed', data);
export const serverInventory = () => fixtureCommand('read');
export const readyInventory = page => page.locator('html[data-inventory-status=ready]').waitFor();
