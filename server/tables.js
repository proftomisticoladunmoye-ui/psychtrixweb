// Generic per-table CRUD with explicit ownership rules — the replacement for
// Supabase's row-level security. Only whitelisted tables are reachable, and
// every query on an owned table is forced through its owner column.
//
// Owner columns mirror the foreign keys in the Neon schema (every owned table
// references users(id) via user_id). Child tables without a user_id column are
// scoped through their parent row instead.
import { query } from './db.js';

export const TABLES = {
  datasets:                      { owner: 'user_id' },
  analyses:                      { owner: 'user_id' },
  projects:                      { owner: 'user_id' },
  reports:                       { owner: 'user_id' },
  // publicReadBy: anonymous SELECT is allowed only when filtered by this
  // column (capability-URL pattern — the public survey page loads a project
  // by its unguessable shareable_link token).
  sandbox_scale_projects:        { owner: 'user_id', publicReadBy: 'shareable_link' },
  scale_responses:               { owner: null, publicInsert: true }, // public survey submissions
  expert_ratings:                { owner: null, publicInsert: true },
  analysis_history:              { owner: 'user_id' },
  cultural_groups:               { owner: 'user_id' },
  translation_items:             { owner: 'user_id' },
  cultural_responses:            { owner: null },
  dif_analyses:                  { owner: 'user_id' },
  forum_admins:                  { owner: null, readAll: true, readonly: true },
  forum_categories:              { owner: null, readAll: true, readonly: true },
  forum_posts:                   { owner: 'user_id', readAll: true },
  forum_replies:                 { owner: 'user_id', readAll: true },
  forum_votes:                   { owner: 'user_id', readAll: true },
  messages:                      { owner: 'from_user_id' },
  notifications:                 { owner: 'user_id' },
  user_notification_preferences: { owner: 'user_id', conflictKey: 'user_id' },
  email_queue:                   { owner: 'user_id' },
  cat_item_banks:                { owner: 'user_id' },
  cat_items:                     { owner: null }, // scoped through its bank
  cat_sessions:                  { owner: 'user_id' },
  cat_session_responses:         { owner: null }, // scoped through its session
  network_projects:              { owner: 'user_id' },
  network_datasets:              { owner: null },
  network_estimations:           { owner: null },
  network_centrality:            { owner: null },
  network_communities:           { owner: null },
  network_stability:             { owner: null },
  network_comparisons:           { owner: null },
  plssem_models:                 { owner: 'user_id' },
  plssem_analyses:               { owner: null },
  r_analysis_jobs:               { owner: 'user_id' },
  r_analysis_templates:          { owner: null, readAll: true, readonly: true },
  r_analysis_logs:               { owner: 'user_id' },
  r_analysis_reports:            { owner: 'user_id' },
  r_analysis_cache:              { owner: null, readAll: true, readonly: true },
};

const IDENT = /^[a-z_][a-z0-9_]*$/;

// node-postgres encodes JS arrays as Postgres array literals, which breaks
// jsonb columns — serialize objects/arrays to JSON strings instead.
function toParam(v) {
  return v !== null && typeof v === 'object' && !(v instanceof Date) ? JSON.stringify(v) : v;
}

function assertIdent(name) {
  if (!IDENT.test(name)) throw Object.assign(new Error(`Invalid identifier: ${name}`), { status: 400 });
  return name;
}

function tableConfig(table) {
  const cfg = TABLES[table];
  if (!cfg) throw Object.assign(new Error(`Unknown table: ${table}`), { status: 404 });
  return cfg;
}

// Filters arrive as query params: eq.column=value, gte.column=value, in.column=a,b,c
const FILTER_OPS = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' };

function buildFilters(params, startIndex = 1) {
  const clauses = [];
  const values = [];
  let i = startIndex;
  for (const [key, raw] of Object.entries(params)) {
    const [op, column] = key.split('.', 2);
    if (!column) continue;
    assertIdent(column);
    if (FILTER_OPS[op]) {
      clauses.push(`"${column}" ${FILTER_OPS[op]} $${i++}`);
      values.push(raw);
    } else if (op === 'in') {
      const list = String(raw).split(',');
      clauses.push(`"${column}" = ANY($${i++})`);
      values.push(list);
    } else if (op === 'is') {
      clauses.push(`"${column}" IS ${raw === 'null' ? 'NULL' : 'NOT NULL'}`);
    }
  }
  return { clauses, values, nextIndex: i };
}

