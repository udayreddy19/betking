import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { ageFromDob, MIN_LEGAL_AGE, shouldEnforceKycAge } from '../../lib/kycAgeGate.mjs';
import {
  isRealityCheckDue,
  netCashLossFromTotals,
  istPeriodStart,
} from '../../lib/responsibleGaming.mjs';

describe('Sprint 5 KYC age gate', () => {
  it('treats under-18 as ineligible and 18+ as eligible', () => {
    const now = new Date('2026-08-19T00:00:00Z');
    expect(ageFromDob('2010-08-19', now)).toBeLessThan(MIN_LEGAL_AGE);
    expect(ageFromDob('2008-08-19', now)).toBe(18);
    expect(ageFromDob(null, now)).toBeNull();
  });

  it('skips the cash KYC gate in default vitest runs', () => {
    expect(shouldEnforceKycAge()).toBe(false);
  });
});

describe('Sprint 5 loss limits and reality checks', () => {
  it('computes net cash loss as staked minus returns, never negative', () => {
    expect(netCashLossFromTotals(1000, 400)).toBe(600);
    expect(netCashLossFromTotals(1000, 1500)).toBe(0);
  });

  it('marks a reality check due only after the interval from last ack', () => {
    const now = Date.parse('2026-08-19T12:00:00Z');
    expect(isRealityCheckDue({
      lastAckAt: '2026-08-19T11:00:00Z',
      intervalMins: 60,
      now,
    })).toBe(true);
    expect(isRealityCheckDue({
      lastAckAt: '2026-08-19T11:01:00Z',
      intervalMins: 60,
      now,
    })).toBe(false);
  });

  it('uses IST day/week starts', () => {
    const wed = new Date('2026-08-19T10:00:00Z');
    const day = istPeriodStart('day', wed);
    const week = istPeriodStart('week', wed);
    expect(Date.parse(week)).toBeLessThanOrEqual(Date.parse(day));
  });
});

describe('Sprint 5 wiring', () => {
  it('enforces KYC age on withdrawals only (not cash bets or deposits), and RG on deposit and bet placement', () => {
    const place = fs.readFileSync(path.resolve(process.cwd(), 'lib/betPlacementEngine.mjs'), 'utf8');
    expect(place).not.toContain('assertRealMoneyKycAge');
    expect(place).toContain('validateBetPlacementAttempt');

    const deposit = fs.readFileSync(path.resolve(process.cwd(), 'lib/depositEngine.mjs'), 'utf8');
    expect(deposit).not.toContain('assertRealMoneyKycAge');
    expect(deposit).toContain('validateDepositAttempt');

    const withdraw = fs.readFileSync(path.resolve(process.cwd(), 'lib/withdrawalEngine.mjs'), 'utf8');
    expect(withdraw).toContain('assertRealMoneyKycAge');
    expect(withdraw).toContain('requireVerifiedIdentity');

    const auth = fs.readFileSync(path.resolve(process.cwd(), 'server/auth/authService.js'), 'utf8');
    expect(auth).toContain('startSession');

    const ui = fs.readFileSync(path.resolve(process.cwd(), 'src/App.jsx'), 'utf8');
    expect(ui).toContain('RealityCheckModal');
  });
});
