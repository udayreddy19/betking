import { describe, it, expect } from 'vitest';
import {
  buildProductionCertification,
  MANDATORY_PRODUCTION_GATES,
  evidenceMatchesClaim,
  DB_BOUND_GATES,
} from '../../lib/productionCertificationEngine.mjs';
import { writePhase9Evidence, evidenceMatchesClaim as match2 } from '../../lib/certificationEvidence.mjs';

describe('Phase 9 production go-live certification', () => {
  it('local evidence never matches production claim', () => {
    expect(evidenceMatchesClaim('local', 'production')).toBe(false);
    expect(evidenceMatchesClaim('staging', 'production')).toBe(false);
    expect(evidenceMatchesClaim('production', 'production')).toBe(true);
    expect(match2('local', 'staging')).toBe(false);
  });

  it('production claim is never GREEN and never force-allowed', async () => {
    const cert = await buildProductionCertification({ environment: 'production' });
    expect(cert.PRODUCTION_CERTIFICATION_STATUS).not.toBe('GREEN');
    expect(['NO-GO', 'RED', 'NOT_VERIFIED', 'YELLOW']).toContain(cert.PRODUCTION_CERTIFICATION_STATUS);
    expect(cert.productionClaimAllowed).toBe(false);
    expect(cert.goNoGo.productionClaimAllowed).toBe(false);
    expect(cert.goNoGo.forceGreenAllowed).toBe(false);
    expect(cert.goNoGo.decision).toBe('NO-GO');
    expect(cert.autoRepair).toBe(false);
  });

  it('NOT_VERIFIED mandatory gates block GREEN (MFA/PITR/RPO/RTO/smoke)', async () => {
    const cert = await buildProductionCertification({ environment: 'production' });
    for (const id of ['MFA', 'RBAC', 'CSRF', 'PITR', 'RPO', 'RTO', 'PRODUCTION_SMOKE', 'WORKERS', 'DEPLOYMENT']) {
      expect(MANDATORY_PRODUCTION_GATES).toContain(id);
      const g = cert.gates.find((x) => x.name === id);
      expect(g).toBeTruthy();
      expect(['NOT_VERIFIED', 'BLOCKED', 'FAIL']).toContain(g.status);
      expect(cert.goNoGo.mandatoryBlockers.some((b) => b.startsWith(`${id}:`))).toBe(true);
    }
  });

  it('connected-DB readiness FAIL does not become production FAIL without prod evidence', async () => {
    const cert = await buildProductionCertification({ environment: 'production' });
    for (const id of ['LEDGER', 'FINANCE', 'DATABASE', 'TEST_FUNDING', 'RECONCILIATION']) {
      expect(DB_BOUND_GATES.has(id) || id === 'RECONCILIATION').toBe(true);
      const g = cert.gates.find((x) => x.name === id);
      expect(g).toBeTruthy();
      // Without production evidence, must not claim FAIL from local bleed as production FAIL
      // (NOT_VERIFIED or BLOCKED or evidence-backed FAIL only)
      expect(g.status === 'FAIL' ? Boolean(g.evidencePath) : true).toBe(true);
      if (!g.evidencePath || !String(g.evidencePath).includes('phase9')) {
        expect(['NOT_VERIFIED', 'BLOCKED']).toContain(g.status);
      }
    }
  });

  it('local PASS evidence cannot satisfy production gate via evidenceMatchesClaim', () => {
    expect(evidenceMatchesClaim('local', 'production')).toBe(false);
  });

  it('writing local phase9 PASS evidence still does not allow production claim', async () => {
    writePhase9Evidence('mfa', {
      environment: 'local',
      result: 'PASS',
      gates: { MFA: { status: 'PASS' } },
    });
    const cert = await buildProductionCertification({ environment: 'production' });
    const mfa = cert.gates.find((g) => g.name === 'MFA');
    expect(mfa.status).not.toBe('PASS');
    expect(cert.productionClaimAllowed).toBe(false);
  });

  it('no auto-repair flags on certification payload', async () => {
    const cert = await buildProductionCertification({ environment: 'production' });
    expect(cert.autoRepair).toBe(false);
    expect(cert.ledger.policy).toContain('NO_AUTO_REPAIR');
  });
});
