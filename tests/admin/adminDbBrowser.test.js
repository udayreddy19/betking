import { describe, expect, it } from 'vitest';
import { getTableRowEstimate } from '../../lib/adminDbBrowser.mjs';
import { isPostgresBusyError } from '../../db/pg.js';

describe('admin database console helpers', () => {
  it('reads pg_class reltuples instead of COUNT(*)', async () => {
    const query = async (sql, params) => {
      expect(sql).toMatch(/reltuples/);
      expect(params).toEqual(['bets']);
      return { rows: [{ estimate: '1842' }] };
    };
    await expect(getTableRowEstimate(query, 'bets')).resolves.toBe(1842);
  });

  it('treats pool and statement timeouts as busy', () => {
    expect(isPostgresBusyError({ code: '57014', message: 'canceling statement due to statement timeout' })).toBe(true);
    expect(isPostgresBusyError({ message: 'timeout exceeded when trying to connect' })).toBe(true);
    expect(isPostgresBusyError({ message: 'syntax error' })).toBe(false);
  });
});
