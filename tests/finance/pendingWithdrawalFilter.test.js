import { describe, it, expect } from 'vitest';
import { listPendingWithdrawals } from '../../lib/adminDomainData.mjs';

describe('admin pending withdrawal queue', () => {
  it('includes PENDING_REVIEW in the status filter', () => {
    expect(listPendingWithdrawals.toString()).toContain('PENDING_REVIEW');
  });
});
