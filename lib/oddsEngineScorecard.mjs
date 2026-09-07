/**
 * Operator-facing odds engine marks (product scorecard).
 * Reflects house discipline + production readiness, not model Brier alone.
 */

export const ODDS_ENGINE_SCORECARD = Object.freeze([
  {
    engine: 'OddsEngineV4',
    version: '4.8.6',
    role: 'Primary cricket book',
    score: 10.0,
    sports: ['cricket'],
  },
  {
    engine: 'OtherSportsEngineV4',
    version: '4.8.6',
    role: 'Soccer / basketball / tennis / AF',
    score: 10.0,
    sports: ['soccer', 'esoccer', 'basketball', 'tennis', 'american-football'],
  },
  {
    engine: 'OddsEngineV3',
    version: '3.0.0',
    role: 'Cricket catalog / fallback / shadow',
    score: 7.8,
    sports: ['cricket'],
  },
  {
    engine: 'V3 otherSportsOdds',
    version: 'legacy',
    role: 'Legacy non-cricket fallback',
    score: 5.5,
    sports: ['soccer', 'basketball', 'tennis', 'other'],
  },
]);

export function getOddsEngineScorecard() {
  return ODDS_ENGINE_SCORECARD.map((row) => ({ ...row }));
}
