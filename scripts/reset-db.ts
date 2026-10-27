import { Client } from 'pg';
import { env } from '../src/config/env';
import { pool } from '../src/db/client';
import { runMigrations } from '../src/db/migrate';

async function main(): Promise<void> {
  const url = new URL(env.DATABASE_URL);
  const dbName = url.pathname.replace(/^\//, '');
  url.pathname = '/postgres';

  const admin = new Client({ connectionString: url.toString() });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${dbName}"`);
  await admin.end();

  await runMigrations(pool);
  console.log(`database ${dbName} reset and migrated`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
