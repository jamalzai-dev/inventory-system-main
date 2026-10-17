import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8080';
const username = process.env.TEST_ADMIN_USERNAME, password = process.env.TEST_ADMIN_PASSWORD;
if (!username || !password) throw new Error('Set TEST_ADMIN_USERNAME and TEST_ADMIN_PASSWORD privately.');
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const errors = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
await mkdir('tests/artifacts', { recursive: true });
async function check(name, action) { await action(); checks.push(name); console.log('PASS', name); }
try {
  await check('direct inventory access redirects to an accessible login page with an empty logo area', async () => {
    await page.goto(base + '/products.html');
    assert.equal(new URL(page.url()).pathname, '/login');
    assert.equal(await page.locator('.logo-space > *').count(), 0);
    assert.equal(await page.locator('#password').getAttribute('type'), 'password');
    for (const id of ['username', 'password']) assert.equal(await page.locator('#' + id).evaluate(input => input.labels.length), 1);
    await page.locator('#username').focus(); await page.keyboard.press('Tab');
    assert.equal(await page.locator('#password').evaluate(input => input === document.activeElement), true);
  });
  await check('empty input validation and keyboard password visibility toggle', async () => {
    await page.locator('#login-submit').click();
    assert.equal(await page.locator('#login-error').isVisible(), true);
    assert.match(await page.locator('#login-error').innerText(), /username and password/);
    await page.locator('#show-password').focus(); await page.keyboard.press('Enter');
    assert.equal(await page.locator('#password').getAttribute('type'), 'text');
    await page.keyboard.press('Enter'); assert.equal(await page.locator('#password').getAttribute('type'), 'password');
  });
  await check('invalid credentials show a friendly generic error and clear the password', async () => {
    await page.locator('#username').fill('invalid-browser-test-account');
    await page.locator('#password').fill('invalid-browser-test-password');
    await page.locator('#password').press('Enter');
    await page.waitForFunction(() => document.querySelector('#login-error').textContent.includes('incorrect'));
    assert.equal(await page.locator('#password').inputValue(), '');
    assert.equal(new URL(page.url()).pathname, '/login');
  });
  await check('desktop and mobile login layouts work in light and dark themes', async () => {
    await page.reload();
    for (const colorScheme of ['light', 'dark']) for (const width of [320, 375, 390, 428, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ colorScheme });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: `tests/artifacts/login-${colorScheme}-${width}.png`, fullPage: true });
    }
  });
  await check('login text, buttons and input boundaries meet selected contrast ratios', async () => {
    for (const colorScheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme });
      const ratios = await page.evaluate(() => {
        const color = value => value.match(/[\d.]+/g).slice(0, 3).map(Number);
        const luminance = rgb => rgb.map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
        const contrast = (a, b) => { const x = luminance(color(a)), y = luminance(color(b)); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
        const style = selector => getComputedStyle(document.querySelector(selector));
        const card = style('.login-card').backgroundColor;
        return [
          ['heading', contrast(style('h1').color, card), 4.5],
          ['intro', contrast(style('.intro').color, card), 4.5],
          ['button', contrast(style('.submit').color, style('.submit').backgroundColor), 4.5],
          ['input boundary', contrast(style('input').borderTopColor, style('input').backgroundColor), 3]
        ];
      });
      for (const [name, ratio, minimum] of ratios) assert.ok(ratio >= minimum, `${colorScheme} ${name}: ${ratio}`);
    }
  });
  await check('successful login prevents duplicate submissions and opens the existing inventory', async () => {
    await page.setViewportSize({ width: 1440, height: 1000 }); await page.emulateMedia({ colorScheme: 'light' });
    await page.locator('#username').fill(username); await page.locator('#password').fill(password);
    let submissions = 0;
    page.on('request', request => { if (request.url().endsWith('/api/auth/login') && request.method() === 'POST') submissions++; });
    await page.evaluate(() => { const form = document.querySelector('form'); form.requestSubmit(); form.requestSubmit(); });
    await page.waitForURL(base + '/'); await page.locator('.sidebar').waitFor();
    assert.equal(submissions, 1);
    assert.equal(await page.locator('.topbar').getByRole('button', { name: 'Sign out', exact: true }).count(), 0);
    await page.locator('nav [data-page=settings]').click();
    assert.equal(await page.locator('.settings').getByRole('button', { name: 'Sign out', exact: true }).count(), 1);
    assert.equal((await context.request.get(base + '/api/auth/session')).status(), 200);
  });
  await check('sign-out blocks subsequent pages and API requests without clearing local inventory', async () => {
    const before = await page.evaluate(() => localStorage.getItem('university_it_inventory_v2'));
    await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await page.waitForURL(base + '/login');
    assert.equal(await page.evaluate(() => localStorage.getItem('university_it_inventory_v2')), before);
    assert.equal((await context.request.get(base + '/api/auth/session')).status(), 401);
    await page.goto(base + '/'); assert.equal(new URL(page.url()).pathname, '/login');
  });
  assert.deepEqual(errors, []);
  await writeFile('tests/artifacts/auth-results.json', JSON.stringify({ browser: browser.version(), base, checks, errors }, null, 2));
  console.log(`${checks.length} authentication browser checks passed`);
} finally { await browser.close(); }
