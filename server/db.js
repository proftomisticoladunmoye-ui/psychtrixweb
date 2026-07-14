// Postgres connection pool. DATABASE_URL points at Neon (or any Postgres).
// Neon requires TLS; local dev against a plain postgres can set PGSSLMODE=disable.
import pg from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

export const pool = new pg.Pool({
  connectionString,
  ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
  max: 5,
});

export function query(text, params) {
  return pool.query(text, params);
}
