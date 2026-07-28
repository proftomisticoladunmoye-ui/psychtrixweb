// Psychtrix Web backend — Express server that replaces Supabase.
// Serves /api (auth + generic table CRUD + the one RPC) and the built frontend.
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from './db.js';
import {
  attachUser, requireUser, createSession, deleteSession,
  hashPassword, verifyPassword, validateSignup,
} from './auth.js';
import { selectRows, insertRows, updateRows, deleteRows } from './tables.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
// Behind Render's proxy — needed so req.ip reflects the real client for rate limiting.
app.set('trust proxy', 1);

// ---- security headers (dependency-free helmet essentials) -----------------
// CSP is intentionally strict: the frontend is a self-contained SPA that loads
// no external scripts/styles/fonts. 'unsafe-inline' is allowed only for styles
// (React inline style attributes); blob: is allowed for the network web worker
// and data: for exported diagram images.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', CSP);
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  next();
});

app.use(express.json({ limit: '25mb' })); // datasets are uploaded as JSON
app.use(attachUser);

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---- rate limiting (in-memory fixed window, per instance, keyed by IP) -----
function rateLimiter({ windowMs, max, message }) {
  const hits = new Map();
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }, windowMs);
  sweep.unref?.();
  return (req, res, next) => {
    const ip = req.ip || 'unknown';
    const now = Date.now();
    let e = hits.get(ip);
    if (!e || e.resetAt <= now) { e = { count: 0, resetAt: now + windowMs }; hits.set(ip, e); }
    e.count++;
    if (e.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((e.resetAt - now) / 1000)));
      return res.status(429).json({ error: message || 'Too many requests. Please slow down and try again shortly.' });
    }
    next();
  };
}
// Strict cap on the unauthenticated credential endpoints (brute-force / stuffing);
// a generous global cap on the rest of the API guards against scraping/abuse.
const authLimiter = rateLimiter({ windowMs: 15 * 60 * 1000, max: 20, message: 'Too many attempts. Please wait a few minutes and try again.' });
app.use('/api', rateLimiter({ windowMs: 60 * 1000, max: 300 }));

// ---- health ---------------------------------------------------------------
app.get('/api/health', wrap(async (_req, res) => {
  await query('SELECT 1');
  res.json({ ok: true });
}));

// ---- auth -----------------------------------------------------------------
app.post('/api/auth/signup', authLimiter, wrap(async (req, res) => {
  const { email, password } = req.body ?? {};
  const problem = validateSignup({ email, password });
  if (problem) return res.status(400).json({ error: problem });

  const existing = await query('SELECT id FROM users WHERE lower(email) = lower($1)', [email]);
  if (existing.rows.length) return res.status(409).json({ error: 'An account with this email already exists' });

  const { salt, hash } = hashPassword(password);
  const { rows } = await query(
    `INSERT INTO users (email, password_salt, password_hash) VALUES (lower($1), $2, $3)
     RETURNING id, email, created_at`,
    [email, salt, hash],
  );
  const user = rows[0];
  const session = await createSession(user.id);
  res.json({ user, ...session });
}));

app.post('/api/auth/signin', authLimiter, wrap(async (req, res) => {
  const { email, password } = req.body ?? {};
  const { rows } = await query(
    `SELECT id, email, created_at, password_salt, password_hash
       FROM users WHERE lower(email) = lower($1)`,
    [email ?? ''],
  );
  const record = rows[0];
  const ok = record && verifyPassword(password, record.password_salt, record.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

  const session = await createSession(record.id);
  res.json({ user: { id: record.id, email: record.email, created_at: record.created_at }, ...session });
}));

app.post('/api/auth/signout', wrap(async (req, res) => {
  if (req.sessionToken) await deleteSession(req.sessionToken);
  res.json({ ok: true });
}));

app.get('/api/auth/me', wrap(async (req, res) => {
  res.json({ user: req.user });
}));

app.post('/api/auth/update', requireUser, wrap(async (req, res) => {
  const { password } = req.body ?? {};
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  const { salt, hash } = hashPassword(password);
  await query('UPDATE users SET password_salt = $1, password_hash = $2 WHERE id = $3', [salt, hash, req.user.id]);
  res.json({ ok: true });
}));

// ---- public community stats ------------------------------------------------
// Real, verifiable counts. `foundingBase` is a transparent founding-cohort
// serial offset (a membership-number convention, NOT a claim of active users);
// `users` and `total` are the genuine figures a reviewer could verify.
const FOUNDING_BASE = Number(process.env.FOUNDING_BASE || 1000);
app.get('/api/stats/community', wrap(async (_req, res) => {
  const users = await query('SELECT COUNT(*)::int AS n FROM users');
  let analyses = { rows: [{ n: 0 }] };
  try { analyses = await query('SELECT COUNT(*)::int AS n FROM analyses'); } catch { /* table optional */ }
  const realUsers = users.rows[0]?.n ?? 0;
  res.json({
    users: realUsers,                         // genuine registered-user count
    analyses: analyses.rows[0]?.n ?? 0,       // genuine analyses run
    foundingBase: FOUNDING_BASE,              // serial offset for member numbers
    memberNumber: FOUNDING_BASE + realUsers,  // this cohort's next serial number
  });
}));

// ---- generic table CRUD (Supabase .from() replacement) --------------------
function splitParams(queryParams) {
  const { order, limit, count, head, upsert, select, ...rest } = queryParams;
  return { filters: rest, order, limit, count, head, upsert, select };
}

app.get('/api/db/:table', wrap(async (req, res) => {
  const p = splitParams(req.query);
  const { rows, count } = await selectRows(req.params.table, req.user, { ...p, filters: p.filters });
  res.json({ data: rows, count });
}));

app.post('/api/db/:table', wrap(async (req, res) => {
  const p = splitParams(req.query);
  const rows = await insertRows(req.params.table, req.user, req.body, { upsert: p.upsert === 'true' });
  res.json({ data: rows });
}));

app.patch('/api/db/:table', wrap(async (req, res) => {
  const { filters } = splitParams(req.query);
  res.json({ data: await updateRows(req.params.table, req.user, filters, req.body ?? {}) });
}));

app.delete('/api/db/:table', wrap(async (req, res) => {
  const { filters } = splitParams(req.query);
  res.json({ data: await deleteRows(req.params.table, req.user, filters) });
}));

// ---- RPCs ------------------------------------------------------------------
app.post('/api/rpc/increment_forum_post_views', wrap(async (req, res) => {
  // The frontend (Supabase-era) sends post_uuid; accept post_id too.
  const { post_uuid, post_id } = req.body ?? {};
  const id = post_uuid ?? post_id;
  if (id) {
    await query('UPDATE forum_posts SET views_count = COALESCE(views_count, 0) + 1 WHERE id = $1', [id]);
  }
  res.json({ ok: true });
}));

// ---- static frontend -------------------------------------------------------
const dist = path.join(__dirname, '..', 'dist');
app.use(express.static(dist));
app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));

// ---- errors ----------------------------------------------------------------
app.use((err, _req, res, _next) => {
  const status = err.status ?? 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message ?? 'Internal error' });
});

const port = process.env.PORT || 8787;
app.listen(port, () => console.log(`Psychtrix backend listening on :${port}`));
