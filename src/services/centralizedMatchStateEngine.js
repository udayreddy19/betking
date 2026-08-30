/**
 * Centralized Match State Engine & Event-Driven Store.
 * Single Source of Truth for all live match scores, statistics, commentary, and odds.
 * Eliminates all duplicated component-level score calculations.
 */

import { formatTeamShortName } from '../utils/teamShortName';
import { normalizeMatch, detectCanonicalFormat, CRICKET_FORMATS } from '../utils/cricketMatchNormalizer';

class CentralizedMatchStateEngine {
  constructor() {
    /** @type {Map<string, object>} Stores canonical MatchState snapshots by matchId */
    this.matchStates = new Map();

    /** @type {Map<string, Set<Function>>} Subscribers per matchId */
    this.listeners = new Map();

    /** @type {Map<string, number>} Version count per matchId for React sync */
    this.versions = new Map();
  }

  /**
   * Subscribe to state updates for a specific match.
   */
  subscribe(matchId, callback) {
    if (!matchId) return () => { };
    if (!this.listeners.has(matchId)) {
      this.listeners.set(matchId, new Set());
    }
    this.listeners.get(matchId).add(callback);

    return () => {
      const set = this.listeners.get(matchId);
      if (set) {
        set.delete(callback);
        if (set.size === 0) this.listeners.delete(matchId);
      }
    };
  }

  /**
   * Get version tag for React useSyncExternalStore.
   */
  getVersion(matchId) {
    return this.versions.get(matchId) || 0;
  }

  /**
   * Get current canonical MatchState snapshot.
   */
  getSnapshot(matchId, fallbackMatch = null) {
    if (!matchId) return null;
    const stored = this.matchStates.get(matchId);
    if (fallbackMatch) {
      return this.computeCanonicalMatchState(matchId, fallbackMatch, stored || {});
    }
    return stored || null;
  }

  /**
   * Notify all subscribers of state changes.
   */
  notify(matchId) {
    this.versions.set(matchId, (this.versions.get(matchId) || 0) + 1);
    const set = this.listeners.get(matchId);
    if (set) {
      set.forEach((fn) => {
        try {
          fn();
        } catch (err) {
          console.error(`MatchState subscription error for ${matchId}:`, err);
        }
      });
    }
  }

  /**
   * Process incoming ball event or live payload and compute canonical MatchState.
   */
  updateMatchState(matchId, rawPayload = {}) {
    if (!matchId) return null;

    const existingState = this.matchStates.get(matchId) || {};
    const computedState = this.computeCanonicalMatchState(matchId, rawPayload, existingState);

    this.matchStates.set(matchId, computedState);
    this.notify(matchId);

    return computedState;
  }

