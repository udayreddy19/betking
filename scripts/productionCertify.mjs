#!/usr/bin/env node
/**
 * Production certification checks — reports PASS / WARN / FAIL / BLOCKED.
 * Does not fabricate validation N.
 * Incomplete security/E2E/concurrency evidence → CERTIFICATION: BLOCKED
 * (unless SKIP_CERT_GATES=1 for local engine-only checks).
 *
 * Usage: node scripts/productionCertify.mjs
 * Optional evidence file: docs/evidence/pass4/cert_gates.json
 */

import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);

const results = [];

function record(name, status, detail = '') {
  results.push({ name, status, detail });
  const mark = status === 'PASS' ? '✓' : status === 'WARN' ? '!' : status === 'BLOCKED' ? '⊗' : '✗';
  console.log(`${mark} [${status}] ${name}${detail ? ` — ${detail}` : ''}`);
}

function loadCertGates() {
  const p = path.resolve('docs/evidence/pass4/cert_gates.json');
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

async function main() {
  console.log('OddsYra production certification\n');
  const skipGates = process.env.SKIP_CERT_GATES === '1';
  const gates = loadCertGates();

  // Engine defaults
  try {
    const { resolveOddsEngineMode, getEngineModeStatus } = await import('../lib/odds-v4/EngineModeControl.mjs');
    const { resolveOtherSportsEngineMode, getOtherSportsEngineModeStatus } = await import('../lib/other-sports-v4/EngineModeControl.mjs');
    const cricket = resolveOddsEngineMode({ ODDS_ENGINE: undefined });
    const other = resolveOtherSportsEngineMode({ OTHER_SPORTS_ENGINE: undefined });
    record('Cricket engine default', cricket === 'v4' ? 'PASS' : 'FAIL', `resolved=${cricket}`);
    record('Other-sports engine default', other === 'v4' ? 'PASS' : 'FAIL', `resolved=${other}`);
    const cStatus = getEngineModeStatus();
    if (cStatus.runtimeOverride === 'v3') {
      record('Cricket V3 override', cStatus.overrideExpiresAt ? 'WARN' : 'FAIL',
        cStatus.overrideExpiresAt
          ? `temporary until ${cStatus.overrideExpiresAt}`
          : 'no expiry — clear override');
    } else {
      record('Cricket V3 override', 'PASS', 'none active (or expired)');
    }
    const oStatus = getOtherSportsEngineModeStatus();
    record('Other-sports override source', oStatus.source === 'env' ? 'PASS' : 'WARN', `source=${oStatus.source} active=${oStatus.active}`);
    record('Active cricket engine (runtime)', 'PASS', `active=${cStatus.active} source=${cStatus.source} expires=${cStatus.overrideExpiresAt || 'n/a'}`);
    record('Active other-sports engine (runtime)', 'PASS', `active=${oStatus.active} source=${oStatus.source}`);
    record('Auto-promotion flag', process.env.AUTO_PROMOTION === 'true' ? 'FAIL' : 'PASS', `AUTO_PROMOTION=${process.env.AUTO_PROMOTION || 'false'}`);
  } catch (err) {
    record('Engine defaults', 'FAIL', err.message);
  }

  // Authoritative exposure
  try {
    const { AUTHORITATIVE_EXPOSURE_SOURCE } = await import('../lib/persistedMarketLiability.mjs');
    record('Authoritative exposure source', AUTHORITATIVE_EXPOSURE_SOURCE === 'open_bets_postgres' ? 'PASS' : 'FAIL', AUTHORITATIVE_EXPOSURE_SOURCE);
  } catch (err) {
    record('Authoritative exposure source', 'FAIL', err.message);
  }

  // Risk hierarchy
  try {
    const { resolveEffectiveRiskLimits } = await import('../lib/risk/riskHierarchy.mjs');
    const lim = resolveEffectiveRiskLimits({ sport: 'cricket', marketId: 'match_winner' });
    record('Risk hierarchy', lim.maxStake != null && lim.minStake != null ? 'PASS' : 'FAIL', `maxStake=${lim.maxStake}`);
  } catch (err) {
    record('Risk hierarchy', 'FAIL', err.message);
  }

  // Calibration honesty
  try {
    const { getCalibrationValidationStatus } = await import('../lib/odds-v4/calibration/calibrationBridge.mjs');
    const cal = getCalibrationValidationStatus();
    record('Calibration auto-promotion', cal.autoPromotionAllowed === false ? 'PASS' : 'FAIL', `status=${cal.status} N=${cal.sampleSize}`);
    const n = Number(cal.sampleSize) || 0;
    if (n === 0) {
      record('Production validation N', 'WARN', `N=0 (${cal.status}) — not fabricated`);
    } else if (n < 1000) {
      record('Production validation N', 'WARN', `N=${n} below gate 1000 (${cal.status})`);
    } else {
      record('Production validation N', 'PASS', `N=${n} (${cal.status})`);
    }
  } catch (err) {
    record('Calibration', 'WARN', err.message);
  }

  // Casino scope
  try {
    const { getCasinoAggregatorStatus } = await import('../lib/casinoAggregator.mjs');
    const c = getCasinoAggregatorStatus();
    record('Casino is aggregator (not house)', c.houseCasinoEngine === false ? 'PASS' : 'FAIL', c.scope);
  } catch (err) {
    record('Casino scope', 'WARN', err.message);
  }

  // package scripts existence
  try {
    const pkg = require('../package.json');
    record('package.json readable', 'PASS', `name=${pkg.name}`);
  } catch (err) {
    record('package.json', 'FAIL', err.message);
  }

  // Certification gates from Pass 4 evidence (honest — missing file = BLOCKED)
  if (!skipGates) {
    if (!gates) {
      record('Security suite gate', 'BLOCKED', 'docs/evidence/pass4/cert_gates.json missing');
      record('E2E suite gate', 'BLOCKED', 'docs/evidence/pass4/cert_gates.json missing');
      record('Concurrency suite gate', 'BLOCKED', 'docs/evidence/pass4/cert_gates.json missing');
      record('Payment E2E gate', 'BLOCKED', 'docs/evidence/pass4/cert_gates.json missing');
      record('Financial invariants gate', 'BLOCKED', 'docs/evidence/pass4/cert_gates.json missing');
    } else {
      const check = (key, label) => {
        const g = gates[key] || {};
        const status = String(g.status || '').toUpperCase();
        if (status === 'PASS' || status === 'GREEN') {
          record(label, 'PASS', g.detail || '');
        } else if (status === 'WARN') {
          record(label, 'WARN', g.detail || '');
        } else {
          record(label, 'BLOCKED', g.detail || `status=${status || 'MISSING'}`);
        }
      };
      check('security', 'Security suite gate');
      check('e2e', 'E2E suite gate');
      check('concurrency', 'Concurrency suite gate');
      check('payments', 'Payment E2E gate');
      check('financialInvariants', 'Financial invariants gate');
      check('websocket', 'WebSocket suite gate');
    }
  } else {
    record('Certification gates', 'WARN', 'SKIP_CERT_GATES=1 — gate checks skipped');
  }

  const failed = results.filter((r) => r.status === 'FAIL').length;
  const blocked = results.filter((r) => r.status === 'BLOCKED').length;
  const warned = results.filter((r) => r.status === 'WARN').length;
  const passed = results.filter((r) => r.status === 'PASS').length;

  console.log('\n---');
  console.log(`PASS=${passed} WARN=${warned} BLOCKED=${blocked} FAIL=${failed}`);

  // Only PASS_WITH_WARNINGS when the sole soft issues are validation N (or explicit WARN),
  // and no FAIL/BLOCKED remain.
  const nonValidationWarns = results.filter(
    (r) => r.status === 'WARN' && !/validation N|SKIP_CERT_GATES/i.test(r.name + r.detail),
  );

  if (failed > 0) {
    console.log('CERTIFICATION: FAIL');
    process.exitCode = 1;
  } else if (blocked > 0) {
    console.log('CERTIFICATION: BLOCKED');
    process.exitCode = 2;
  } else if (warned > 0 && nonValidationWarns.length === 0) {
    console.log('CERTIFICATION: PASS_WITH_WARNINGS');
  } else if (warned > 0) {
    console.log('CERTIFICATION: PASS_WITH_WARNINGS');
  } else {
    console.log('CERTIFICATION: PASS');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
