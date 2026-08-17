import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL || 'postgresql://oddsyra_app:oddsyra_dev_pass@127.0.0.1:5432/oddsyra';

export const pool = new Pool({
  connectionString,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[PostgreSQL Pool Error]', err.message);
});

/**
 * Execute SQL Query against PostgreSQL Pool
 */
export async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.DEBUG_SQL) {
      console.log('[SQL Query]', { text, duration, rows: res.rowCount });
    }
    return res;
  } catch (err) {
    console.error('[SQL Error]', { text, error: err.message });
    throw err;
  }
}

/**
 * Execute Atomic Transaction Wrapper
 * BEGIN -> execute callback -> COMMIT or ROLLBACK on exception
 */
export async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Transaction Rollback Triggered]', err.message);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Health Check helper verifying PostgreSQL connectivity
 */
export async function checkPgHealth() {
  try {
    const res = await pool.query('SELECT 1 AS healthy, NOW() as server_time');
    return {
      connected: true,
      serverTime: res.rows[0]?.server_time,
      database: process.env.POSTGRES_DB || 'oddsyra',
    };
  } catch (err) {
    return {
      connected: false,
      error: err.message,
    };
  }
}
