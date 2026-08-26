import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminCanViewFullPii, PII_ROLES } from '../../server/routes/admin/customerDossier.js';
import { ADMIN_ROLES } from '../../server/middleware/adminAuth.js';

vi.mock('../../db/pg.js', () => {
  const query = vi.fn(async (sql) => {
    const s = String(sql);
    if (s.includes('FROM users u')) {
      return {
        rows: [{
          user_id: 'usr_test_1',
          email: 'test@oddsyra.com',
          phone: '9876543210',
          first_name: 'Test',
          last_name: 'User',
          country: 'IN',
          currency: 'INR',
          role: 'user',
          user_status: 'ACTIVE',
          email_verified_at: null,
          phone_verified_at: null,
          last_login_at: null,
          created_at: new Date('2026-01-01'),
          display_name: 'Test User',
          date_of_birth: '1995-05-05',
          kyc_status: 'VERIFIED',
          risk_tier: 'LOW',
          account_status: 'ACTIVE',
          lifetime_value: 1000,
        }],
      };
    }
    if (s.includes('FROM wallets')) {
      return { rows: [{ wallet_id: 'w1', balance: 500, bonus_balance: 50, reserved_balance: 0, currency: 'INR', updated_at: new Date() }] };
    }
    if (s.includes('FROM kyc_cases')) {
      return { rows: [{ case_id: 'kyc1', status: 'VERIFIED', pan_number: 'ABCDE1234F', aadhaar_number: '123456789012', reviewed_by: 'admin', updated_at: new Date() }] };
    }
    if (s.includes('FROM transactions WHERE user_id') && s.includes('SUM')) {
      return { rows: [{ total_deposited: 2000, deposit_count: 2, total_withdrawn: 200, withdrawal_count: 1, pending_withdrawal_amount: 0, total_stake_tx: 100 }] };
    }
    if (s.includes('FROM deposits')) return { rows: [{ total: 2000, cnt: 2 }] };
    if (s.includes('FROM withdrawals')) return { rows: [{ total: 200, cnt: 1, pending: 0 }] };
    if (s.includes('FROM bets WHERE user_id') && s.includes('COUNT')) {
      return { rows: [{ total_bets: 3, total_stake: 300, total_won_payout: 150, won_bets: 1, lost_bets: 1, void_bets: 0, open_bets: 1, cashed_out_bets: 0 }] };
    }
    if (s.includes('FROM bets WHERE user_id')) {
      return { rows: [{ bet_id: 'bet_1', match_id: 'm1', stake: 100, odds: 1.5, potential_payout: 150, status: 'WON', created_at: new Date() }] };
    }
    if (s.includes('FROM transactions WHERE user_id') && s.includes('ORDER BY')) {
      return { rows: [{ transaction_id: 'tx1', type: 'DEPOSIT', method: 'UPI', utr: null, amount: 1000, status: 'SUCCESS', created_at: new Date() }] };
    }
    if (s.includes('FROM support_conversations')) {
      return { rows: [{ id: 'conv1', subject: 'Help', category: 'General', priority: 'MEDIUM', status: 'OPEN', agent: 'Unassigned', created_at: '2026-01-02 10:00' }] };
    }
    if (s.includes('FROM audit_events')) {
      return { rows: [{ event_id: 1, actor_id: 'admin', action: 'ACCOUNT_RESTRICTED', details: {}, created_at: new Date() }] };
    }
    if (s.includes('FROM notifications')) {
      return { rows: [{ id: 'n1', event_type: 'DEPOSIT_SUCCESSFUL', category: 'TRANSACTIONAL', channel: 'IN_APP', subject: 'Deposit', status: 'SENT', created_at: new Date(), is_read: true }] };
    }
    if (s.includes('FROM referrals')) {
      return { rows: [{ referred_out: 2, referred_in: 0, qualified_out: 1 }] };
    }
    if (s.includes('FROM referral_codes')) {
      return { rows: [{ code: 'TESTREF' }] };
    }
    if (s.includes('FROM ledger_entries')) {
      return { rows: [{ type: 'CREDIT', amount: 500 }, { type: 'DEBIT', amount: 0 }] };
    }
    return { rows: [] };
  });
  return { query, withTransaction: async (fn) => fn({ query }) };
});

vi.mock('../../lib/kycEngine.mjs', () => ({
  maskPan: (p) => `XXXXXX${String(p).slice(-4)}`,
  maskAadhaar: (a) => `XXXXXXXX${String(a).slice(-4)}`,
}));

describe('Admin customer dossier 360', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('adminCanViewFullPii allows compliance roles only', () => {
    expect(adminCanViewFullPii({ role: ADMIN_ROLES.SUPER_ADMIN })).toBe(true);
    expect(adminCanViewFullPii({ role: ADMIN_ROLES.SUPPORT_AGENT })).toBe(true);
    expect(adminCanViewFullPii({ role: ADMIN_ROLES.RISK_ANALYST })).toBe(true);
    expect(adminCanViewFullPii({ role: ADMIN_ROLES.FINANCE_ADMIN })).toBe(false);
    expect(adminCanViewFullPii({ role: ADMIN_ROLES.MARKETING_ADMIN })).toBe(false);
    expect(PII_ROLES.has('SUPPORT_AGENT')).toBe(true);
  });

  it('getUser360View returns aggregates and masks PII when not allowed', async () => {
    const { getUser360View } = await import('../../lib/adminIntelligenceEngine.mjs');
    const data = await getUser360View('usr_test_1', { canViewFullPii: false });
    expect(data.success).toBe(true);
    expect(data.user.email).toBe('test@oddsyra.com');
    expect(data.money.totalDeposited).toBe(2000);
    expect(data.betting.totalBets).toBe(3);
    expect(data.ticketsCount).toBe(1);
    expect(data.referrals.code).toBe('TESTREF');
    expect(data.notificationsCount).toBe(1);
    expect(data.auditTrail.length).toBeGreaterThan(0);
    expect(data.kyc.panMasked).toContain('234F');
    expect(data.kyc.panNumber).toBeNull();
    expect(data.permissions.canViewFullPii).toBe(false);
    expect(data.reconciliation?.isReconciled).toBe(true);
  });

  it('getUser360View includes full PII when allowed', async () => {
    const { getUser360View } = await import('../../lib/adminIntelligenceEngine.mjs');
    const data = await getUser360View('usr_test_1', { canViewFullPii: true });
    expect(data.kyc.panNumber).toBe('ABCDE1234F');
    expect(data.kyc.aadhaarNumber).toBe('123456789012');
    expect(data.permissions.canViewFullPii).toBe(true);
  });
});
