// Additive migration: PsychtrixWeb Research Notes (Phase 1 schema).
// Creates the scholarly-publishing tables + an editor/admin role flag.
// Safe to run repeatedly (IF NOT EXISTS everywhere).
//   node scripts/migrate-research-notes.mjs   (DATABASE_URL from .env)
import pg from 'pg';
import fs from 'node:fs';

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
const client = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const statements = [
  // ---- role flags on users (no role column existed before) ----------------
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_editor boolean NOT NULL DEFAULT false`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin  boolean NOT NULL DEFAULT false`,

  // ---- author profiles (distinct from user accounts) ----------------------
  `CREATE TABLE IF NOT EXISTS rn_authors (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id uuid REFERENCES users(id) ON DELETE SET NULL,
     slug text UNIQUE NOT NULL,
     full_name text NOT NULL,
     academic_title text,
     affiliation text,
     country text,
     bio text,
     orcid text,
     google_scholar_url text,
     website_url text,
     research_interests text[] NOT NULL DEFAULT '{}',
     profile_image_url text,
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now()
   )`,

  // ---- the Research Notes themselves --------------------------------------
  `CREATE SEQUENCE IF NOT EXISTS research_note_number_seq START 1`,
  `CREATE TABLE IF NOT EXISTS research_notes (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     note_number integer UNIQUE,
     slug text UNIQUE NOT NULL,
     note_type text NOT NULL DEFAULT 'Research Note',
     status text NOT NULL DEFAULT 'draft',
     title text NOT NULL DEFAULT '',
     subtitle text,
     abstract text,
     keywords text[] NOT NULL DEFAULT '{}',
     categories text[] NOT NULL DEFAULT '{}',
     body_html text NOT NULL DEFAULT '',
     body_json jsonb,
     license text NOT NULL DEFAULT 'cc-by',
     doi text,
     version text NOT NULL DEFAULT '1.0',
     first_page integer,
     last_page integer,
     seo_title text,
     seo_description text,
     featured boolean NOT NULL DEFAULT false,
     view_count integer NOT NULL DEFAULT 0,
     download_count integer NOT NULL DEFAULT 0,
     meta jsonb NOT NULL DEFAULT '{}',
     created_by uuid REFERENCES users(id) ON DELETE SET NULL,
     published_at timestamptz,
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS rn_status_idx ON research_notes(status)`,
  `CREATE INDEX IF NOT EXISTS rn_published_idx ON research_notes(published_at DESC)`,
  `CREATE INDEX IF NOT EXISTS rn_featured_idx ON research_notes(featured) WHERE featured`,

  // ---- ordered authorship (many-to-many) ----------------------------------
  `CREATE TABLE IF NOT EXISTS research_note_authors (
     note_id uuid NOT NULL REFERENCES research_notes(id) ON DELETE CASCADE,
     author_id uuid NOT NULL REFERENCES rn_authors(id) ON DELETE CASCADE,
     position integer NOT NULL DEFAULT 0,
     affiliation_override text,
     is_corresponding boolean NOT NULL DEFAULT false,
     PRIMARY KEY (note_id, author_id)
   )`,
  `CREATE INDEX IF NOT EXISTS rna_note_idx ON research_note_authors(note_id, position)`,

  // ---- external references (bibliography) ---------------------------------
  `CREATE TABLE IF NOT EXISTS rn_references (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     note_id uuid NOT NULL REFERENCES research_notes(id) ON DELETE CASCADE,
     position integer NOT NULL DEFAULT 0,
     ref_type text NOT NULL DEFAULT 'journal',
     raw_text text NOT NULL DEFAULT '',
     csl jsonb,
     doi text,
     url text,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS rnref_note_idx ON rn_references(note_id, position)`,

  // ---- internal citation graph (note -> note) -----------------------------
  `CREATE TABLE IF NOT EXISTS rn_internal_citations (
     citing_note_id uuid NOT NULL REFERENCES research_notes(id) ON DELETE CASCADE,
     cited_note_id  uuid NOT NULL REFERENCES research_notes(id) ON DELETE CASCADE,
     created_at timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (citing_note_id, cited_note_id)
   )`,
  `CREATE INDEX IF NOT EXISTS rnic_cited_idx ON rn_internal_citations(cited_note_id)`,

  // ---- media (figures) — storage_key points at external object storage ----
  `CREATE TABLE IF NOT EXISTS rn_media (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     note_id uuid REFERENCES research_notes(id) ON DELETE SET NULL,
     storage_provider text NOT NULL DEFAULT 'r2',
     storage_key text,
     url text,
     mime text,
     bytes integer,
     width integer,
     height integer,
     alt text,
     caption text,
     figure_number integer,
     created_by uuid REFERENCES users(id) ON DELETE SET NULL,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS rnmedia_note_idx ON rn_media(note_id)`,
  // DB-backed fallback storage (used until external object storage is configured).
  `ALTER TABLE rn_media ADD COLUMN IF NOT EXISTS data bytea`,
  `ALTER TABLE rn_media ADD COLUMN IF NOT EXISTS original_name text`,

  // ---- analytics events (views/downloads/shares) --------------------------
  `CREATE TABLE IF NOT EXISTS rn_page_views (
     id bigserial PRIMARY KEY,
     note_id uuid REFERENCES research_notes(id) ON DELETE CASCADE,
     event text NOT NULL DEFAULT 'view',
     country text,
     referrer text,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS rnpv_note_idx ON rn_page_views(note_id, created_at DESC)`,

  // ---- moderated scholarly discussion (public can submit; editors approve) --
  `CREATE TABLE IF NOT EXISTS rn_comments (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     note_id uuid NOT NULL REFERENCES research_notes(id) ON DELETE CASCADE,
     parent_id uuid REFERENCES rn_comments(id) ON DELETE CASCADE,
     author_name text NOT NULL,
     author_email text,                 -- private: used for accountability, never rendered publicly
     author_affiliation text,
     author_orcid text,
     body text NOT NULL,
     status text NOT NULL DEFAULT 'pending',   -- pending | approved | rejected | spam
     is_editor_reply boolean NOT NULL DEFAULT false,
     created_by uuid REFERENCES users(id) ON DELETE SET NULL,
     ip text,
     approved_at timestamptz,
     approved_by uuid REFERENCES users(id) ON DELETE SET NULL,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS rncmt_note_status_idx ON rn_comments(note_id, status, created_at)`,
  `CREATE INDEX IF NOT EXISTS rncmt_status_idx ON rn_comments(status, created_at DESC)`,

  // ---- Zenodo DOI minting (real DOIs only; populated when minted) ----------
  `ALTER TABLE research_notes ADD COLUMN IF NOT EXISTS zenodo_deposition_id text`,
  `ALTER TABLE research_notes ADD COLUMN IF NOT EXISTS zenodo_record_url text`,
  `ALTER TABLE research_notes ADD COLUMN IF NOT EXISTS zenodo_concept_doi text`,
  `ALTER TABLE research_notes ADD COLUMN IF NOT EXISTS doi_env text`, // sandbox | production
  `ALTER TABLE research_notes ADD COLUMN IF NOT EXISTS share_count integer NOT NULL DEFAULT 0`,
];

await client.connect();
for (const sql of statements) {
  await client.query(sql);
  console.log('OK:', sql.trim().split('\n')[0].slice(0, 72));
}

// Grant editor/admin to the known operator accounts so the admin area is reachable.
// (Additive + idempotent; extend RN_ADMIN_EMAILS in .env to add more.)
const adminEmails = (env.RN_ADMIN_EMAILS || 'proftomisticoladunmoye@gmail.com,testuser@psychtrix.dev')
  .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
for (const email of adminEmails) {
  const { rowCount } = await client.query(
    'UPDATE users SET is_editor = true, is_admin = true WHERE lower(email) = $1', [email]);
  console.log(`grant editor/admin -> ${email}: ${rowCount ? 'done' : 'no such user (skipped)'}`);
}

const { rows } = await client.query(
  `SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_name LIKE 'rn_%' OR table_name IN ('research_notes','research_note_authors')
    ORDER BY 1`);
console.log('RN tables:', rows.map((r) => r.table_name).join(', '));
await client.end();
