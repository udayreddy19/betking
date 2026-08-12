import express from 'express';
import { generate as generateV3 } from '../../../lib/odds-v3/OddsEngineV3.mjs';
import { createCanonicalMatchState } from '../../../lib/odds-v3/models/CanonicalMatchState.mjs';

const router = express.Router();

/**
 * GET /api/admin/odds/:matchId/debug
 * Admin-only pricing debug endpoint exposing V3 probability, fair odds, margin, risk shift, overround, TTL, and versioning.
 */
router.get('/:matchId/debug', (req, res) => {
  const { matchId } = req.params;

  const canonicalState = createCanonicalMatchState({
    matchId,
    sport: 'CRICKET',
    format: 'T20',
    status: 'LIVE',
    team1: { id: 't1', name: 'Team 1', runs: 120, wickets: 3, balls: 80 },
    team2: { id: 't2', name: 'Team 2', runs: 85, wickets: 2, balls: 50 },
    currentInnings: 2,
    battingTeamId: 't2',
    bowlingTeamId: 't1',
    target: 121,
    runsRequired: 36,
    ballsPerInnings: 120,
    ballsCompleted: 50,
    ballsRemaining: 70,
    providerTimestamp: Date.now(),
    stateVersion: 1,
  });

  const snapshot = generateV3(canonicalState, { debug: true });

  return res.json({
    success: true,
    matchId,
    oddsVersion: 'v3',
    stateVersion: snapshot.stateVersion,
    generatedAt: snapshot.createdAt,
    pricingSource: 'ODDS_ENGINE_V3',
    marketsCount: snapshot.markets.length,
    markets: snapshot.markets,
    timestamp: new Date().toISOString(),
  });
});

export default router;
