// Uses real sign-in routes; never installs an authentication bypass.
export async function authenticateContext(context, base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8080') {
  const username = process.env.TEST_ADMIN_USERNAME;
  const password = process.env.TEST_ADMIN_PASSWORD;
  if (!username || !password) throw new Error('Set TEST_ADMIN_USERNAME and TEST_ADMIN_PASSWORD for browser tests.');
  const tokenResponse = await context.request.get(`${base}/api/auth/csrf`);
  if (!tokenResponse.ok()) throw new Error('Could not initialize the browser-test session.');
  const { csrfToken } = await tokenResponse.json();
  const response = await context.request.post(`${base}/api/auth/login`, {
    headers: { 'X-CSRF-Token': csrfToken }, data: { username, password }
  });
  if (!response.ok()) throw new Error(`Browser-test login failed (${response.status()}).`);
}
