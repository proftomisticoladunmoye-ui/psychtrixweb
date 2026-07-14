// Generic per-table CRUD with explicit ownership rules — the replacement for
// Supabase's row-level security. Only whitelisted tables are reachable, and
// every query on an owned table is forced through its owner column.
//
// NOTE: owner columns below are the working assumption from frontend code
// (user_id everywhere). Reconcile against the real DDL + RLS policies once the
// Supabase dump lands (see scripts/export-supabase.md), then update this map.
import { query } from './db.js';

export const TABLES = {
  datasets:                      { owner: 'user_id' },
  analyses:                      { owner: 'user_id' },
  reports:                       { owner: 'user_id' },
  sandbox_scale_projects:        { owner: 'user_id' },
  scale_responses:               { owner: null, publicInsert: true }, // public survey submissions
  analysis_history:              { owner: 'user_id' },
  cultural_groups:               { owner: 'user_id' },
  translation_items:             { owner: 'user_id' },
  cultural_responses:            { owner: 'user_id' },
  forum_admins:                  { owner: null, readAll: true, readonly: true },
  forum_posts:                   { owner: 'user_id', readAll: true },
  forum_replies:                 { owner: 'user_id', readAll: true },
  notifications:                 { owner: 'user_id' },
  user_notification_preferences: { owner: 'user_id' },
  cat_item_banks:                { owner: 'user_id' },
  cat_items:                     { owner: null }, // scoped through its bank; tightened after dump review
  cat_sessions:                  { owner: 'user_id' },
  cat_session_responses:         { owner: null }, // scoped through its session; tightened after dump review
  network_projects:              { owner: 'user_id' },
  network_datasets:              { owner: null },
  network_estimations:           { owner: null },
  network_centrality:            { owner: null },
  network_communities:           { owner: null },
  network_stability:             { owner: null },
  plssem_models:                 { owner: 'user_id' },
};

const IDENT = /^[a-z_][a-z0-9_]*$/;

function assertIdent(name) {
  if (!IDENT.test(name)) throw Object.assign(new Error(`Invalid identifier: ${name}`), { status: 400 });
  return name;
}

function tableConfig(table) {
  const cfg = TABLES[table];
  if (!cfg) throw Object.assign(new Error(`Unknown table: ${table}`), { status: 404 });
  return cfg;
}

// Filters arrive as query params: eq.column=value, in.column=a,b,c
function buildFilters(params, startIndex = 1) {
  const clauses = [];
  const values = [];
  let i = startIndex;
  for (const [key, raw] of Object.entries(params)) {
    const [op, column] = key.split('.', 2);
    if (!column) continue;
    assertIdent(column);
    if (op === 'eq') {
      clauses.push(`"${column}" = $${i++}`);
      values.push(raw);
    } else if (op === 'in') {
      const list = String(raw).split(',');
      clauses.push(`"${column}" = ANY($${i++})`);
      values.push(list);
    }
  }
  return { clauses, values, nextIndex: i };
}

export async function selectRows(table, user, params) {
  const cfg = tableConfig(table);
  const { clauses, values, nextIndex } = buildFilters(params.filters ?? {});
  let i = nextIndex;

  if (cfg.owner && !cfg.readAll) {
    if (!user) throw Object.assign(new Error('Not signed in'), { status: 401 });
    clauses.push(`"${cfg.owner}" = $${i++}`);
    values.push(user.id);
  }

  let sql = `SELECT * FROM "${assertIdent(table)}"`;
  if (clauses.length) sql += ` WHERE ${clauses.join(' AND ')}`;
  if (params.order) {
    const [col, dir] = String(params.order).split('.');
    sql += ` ORDER BY "${assertIdent(col)}" ${dir === 'desc' ? 'DESC' : 'ASC'}`;
  }
  if (params.limit) sql += ` LIMIT ${Math.max(0, parseInt(params.limit, 10) || 0)}`;

  const { rows } = await query(sql, values);
  return rows;
}

export async function insertRows(table, user, rows) {
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
    const sql = `INSERT INTO "${assertIdent(table)}" (${cols.map((c) => `"${c}"`).join(', ')})
                 VALUES (${placeholders.join(', ')}) RETURNING *`;
    const { rows: r } = await query(sql, Object.values(data));
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
  const values = cols.map((c) => patch[c]);
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
