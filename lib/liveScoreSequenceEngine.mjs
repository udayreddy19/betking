/**
 * Live Score Sequence Engine & Out-Of-Order Event Guard
 * Prevents score regressions (e.g. 150/4 after 152/4), enforces event sequence idempotency,
 * and processes sport-specific scoring models (including 5-Day Test Cricket).
 */

import { sportsDataRegistry } from './sportsDataRegistry.mjs';

const PROCESSED_EVENT_FINGERPRINTS = new Set();

// Clean up old fingerprints every 10 minutes
setInterval(() => {
  if (PROCESSED_EVENT_FINGERPRINTS.size > 5000) {
    PROCESSED_EVENT_FINGERPRINTS.clear();
  }
}, 10 * 60 * 1000);

export class LiveScoreSequenceEngine {
  /** Generate unique idempotent event fingerprint */
  generateFingerprint(canonicalMatchId, liveScore) {
    if (!liveScore) return null;
    const runs = liveScore.runs || liveScore.home || 0;
    const wickets = liveScore.wickets || 0;
    const overs = liveScore.overs || 0;
    const innings = liveScore.currentInnings || 1;
    return `${canonicalMatchId}:i${innings}:r${runs}:w${wickets}:o${overs}`;
  }

  /**
   * Validate and apply live score payload to canonical match
   * Rejects out-of-order score regressions and duplicate event fingerprints
   */
  processLiveScoreUpdate(canonicalMatchId, newLiveScore, providerName = 'generic') {
    const match = sportsDataRegistry.getMatch(canonicalMatchId);
    if (!match) return { success: false, reason: 'Match not found' };

    // 1. Idempotency Check
    const fingerprint = this.generateFingerprint(canonicalMatchId, newLiveScore);
    if (fingerprint && PROCESSED_EVENT_FINGERPRINTS.has(fingerprint)) {
      return { success: true, isDuplicate: true, message: 'Duplicate live score event ignored', match };
    }

    const currentScore = match.liveScore || {};
    const curInnings = currentScore.currentInnings || 1;
    const newInnings = newLiveScore.currentInnings || curInnings;

    // 2. Score Monotonicity Guard (Within the same innings)
    if (newInnings === curInnings && !newLiveScore.isDLReset) {
      const curRuns = Number(currentScore.runs) || 0;
      const newRuns = Number(newLiveScore.runs) || 0;
      const curWickets = Number(currentScore.wickets) || 0;
      const newWickets = Number(newLiveScore.wickets) || 0;

      // Detect regression
      if (newRuns < curRuns || newWickets < curWickets) {
        console.warn(`[Score Sequence Warning] Score regression detected for ${canonicalMatchId}: ${newRuns}/${newWickets} < ${curRuns}/${curWickets}. Event rejected.`);
        return {
          success: false,
          isRegression: true,
          reason: `Out-of-order score regression rejected: ${newRuns}/${newWickets} < ${curRuns}/${curWickets}`,
          match,
        };
      }
    }

    // 3. Test Cricket Specific Validation
    if (newLiveScore.isTestMatch || match.league?.leagueName?.toLowerCase().includes('test')) {
      newLiveScore.isTestMatch = true;
      newLiveScore.dayNumber = newLiveScore.dayNumber || currentScore.dayNumber || 1;
      newLiveScore.session = newLiveScore.session || currentScore.session || 'MORNING';

      // Compute lead or trail from batting team's perspective
      const battingTeamRuns = Number(newLiveScore.runs) || 0;
      const opposingTeamRuns = Number(newLiveScore.score2) || 0;
      const diff = battingTeamRuns - opposingTeamRuns;
      newLiveScore.leadOrTrail = diff > 0 ? 'LEAD' : (diff < 0 ? 'TRAIL' : 'EVEN');
      newLiveScore.leadRuns = Math.abs(diff);
    }

    // 4. Update Canonical Match Live Score
    match.liveScore = {
      ...currentScore,
      ...newLiveScore,
      lastUpdatedAt: new Date().toISOString(),
    };
    match.lastUpdated = new Date().toISOString();

    if (fingerprint) {
      PROCESSED_EVENT_FINGERPRINTS.add(fingerprint);
    }

    return {
      success: true,
      isDuplicate: false,
      isRegression: false,
      match,
    };
  }
}

export const liveScoreSequenceEngine = new LiveScoreSequenceEngine();
