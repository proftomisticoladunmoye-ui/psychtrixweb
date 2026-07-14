-- Core auth tables for the custom backend (replaces Supabase auth.users).
-- App tables (datasets, analyses, ...) are created from the Supabase dump —
-- see scripts/export-supabase.mjs and MIGRATION_PLAN.md.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_salt text,
  password_hash text,
  -- Carried over from Supabase auth.users.encrypted_password; verified with
  -- bcrypt on first login, then upgraded to scrypt and cleared.
  supabase_bcrypt_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions (expires_at);
