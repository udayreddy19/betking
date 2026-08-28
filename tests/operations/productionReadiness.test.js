import { describe, it, expect } from 'vitest';
import { getConfigurationHealth } from '../../lib/configHealthEngine.mjs';
import { buildProductionReadiness } from '../../lib/productionReadinessEngine.mjs';
import {
  KNOWN_TEST_FUNDING_USER_IDS,
  isKnownTestFundingUser,
  inspectKnownTestFundingAccounts,
} from '../../lib/knownTestFundingExclusions.mjs';

describe('production readiness engine', () => {
  it('never returns GREEN overall for production environment claim', async () => {
    const res = await buildProductionReadiness({ environment: 'production' });
    expect(res.isProductionClaim).toBe(true);
    expect(res.overall).not.toBe('GREEN');
    expect(['NOT VERIFIED', 'RED', 'YELLOW']).toContain(res.overall);
    expect(res.goNoGo.productionClaimAllowed).toBe(false);
    expect(res.gates?.length).toBeGreaterThan(10);
    expect(res.gates.some((g) => g.id === 'TEST_FUNDING_CLEANUP')).toBe(true);
    expect(res.gates.some((g) => g.id === 'PITR')).toBe(true);
  });

  it('lists known test funding exclusions', () => {
    expect(KNOWN_TEST_FUNDING_USER_IDS).toHaveLength(7);
    expect(isKnownTestFundingUser('faizu_26_08_2026_000014')).toBe(true);
    expect(isKnownTestFundingUser('random_user')).toBe(false);
  });

  it('inspectKnownTestFundingAccounts is read-only shaped', async () => {
    const snap = await inspectKnownTestFundingAccounts();
    expect(snap.policy).toBe('FLAG_ONLY_NO_AUTO_REPAIR');
    expect(snap.acceptance.autoRepair).toBe(false);
    expect(['TEST_FUNDING_CLEANUP_PENDING', 'TEST_FUNDING_CLEAN'].includes(snap.code)
      || snap.code === 'TEST_FUNDING_INSPECT_FAILED').toBe(true);
    expect(Array.isArray(snap.accounts)).toBe(true);
  });

  it('config health remains secret-safe', () => {
    const secret = 'prod-jwt-secret-value-that-must-not-leak!!';
    const h = getConfigurationHealth({
      NODE_ENV: 'production',
      JWT_SECRET: secret,
      DATABASE_URL: 'postgres://u:p@h/db',
      DEMO_MODE: '0',
      FRONTEND_URL: 'https://oddsyra.com',
      CORS_ORIGIN: 'https://oddsyra.com',
      SMTP_HOST: 'smtp',
      REDIS_URL: 'redis://x',
    });
    expect(JSON.stringify(h)).not.toContain(secret);
    expect(JSON.stringify(h)).not.toContain('u:p@');
  });
});
