/**
 * Operator-facing odds engine marks (product scorecard).
 * Scores are honest engineering readiness estimates — NOT vanity 10/10.
 * Update only when measured KPIs / audit evidence support a change.
 * See AUDIT_REPORT_BEFORE.md and scripts/scoreProductionExcellence.mjs.
 */

export const ODDS_ENGINE_SCORECARD = Object.freeze([
  {
    engine: 'OddsEngineV4',
    version: '4.9.0',
    role: 'Primary cricket book',
    score: 8.3,
    scoreBasis: 'AUDIT_ESTIMATE',
    sports: ['cricket'],
  },
  {
    engine: 'OtherSportsEngineV4',
    version: '4.9.0',
    role: 'Soccer / basketball / tennis / AF / baseball / ice-hockey',
    score: 8.6,
    scoreBasis: 'AUDIT_ESTIMATE',
    sports: ['soccer', 'esoccer', 'basketball', 'tennis', 'american-football', 'baseball', 'ice-hockey'],
  },
  {
    engine: 'OddsEngineV3',
    version: '3.0.0',
    role: 'Cricket catalog / fallback / shadow',
    score: 7.8,
    scoreBasis: 'AUDIT_ESTIMATE',
    sports: ['cricket'],
  },
  {
    engine: 'V3 otherSportsOdds',
    version: 'legacy',
    role: 'Legacy non-cricket fallback',
    score: 5.5,
    scoreBasis: 'AUDIT_ESTIMATE',
    sports: ['soccer', 'basketball', 'tennis', 'other'],
  },
]);

/**
 * OddsEngineV4 version ladder — honest historical readiness (not Brier).
 * Current tip mirrors independent scorer (~83/100 → 8.3/10) with calibration still INSUFFICIENT_DATA (N=0).
 */
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
  {
    version: '4.9.0',
    mark: 8.3,
    note: 'Integrity + format resources + settlement graders + cal/pricing scaffolds; N=0 so not MODEL_CALIBRATED',
  },
]);

export function getOddsEngineScorecard() {
  return ODDS_ENGINE_SCORECARD.map((row) => ({ ...row }));
}

export function getOddsEngineV4VersionMarks() {
  return ODDS_ENGINE_V4_VERSION_MARKS.map((row) => ({ ...row }));
}
