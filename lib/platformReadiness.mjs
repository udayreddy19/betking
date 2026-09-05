/**
 * OddsYra platform readiness scorecard (0–100).
 * Mirrors the operator rubric used for product scoring.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ENGINE_MODES, resolveOddsEngineMode, V4_ENGINE_VERSION } from './odds-v4/index.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function exists(rel) {
  try {
    return fs.existsSync(path.join(root, rel));
  } catch {
    return false;
  }
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * @returns {Promise<{
 *   qualityScore: number,
 *   breakdown: Record<string, number>,
 *   checks: Record<string, boolean>,
 *   engineMode: string,
 *   version: string,
 * }>}
 */
export async function scorePlatformReadiness(opts = {}) {
  const checks = {
    oddsV4Present: exists('lib/odds-v4/OddsEngineV4.mjs'),
    oddsV4Guardian: exists('lib/odds-v4/v4BookGuardian.mjs'),
    oddsV4Toggle: exists('lib/odds-v4/EngineModeControl.mjs'),
    matchQualityGate: exists('lib/matchQualityGate.mjs'),
    settlementContract: exists('lib/settlement/marketSettlementContract.mjs'),
    walletEngine: exists('lib/betPlacementEngine.mjs'),
    cashoutEngine: exists('lib/cashoutEngine.mjs'),
    adminRiskUi: exists('src/pages/Admin/domains/TradingRiskDomainView.jsx'),
    deployScript: exists('scripts/deploy_vps.sh'),
    migrationsDir: exists('migrations'),
    frontendMatchGate: exists('src/utils/matchQualityGate.js'),
    liveContext: exists('src/context/LiveSportsContext.jsx'),
    responsibleGaming: exists('server/routes/responsibleGaming.js'),
    adminMfa: exists('lib/adminMfa.mjs'),
    testsOddsV4: exists('tests/odds-v4/oddsEngineV4.test.js'),
  };

  let engineMode = 'v3';
  try {
    engineMode = resolveOddsEngineMode();
  } catch {
    engineMode = 'unknown';
  }

  // Product completeness (20)
  let product = 10;
  if (checks.walletEngine) product += 3;
  if (checks.cashoutEngine) product += 2;
  if (checks.adminRiskUi) product += 2;
  if (checks.liveContext) product += 2;
  if (checks.responsibleGaming) product += 1;
  product = clamp(product, 0, 20);

  // Odds / trading (15)
  let odds = 6;
  if (checks.oddsV4Present) odds += 3;
  if (checks.oddsV4Guardian) odds += 2;
  if (checks.oddsV4Toggle) odds += 2;
  if (ENGINE_MODES.includes(engineMode) || ['v3', 'v4', 'shadow'].includes(engineMode)) odds += 1;
  if (String(V4_ENGINE_VERSION || '').startsWith('4.2')) odds += 1;
  odds = clamp(odds, 0, 15);

  // Settlement / money (15)
  let settlement = 8;
  if (checks.settlementContract) settlement += 4;
  if (checks.migrationsDir) settlement += 3;
  settlement = clamp(settlement, 0, 15);

  // Backend architecture (10)
  let backend = 6;
  if (checks.deployScript) backend += 2;
  if (checks.oddsV4Present && checks.walletEngine) backend += 2;
  backend = clamp(backend, 0, 10);

  // Admin / ops (10)
  let admin = 6;
  if (checks.adminRiskUi) admin += 2;
  if (checks.oddsV4Toggle) admin += 2;
  admin = clamp(admin, 0, 10);

  // Frontend / UX (10)
  let frontend = 5;
  if (checks.liveContext) frontend += 2;
  if (checks.frontendMatchGate) frontend += 3;
  frontend = clamp(frontend, 0, 10);

  // Data / feed quality (10)
  let feed = 4;
  if (checks.matchQualityGate) feed += 3;
  if (checks.frontendMatchGate) feed += 3;
  feed = clamp(feed, 0, 10);

  // Testing / docs (5)
  let testing = 2;
  if (checks.testsOddsV4) testing += 2;
  if (exists('docs')) testing += 1;
  testing = clamp(testing, 0, 5);

  // Security / compliance (5)
  let security = 2;
  if (checks.adminMfa) security += 2;
  if (checks.responsibleGaming) security += 1;
  security = clamp(security, 0, 5);

  const breakdown = {
    productCompleteness: product,
    oddsTrading: odds,
    settlementMoney: settlement,
    backendArchitecture: backend,
    adminOps: admin,
    frontendUx: frontend,
    feedQuality: feed,
    testingDocs: testing,
    securityCompliance: security,
  };

  const qualityScore = Object.values(breakdown).reduce((a, b) => a + b, 0);

  return {
    qualityScore,
    breakdown,
    checks,
    engineMode,
    version: 'OddsYra-platform-1.0',
    v4EngineVersion: V4_ENGINE_VERSION || null,
    target: 100,
    ...(opts.extra || {}),
  };
}
