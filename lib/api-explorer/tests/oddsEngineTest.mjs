import { generate } from '../../odds-v3/OddsEngineV3.mjs';
import { createCanonicalMatchState } from '../../odds-v3/models/CanonicalMatchState.mjs';
import { ENGINE_NAME, ENGINE_VERSION } from '../../odds-v3/models/OddsSnapshot.mjs';
import { normalizeTestResult, mapThrownError } from '../result.mjs';
import { timed } from '../timeout.mjs';
import { summarizeOddsSnapshot } from '../summarize.mjs';

/** Isolated sandbox match — never a real fixture id. */
export const SANDBOX_MATCH_ID = 'api-explorer-sandbox-t20';

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

export async function testOddsEngineV3() {
  const started = Date.now();
  try {
    const state = buildSandboxCanonicalMatchState();
    const { value, responseTimeMs, error } = await timed(() => Promise.resolve(generate(state)));
    if (error) return mapThrownError(error, responseTimeMs);

    const validationErrors = [];
    if (!value || value.status === 'INVALID_STATE') {
      validationErrors.push('Engine returned INVALID_STATE for sandbox input');
    }

    const summary = summarizeOddsSnapshot(value, state, responseTimeMs, validationErrors);
    return normalizeTestResult({
      success: validationErrors.length === 0 && value?.status !== 'INVALID_STATE',
      statusCode: 200,
      responseTimeMs,
      implementation: 'REAL',
      summary: {
        ...summary,
        engineName: ENGINE_NAME,
        engineVersion: ENGINE_VERSION,
        note: 'TEST/SANDBOX canonical match state. Does not modify live odds, wallets, or bets.',
      },
      data: summary,
    });
  } catch (err) {
    return mapThrownError(err, Date.now() - started);
  }
}