  /**
   * Compute single canonical MatchState object with all derived metrics for any format.
   */
  computeCanonicalMatchState(matchId, payload, previous = {}) {
    const safePrevious = (previous && previous.matchId === matchId) ? previous : {};
    
    // Authoritative normalizer produces single consistent representation
    const normalized = normalizeMatch(
      { id: matchId, ...payload },
      safePrevious,
      { requestId: `engine-${matchId}-${Date.now()}` }
    );

    const team1Name = normalized.homeTeam.name;
    const team2Name = normalized.awayTeam.name;
    const team1Short = normalized.homeTeam.shortName;
    const team2Short = normalized.awayTeam.shortName;

    const inningsList = normalized.innings || [];
    const team1Innings = normalized.homeTeam.innings || [];
    const team2Innings = normalized.awayTeam.innings || [];

    const t1TotalRuns = normalized.homeTeam.runs;
    const t2TotalRuns = normalized.awayTeam.runs;

    const isTestMatch = normalized.isTest;
    const matchFormat = normalized.format;

    const t1ScoreStr = normalized.homeTeam.score;
    const t2ScoreStr = normalized.awayTeam.score;

    const currentInn = normalized.currentInnings || {
      number: 1,
      batTeam: team1Name,
      runs: 0,
      wickets: 0,
      overs: '0.0',
    };

    const currentInnId = currentInn.number || 1;
    const batTeamName = currentInn.batTeam || team1Name;
    const bowlTeamName = (batTeamName === team1Name || batTeamName === team1Short) ? team2Name : team1Name;
    const currentRuns = currentInn.runs ?? 0;
    const currentWickets = currentInn.wickets ?? 0;
    const currentOvers = currentInn.overs || '0.0';

    const currentBalls = this.oversToBalls(currentOvers);
    const runRate = currentBalls > 0 ? (currentRuns / (currentBalls / 6)).toFixed(2) : '0.00';

    // Chase & Target State
    const isChaseInnings = isTestMatch ? (currentInnId === 4) : (currentInnId >= 2);
    let chaseState = null;

    if (isChaseInnings) {
      const oppTotalRuns = (batTeamName === team1Name || batTeamName === team1Short) ? t2TotalRuns : t1TotalRuns;
      let target = (oppTotalRuns > 0) ? (oppTotalRuns + 1) : null;
      let reqRuns = target ? Math.max(0, target - currentRuns) : null;

      const maxBalls = (matchFormat === CRICKET_FORMATS.T20 || matchFormat === CRICKET_FORMATS.SRL) ? 120 : (isTestMatch ? null : 300);
      const remBalls = maxBalls ? Math.max(0, maxBalls - currentBalls) : null;
      const remOvers = remBalls ? (remBalls / 6).toFixed(1) : null;
      const reqRunRate = remBalls && remBalls > 0 && reqRuns != null ? (reqRuns / (remBalls / 6)).toFixed(2) : '0.00';

      if (target && target > 0) {
        chaseState = {
          target,
          requiredRuns: reqRuns,
          remainingBalls: remBalls,
          remainingOvers: remOvers,
          requiredRunRate: reqRunRate,
        };
      }
    }

    // Lead / Trail State
    const diff = t1TotalRuns - t2TotalRuns;
    const leadTrailState = {
      lead: diff !== 0 ? Math.abs(diff) : null,
      trail: null,
      leadingTeam: diff > 0 ? team1Name : (diff < 0 ? team2Name : null),
    };

    const currentBatters = normalized.currentBatters;
    const currentBowler = normalized.currentBowler;

    const partnership = normalized.rawLiveDetails?.partnership || safePrevious.partnership || { runs: 0, balls: 0 };
    const recentBalls = normalized.recentBalls;

    const teamWickets = (inns) => {
      if (!inns || inns.length === 0) return 0;
      if (isTestMatch) return inns.reduce((s, i) => s + (i.wickets ?? 0), 0);
      return inns[inns.length - 1]?.wickets ?? 0;
    };

    return {
      matchId,
      matchFormat,
      isTest: isTestMatch,
      maxOvers: normalized.maxOvers,
      sport: payload.sport || safePrevious.sport || 'cricket',
      matchState: normalized.matchState,
      isLive: normalized.isLive,
      status: normalized.status,
      teams: {
        team1: {
          name: team1Name,
          shortName: team1Short,
          score: t1ScoreStr,
          runs: t1TotalRuns,
          wickets: teamWickets(team1Innings),
          overs: team1Innings[team1Innings.length - 1]?.overs || '0.0',
          innings: team1Innings,
        },
        team2: {
          name: team2Name,
          shortName: team2Short,
          score: t2ScoreStr,
          runs: t2TotalRuns,
          wickets: teamWickets(team2Innings),
          overs: team2Innings[team2Innings.length - 1]?.overs || '0.0',
          innings: team2Innings,
        },
      },
      homeTeam: normalized.homeTeam,
      awayTeam: normalized.awayTeam,
      testInnings: normalized.testInnings || inningsList,
      inningsHistory: inningsList,
      currentInnings: {
        number: currentInnId,
        batTeam: batTeamName,
        bowlTeam: bowlTeamName,
        runs: currentRuns,
        wickets: currentWickets,
        overs: currentOvers,
        runRate,
        isChase: isChaseInnings,
      },
      chaseState,
      leadTrailState,
      currentBatters,
      currentBowler,
      partnership,
      recentBalls,
      bettingMarkets: [],
      commentary: normalized.commentary,
      lastUpdated: new Date().toISOString(),
      version: normalized.version,
    };
  }

  oversToBalls(oversStr) {
    if (!oversStr) return 0;
    const str = String(oversStr).trim();
    if (str.includes('.')) {
      const [ov, b] = str.split('.');
      return (parseInt(ov, 10) * 6) + (parseInt(b, 10) || 0);
    }
    return Math.round(parseFloat(str) * 6);
  }

  computeBettingMarkets() {
    return [];
  }
}

export const centralizedMatchEngine = new CentralizedMatchStateEngine();
