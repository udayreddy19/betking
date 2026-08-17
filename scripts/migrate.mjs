import fs from 'fs';
import path from 'path';
import { pool, withTransaction } from '../db/pg.js';
import dotenv from 'dotenv';

dotenv.config();

const MIGRATIONS_DIR = path.join(process.cwd(), 'migrations');

async function runMigrations() {
  console.log('🚀 INITIALIZING ODDSYRA POSTGRESQL MIGRATION RUNNER...');

  const client = await pool.connect();
  try {
    // 1. Create migrations tracking table
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Fetch applied migrations
    const res = await client.query('SELECT version FROM schema_migrations ORDER BY version ASC');
    const appliedVersions = new Set(res.rows.map((r) => r.version));

    // 3. Read migration files
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    console.log(`📁 Found ${files.length} migration file(s) in /migrations`);

    for (const file of files) {
      if (appliedVersions.has(file)) {
        console.log(`   ⏭️  Skipping migration ${file} (Already Applied)`);
        continue;
      }

      console.log(`   ⏳ Applying migration ${file}...`);
      const filePath = path.join(MIGRATIONS_DIR, file);
      const sql = fs.readFileSync(filePath, 'utf-8');

      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
      await client.query('COMMIT');

      console.log(`   ✅ Successfully applied ${file}`);
    }

    console.log('🎉 ALL DATABASE MIGRATIONS EXECUTED SUCCESSFULLY!\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ MIGRATION EXECUTION FAILED:', err.message);
    process.exit(1);
  } finally {
    client.release();
  }
}

runMigrations();
