import { describe, expect, it } from 'vitest';
import { validateReadOnlySql, sqlWithRowCap, MAX_SQL_ROWS } from '../../lib/adminSqlConsole.mjs';

describe('adminSqlConsole', () => {
  it('accepts SELECT and strips trailing semicolon', () => {
    expect(validateReadOnlySql('SELECT 1;')).toBe('SELECT 1');
  });

  it('rejects empty and multi-statement input', () => {
    expect(() => validateReadOnlySql('')).toThrow(/Enter a SQL statement/);
    expect(() => validateReadOnlySql('SELECT 1; SELECT 2')).toThrow(/one statement/);
  });

  it('rejects write operations', () => {
    expect(() => validateReadOnlySql('DELETE FROM users')).toThrow(/not allowed/);
  });

  it('appends LIMIT when missing on SELECT', () => {
    const capped = sqlWithRowCap('SELECT * FROM users');
    expect(capped).toBe(`SELECT * FROM users LIMIT ${MAX_SQL_ROWS + 1}`);
  });

  it('leaves EXPLAIN unchanged', () => {
    expect(sqlWithRowCap('EXPLAIN SELECT 1')).toBe('EXPLAIN SELECT 1');
  });
});
