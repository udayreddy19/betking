/**
 * Shared helpers for admin DB table browser / editor.
 */

export const HIDDEN_COLUMNS = new Set([
  'password_hash',
  'password',
  'refresh_token_hash',
  'refresh_token',
  'token_hash',
  'key_hash',
  'api_key',
  'api_key_hash',
  'secret_ciphertext',
  'secret_iv',
  'secret_tag',
  'totp_secret',
  'mfa_secret',
  'backup_codes',
  'backup_code_hash',
  'pan_number',
  'aadhaar_number',
  'bank_account_number',
  'ifsc',
]);

export const READONLY_COLUMNS = new Set([
  ...HIDDEN_COLUMNS,
  'created_at',
  'enrolled_at',
]);

/** Tables that cannot be deleted via the admin browser (schema / infra). */
export const DELETE_BLOCKED_TABLES = new Set([
  'schema_migrations',
  'pg_stat_statements',
]);

export function assertTableDeletable(tableName) {
  if (DELETE_BLOCKED_TABLES.has(String(tableName || ''))) {
    const err = new Error(`Deletes are blocked for table "${tableName}".`);
    err.status = 403;
    err.code = 'DELETE_BLOCKED';
    throw err;
  }
}

export function isSafeIdent(name) {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(String(name || ''));
}

export async function assertPublicTable(query, tableName) {
  if (!isSafeIdent(tableName)) {
    const err = new Error('Invalid table name');
    err.status = 400;
    err.code = 'INVALID_TABLE';
    throw err;
  }
  const exists = await query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
    [tableName],
  );
  if (!exists.rows.length) {
    const err = new Error('Table not found');
    err.status = 404;
    err.code = 'TABLE_NOT_FOUND';
    throw err;
  }
}

export async function getTableColumns(query, tableName) {
  const colsRes = await query(
    `SELECT column_name, data_type, is_nullable
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position ASC`,
    [tableName],
  );
  return colsRes.rows.map((col) => ({
    column_name: col.column_name,
    data_type: col.data_type,
    is_nullable: col.is_nullable === 'YES',
    hidden: HIDDEN_COLUMNS.has(col.column_name),
    editable: !READONLY_COLUMNS.has(col.column_name),
  }));
}

export async function getPrimaryKeyColumns(query, tableName) {
  const pkRes = await query(
    `SELECT kcu.column_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
     WHERE tc.table_schema = 'public'
       AND tc.table_name = $1
       AND tc.constraint_type = 'PRIMARY KEY'
     ORDER BY kcu.ordinal_position ASC`,
    [tableName],
  );
  return pkRes.rows.map((r) => r.column_name);
}

export function coerceCellValue(raw, dataType) {
  if (raw === null || raw === undefined || raw === '') {
    return null;
  }
  const type = String(dataType || '').toLowerCase();
  if (type.includes('bool')) {
    if (typeof raw === 'boolean') return raw;
    const s = String(raw).trim().toLowerCase();
    if (['true', 't', '1', 'yes'].includes(s)) return true;
    if (['false', 'f', '0', 'no'].includes(s)) return false;
    throw Object.assign(new Error(`Invalid boolean: ${raw}`), { status: 400 });
  }
  if (type.includes('int') || type === 'numeric' || type.includes('decimal') || type.includes('real') || type.includes('double')) {
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      throw Object.assign(new Error(`Invalid number: ${raw}`), { status: 400 });
    }
    return n;
  }
  if (type.includes('json')) {
    if (typeof raw === 'object') return raw;
    return JSON.parse(String(raw));
  }
  return String(raw);
}
