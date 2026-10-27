import { Client, Pool } from 'pg';
import { runMigrations } from '../src/db/migrate';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://trustcircle:trustcircle@localhost:5433/trustcircle_test';

export default async function setup(): Promise<void> {
  const url = new URL(TEST_DATABASE_URL);
  const dbName = url.pathname.replace(/^\//, '');
  url.pathname = '/postgres';

  const admin = new Client({ connectionString: url.toString() });
  await admin.connect();
  const { rows } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
  if (rows.length === 0) {
    await admin.query(`CREATE DATABASE "${dbName}"`);
  }
  await admin.end();

  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  try {
    await runMigrations(pool, () => {});
  } finally {
    await pool.end();
  }
}
