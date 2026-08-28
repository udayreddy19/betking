/**
 * Phase 11 — blocker resolution rules + certification authority.
 * Never fabricates GREEN. Never allows force/override.
 */
import { describe, it, expect } from 'vitest';
import {
  buildProductionCertification,
  evidenceMatchesClaim,
  isDumpOnlyDrEvidence,
  isProcessLocalMonitoring,
  isStubEvidence,
} from '../../lib/productionCertificationEngine.mjs';
import {
  validateEvidenceForClaim,
  redactDatabaseIdentity,
} from '../../lib/certificationEvidence.mjs';

describe('Phase 11 evidence isolation & validation', () => {
  it('rejects local evidence for production', () => {
    expect(evidenceMatchesClaim('local', 'production')).toBe(false);
    const v = validateEvidenceForClaim({
      environment: 'local',
      result: 'PASS',
      timestamp: new Date().toISOString(),
    }, 'production');
    expect(v.valid).toBe(false);
  });

  it('rejects stub PASS for production', () => {
    const v = validateEvidenceForClaim({
      environment: 'production',
      result: 'PASS',
      stub: true,
      verificationMethod: 'phase11_stub',
      timestamp: new Date().toISOString(),
    }, 'production');
    expect(v.valid).toBe(false);
    expect(v.reason).toMatch(/stub/);
  });

  it('rejects stale evidence', () => {
    const v = validateEvidenceForClaim({
      environment: 'production',
      result: 'PASS',
      timestamp: new Date(Date.now() - 400 * 86400000).toISOString(),
    }, 'production', { maxAgeMs: 7 * 86400000 });
    expect(v.valid).toBe(false);
    expect(v.stale).toBe(true);
  });

  it('rejects missing environment', () => {
    const v = validateEvidenceForClaim({
      result: 'PASS',
      timestamp: new Date().toISOString(),
    }, 'production');
    expect(v.valid).toBe(false);
  });

  it('rejects blocked probes as BLOCKED', () => {
    const v = validateEvidenceForClaim({
      environment: 'production',
      blocked: true,
      result: 'BLOCKED',
      timestamp: new Date().toISOString(),
    }, 'production');
    expect(v.statusHint).toBe('BLOCKED');
  });

  it('dump-only is not PITR', () => {
    expect(isDumpOnlyDrEvidence({ restoreMethod: 'pg_dump' })).toBe(true);
    expect(isDumpOnlyDrEvidence({ restore_environment: 'PRODUCTION_CLASS_PITR' })).toBe(false);
  });

  it('PROCESS_LOCAL is not distributed monitoring', () => {
    expect(isProcessLocalMonitoring({ metricsBackend: 'PROCESS_LOCAL' })).toBe(true);
  });

  it('detects phase11 stubs', () => {
    expect(isStubEvidence({ verificationMethod: 'phase11_stub', stub: true })).toBe(true);
  });

  it('redacts database identity without secrets', () => {
    const id = redactDatabaseIdentity('postgresql://user:SECRET@db.example.com:5432/oddsyra');
    expect(JSON.stringify(id)).not.toMatch(/SECRET/);
    expect(id.identityProven).toBe(false);
  });
});

describe('Phase 11 production certification authority', () => {
  it('forceGreen / override / autoRepair remain false', async () => {
    const cert = await buildProductionCertification({ environment: 'production' });
    expect(cert.forceGreenAllowed).toBe(false);
    expect(cert.autoRepair).toBe(false);
    expect(cert.overrideAllowed).toBe(false);
    expect(cert.forceGreen).toBe(false);
    expect(cert.goNoGo.forceGreenAllowed).toBe(false);
    expect(cert.phase).toBe(11);
    expect(cert.certificationVersion).toBe('phase11');
  });

  it('productionClaimAllowed is false without full mandatory PASS', async () => {
    const cert = await buildProductionCertification({ environment: 'production' });
    expect(cert.productionClaimAllowed).toBe(false);
    expect(cert.goNoGo.decision).toBe('NO-GO');
    expect(['NO-GO', 'RED']).toContain(cert.PRODUCTION_CERTIFICATION_STATUS);
    expect((cert.goNoGo.mandatoryBlockers || []).length).toBeGreaterThan(0);
  });

  it('exposes evidence age and source on gates', async () => {
    const cert = await buildProductionCertification({ environment: 'production' });
    const g = cert.gates.find((x) => x.name === 'DATABASE') || cert.gates[0];
    expect(g).toHaveProperty('evidenceAgeMs');
    expect(g).toHaveProperty('evidenceSource');
    expect(g).toHaveProperty('reason');
  });

  it('checklist cannot override certification', async () => {
    const cert = await buildProductionCertification({ environment: 'production' });
    expect(cert.checklist.canOverrideCertification).toBe(false);
  });

  it('missing PITR / RPO / RTO keep NO-GO', async () => {
    const cert = await buildProductionCertification({ environment: 'production' });
    const names = new Set(cert.goNoGo.mandatoryBlockers.map((b) => b.split(':')[0]));
    // At least one of these should block unless real evidence appeared
    const drish = ['PITR', 'RPO', 'RTO'].some((n) => names.has(n)
      || cert.gates.find((g) => g.name === n)?.status !== 'PASS');
    expect(drish).toBe(true);
    expect(cert.productionClaimAllowed).toBe(false);
  });
});
