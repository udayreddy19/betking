/**
 * Catalog-first schema checks. ALTER/CREATE still take exclusive locks even
 * with IF NOT EXISTS — never call the mutators from inside an open money txn.
 */

import { query } from '../db/pg.js';

export async function publicTableExists(tableName) {
  const res = await query(
    `SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
    [tableName],
  );
  return res.rows.length > 0;
}

export async function publicColumnExists(tableName, columnName) {
  const res = await query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2 LIMIT 1`,
    [tableName, columnName],
  );
  return res.rows.length > 0;
}

export async function addColumnIfMissing(tableName, columnName, ddl) {
  if (await publicColumnExists(tableName, columnName)) return false;
  await query(ddl);
  return true;
}

export async function createTableIfMissing(tableName, ddl) {
  if (await publicTableExists(tableName)) return false;
  await query(ddl);
  return true;
}

/** Memoize a one-shot ensure; reset on failure so the next call retries. */
export function memoizeEnsure(fn) {
  let ready = null;
  return async function ensureOnce() {
    if (!ready) {
      ready = Promise.resolve()
        .then(fn)
        .catch((err) => {
          ready = null;
          throw err;
        });
    }
    try {
      await ready;
    } catch {
      // Migrations may already have applied the schema.
    }
  };
}
