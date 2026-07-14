// Authentication core: scrypt password hashing (no external dependencies),
// opaque revocable session tokens stored in the sessions table.
//
// Users migrated from Supabase arrive with bcrypt hashes (auth.users.encrypted_password).
// Those are verified via bcryptjs on first login and transparently re-hashed to scrypt,
// so existing accounts keep working without a forced reset.
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { query } from './db.js';

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ---- password hashing ---------------------------------------------------
export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

export function verifyPassword(password, salt, hash) {
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function newToken() {
  return randomBytes(32).toString('hex');
}

// ---- sessions -----------------------------------------------------------
export async function createSession(userId) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await query(
    'INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)',
    [token, userId, expiresAt],
  );
  return { token, expiresAt };
}

export async function deleteSession(token) {
  await query('DELETE FROM sessions WHERE token = $1', [token]);
}

export async function userForToken(token) {
  if (!token) return null;
  const { rows } = await query(
    `SELECT u.id, u.email, u.created_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = $1 AND s.expires_at > now()`,
    [token],
  );
  return rows[0] ?? null;
}

// Express middleware: attaches req.user (or null) from the Authorization header.
export async function attachUser(req, _res, next) {
  try {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    req.sessionToken = token;
    req.user = await userForToken(token);
    next();
  } catch (err) {
    next(err);
  }
}

export function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not signed in' });
  next();
}

export function validateSignup({ email, password }) {
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return 'A valid email is required';
  if (!password || password.length < 8) return 'Password must be at least 8 characters';
  return null;
}
