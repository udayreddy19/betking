/**
 * Centralized Match State Engine & Event-Driven Store.
 * Single Source of Truth for all live match scores, statistics, commentary, and odds.
 * Eliminates all duplicated component-level score calculations.
 */

import { formatTeamShortName } from '../utils/teamShortName';
import { looksLikeMirroredFirstInnings, isCricketSecondInnings } from '../utils/cricketScores';

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
    const ld = payload.liveDetails || payload.live || {};
    const team1Name = payload.team1?.name || payload.matchHeader?.team1?.name || safePrevious.teams?.team1?.name || 'Team 1';
    const team2Name = payload.team2?.name || payload.matchHeader?.team2?.name || safePrevious.teams?.team2?.name || 'Team 2';

    const team1Short = formatTeamShortName(team1Name, payload.team1?.shortName || safePrevious.teams?.team1?.shortName);
    const team2Short = formatTeamShortName(team2Name, payload.team2?.shortName || safePrevious.teams?.team2?.shortName);

    const commStr = ld.commentary || payload.commentary || '';
    const matchFormat = ld.matchFormat || payload.matchFormat || payload.matchType || safePrevious.matchFormat || 'Cricket';

    const matchesTeam = (nameOrToken, targetFull, targetShort) => {
      if (!nameOrToken || !targetFull) return false;
      const str = String(nameOrToken).toLowerCase().trim();
      const fn = String(targetFull).toLowerCase().trim();
      const sn = String(targetShort || '').toLowerCase().trim();
      if (!str) return false;
      if (str === fn || str === sn) return true;
      if (fn.includes(str) || str.includes(fn.slice(0, Math.max(3, fn.length)))) return true;
      if (sn && (str.includes(sn) || sn.includes(str))) return true;
      return false;
    };

    // 1. Gather all innings into a unified inningsList
    let inningsList = [];
    if (Array.isArray(ld.testInnings) && ld.testInnings.length > 0) {
      inningsList = ld.testInnings.map((inn, idx) => ({
        inningsId: inn.inningsId ?? idx + 1,
        batTeam: inn.batTeam || '',
        runs: inn.runs ?? 0,
        wickets: inn.wickets ?? 0,
        overs: inn.overs || '0.0',
        declared: inn.declared || false,
        allOut: inn.allOut || false,
      }));
    } else {
      const needMatch = commStr.match(/(?:([A-Za-z\s]+)\s+)?need\s+(\d+)\s+runs?(?:\s+in\s+(\d+)\s+balls?)?/i);
      const mirrored = looksLikeMirroredFirstInnings(payload, ld);
      const isSecond = !mirrored && (
        isCricketSecondInnings(payload, ld)
        || (Number(ld.firstRuns) > 0 && Number(ld.chaseRuns) > 0 && Number(ld.firstRuns) !== Number(ld.chaseRuns))
        || (ld.firstTeamName && ld.chaseTeamName && Number(ld.chaseRuns) > 0)
        || Boolean(needMatch && Number(ld.firstRuns) > 0)
      );

      if (isSecond) {
        let firstRuns = ld.firstRuns ?? ld.score1 ?? 0;
        let firstWkts = ld.firstWickets ?? ld.wickets1 ?? 0;
        let firstOvs = ld.firstOvers ?? '50.0';
        let firstTeam = ld.firstTeamName || safePrevious.teams?.team1?.name || team1Name;

        let chaseRuns = ld.chaseRuns ?? ld.score2 ?? 0;
        let chaseWkts = ld.chaseWickets ?? ld.wickets2 ?? 0;
        let chaseOvs = ld.chaseOvers ?? ld.overs2 ?? '0.0';
        let chaseTeam = ld.chaseTeamName || (needMatch?.[1] ? needMatch[1].trim() : team2Name);

        if (needMatch) {
          const req = parseInt(needMatch[2], 10);
          if (firstRuns === 0) firstRuns = chaseRuns + req - 1;
        }

        inningsList.push({
          inningsId: 1,
          batTeam: firstTeam,
          runs: firstRuns,
          wickets: firstWkts,
          overs: firstOvs,
          declared: Boolean(ld.declared || ld.declared1 || (ld.testInnings && ld.testInnings[0]?.declared)),
        });

        inningsList.push({
          inningsId: 2,
          batTeam: chaseTeam,
          runs: chaseRuns,
          wickets: chaseWkts,
          overs: chaseOvs,
          declared: Boolean(ld.declared2 || (ld.testInnings && ld.testInnings[1]?.declared)),
        });
      } else {
        const batTeam = ld.firstTeamName || team1Name;
        inningsList.push({
          inningsId: 1,
          batTeam,
          runs: ld.runs ?? payload.runs ?? 0,
          wickets: ld.wickets ?? payload.wickets ?? 0,
          overs: ld.overs ?? payload.overs ?? '0.0',
          declared: Boolean(ld.declared || ld.declared1 || (ld.testInnings && ld.testInnings[0]?.declared)),
        });
      }
    }

    inningsList.sort((a, b) => a.inningsId - b.inningsId);

    // 2. Map innings to team1 and team2
    const team1Innings = inningsList.filter((i) => matchesTeam(i.batTeam, team1Name, team1Short));
    const team2Innings = inningsList.filter((i) => matchesTeam(i.batTeam, team2Name, team2Short));

    const t1TotalRuns = team1Innings.reduce((sum, i) => sum + i.runs, 0);
    const t2TotalRuns = team2Innings.reduce((sum, i) => sum + i.runs, 0);

    const isTestMatch = /test/i.test(matchFormat);
    const formatTeamScore = (innings, defaultRuns = 0, defaultWkts = 0, isDeclared = false) => {
      if (innings.length === 0) {
        return '0/0';
      }
      if (innings.length === 1 || !isTestMatch) {
        const inn = innings[innings.length - 1];
        const dec = (inn.declared || isDeclared) ? 'd' : '';
        return `${inn.runs}/${inn.wickets}${dec}`;
      }
      return innings.map((i) => `${i.runs}/${i.wickets}${(i.declared || isDeclared) ? 'd' : ''}`).join(' & ');
    };

    const sport = payload.sport || safePrevious.sport || 'cricket';
    const isCricket = sport === 'cricket' || sport === 'virtual-cricket';

    let t1ScoreStr, t2ScoreStr;
    if (isCricket) {
      t1ScoreStr = formatTeamScore(team1Innings, payload.runs ?? ld.runs ?? 0, payload.wickets ?? ld.wickets ?? 0, Boolean(ld.declared || ld.declared1));
      t2ScoreStr = formatTeamScore(team2Innings, ld.score2 ?? 0, ld.wickets2 ?? 0, Boolean(ld.declared2));
    } else {
      t1ScoreStr = String(ld.score1 ?? payload.score1 ?? payload.team1Score ?? payload.team1?.score ?? 0);
      t2ScoreStr = String(ld.score2 ?? payload.score2 ?? payload.team2Score ?? payload.team2?.score ?? 0);
    }

    // 3. Current active innings
    const currentInn = inningsList[inningsList.length - 1] || {
      inningsId: 1,
      batTeam: team1Name,
      runs: payload.runs ?? ld.runs ?? 0,
      wickets: payload.wickets ?? ld.wickets ?? 0,
      overs: payload.overs ?? ld.overs ?? '0.0',
    };

    const currentInnId = currentInn.inningsId;
    const batTeamName = currentInn.batTeam || team1Name;
    const bowlTeamName = matchesTeam(batTeamName, team1Name, team1Short) ? team2Name : team1Name;
    const currentRuns = currentInn.runs ?? 0;
    const currentWickets = currentInn.wickets ?? 0;
    const currentOvers = currentInn.overs || '0.0';

    const currentBalls = this.oversToBalls(currentOvers);
    const runRate = currentBalls > 0 ? (currentRuns / (currentBalls / 6)).toFixed(2) : '0.00';

    // 4. Is Chase & Target
    const isTest = /test/i.test(matchFormat) || inningsList.length > 2;
    const isChaseInnings = isTest ? (currentInnId === 4) : (currentInnId >= 2);

    let chaseState = null;
    if (isChaseInnings) {
      let target = ld.testTarget || ld.target || null;
      let reqRuns = null;

      const needMatch = commStr.match(/(?:([A-Za-z\s]+)\s+)?need\s+(\d+)\s+runs?(?:\s+in\s+(\d+)\s+balls?)?/i);
      if (needMatch) {
        reqRuns = parseInt(needMatch[2], 10);
        if (!target) target = currentRuns + reqRuns;
      }

      if (!target) {
        const oppTotalRuns = matchesTeam(batTeamName, team1Name, team1Short) ? t2TotalRuns : t1TotalRuns;
        const currentPreviousRuns = (matchesTeam(batTeamName, team1Name, team1Short) ? team1Innings : team2Innings)
          .slice(0, -1)
          .reduce((s, i) => s + i.runs, 0);

        if (oppTotalRuns > 0) {
          target = (oppTotalRuns - currentPreviousRuns) + 1;
        } else {
          target = null;
        }
      }

      if (target && target > 0) {
        if (reqRuns == null) reqRuns = Math.max(0, target - currentRuns);
        const maxBalls = (matchFormat === 'T20' || matchFormat === 'T20I') ? 120 : (isTest ? null : 300);
        const remBalls = maxBalls ? Math.max(0, maxBalls - currentBalls) : null;
        const remOvers = remBalls ? (remBalls / 6).toFixed(1) : null;
        const reqRunRate = remBalls && remBalls > 0 ? (reqRuns / (remBalls / 6)).toFixed(2) : '0.00';

        chaseState = {
          target,
          requiredRuns: reqRuns,
          remainingBalls: remBalls,
          remainingOvers: remOvers,
          requiredRunRate: reqRunRate,
        };
      }
    }

    // 5. Lead / Trail State
    const diff = t1TotalRuns - t2TotalRuns;
    const leadTrailState = {
      lead: diff !== 0 ? Math.abs(diff) : null,
      trail: null,
      leadingTeam: diff > 0 ? team1Name : (diff < 0 ? team2Name : null),
    };

    // 6. Current Batters & Bowler
    const currentBatters = {
      striker: (ld.batter1?.name ? ld.batter1 : null)
        || (safePrevious.currentBatters?.striker?.name ? safePrevious.currentBatters.striker : null)
        || { name: '', runs: 0, balls: 0, fours: 0, sixes: 0, strikeRate: '0.00' },
      nonStriker: (ld.batter2?.name ? ld.batter2 : null)
        || (safePrevious.currentBatters?.nonStriker?.name ? safePrevious.currentBatters.nonStriker : null)
        || { name: '', runs: 0, balls: 0, fours: 0, sixes: 0, strikeRate: '0.00' },
    };

    const currentBowler = (ld.bowler?.name ? ld.bowler : null)
      || (safePrevious.currentBowler?.name ? safePrevious.currentBowler : null)
      || { name: '', overs: '0.0', maidens: 0, runs: 0, wickets: 0, economy: '0.00' };

    const partnership = ld.partnership || safePrevious.partnership || { runs: 0, balls: 0 };
    const recentBalls = ld.currentOverBalls || safePrevious.recentBalls || [];

    const bettingMarkets = this.computeBettingMarkets({
      team1Name, team2Name, t1Runs: t1TotalRuns, t2Runs: t2TotalRuns,
      chaseState, isSecondInnings: isChaseInnings, payload,
    });

    const teamWickets = (innings) => {
      if (innings.length === 0) return 0;
      if (isTestMatch) return innings.reduce((s, i) => s + (i.wickets ?? 0), 0);
      return innings[innings.length - 1]?.wickets ?? 0;
    };

    return {
      matchId,
      matchFormat,
      sport: payload.sport || safePrevious.sport || 'cricket',
      matchState: payload.matchState || (payload.isLive ? 'in' : 'pre'),
      isLive: payload.isLive ?? true,
      teams: {
        team1: { name: team1Name, shortName: team1Short, score: t1ScoreStr, runs: t1TotalRuns, wickets: teamWickets(team1Innings), overs: team1Innings[team1Innings.length - 1]?.overs || '0.0', innings: team1Innings },
        team2: { name: team2Name, shortName: team2Short, score: t2ScoreStr, runs: t2TotalRuns, wickets: teamWickets(team2Innings), overs: team2Innings[team2Innings.length - 1]?.overs || '0.0', innings: team2Innings },
      },
      testInnings: inningsList,
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
      bettingMarkets,
      commentary: commStr,
      lastUpdated: new Date().toISOString(),
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
    // OddsEngineV3 is the sole authoritative pricing path — never invent markets here.
    return [];
  }
}

export const centralizedMatchEngine = new CentralizedMatchStateEngine();
