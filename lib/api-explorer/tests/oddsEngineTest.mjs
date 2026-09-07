import { generate } from '../../odds-v3/OddsEngineV3.mjs';
import { generate as generateV4, V4_ENGINE_VERSION } from '../../odds-v4/OddsEngineV4.mjs';
import { generate as generateOtherSportsV4 } from '../../other-sports-v4/OtherSportsEngineV4.mjs';
import { OSV4_ENGINE_VERSION } from '../../other-sports-v4/pricing/MarginPolicy.mjs';
import { createCanonicalMatchState } from '../../odds-v3/models/CanonicalMatchState.mjs';
import { ENGINE_NAME, ENGINE_VERSION } from '../../odds-v3/models/OddsSnapshot.mjs';
import { normalizeTestResult, mapThrownError } from '../result.mjs';
import { timed } from '../timeout.mjs';
import { summarizeOddsSnapshot } from '../summarize.mjs';

/** Isolated sandbox match — never a real fixture id. */
export const SANDBOX_MATCH_ID = 'api-explorer-sandbox-t20';
export const SANDBOX_SOCCER_MATCH_ID = 'api-explorer-sandbox-soccer';

export function buildSandboxCanonicalMatchState() {
  return createCanonicalMatchState({
    matchId: SANDBOX_MATCH_ID,
    sport: 'CRICKET',
    format: 'T20',
    status: 'LIVE',
    team1: { id: 'SANDBOX_A', name: 'Sandbox Strikers', runs: 148, wickets: 4, balls: 120 },
    team2: { id: 'SANDBOX_B', name: 'Sandbox Royals', runs: 72, wickets: 2, balls: 54 },
    currentInnings: 2,
    battingTeamId: 'SANDBOX_B',
    bowlingTeamId: 'SANDBOX_A',
    target: 149,
    runsRequired: 77,
    ballsPerInnings: 120,
    ballsCompleted: 54,
    ballsRemaining: 66,
    batter1: { name: 'Sandbox Batter 1', runs: 31, balls: 22 },
    batter2: { name: 'Sandbox Batter 2', runs: 18, balls: 14 },
    providerTimestamp: Date.now(),
    stateVersion: 1,
  });
}

export function buildSandboxSoccerMatch() {
  return {
    matchId: SANDBOX_SOCCER_MATCH_ID,
    id: SANDBOX_SOCCER_MATCH_ID,
    sport: 'soccer',
    team1: { name: 'Sandbox United' },
    team2: { name: 'Sandbox City' },
    isLive: true,
    matchState: 'in',
    stateVersion: 1,
    liveDetails: { score1: 1, score2: 0, minute: 55 },
    odds: { home: 2.1, draw: 3.4, away: 3.5 },
  };
}

function finishOddsSandboxTest({
  snapshot,
  state,
  responseTimeMs,
  engineName,
  engineVersion,
  note,
}) {
  const validationErrors = [];
  if (!snapshot || snapshot.status === 'INVALID_STATE') {
    validationErrors.push('Engine returned INVALID_STATE for sandbox input');
  }
  const summary = summarizeOddsSnapshot(snapshot, state, responseTimeMs, validationErrors);
  return normalizeTestResult({
    success: validationErrors.length === 0 && snapshot?.status !== 'INVALID_STATE',
    statusCode: 200,
    responseTimeMs,
    implementation: 'REAL',
    summary: {
      ...summary,
      engineName,
      engineVersion,
      note,
    },
    data: summary,
  });
}

export async function testOddsEngineV3() {
  const started = Date.now();
  try {
    const state = buildSandboxCanonicalMatchState();
    const { value, responseTimeMs, error } = await timed(() => Promise.resolve(generate(state)));
    if (error) return mapThrownError(error, responseTimeMs);
    return finishOddsSandboxTest({
      snapshot: value,
      state,
      responseTimeMs,
      engineName: ENGINE_NAME,
      engineVersion: ENGINE_VERSION,
      note: 'TEST/SANDBOX canonical match state. Does not modify live odds, wallets, or bets.',
    });
  } catch (err) {
    return mapThrownError(err, Date.now() - started);
  }
}

export async function testOddsEngineV4() {
  const started = Date.now();
  try {
    const state = buildSandboxCanonicalMatchState();
    const { value, responseTimeMs, error } = await timed(() => Promise.resolve(generateV4(state)));
    if (error) return mapThrownError(error, responseTimeMs);
    return finishOddsSandboxTest({
      snapshot: value,
      state,
      responseTimeMs,
      engineName: 'OddsEngineV4',
      engineVersion: value?.engineVersion || V4_ENGINE_VERSION,
      note: 'TEST/SANDBOX cricket OddsEngineV4. Does not modify live odds, wallets, or bets.',
    });
  } catch (err) {
    return mapThrownError(err, Date.now() - started);
  }
}

export async function testOtherSportsEngineV4() {
  const started = Date.now();
  try {
    const match = buildSandboxSoccerMatch();
    const { value, responseTimeMs, error } = await timed(() =>
      Promise.resolve(generateOtherSportsV4(match, { allowModelOnly: true })),
    );
    if (error) return mapThrownError(error, responseTimeMs);
    return finishOddsSandboxTest({
      snapshot: value,
      state: match,
      responseTimeMs,
      engineName: 'OtherSportsEngineV4',
      engineVersion: value?.engineVersion || OSV4_ENGINE_VERSION,
      note: 'TEST/SANDBOX soccer book (OtherSportsEngineV4). Does not modify live odds, wallets, or bets.',
    });
  } catch (err) {
    return mapThrownError(err, Date.now() - started);
  }
}
