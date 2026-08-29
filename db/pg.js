import { logger } from '../lib/logger.mjs';

let pgModule = null;
try {
  pgModule = (await import('pg')).default;
} catch {
  // pg package optional in unit test environments
}

try {
  const dotenv = (await import('dotenv')).default;
  dotenv.config();
} catch {
  // dotenv optional in unit test environments
}

class MockPool {
  constructor() {}
  on() {}
  async query() { return { rows: [], rowCount: 0 }; }
  async connect() {
    return {
      query: async () => ({ rows: [], rowCount: 0 }),
      release: () => {},
    };
  }
}

const Pool = pgModule?.Pool || MockPool;

const connectionString = process.env.DATABASE_URL || 'postgresql://oddsyra_app:oddsyra_dev_pass@127.0.0.1:5432/oddsyra';
const readConnectionString = process.env.DATABASE_READ_URL || connectionString;

export const pool = new Pool({
  connectionString,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export const readPool = readConnectionString === connectionString
  ? pool
  : new Pool({
    connectionString: readConnectionString,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

export function isReadReplicaConfigured() {
  return Boolean(process.env.DATABASE_READ_URL) && process.env.DATABASE_READ_URL !== connectionString;
}

pool.on('error', (err) => {
  logger.error('postgres_pool_error', { error: err?.message || err });
});

if (readPool !== pool) {
  readPool.on('error', (err) => {
    logger.error('postgres_read_pool_error', { error: err?.message || err });
  });
}

async function runQuery(targetPool, text, params) {
  const start = Date.now();
  try {
    const res = await targetPool.query(text, params);
    if (process.env.DEBUG_SQL) {
      logger.info('sql_query', { duration: Date.now() - start, rows: res.rowCount });
    }
    return res;
  } catch (err) {
    logger.error('sql_error', { error: err.message });
    throw err;
  }
}

/** Primary (writes + transactions). */
export async function query(text, params) {
  return runQuery(pool, text, params);
}

/** Replica when DATABASE_READ_URL is set; otherwise the primary. */
export async function queryRead(text, params) {
  try {
    return await runQuery(readPool, text, params);
  } catch (err) {
    if (readPool !== pool) {
      logger.warn('postgres_read_fallback_primary', { error: err.message });
      return runQuery(pool, text, params);
    }
    throw err;
  }
}

export async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('sql_transaction_rollback', { error: err.message });
    throw err;
  } finally {
    client.release();
  }
}

async function ping(targetPool, role) {
  try {
    const res = await targetPool.query('SELECT 1 AS healthy, NOW() as server_time');
    return {
      connected: true,
      role,
      serverTime: res.rows[0]?.server_time,
      database: process.env.POSTGRES_DB || 'oddsyra',
    };
  } catch (err) {
    return { connected: false, role, error: err.message };
  }
}

export async function checkPgHealth() {
  const primary = await ping(pool, 'primary');
  if (!isReadReplicaConfigured()) {
    return { ...primary, replicaConfigured: false };
  }
  const replica = await ping(readPool, 'replica');
  return {
    connected: primary.connected,
    replicaConfigured: true,
    replicaConnected: replica.connected,
    serverTime: primary.serverTime,
    database: primary.database,
    replica,
  };
}
