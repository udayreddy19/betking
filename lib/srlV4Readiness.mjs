/**
 * OddsYra SRL + OddsEngine V4 combined readiness (0–100).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveOddsEngineMode, V4_ENGINE_VERSION } from './odds-v4/index.mjs';
import { getIplSrlMatches } from './iplSrlSimulator.mjs';
import { SRL_LAUNCH_AT } from './oddsyraSrlSeason.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function exists(rel) {
  try {
    return fs.existsSync(path.join(root, rel));
  } catch {
    return false;
  }
}

/**
 * @returns {{ qualityScore: number, breakdown: Record<string, number>, checks: Record<string, boolean> }}
 */
export function scoreSrlV4Readiness() {
  const checks = {
    tossFamilyModule: exists('lib/odds-v4/markets/TossWinnerMarketV4.mjs'),
    cardEnrich: exists('lib/iplSrlCardMarkets.mjs'),
    srlSimulator: exists('lib/iplSrlSimulator.mjs'),
    srlPanel: exists('src/components/SrlLeaguePanel/SrlLeaguePanel.jsx'),
    srlPage: exists('src/pages/Srl/OddsYraSrl.jsx'),
    engineDispatch: exists('lib/odds-v4/engineDispatch.mjs'),
    settlementToss: exists('lib/settlement/marketSettlementContract.mjs'),
    tossTests: exists('tests/odds-v4/tossWinnerMarket.test.js'),
    seasonTests: exists('tests/iplSrl/seasonStructure.test.js'),
  };

  const engineMode = resolveOddsEngineMode();
  const pre = getIplSrlMatches(SRL_LAUNCH_AT - 60_000);
  const sample = pre[0] || null;
  const cardIds = new Set((sample?.engineCardMarkets || []).map((m) => m.marketId));

  checks.defaultV4 = engineMode === 'v4' || engineMode === 'shadow';
  checks.cardHasToss = cardIds.has('toss_winner');
  checks.cardHasWinner = cardIds.has('match_winner') || Number(sample?.odds?.team1) > 1;
  checks.cardHasTotal = cardIds.has('match_total') || sample?.srlMarkets?.totalRuns != null;
  checks.v4Version46 = /^4\.(6|7|8|9)/.test(String(V4_ENGINE_VERSION || ''));

  // Schedule / product (20)
  let schedule = 12;
  if (checks.srlSimulator) schedule += 4;
  if (checks.seasonTests) schedule += 4;
  schedule = Math.min(20, schedule);

  // Odds depth (20)
  let odds = 8;
  if (checks.tossFamilyModule) odds += 4;
  if (checks.cardHasToss) odds += 3;
  if (checks.cardHasWinner) odds += 3;
  if (checks.cardHasTotal) odds += 2;
  odds = Math.min(20, odds);

  // Settlement (15)
  let settlement = 8;
  if (checks.settlementToss) settlement += 4;
  if (checks.tossTests) settlement += 3;
  settlement = Math.min(15, settlement);

  // Engine / dispatch (15)
  let engine = 6;
  if (checks.engineDispatch) engine += 3;
  if (checks.defaultV4) engine += 3;
  if (checks.v4Version46) engine += 3;
  engine = Math.min(15, engine);

  // UX / engagement (15)
  let ux = 6;
  if (checks.srlPanel) ux += 4;
  if (checks.srlPage) ux += 3;
  if (checks.cardEnrich) ux += 2;
  ux = Math.min(15, ux);

  // Ops / quality (15)
  let ops = 8;
  if (checks.cardEnrich) ops += 3;
  if (checks.tossTests && checks.seasonTests) ops += 4;
  ops = Math.min(15, ops);

  const breakdown = {
    schedule,
    oddsDepth: odds,
    settlement,
    engine,
    ux,
    ops,
  };
  const qualityScore = Object.values(breakdown).reduce((a, b) => a + b, 0);

  return {
    qualityScore,
    breakdown,
    checks,
    engineMode,
    v4EngineVersion: V4_ENGINE_VERSION,
    sampleCardMarkets: [...cardIds],
    target: 100,
  };
}
