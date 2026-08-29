import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { runProductionPreflight } from '../../scripts/production-preflight.mjs';
import { MANDATORY_PRODUCTION_GATES } from '../../lib/productionCertificationEngine.mjs';
import {
  normalizeBallToCanonicalEvent,
  upsertCanonicalBallEvent,
  getConfirmedBallEvent,
} from '../../lib/settlement/canonicalBallEvents.mjs';

describe('Phase 35.1 — Production Preflight Hardening & Evidence Completeness Suite', () => {

  // =========================================================================
  // 1. MIGRATION 056 READ-ONLY DUPLICATE PREFLIGHT & OPERATIONAL SAFETY
  // =========================================================================
  describe('1. Migration 056 Read-Only Duplicate Preflight', () => {
    it('Executes read-only duplicate preflight returning zero duplicates and no state mutation', async () => {
      const res = await runProductionPreflight({ targetEnv: 'staging', prodAck: true });
      assert.equal(res.readOnly, true, 'Preflight MUST strictly be read-only');
      assert.equal(res.status, 'PASS');
      assert.equal(res.actual_result.duplicatePreflight.status, 'PASS');
      assert.equal(res.actual_result.duplicatePreflight.duplicateGroupCount, 0);
    });
  });

  // =========================================================================
  // 2. NULL PROVIDER IDENTITY & FALLBACK CANONICAL STRATEGY
  // =========================================================================
  describe('2. NULL Provider Identity & Fallback Uniqueness Strategy', () => {
    it('Protects deliveries with NULL provider or provider_event_id using canonical sequence slot', async () => {
      const matchId = `match_p351_fallback_${Date.now()}`;
      const evFallback = normalizeBallToCanonicalEvent({
        matchId,
        innings: 1,
        overNumber: 20,
        ballNumber: 6,
        sequenceNumber: 120,
        rawBall: 'W',
        provider: null,
        providerEventId: null,
        isConfirmed: true,
      });

      assert.equal(evFallback.provider, 'CANONICAL_FEED');
      assert.ok(evFallback.eventId.includes('_i1_o20_b6_s120'));

      const res = await upsertCanonicalBallEvent(evFallback);
      assert.ok(['INSERTED', 'IDEMPOTENT'].includes(res.action));

      // Re-submitting same fallback event is IDEMPOTENT
      const resDup = await upsertCanonicalBallEvent(evFallback);
      assert.equal(resDup.action, 'IDEMPOTENT');
    });
  });

  // =========================================================================
  // 3. DEPLOYMENT ATTESTATION SCHEMA & VALIDATION LOGIC
  // =========================================================================
  describe('3. Deployment Attestation Completeness & Validation', () => {
    function validateDeploymentAttestation(meta) {
      if (!meta.git_commit_sha || meta.git_commit_sha.length !== 40) {
        return { valid: false, reason: 'MISSING_OR_INVALID_GIT_SHA' };
      }
      if (!meta.artifact_version || !meta.application_version) {
        return { valid: false, reason: 'MISSING_VERSION_METADATA' };
      }
      if (meta.application_version !== meta.build_version) {
        return { valid: false, reason: 'VERSION_MISMATCH' };
      }
      if (!meta.rollback_artifact) {
        return { valid: false, reason: 'MISSING_ROLLBACK_METADATA' };
      }
      return { valid: true, status: 'PASS' };
    }

    it('Scenario A: Complete valid metadata returns PASS', () => {
      const validMeta = {
        git_commit_sha: 'ac58583c19088e68f6d58b728f5d108c10d55734',
        artifact_version: 'oddsyra-v3.5.1.tgz',
        application_version: '1.0.0-production-candidate',
        build_version: '1.0.0-production-candidate',
        rollback_artifact: 'oddsyra-v3.5.0.tgz',
      };
      const res = validateDeploymentAttestation(validMeta);
      assert.equal(res.valid, true);
      assert.equal(res.status, 'PASS');
    });

    it('Scenario B: Missing SHA returns invalid', () => {
      const meta = {
        git_commit_sha: null,
        artifact_version: 'oddsyra-v3.5.1.tgz',
        application_version: '1.0.0',
        build_version: '1.0.0',
        rollback_artifact: 'oddsyra-v3.5.0.tgz',
      };
      const res = validateDeploymentAttestation(meta);
      assert.equal(res.valid, false);
      assert.equal(res.reason, 'MISSING_OR_INVALID_GIT_SHA');
    });

    it('Scenario C: Version mismatch returns invalid', () => {
      const meta = {
        git_commit_sha: 'ac58583c19088e68f6d58b728f5d108c10d55734',
        artifact_version: 'oddsyra-v3.5.1.tgz',
        application_version: '1.0.0',
        build_version: '1.0.1', // mismatch
        rollback_artifact: 'oddsyra-v3.5.0.tgz',
      };
      const res = validateDeploymentAttestation(meta);
      assert.equal(res.valid, false);
      assert.equal(res.reason, 'VERSION_MISMATCH');
    });

    it('Scenario D: Missing rollback metadata returns invalid', () => {
      const meta = {
        git_commit_sha: 'ac58583c19088e68f6d58b728f5d108c10d55734',
        artifact_version: 'oddsyra-v3.5.1.tgz',
        application_version: '1.0.0',
        build_version: '1.0.0',
        rollback_artifact: null,
      };
      const res = validateDeploymentAttestation(meta);
      assert.equal(res.valid, false);
      assert.equal(res.reason, 'MISSING_ROLLBACK_METADATA');
    });
  });

  // =========================================================================
  // 4. PRODUCTION PREFLIGHT SAFETY & ACKNOWLEDGEMENT GATING
  // =========================================================================
  describe('4. Production Preflight Safety & Acknowledgement Enforcement', () => {
    it('Blocks production preflight when --i-understand-production=1 is omitted', async () => {
      const res = await runProductionPreflight({ targetEnv: 'production', prodAck: false });
      assert.equal(res.status, 'BLOCKED');
      assert.ok(res.reason.includes('--i-understand-production=1'));
    });

    it('Executes non-destructive read-only preflight when acknowledged', async () => {
      const res = await runProductionPreflight({ targetEnv: 'production', prodAck: true });
      assert.equal(res.readOnly, true);
      assert.equal(res.status, 'PASS');
    });
  });

  // =========================================================================
  // 5. MANDATORY PRODUCTION BLOCKER MATRIX COMPLETENESS
  // =========================================================================
  describe('5. Mandatory Production Blocker Matrix Completeness', () => {
    it('Contains all 31 mandatory certification gates from engine without omission', () => {
      assert.equal(MANDATORY_PRODUCTION_GATES.length, 31);
      const sampleGates = ['DATABASE', 'MIGRATIONS', 'FINANCE', 'PITR', 'RPO', 'RTO', 'MONITORING', 'DEPLOYMENT', 'RBAC', 'MFA'];
      for (const g of sampleGates) {
        assert.ok(MANDATORY_PRODUCTION_GATES.includes(g), `Gate ${g} MUST be mandatory`);
      }
    });
  });
});
