// One-time Neon adjustments after adopting the Bolt-generated schema:
// rename auth tables to what server/ expects, add the scrypt salt column,
// and the unique indexes the backend relies on.
//   node scripts/neon-setup.mjs   (DATABASE_URL from .env)
import pg from 'pg';
import fs from 'node:fs';

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
const client = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const statements = [
  `DO $$ BEGIN
     IF EXISTS (SELECT FROM pg_tables WHERE schemaname='public' AND tablename='app_users') THEN
       ALTER TABLE app_users RENAME TO users;
     END IF;
   END $$`,
  `DO $$ BEGIN
     IF EXISTS (SELECT FROM pg_tables WHERE schemaname='public' AND tablename='app_sessions') THEN
       ALTER TABLE app_sessions RENAME TO sessions;
     END IF;
   END $$`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS password_salt text`,
  `CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key ON users (lower(email))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_key ON sessions (token)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS unp_user_key ON user_notification_preferences (user_id)`,
];

const client2 = client;
await client2.connect();
for (const sql of statements) {
  await client2.query(sql);
  console.log('OK:', sql.split('\n')[0].trim().slice(0, 70));
}
const { rows } = await client2.query(
  "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('users','sessions') ORDER BY 1");
console.log('Auth tables now:', rows.map((r) => r.tablename).join(', '));
await client2.end();
