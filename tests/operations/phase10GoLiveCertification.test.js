/**
 * Phase 10 — environment isolation, evidence validation, certification NO-GO rules.
 */
import { describe, it, expect } from 'vitest';
import {
  buildProductionCertification,
  evidenceMatchesClaim,
  isDumpOnlyDrEvidence,
  isProcessLocalMonitoring,
  isStubEvidence,
} from '../../lib/productionCertificationEngine.mjs';
import { validateEvidenceForClaim } from '../../lib/certificationEvidence.mjs';

describe('Phase 10 evidence validation', () => {
  it('rejects missing environment as NOT_VERIFIED', () => {
    const v = validateEvidenceForClaim({ result: 'PASS', timestamp: new Date().toISOString() }, 'production');
    expect(v.valid).toBe(false);
    expect(v.statusHint).toBe('NOT_VERIFIED');
    expect(v.reason).toBe('missing_environment');
  });

  it('rejects wrong environment for production claim', () => {
    const v = validateEvidenceForClaim({
      environment: 'local',
      result: 'PASS',
      timestamp: new Date().toISOString(),
    }, 'production');
    expect(v.valid).toBe(false);
    expect(v.reason).toMatch(/environment_mismatch/);
  });

  it('rejects staging evidence for production', () => {
    expect(evidenceMatchesClaim('staging', 'production')).toBe(false);
    const v = validateEvidenceForClaim({
      environment: 'staging',
      result: 'PASS',
      timestamp: new Date().toISOString(),
    }, 'production');
    expect(v.valid).toBe(false);
  });

  it('rejects stale evidence', () => {
    const old = new Date(Date.now() - 400 * 24 * 3600 * 1000).toISOString();
    const v = validateEvidenceForClaim({
      environment: 'production',
      result: 'PASS',
      timestamp: old,
    }, 'production', { maxAgeMs: 7 * 24 * 3600 * 1000 });
    expect(v.valid).toBe(false);
    expect(v.stale).toBe(true);
    expect(v.statusHint).toBe('NOT_VERIFIED');
  });

  it('rejects malformed evidence missing result/gates', () => {
    const v = validateEvidenceForClaim({
      environment: 'production',
      timestamp: new Date().toISOString(),
    }, 'production');
    expect(v.valid).toBe(false);
    expect(v.reason).toMatch(/malformed/);
  });

  it('accepts fresh production evidence', () => {
    const v = validateEvidenceForClaim({
      environment: 'production',
      result: 'PASS',
      timestamp: new Date().toISOString(),
      verifiedBy: 'ops',
    }, 'production');
    expect(v.valid).toBe(true);
    expect(v.expiresAt).toBeTruthy();
  });

  it('marks blocked evidence as BLOCKED', () => {
    const v = validateEvidenceForClaim({
      environment: 'production',
      blocked: true,
      blockReason: 'external_probe_denied',
      timestamp: new Date().toISOString(),
      result: 'BLOCKED',
    }, 'production');
    expect(v.valid).toBe(false);
    expect(v.statusHint).toBe('BLOCKED');
  });
});

describe('Phase 10 DR / monitoring / stub rules', () => {
  it('treats dump restore as not PITR', () => {
    expect(isDumpOnlyDrEvidence({ restoreMethod: 'pg_dump', environment: 'production' })).toBe(true);
    expect(isDumpOnlyDrEvidence({
      restore_environment: 'PRODUCTION_CLASS_PITR',
      wal_position: '0/ABC',
    })).toBe(false);
  });

  it('detects PROCESS_LOCAL monitoring', () => {
    expect(isProcessLocalMonitoring({ metricsBackend: 'PROCESS_LOCAL' })).toBe(true);
    expect(isProcessLocalMonitoring({ metricsBackend: 'DISTRIBUTED' })).toBe(false);
  });

  it('detects stub evidence', () => {
    expect(isStubEvidence({ stub: true })).toBe(true);
    expect(isStubEvidence({ verificationMethod: 'stub' })).toBe(true);
    expect(isStubEvidence({ result: 'PASS' })).toBe(false);
  });
});

describe('Phase 10 production certification', () => {
  it('forceGreenAllowed and autoRepair remain false', async () => {
    const cert = await buildProductionCertification({ environment: 'production' });
    expect(cert.forceGreenAllowed).toBe(false);
    expect(cert.autoRepair).toBe(false);
    expect(cert.goNoGo.forceGreenAllowed).toBe(false);
    expect(cert.phase).toBeGreaterThanOrEqual(10);
  });

  it('production claim is NO-GO without full mandatory PASS', async () => {
    const cert = await buildProductionCertification({ environment: 'production' });
    expect(cert.productionClaimAllowed).toBe(false);
    expect(['NO-GO', 'RED', 'NOT_VERIFIED']).toContain(cert.PRODUCTION_CERTIFICATION_STATUS);
    expect(cert.goNoGo.decision).toBe('NO-GO');
  });

  it('one NOT_VERIFIED mandatory gate blocks productionClaimAllowed', async () => {
    const cert = await buildProductionCertification({ environment: 'production' });
    const blockers = cert.goNoGo.mandatoryBlockers || [];
    expect(blockers.length).toBeGreaterThan(0);
    expect(cert.productionClaimAllowed).toBe(false);
  });

  it('exposes go-live checklist that cannot override certification', async () => {
    const cert = await buildProductionCertification({ environment: 'production' });
    expect(cert.checklist?.canOverrideCertification).toBe(false);
    expect(cert.checklist?.sections?.FINANCE?.length).toBeGreaterThan(0);
    expect(cert.checklist?.sections?.DR?.some((i) => i.gate === 'PITR')).toBe(true);
  });

  it('gate objects include Phase 10 certification fields', async () => {
    const cert = await buildProductionCertification({ environment: 'production' });
    const mfa = cert.gates.find((g) => g.name === 'MFA');
    expect(mfa).toBeTruthy();
    expect(mfa).toHaveProperty('gate');
    expect(mfa).toHaveProperty('status');
    expect(mfa).toHaveProperty('required');
    expect(mfa).toHaveProperty('environment');
    expect(mfa).toHaveProperty('reason');
    expect(mfa).toHaveProperty('verificationMethod');
  });

  it('PAYMENTS out of scope does not unlock finance', async () => {
    const cert = await buildProductionCertification({ environment: 'production' });
    const pay = cert.gates.find((g) => g.name === 'PAYMENTS');
    if (pay) {
      expect(['OUT_OF_SCOPE', 'NOT_VERIFIED', 'PASS', 'FAIL', 'BLOCKED']).toContain(pay.status);
    }
    const finance = cert.gates.find((g) => g.name === 'FINANCE');
    // Finance must not be auto-PASS merely because payments are out of scope
    if (finance?.status === 'PASS') {
      expect(finance.verified).toBe(true);
      expect(finance.evidenceEnvironment).toBe('production');
    }
  });
});
