const pg = require('pg');
(async () => {
  const c = new pg.Client({ connectionString: process.env.NEON_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  for (const t of ['app_users', 'app_sessions', 'datasets', 'sandbox_scale_projects', 'forum_posts', 'notifications']) {
    const { rows } = await c.query(`
      SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
       WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [t]);
    console.log(`\n== ${t} ==`);
    rows.forEach((r) => console.log(`  ${r.column_name} ${r.data_type}${r.is_nullable === 'NO' ? ' NOT NULL' : ''}${r.column_default ? ' DEFAULT ' + r.column_default : ''}`));
  }
  const { rows: fks } = await c.query(`
    SELECT conrelid::regclass AS tbl, pg_get_constraintdef(oid) AS def
      FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace ORDER BY 1`);
  console.log('\n== Foreign keys ==');
  fks.forEach((r) => console.log(`  ${r.tbl}: ${r.def}`));
  await c.end();
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
