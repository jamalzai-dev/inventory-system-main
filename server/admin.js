import { createHash } from 'node:crypto';
import bcrypt from 'bcrypt';

export function credentialVersion(admin) {
  return createHash('sha256').update(`${admin.username}\0${admin.password_hash}`).digest('hex');
}

export function createAdminRepository(pool) {
  return {
    async findAdmin() {
      const { rows } = await pool.query('SELECT id, username, password_hash FROM public.admin_account WHERE id = 1');
      return rows[0] ?? null;
    }
  };
}

export function validateAdminCredentials(username, password) {
  if (typeof username !== 'string' || !username.trim() || username.length > 100 || username !== username.trim()) {
    throw new Error('Admin username must be 1–100 characters without leading or trailing spaces.');
  }
  if (typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72 || !password.trim()) {
    throw new Error('Admin password must be at least 12 characters and no more than 72 UTF-8 bytes.');
  }
}

export async function setAdminCredentials(pool, username, password) {
  validateAdminCredentials(username, password);
  const hash = await bcrypt.hash(password, 12);
  // The existing id = 1 constraint enforces the singleton, including concurrent runs.
  // The existing updated_at trigger handles timestamps.
  await pool.query(`INSERT INTO public.admin_account (id, username, password_hash)
    VALUES (1, $1, $2) ON CONFLICT (id) DO UPDATE
    SET username = EXCLUDED.username, password_hash = EXCLUDED.password_hash`, [username, hash]);
  // Every authenticated request checks credentialVersion, invalidating old sessions
  // after an account change, including concurrent in-flight sign-ins.
}
