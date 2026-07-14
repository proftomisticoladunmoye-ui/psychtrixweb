// Export the Psychtrix Supabase database: schema (DDL), RLS policies (as
// reference), all rows from public tables, and auth users (email + bcrypt hash)
// so accounts survive the move to the new backend.
//
// Run it yourself so the database password never leaves your terminal:
//   node scripts/export-supabase.mjs "<connection-string>"
//
// Get the connection string from: Supabase dashboard → Connect (top bar) →
// Session pooler. It looks like:
//   postgresql://postgres.rcmsykdyiaccsgxqprrp:[YOUR-PASSWORD]@aws-1-....pooler.supabase.com:5432/postgres
// Replace [YOUR-PASSWORD] with your database password.
//
// Output goes to supabase-export/ (gitignored — contains your data).
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';

const connectionString = process.argv[2];
if (!connectionString) {
  console.error('Usage: node scripts/export-supabase.mjs "<connection-string>"');
  process.exit(1);
}

const outDir = path.join(process.cwd(), 'supabase-export');
fs.mkdirSync(outDir, { recursive: true });

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });

function q(ident) { return '"' + ident.replace(/"/g, '""') + '"'; }

async function main() {
  await client.connect();
  console.log('Connected.');

  // ---- table list -----------------------------------------------------------
  const { rows: tables } = await client.query(`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`);
  console.log(`Found ${tables.length} public tables.`);

  // ---- schema DDL -------------------------------------------------------------
  let ddl = '-- Generated from Supabase public schema\n\n';
  for (const { tablename } of tables) {
    const { rows: cols } = await client.query(`
      SELECT column_name, data_type, udt_name, is_nullable, column_default,
             character_maximum_length
        FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`, [tablename]);
    const { rows: pks } = await client.query(`
      SELECT a.attname FROM pg_index i
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
       WHERE i.indrelid = ('public.' || quote_ident($1))::regclass AND i.indisprimary`, [tablename]);
    const pkSet = new Set(pks.map((r) => r.attname));

    ddl += `CREATE TABLE ${q(tablename)} (\n`;
    ddl += cols.map((c) => {
      let type = c.data_type === 'USER-DEFINED' ? c.udt_name : c.data_type;
      if (c.character_maximum_length) type += `(${c.character_maximum_length})`;
      let line = `  ${q(c.column_name)} ${type}`;
      if (c.column_default) line += ` DEFAULT ${c.column_default}`;
      if (c.is_nullable === 'NO') line += ' NOT NULL';
      return line;
    }).join(',\n');
    if (pkSet.size) ddl += `,\n  PRIMARY KEY (${[...pkSet].map(q).join(', ')})`;
    ddl += '\n);\n\n';
  }

  // Foreign keys (added after all tables so ordering doesn't matter)
  const { rows: fks } = await client.query(`
    SELECT conrelid::regclass AS tbl, pg_get_constraintdef(oid) AS def, conname
      FROM pg_constraint WHERE contype = 'f' AND connamespace = 'public'::regnamespace`);
  for (const fk of fks) {
    ddl += `ALTER TABLE ${fk.tbl} ADD CONSTRAINT ${q(fk.conname)} ${fk.def};\n`;
  }
  fs.writeFileSync(path.join(outDir, 'schema.sql'), ddl);
  console.log('Wrote schema.sql');

  // ---- RLS policies (reference only, to derive ownership rules) --------------
  const { rows: policies } = await client.query(`
    SELECT schemaname, tablename, policyname, cmd, qual, with_check, roles
      FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname`);
  fs.writeFileSync(path.join(outDir, 'rls-policies.json'), JSON.stringify(policies, null, 2));
  console.log(`Wrote rls-policies.json (${policies.length} policies)`);

  // ---- data -------------------------------------------------------------------
  let totalRows = 0;
  const counts = {};
  for (const { tablename } of tables) {
    const { rows } = await client.query(`SELECT * FROM ${q(tablename)}`);
    fs.writeFileSync(path.join(outDir, `data-${tablename}.json`), JSON.stringify(rows, null, 1));
    counts[tablename] = rows.length;
    totalRows += rows.length;
  }
  fs.writeFileSync(path.join(outDir, 'row-counts.json'), JSON.stringify(counts, null, 2));
  console.log(`Wrote data files: ${totalRows} rows total.`);
  console.table(counts);

  // ---- auth users (email + bcrypt hash so accounts keep working) -------------
  const { rows: users } = await client.query(`
    SELECT id, email, encrypted_password, email_confirmed_at, created_at,
           raw_user_meta_data
      FROM auth.users ORDER BY created_at`);
  fs.writeFileSync(path.join(outDir, 'auth-users.json'), JSON.stringify(users, null, 1));
  console.log(`Wrote auth-users.json (${users.length} accounts)`);

  await client.end();
  console.log('\nDone. Everything is in supabase-export/ — tell Claude it finished.');
}

main().catch((err) => { console.error('Export failed:', err.message); process.exit(1); });
