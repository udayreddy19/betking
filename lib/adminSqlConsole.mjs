/**
 * Read-only SQL console for admin Database Tables view.
 * Allows SELECT, WITH … SELECT, and EXPLAIN (optionally ANALYZE) only.
 */

const FORBIDDEN_PATTERN = /\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|REPLACE|GRANT|REVOKE|COPY|\bINTO\b|CALL|DO|MERGE|VACUUM|REINDEX|CLUSTER|REFRESH|COMMENT|BEGIN|COMMIT|ROLLBACK|SAVEPOINT|LOCK|DISCARD|LISTEN|NOTIFY|LOAD|SECURITY|SET\s|RESET|PREPARE|EXECUTE|DEALLOCATE|FETCH|MOVE|CLOSE|DECLARE|CURSOR)\b/i;

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

  if (FORBIDDEN_PATTERN.test(sql)) {
    const err = new Error('Write operations and DDL are not allowed in the SQL console');
    err.status = 403;
    err.code = 'SQL_FORBIDDEN';
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
