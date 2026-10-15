/**
 * Read-only SQL console for admin Database Tables view.
 * Allows SELECT, WITH … SELECT, and EXPLAIN (optionally ANALYZE) only.
 */

const FORBIDDEN_PATTERN = /\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|REPLACE|GRANT|REVOKE|COPY|\bINTO\b|CALL|DO|MERGE|VACUUM|REINDEX|CLUSTER|REFRESH|COMMENT|BEGIN|COMMIT|ROLLBACK|SAVEPOINT|LOCK|DISCARD|LISTEN|NOTIFY|LOAD|SECURITY|SET\s|RESET|PREPARE|EXECUTE|DEALLOCATE|FETCH|MOVE|CLOSE|DECLARE|CURSOR)\b/i;

const DANGEROUS_PG_FUNCTIONS_PATTERN = /\b(pg_read_file|pg_read_binary_file|pg_ls_dir|pg_stat_file|lo_import|lo_export|lo_create|lo_open|dblink|dblink_exec|copy\s+.*program|program\s+['"]|c_create|c_destroy|pg_sleep|pg_terminate_backend|pg_cancel_backend|pg_catalog\.(pg_write|pg_file)|set_config)\b/i;

const SELECT_INTO_PATTERN = /\bSELECT\b[\s\S]*\bINTO\b/i;
const EXPLAIN_ANALYZE_MUTATING = /\bEXPLAIN\s+(?:\([^)]*\)\s*)?ANALYZE\b/i;

/** Per-admin rate limit: max runs per window. */
const SQL_RATE_LIMIT = new Map();
const SQL_RATE_WINDOW_MS = 60_000;
const SQL_RATE_MAX = 30;

const ALLOWED_START = /^(SELECT|WITH|EXPLAIN)\b/is;

export const MAX_SQL_ROWS = 500;

export function validateReadOnlySql(raw) {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) {
    const err = new Error('Enter a SQL statement');
    err.status = 400;
    err.code = 'EMPTY_SQL';
    throw err;
  }

  if (trimmed.includes('\0') || /\\/.test(trimmed)) {
    const err = new Error('Invalid or unsupported SQL input');
    err.status = 400;
    err.code = 'INVALID_SQL';
    throw err;
  }

  let sql = trimmed;
  if (sql.endsWith(';')) {
    sql = sql.slice(0, -1).trim();
  }
  if (sql.includes(';')) {
    const err = new Error('Only one statement per run is allowed');
    err.status = 400;
    err.code = 'MULTI_STATEMENT';
    throw err;
  }

  if (FORBIDDEN_PATTERN.test(sql) || SELECT_INTO_PATTERN.test(sql)) {
    const err = new Error('Write operations and DDL are not allowed in the SQL console');
    err.status = 403;
    err.code = 'SQL_FORBIDDEN';
    throw err;
  }

  if (EXPLAIN_ANALYZE_MUTATING.test(sql) && FORBIDDEN_PATTERN.test(sql.replace(EXPLAIN_ANALYZE_MUTATING, ''))) {
    const err = new Error('EXPLAIN ANALYZE of mutating statements is blocked');
    err.status = 403;
    err.code = 'SQL_FORBIDDEN';
    throw err;
  }

  if (DANGEROUS_PG_FUNCTIONS_PATTERN.test(sql)) {
    const err = new Error('Dangerous PostgreSQL administrative or filesystem functions are blocked');
    err.status = 403;
    err.code = 'SQL_DANGEROUS_BLOCKED';
    throw err;
  }

  if (!ALLOWED_START.test(sql)) {
    const err = new Error('Only SELECT, WITH … SELECT, and EXPLAIN queries are allowed');
    err.status = 400;
    err.code = 'SQL_NOT_ALLOWED';
    throw err;
  }

  if (/^\s*WITH\b/is.test(sql) && FORBIDDEN_PATTERN.test(sql.replace(/^\s*WITH\b/is, ''))) {
    const err = new Error('CTE queries must be read-only');
    err.status = 403;
    err.code = 'SQL_FORBIDDEN';
    throw err;
  }

  return sql;
}

export function fieldsFromResult(result) {
  if (!result?.fields?.length) return [];
  return result.fields.map((f) => ({
    name: f.name,
    dataTypeId: f.dataTypeID,
  }));
}

export function rowsFromResult(result, maxRows = MAX_SQL_ROWS) {
  const rows = result?.rows ?? [];
  if (rows.length <= maxRows) {
    return { rows, truncated: false };
  }
  return { rows: rows.slice(0, maxRows), truncated: true };
}

/** Append LIMIT for SELECT/WITH when missing so large tables cannot OOM the console. */
export function sqlWithRowCap(validatedSql, maxRows = MAX_SQL_ROWS) {
  if (/^\s*EXPLAIN\b/is.test(validatedSql)) return validatedSql;
  if (/\bLIMIT\s+\d+/i.test(validatedSql)) return validatedSql;
  return `${validatedSql} LIMIT ${maxRows + 1}`;
}

/** Session GUCs for read-only console (applied per query when supported). */
export const SQL_CONSOLE_SESSION_GUCS = Object.freeze([
  'SET LOCAL default_transaction_read_only = on',
  'SET LOCAL statement_timeout = 15000',
]);

export function assertSqlConsoleRateLimit(adminId) {
  const key = String(adminId || 'anon');
  const now = Date.now();
  const bucket = SQL_RATE_LIMIT.get(key) || { count: 0, window: now };
  if (now - bucket.window > SQL_RATE_WINDOW_MS) {
    bucket.count = 0;
    bucket.window = now;
  }
  bucket.count += 1;
  SQL_RATE_LIMIT.set(key, bucket);
  if (bucket.count > SQL_RATE_MAX) {
    const err = new Error('SQL console rate limit exceeded — retry in a minute');
    err.status = 429;
    err.code = 'SQL_RATE_LIMIT';
    throw err;
  }
  return { remaining: Math.max(0, SQL_RATE_MAX - bucket.count) };
}
