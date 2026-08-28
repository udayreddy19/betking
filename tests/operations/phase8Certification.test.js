import { describe, it, expect } from 'vitest';
import {
  buildProductionCertification,
  MANDATORY_PRODUCTION_GATES,
  mapReadinessToCertStatus,
} from '../../lib/productionCertificationEngine.mjs';
import { mapReadinessToCertStatus as map2 } from '../../lib/certificationEvidence.mjs';

describe('Phase 8 production certification', () => {
  it('maps readiness statuses honestly', () => {
    expect(mapReadinessToCertStatus('GREEN')).toBe('PASS');
    expect(mapReadinessToCertStatus('RED')).toBe('FAIL');
    expect(mapReadinessToCertStatus('NOT VERIFIED')).toBe('NOT_VERIFIED');
    expect(mapReadinessToCertStatus('YELLOW')).toBe('NOT_VERIFIED');
    expect(mapReadinessToCertStatus('OUT OF SCOPE')).toBe('OUT_OF_SCOPE');
    expect(map2('BLOCKED')).toBe('BLOCKED');
  });

  it('never allows productionClaimAllowed without all mandatory PASS', async () => {
    const cert = await buildProductionCertification({ environment: 'production' });
    expect(cert.PRODUCTION_CERTIFICATION_STATUS).not.toBe('GREEN');
    expect(['NO-GO', 'RED', 'NOT_VERIFIED', 'YELLOW']).toContain(cert.PRODUCTION_CERTIFICATION_STATUS);
    expect(cert.goNoGo.forceGreenAllowed === false || cert.goNoGo.forceGreenAllowed == null).toBe(true);
    expect(cert.goNoGo.productionClaimAllowed).toBe(false);
    expect(cert.goNoGo.decision).toBe('NO-GO');
    expect(cert.goNoGo.mandatoryBlockers.length).toBeGreaterThan(0);
    expect(cert.autoRepair).toBe(false);
    expect(MANDATORY_PRODUCTION_GATES).toContain('PITR');
    expect(MANDATORY_PRODUCTION_GATES).toContain('MFA');
    expect(MANDATORY_PRODUCTION_GATES).toContain('TEST_FUNDING');
  });

  it('NOT_VERIFIED mandatory gates block production', async () => {
    const cert = await buildProductionCertification({ environment: 'production' });
    const mfa = cert.gates.find((g) => g.name === 'MFA');
    expect(mfa).toBeTruthy();
    expect(['NOT_VERIFIED', 'BLOCKED', 'FAIL']).toContain(mfa.status);
    expect(cert.goNoGo.mandatoryBlockers.some((b) => b.startsWith('MFA:'))).toBe(true);
    expect(cert.goNoGo.mandatoryBlockers.some((b) => b.startsWith('PITR:'))).toBe(true);
    expect(cert.goNoGo.mandatoryBlockers.some((b) => b.startsWith('PRODUCTION_SMOKE:'))).toBe(true);
  });

  it('staging also cannot claim without evidence', async () => {
    const cert = await buildProductionCertification({ environment: 'staging' });
    expect(cert.goNoGo.stagingClaimAllowed).toBe(false);
    expect(cert.goNoGo.decision).toBe('NO-GO');
  });

  it('does not invent PASS for payments — OUT_OF_SCOPE preserved', async () => {
    const cert = await buildProductionCertification({ environment: 'local' });
    const pay = cert.gates.find((g) => g.name === 'PAYMENTS');
    if (pay) expect(pay.status).toBe('OUT_OF_SCOPE');
  });
});
