import express from 'express';
import session from 'express-session';
import bcrypt from 'bcrypt';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { rateLimit } from 'express-rate-limit';
import { credentialVersion } from './admin.js';

const root = resolve(import.meta.dirname, '..');
const cookieName = 'inventory.sid';
const protectedFiles = new Set(['index.html', 'products.html', 'categories.html', 'suppliers.html', 'reports.html', 'orders.html', 'adjustments.html', 'log.html', 'manifest.webmanifest', 'service-worker.js', 'assets/inventory.svg',
  ...['start.js', 'main.js', 'data.js', 'i18n.js', 'ui.js', 'preferences.js', 'auth.js', 'styles.css', 'icons.js', 'search.js', 'dashboard.js'].map(name => `app/${name}`)]);
const publicFiles = new Set(['login/login.css', 'login/login.js']);
const sessionCall = (object, method) => new Promise((done, reject) => object[method](error => error ? reject(error) : done()));

// Dependencies are explicit for tests; the real entry point always supplies PostgreSQL.
export async function createApp({ config, store, admins, loginLimit = 10 }) {
  if (!store || !admins) throw new Error('A session store and admin repository are required.');
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 'loopback');
  const dummyHash = await bcrypt.hash(randomBytes(32).toString('hex'), 12);
  const cookie = { httpOnly: true, secure: config.secure, sameSite: 'lax', path: '/', maxAge: 8 * 60 * 60 * 1000 };
  app.use((req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin',
      'X-Frame-Options': 'DENY', 'Cross-Origin-Resource-Policy': 'same-origin',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'" });
    next();
  });
  function serve(file, res) { return res.sendFile(resolve(root, file), { cacheControl: false, lastModified: false }); }
  app.use((req, res, next) => {
    if (['GET', 'HEAD'].includes(req.method) && publicFiles.has(req.path.slice(1))) return serve(req.path.slice(1), res);
    if (req.path === '/login' || req.path.startsWith('/api/') || req.path === '/' || protectedFiles.has(req.path.slice(1))) return next();
    return res.status(404).send('Not found');
  });
  app.use(express.json({ limit: '4kb' }));
  app.use(session({ name: cookieName, secret: config.secret, store, resave: false, saveUninitialized: false, rolling: true, cookie }));

  function csrf(req, res, next) {
    const token = req.get('X-CSRF-Token');
    const expected = req.session.csrfToken;
    const origin = req.get('Origin');
    const allowedOrigin = config.origin || `${req.protocol}://${req.get('host')}`;
    if (req.get('Sec-Fetch-Site') === 'cross-site' || (origin && origin !== allowedOrigin) ||
        typeof token !== 'string' || typeof expected !== 'string' || token.length !== expected.length ||
        !/^[a-f0-9]{64}$/.test(token) || !timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
      return res.status(403).json({ error: 'Request could not be verified. Refresh and try again.' });
    }
    next();
  }
  async function authenticated(req) {
    if (!req.session.admin) return false;
    const admin = await admins.findAdmin();
    if (admin && req.session.admin.id === admin.id && req.session.admin.version === credentialVersion(admin)) return true;
    await sessionCall(req.session, 'destroy');
    return false;
  }
  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: loginLimit, standardHeaders: 'draft-7', legacyHeaders: false,
    skipSuccessfulRequests: true, message: { error: 'Too many sign-in attempts. Please try again later.' } });

  app.get('/api/auth/csrf', async (req, res) => {
    req.session.csrfToken ||= randomBytes(32).toString('hex');
    await sessionCall(req.session, 'save');
    res.json({ csrfToken: req.session.csrfToken });
  });
  app.get('/login', async (req, res) => {
    if (await authenticated(req)) return res.redirect('/');
    serve('login.html', res);
  });
  app.post('/api/auth/login', limiter, csrf, async (req, res) => {
    const { username, password } = req.body ?? {};
    if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || username.length > 100 || !password || Buffer.byteLength(password) > 72) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }
    const admin = await admins.findAdmin();
    const valid = await bcrypt.compare(password, admin?.password_hash || dummyHash);
    if (!admin || !valid || username !== admin.username) return res.status(401).json({ error: 'Invalid username or password.' });
    await sessionCall(req.session, 'regenerate');
    req.session.admin = { id: admin.id, version: credentialVersion(admin) };
    req.session.csrfToken = randomBytes(32).toString('hex');
    await sessionCall(req.session, 'save');
    res.json({ authenticated: true });
  });
  app.post('/api/auth/logout', csrf, async (req, res) => {
    await sessionCall(req.session, 'destroy');
    res.clearCookie(cookieName, { httpOnly: true, secure: config.secure, sameSite: 'lax', path: '/' });
    res.json({ authenticated: false });
  });
  app.use(async (req, res, next) => {
    if (await authenticated(req)) return next();
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Authentication required.' });
    res.redirect('/login');
  });
  app.get('/api/auth/session', (req, res) => res.json({ authenticated: true }));
  app.use((req, res) => {
    const file = req.path === '/' ? 'index.html' : req.path.slice(1);
    if (['GET', 'HEAD'].includes(req.method) && protectedFiles.has(file)) return serve(file, res);
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found.' });
    res.status(404).send('Not found');
  });
  app.use((error, req, res, next) => {
    // Stop failed sessions from being saved again while sending the error response.
    req.session = null;
    if (res.headersSent) return res.destroy();
    const status = error.type === 'entity.too.large' ? 413 : error.type === 'entity.parse.failed' ? 400 : 503;
    if (status === 503) console.error('Authentication service unavailable. Check PostgreSQL and the session-table migration.');
    res.status(status).json({ error: status === 503 ? 'Service temporarily unavailable.' : 'Invalid request.' });
  });
  return app;
}