export async function selectRows(table, user, params) {
  const cfg = tableConfig(table);
  const { clauses, values, nextIndex } = buildFilters(params.filters ?? {});
  let i = nextIndex;

  const anonymousByToken =
    !user && cfg.publicReadBy && Object.prototype.hasOwnProperty.call(params.filters ?? {}, `eq.${cfg.publicReadBy}`);

  if (cfg.owner && !cfg.readAll && !anonymousByToken) {
    if (!user) throw Object.assign(new Error('Not signed in'), { status: 401 });
    clauses.push(`"${cfg.owner}" = $${i++}`);
    values.push(user.id);
  }

  const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';

  // Count-only queries (Supabase's { count: 'exact', head: true })
  let count = null;
  if (params.count) {
    const { rows } = await query(`SELECT count(*)::int AS n FROM "${assertIdent(table)}"${where}`, values);
    count = rows[0].n;
    if (params.head) return { rows: [], count };
  }

  // Column projection: without it every query returns full rows, and dataset
  // rows carry multi-megabyte jsonb blobs that list views don't need.
  let cols = '*';
  if (params.select && params.select !== '*') {
    const names = String(params.select).split(',').map((c) => c.trim()).filter(Boolean);
    if (names.length && names.every((c) => IDENT.test(c))) {
      cols = names.map((c) => `"${c}"`).join(', ');
    }
  }

  let sql = `SELECT ${cols} FROM "${assertIdent(table)}"${where}`;
  if (params.order) {
    const [col, dir] = String(params.order).split('.');
    sql += ` ORDER BY "${assertIdent(col)}" ${dir === 'desc' ? 'DESC' : 'ASC'}`;
  }
  if (params.limit) sql += ` LIMIT ${Math.max(0, parseInt(params.limit, 10) || 0)}`;

  const { rows } = await query(sql, values);
  return { rows, count };
}

export async function insertRows(table, user, rows, { upsert = false } = {}) {
  const cfg = tableConfig(table);
  if (cfg.readonly) throw Object.assign(new Error('Read-only table'), { status: 403 });
  if (!cfg.publicInsert && !user) throw Object.assign(new Error('Not signed in'), { status: 401 });

  const list = Array.isArray(rows) ? rows : [rows];
  if (!list.length) return [];
  const inserted = [];
  for (const row of list) {
    const data = { ...row };
    if (cfg.owner && user) data[cfg.owner] = user.id; // ownership is never client-controlled
    const cols = Object.keys(data).map(assertIdent);
    const placeholders = cols.map((_, idx) => `$${idx + 1}`);
    let sql = `INSERT INTO "${assertIdent(table)}" (${cols.map((c) => `"${c}"`).join(', ')})
               VALUES (${placeholders.join(', ')})`;
    if (upsert && cfg.conflictKey) {
      const updates = cols.filter((c) => c !== cfg.conflictKey).map((c) => `"${c}" = EXCLUDED."${c}"`);
      sql += ` ON CONFLICT ("${cfg.conflictKey}") DO UPDATE SET ${updates.join(', ')}`;
    }
    sql += ' RETURNING *';
    const { rows: r } = await query(sql, Object.values(data).map(toParam));
    inserted.push(r[0]);
  }
  return inserted;
}

export async function updateRows(table, user, filters, patch) {
  const cfg = tableConfig(table);
  if (cfg.readonly) throw Object.assign(new Error('Read-only table'), { status: 403 });
  if (!user) throw Object.assign(new Error('Not signed in'), { status: 401 });

  const cols = Object.keys(patch).map(assertIdent);
  if (!cols.length) return [];
  const values = cols.map((c) => toParam(patch[c]));
  const sets = cols.map((c, idx) => `"${c}" = $${idx + 1}`);

  const { clauses, values: fv, nextIndex } = buildFilters(filters, cols.length + 1);
  let i = nextIndex;
  if (cfg.owner) {
    clauses.push(`"${cfg.owner}" = $${i++}`);
    fv.push(user.id);
  }
  if (!clauses.length) throw Object.assign(new Error('Refusing unfiltered update'), { status: 400 });

  const sql = `UPDATE "${assertIdent(table)}" SET ${sets.join(', ')} WHERE ${clauses.join(' AND ')} RETURNING *`;
  const { rows } = await query(sql, [...values, ...fv]);
  return rows;
}

export async function deleteRows(table, user, filters) {
  const cfg = tableConfig(table);
  if (cfg.readonly) throw Object.assign(new Error('Read-only table'), { status: 403 });
  if (!user) throw Object.assign(new Error('Not signed in'), { status: 401 });

  const { clauses, values, nextIndex } = buildFilters(filters);
  let i = nextIndex;
  if (cfg.owner) {
    clauses.push(`"${cfg.owner}" = $${i++}`);
    values.push(user.id);
  }
  if (!clauses.length) throw Object.assign(new Error('Refusing unfiltered delete'), { status: 400 });

  const sql = `DELETE FROM "${assertIdent(table)}" WHERE ${clauses.join(' AND ')} RETURNING *`;
  const { rows } = await query(sql, values);
  return rows;
}
