import { describe, expect, it } from 'vitest';
import {
  allocateReadableUserId,
  formatReadableUserId,
  slugifyFirstName,
} from '../../lib/userIdFormat.mjs';

describe('readable user IDs', () => {
  it('formats firstname_DD_MM_YYYY_sequence', () => {
    const date = new Date('2026-08-28T08:00:00+05:30');
    expect(formatReadableUserId('Uday', 1, date)).toBe('uday_28_08_2026_000001');
    expect(formatReadableUserId('FirstName', 2, date)).toBe('firstname_28_08_2026_000002');
  });

  it('slugifies names', () => {
    expect(slugifyFirstName('Uday')).toBe('uday');
    expect(slugifyFirstName('  Mary-Anne  ')).toBe('maryanne');
    expect(slugifyFirstName('')).toBe('user');
  });

  it('allocates from postgres sequence', async () => {
    const queryFn = async (sql) => {
      if (sql.includes('nextval')) return { rows: [{ n: 7 }] };
      return { rows: [] };
    };
    const id = await allocateReadableUserId(queryFn, 'Uday', new Date('2026-08-28T08:00:00+05:30'));
    expect(id).toBe('uday_28_08_2026_000007');
  });
});
