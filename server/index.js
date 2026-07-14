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
app.use(express.json({ limit: '25mb' })); // datasets are uploaded as JSON
app.use(attachUser);

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---- health ---------------------------------------------------------------
app.get('/api/health', wrap(async (_req, res) => {
  await query('SELECT 1');
  res.json({ ok: true });
}));

// ---- auth -----------------------------------------------------------------
app.post('/api/auth/signup', wrap(async (req, res) => {
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

app.post('/api/auth/signin', wrap(async (req, res) => {
  const { email, password } = req.body ?? {};
  const { rows } = await query(
    `SELECT id, email, created_at, password_salt, password_hash, supabase_bcrypt_hash
       FROM users WHERE lower(email) = lower($1)`,
    [email ?? ''],
  );
  const record = rows[0];
  let ok = record && verifyPassword(password, record.password_salt, record.password_hash);

  // Users migrated from Supabase carry a bcrypt hash; verify once and upgrade to scrypt.
  if (!ok && record?.supabase_bcrypt_hash) {
    const { default: bcrypt } = await import('bcryptjs');
    if (bcrypt.compareSync(password ?? '', record.supabase_bcrypt_hash)) {
      const { salt, hash } = hashPassword(password);
      await query(
        'UPDATE users SET password_salt = $1, password_hash = $2, supabase_bcrypt_hash = NULL WHERE id = $3',
        [salt, hash, record.id],
      );
      ok = true;
    }
  }
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

// ---- generic table CRUD (Supabase .from() replacement) --------------------
function splitParams(queryParams) {
  const { order, limit, ...rest } = queryParams;
  return { filters: rest, order, limit };
}

app.get('/api/db/:table', wrap(async (req, res) => {
  res.json(await selectRows(req.params.table, req.user, splitParams(req.query)));
}));

app.post('/api/db/:table', wrap(async (req, res) => {
  res.json(await insertRows(req.params.table, req.user, req.body));
}));

app.patch('/api/db/:table', wrap(async (req, res) => {
  const { filters } = splitParams(req.query);
  res.json(await updateRows(req.params.table, req.user, filters, req.body ?? {}));
}));

app.delete('/api/db/:table', wrap(async (req, res) => {
  const { filters } = splitParams(req.query);
  res.json(await deleteRows(req.params.table, req.user, filters));
}));

// ---- RPCs ------------------------------------------------------------------
app.post('/api/rpc/increment_forum_post_views', wrap(async (req, res) => {
  const { post_id } = req.body ?? {};
  await query('UPDATE forum_posts SET views = COALESCE(views, 0) + 1 WHERE id = $1', [post_id]);
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
