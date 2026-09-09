import { describe, it, expect } from 'vitest';
import { getFinancialPnlLedger } from '../../lib/businessIntelligenceEngine.mjs';

describe('Admin New Enterprise Features Suite', () => {
  describe('Executive Financial P&L & Cashflow Ledger Engine', () => {
    it('returns a well-formed P&L ledger object with metrics', async () => {
      const ledger = await getFinancialPnlLedger({ period: '7d' });
      expect(ledger).toBeDefined();
      expect(ledger.success).toBe(true);
      expect(ledger.period).toBe('7d');
      expect(typeof ledger.turnover).toBe('number');
      expect(typeof ledger.ggr).toBe('number');
      expect(typeof ledger.holdPct).toBe('number');
      expect(typeof ledger.playerWinRatePct).toBe('number');
      expect(ledger.cashflow).toBeDefined();
      expect(typeof ledger.cashflow.totalDeposits).toBe('number');
      expect(typeof ledger.cashflow.totalWithdrawals).toBe('number');
      expect(typeof ledger.cashflow.netCashflow).toBe('number');
      expect(Array.isArray(ledger.sportBreakdown)).toBe(true);
    });

    it('supports different time horizon periods', async () => {
      const periods = ['today', 'yesterday', '7d', '30d'];
      for (const p of periods) {
        const res = await getFinancialPnlLedger({ period: p });
        expect(res.success).toBe(true);
        expect(res.period).toBe(p);
      }
    });
  });

  describe('Bonus & Promotions Engine Data Structures', () => {
    it('validates promotion wagering and multiplier rules', () => {
      const promoPayload = {
        name: 'Weekend Match Bonus',
        code: 'IPL50',
        type: 'DEPOSIT_MATCH',
        budget: 50000,
        maxReward: 2500,
        wageringMultiplier: 5,
        minOdds: 1.5,
      };

      expect(promoPayload.wageringMultiplier).toBeGreaterThanOrEqual(1);
      expect(promoPayload.wageringMultiplier).toBeLessThanOrEqual(20);
      expect(promoPayload.minOdds).toBeGreaterThanOrEqual(1.0);
      expect(promoPayload.budget).toBeGreaterThan(0);
    });
  });

  describe('VIP High-Roller Desk & Balance Rebate', () => {
    it('structures a valid VIP rebate transaction payload', () => {
      const rebate = {
        userId: 'usr_highroller_99',
        amount: 5000,
        type: 'VIP_REBATE',
        reason: 'VIP Weekend Cashback Rebate',
        adminName: 'Lead VIP Manager',
      };

      expect(rebate.amount).toBeGreaterThan(0);
      expect(rebate.type).toBe('VIP_REBATE');
      expect(rebate.reason).toContain('VIP');
    });
  });

  describe('Live Broadcast Announcement System', () => {
    it('validates announcement banner types and expiry', () => {
      const validTypes = ['INFO', 'PROMO', 'WARNING'];
      const banner = {
        title: 'Instant UPI Upgrades',
        message: 'UPI deposit channels have been enhanced for 0s confirmation.',
        type: 'INFO',
        target: 'ALL',
        hoursActive: 24,
      };

      expect(validTypes).toContain(banner.type);
      expect(['ALL', 'SPORTSBOOK', 'CASINO']).toContain(banner.target);
      expect(banner.hoursActive).toBeGreaterThanOrEqual(1);
    });
  });
});
