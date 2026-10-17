// Server-only: never import this module from browser code.
import dotenv from 'dotenv';
import pg from 'pg';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), override: false, quiet: true });

function configurationError(message) {
  const error = new Error(`Database configuration: ${message}`);
  error.name = 'DatabaseConfigurationError';
  throw error;
}

function required(name) {
  const value = process.env[name];
  if (!value?.trim()) configurationError(`${name} is required and must not be empty.`);
  return value;
}

const host = process.env.PGHOST ?? '127.0.0.1';
if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
  configurationError('PGHOST must be 127.0.0.1, localhost, or ::1.');
}
const portText = process.env.PGPORT ?? '5432';
if (!/^\d+$/.test(portText) || Number(portText) < 1 || Number(portText) > 65535) {
  configurationError('PGPORT must be an integer between 1 and 65535.');
}

// ES module caching shares this single pool across server-side imports.
// Keep pg's default NUMERIC parser: quantities and prices remain exact strings.
export const pool = new pg.Pool({
  host,
  port: Number(portText),
  database: required('PGDATABASE'),
  user: required('PGUSER'),
  password: required('PGPASSWORD'),
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: false, // Same-host loopback only; browser HTTPS is configured separately.
  application_name: 'university-it-inventory'
});

function safeCode(error) {
  const code = error?.code;
  return typeof code === 'string' && (/^[0-9A-Z]{5}$/.test(code) ||
    ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EHOSTUNREACH', 'ENETUNREACH', 'EPIPE'].includes(code))
    ? ` (code: ${code})` : '';
}

pool.on('error', error => {
  console.error(`Idle database connection failed${safeCode(error)}.`);
});

export async function checkDatabaseConnection() {
  try {
    await pool.query('SELECT 1');
  } catch (error) {
    // Never propagate the raw driver message, query, connection details or cause.
    const safeError = new Error(`Database connection failed${safeCode(error)}. Check the local PostgreSQL service and configuration.`);
    safeError.name = 'DatabaseConnectionError';
    throw safeError;
  }
}

export async function closeDatabase() {
  await pool.end();
}

// Future transactions must acquire one client with pool.connect(), use that
// same client for BEGIN, all statements and COMMIT, ROLLBACK on failure, and
// always release the client in finally. Do not use pool.query() for transactions.
