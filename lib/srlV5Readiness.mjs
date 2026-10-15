/**
 * OddsYra SRL + OddsEngine V5 combined readiness (0–100).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveOddsEngineMode, V5_ENGINE_VERSION } from './odds-v5/index.mjs';
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
export function scoreSrlV5Readiness() {
  const checks = {
    tossFamilyModule: exists('lib/odds-v5/markets/TossWinnerMarketV4.mjs')
      || exists('lib/odds-v5/markets/TossWinnerMarketV5.mjs'),
    cardEnrich: exists('lib/iplSrlCardMarkets.mjs'),
    srlSimulator: exists('lib/iplSrlSimulator.mjs'),
    srlPanel: exists('src/components/SrlLeaguePanel/SrlLeaguePanel.jsx'),
    srlPage: exists('src/pages/Srl/OddsYraSrl.jsx'),
    engineDispatch: exists('lib/odds-v5/engineDispatch.mjs'),
    settlementToss: exists('lib/settlement/marketSettlementContract.mjs'),
    tossTests: exists('tests/odds-v5/tossWinnerMarket.test.js')
      || exists('tests/odds-v4/tossWinnerMarket.test.js'),
    seasonTests: exists('tests/iplSrl/seasonStructure.test.js'),
  };

  const engineMode = resolveOddsEngineMode();
  const pre = getIplSrlMatches(SRL_LAUNCH_AT - 60_000);
  const sample = pre[0] || null;
  const cardIds = new Set((sample?.engineCardMarkets || []).map((m) => m.marketId));

  checks.defaultV5 = engineMode === 'v5' || engineMode === 'shadow';
  checks.cardHasToss = cardIds.has('toss_winner');
  checks.cardHasWinner = cardIds.has('match_winner') || Number(sample?.odds?.team1) > 1;
  checks.cardHasTotal = cardIds.has('match_total') || sample?.srlMarkets?.totalRuns != null;
  checks.v5Version = /^5\./.test(String(V5_ENGINE_VERSION || ''));

  let schedule = 12;
  if (checks.srlSimulator) schedule += 4;
  if (checks.seasonTests) schedule += 4;
  schedule = Math.min(20, schedule);

  let odds = 8;
  if (checks.tossFamilyModule) odds += 4;
  if (checks.cardHasToss) odds += 3;
  if (checks.cardHasWinner) odds += 3;
  if (checks.cardHasTotal) odds += 2;
  odds = Math.min(20, odds);

  let settlement = 8;
  if (checks.settlementToss) settlement += 4;
  if (checks.tossTests) settlement += 3;
  settlement = Math.min(15, settlement);

  let engine = 6;
  if (checks.engineDispatch) engine += 3;
  if (checks.defaultV5) engine += 4;
  if (checks.v5Version) engine += 2;
  engine = Math.min(15, engine);

  let ux = 6;
  if (checks.srlPanel) ux += 4;
  if (checks.srlPage) ux += 3;
  if (checks.cardEnrich) ux += 2;
  ux = Math.min(15, ux);

  let ops = 8;
  if (checks.cardEnrich) ops += 3;
  if (checks.tossTests && checks.seasonTests) ops += 4;
  ops = Math.min(15, ops);

  const breakdown = { schedule, oddsDepth: odds, settlement, engine, ux, ops };
  const qualityScore = Object.values(breakdown).reduce((a, b) => a + b, 0);

  return {
    qualityScore,
    breakdown,
    checks,
    engineMode,
    v5EngineVersion: V5_ENGINE_VERSION,
    sampleCardMarkets: [...cardIds],
    target: 100,
  };
}

/** @deprecated alias */
export function scoreSrlV4Readiness() {
  return scoreSrlV5Readiness();
}
