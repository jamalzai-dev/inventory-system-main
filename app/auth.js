// Authentication uses the same shared Admin session as the inventory APIs.
let logoutPending = false;
export async function logout(clearProtected = () => {}) {
  if (logoutPending) return;
  logoutPending = true;
  try {
    const tokenResponse = await fetch('/api/auth/csrf', { cache: 'no-store' });
    if (!tokenResponse.ok) throw new Error();
    const { csrfToken } = await tokenResponse.json();
    const response = await fetch('/api/auth/logout', { method: 'POST', headers: { 'X-CSRF-Token': csrfToken } });
    if (!response.ok) throw new Error();
    clearProtected();
    location.replace('/login');
  } finally { logoutPending = false; }
}

let checking = false;
export async function verifySession() {
  if (checking || location.protocol === 'file:') return;
  checking = true;
  try {
    const response = await fetch('/api/auth/session', { cache: 'no-store' });
    if (response.status === 401) {
      window.dispatchEvent(new Event('inventory-session-expired'));
      document.querySelector('#app')?.replaceChildren(); location.replace('/login');
    }
  } catch { /* The server still enforces authentication on every protected request. */ }
  finally { checking = false; }
}
window.addEventListener('pageshow', verifySession);
window.addEventListener('focus', verifySession);
document.addEventListener('visibilitychange', () => { if (!document.hidden) void verifySession(); });
setInterval(() => { if (!document.hidden) void verifySession(); }, 60000);
