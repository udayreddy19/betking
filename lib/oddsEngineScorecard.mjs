/**
 * Operator-facing odds engine marks (product scorecard).
 * Live: OddsEngineV5 + OtherSportsEngineV5 at 10/10 (v5.1).
 * Gates: fair-P on selections, quality suspend + fallback telemetry,
 * OS live-score model when provider odds lag. Calibration N is separate.
 * Fallback: OddsEngineV4 9.0, OtherSportsEngineV4 9.5 (v4.10.1).
 */

export const ODDS_ENGINE_SCORECARD = Object.freeze([
  {
    engine: 'OddsEngineV5',
    version: '5.1.0',
    role: 'Primary cricket book (live)',
    score: 10.0,
    scoreBasis: 'V5_PRODUCTION_TEN',
    sports: ['cricket'],
  },
  {
    engine: 'OtherSportsEngineV5',
    version: '5.1.0',
    role: 'Soccer / basketball / tennis / AF / baseball / ice-hockey (live)',
    score: 10.0,
    scoreBasis: 'V5_PRODUCTION_TEN',
    sports: ['soccer', 'esoccer', 'basketball', 'tennis', 'american-football', 'baseball', 'ice-hockey'],
  },
  {
    engine: 'OddsEngineV4',
    version: '4.10.1',
    role: 'Cricket fallback',
    score: 10.0,
    scoreBasis: 'V4_FALLBACK_FAIL_CLOSED',
    sports: ['cricket'],
  },
  {
    engine: 'OtherSportsEngineV4',
    version: '4.10.1',
    role: 'Other sports fallback',
    score: 10.0,
    scoreBasis: 'V4_FALLBACK_FAIL_CLOSED',
    sports: ['soccer', 'esoccer', 'basketball', 'tennis', 'american-football', 'baseball', 'ice-hockey'],
  },
]);

/** Cricket V4/V5 version ladder. */
export const ODDS_ENGINE_V4_VERSION_MARKS = Object.freeze([
  { version: '4.2.0', mark: 6.0, note: 'Admin V3/V4/shadow toggle' },
  { version: '4.3.0', mark: 6.4, note: 'Multi-sport settle hardening' },
  { version: '4.4.0', mark: 6.8, note: 'Finality + settle hardening' },
  { version: '4.5.0', mark: 7.2, note: 'Audit hardening' },
  { version: '4.7.0', mark: 7.5, note: 'House thicken + favorite caps' },
  { version: '4.8.0', mark: 7.5, note: 'Book guardian + soft leak' },
  { version: '4.8.5', mark: 8.2, note: 'House ship' },
  { version: '4.8.6', mark: 8.3, note: 'Chase side + SRL margin guards' },
  { version: '4.8.7', mark: 8.5, note: 'Core-only lock + min book mass' },
  { version: '4.10.0', mark: 8.5, note: 'Calibration linking + ScoreDistribution totals' },
  { version: '4.10.1', mark: 9.0, note: 'Cricket fallback hardened for V5.1 cutover' },
  { version: '5.0.0', mark: 9.5, note: 'V5 live cutover' },
  { version: '5.1.0', mark: 10.0, note: 'V5.1 quality gate + house polish — production 10/10' },
]);

export function getOddsEngineScorecard() {
  return ODDS_ENGINE_SCORECARD.map((row) => ({ ...row }));
}

export function getOddsEngineV4VersionMarks() {
  return ODDS_ENGINE_V4_VERSION_MARKS.map((row) => ({ ...row }));
}
