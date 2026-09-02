/**
 * Build CanonicalMatchState from a live aggregator / match-detail object.
 * Passes through provider odds when present; never invents scores or odds.
 */

import { createCanonicalMatchState } from './models/CanonicalMatchState.mjs';
import { getFormatRules, resolveCricketFormat } from './format/CricketFormatRules.mjs';
import { isCricketMatchCompleted } from '../../src/utils/cricketMatchComplete.js';
import { oversToBallsForMatch } from '../../src/utils/cricketFormat.js';
import { teamNameMatches } from '../../src/utils/cricketScores.js';

function parseOversToBalls(oversStr, match, ballsPerOver = 6) {
  if (oversStr == null || oversStr === '') return 0;
  const str = String(oversStr).trim();
  if (/ball/i.test(str)) return parseInt(str, 10) || 0;
  // Hundred feeds often send total balls as "64.0" — use match-aware conversion.
  if (match) return oversToBallsForMatch(str, match);
  const parts = str.split('.');
  const overs = parseInt(parts[0], 10) || 0;
  const balls = parseInt(parts[1], 10) || 0;
  return overs * ballsPerOver + balls;
}

/** Prefer unique match; refuse ambiguous fuzzy hits (e.g. South Africa vs South Australia). */
function whichTeam(label, team1, team2) {
  if (!label) return null;
  const t1Name = typeof team1 === 'string' ? team1 : (team1?.name || '');
  const t2Name = typeof team2 === 'string' ? team2 : (team2?.name || '');
  const t1Short = typeof team1 === 'object' && team1
    ? String(team1.shortName || team1.id || '')
    : '';
  const t2Short = typeof team2 === 'object' && team2
    ? String(team2.shortName || team2.id || '')
    : '';
  const l = String(label).toLowerCase().trim();

  if (t1Name && t1Name.toLowerCase() === l) return 1;
  if (t2Name && t2Name.toLowerCase() === l) return 2;
  if (t1Short && t1Short.toLowerCase() === l) return 1;
  if (t2Short && t2Short.toLowerCase() === l) return 2;

  const hit = (name, short) => (
    (name && (teamNameMatches(name, label) || teamNameMatches(label, name)))
    || (short && (teamNameMatches(short, label) || teamNameMatches(label, short)
      || short.toLowerCase() === l))
  );
  const m1 = hit(t1Name, t1Short);
  const m2 = hit(t2Name, t2Short);
  if (m1 && !m2) return 1;
  if (m2 && !m1) return 2;
  return null;
}

function isNonZeroOvers(value) {
  if (value == null || value === '') return false;
  const s = String(value).trim();
  return s !== '0' && s !== '0.0';
}

/**
 * True when the chase is underway. Must not treat team2 batting first
 * (score2/wickets2/overs2 populated) or a leaked chaseOvers "0.0" as 2nd innings.
 */
export function isSecondInnings(match, ld = {}) {
  const inningsId = Number(ld.inningsId) || 0;
  if (inningsId >= 2) return true;

  const chaseProgress = Number(ld.chaseRuns) > 0 || Number(ld.chaseWickets) > 0;
  const bothTeamsScored = () => {
    const s1 = Number(match?.team1?.runs ?? ld.score1 ?? 0);
    const s2 = Number(match?.team2?.runs ?? 0);
    return s1 > 0 && s2 > 0;
  };

  // Explicit first-innings feeds: only upgrade on real chase signals.
  if (inningsId === 1) {
    if (chaseProgress) return true;
    if (bothTeamsScored()) return true;
    return false;
  }

  // Unlabeled feeds (CREX/ESPN): never treat overs2 or bare chaseTeamName as chase.
  if (chaseProgress) return true;
  // Named chase with overs clock (including "0.0" at chase start) — real chase begin
  if (ld.chaseTeamName && ld.chaseOvers != null && String(ld.chaseOvers).trim() !== '') {
    return true;
  }
  if (isNonZeroOvers(ld.chaseOvers) && Number(ld.firstRuns) > 0) return true;
  // Real innings/chase language only — not "second slip" / "good chase from the fielder"
  if (/\b(second\s+innings|2nd\s+innings|target\s+\d+|chas(?:e|ing)\s+\d+|need(?:s|ed)?\s+\d+\s+runs|to\s+chase\b|in\s+the\s+chase)\b/i.test(
    String(ld.commentary || match?.time || ''),
  )) return true;
  if (bothTeamsScored()) return true;
  return false;
}

function resolveSport(match) {
  const raw = String(match?.sport || 'cricket').toLowerCase();
  if (raw.includes('cricket')) return 'CRICKET';
  return raw.replace(/[^a-z]/g, '').toUpperCase() || 'CRICKET';
}

function resolveFormat(match) {
  return resolveCricketFormat(match);
}

function teamId(team, fallback) {
  return String(team?.id || team?.shortName || fallback);
}

export function extractProviderOdds(match) {
  const stored = match?.providerOdds || match?.preOdds || match?.marketReferenceData?.providerOdds;
  const o = stored && (Number(stored.home ?? stored.team1) > 1)
    ? stored
    : (String(match?.oddsSource || '') === 'OddsEngineV3' ? null : (match?.odds || {}));
  if (!o) return null;
  const home = Number(o.home ?? o.team1);
  const away = Number(o.away ?? o.team2);
  if (!(home > 1) || !(away > 1)) return null;
  return {
    home,
    away,
    team1: home,
    team2: away,
    draw: o.draw != null ? Number(o.draw) : null,
  };
}

/**
 * @param {object} match
 * @param {{ stateVersion?: number }} [opts]
 * @returns {import('./models/CanonicalMatchState.mjs').CanonicalMatchState}
 */
export function buildCanonicalFromMatch(match, opts = {}) {
  if (!match) throw new Error('buildCanonicalFromMatch: match required');

  const ld = match.liveDetails || {};
  const sport = resolveSport(match);
  const format = resolveFormat(match);
  const rules = getFormatRules(format) || getFormatRules('T20');
  const ballsPerInnings = rules.ballsPerInnings;
  const ballsPerOver = rules.ballsPerOver || 6;

  const t1Name = match.team1?.name || match.team1 || 'Team 1';
  const t2Name = match.team2?.name || match.team2 || 'Team 2';
  const t1Id = teamId(match.team1, 'team1');
  const t2Id = teamId(match.team2, 'team2');

  const isSecond = isSecondInnings(match, ld);
  const hasInningsLabels = ld.firstRuns != null
    || ld.chaseRuns != null
    || ld.firstTeamName
    || ld.chaseTeamName
    || ld.firstOvers
    || ld.chaseOvers;

  // Never use liveDetails.runs as first-innings total mid-chase — it is often the chase score.
  const firstRuns = Number(
    ld.firstRuns != null
      ? ld.firstRuns
      : (isSecond ? (ld.score1 ?? 0) : (ld.runs ?? ld.score1 ?? 0)),
  );
  const firstWickets = Number(
    ld.firstWickets != null
      ? ld.firstWickets
      : (isSecond ? (ld.wickets1 ?? 0) : (ld.wickets ?? ld.wickets1 ?? 0)),
  );
  const firstBalls = parseOversToBalls(
    ld.firstOvers || (!isSecond ? ld.overs : null),
    match,
    ballsPerOver,
  );

  const chaseRuns = Number(
    ld.chaseRuns != null
      ? ld.chaseRuns
      : (isSecond ? (ld.score2 ?? 0) : 0),
  );
  const chaseWickets = Number(
    ld.chaseWickets != null
      ? ld.chaseWickets
      : (isSecond ? (ld.wickets2 ?? 0) : 0),
  );

  const oversIsZero = (v) => {
    if (v == null || v === '') return false;
    const s = String(v).trim();
    return s === '0' || s === '0.0';
  };

  // Resolve chase balls carefully:
  // - Explicit chaseOvers "0.0" = start of chase → 0 balls (do NOT fall back to first-innings overs/ballNbr)
  // - Mid-chase missing chaseOvers may use liveDetails.overs
  // - Ignore stale chaseBallNbr / leftover first-innings overs when chase is still 0/0
  let chaseBalls = 0;
  if (ld.chaseOvers != null && String(ld.chaseOvers).trim() !== '') {
    chaseBalls = parseOversToBalls(ld.chaseOvers, match, ballsPerOver);
  } else if (ld.overs2 != null && String(ld.overs2).trim() !== '') {
    chaseBalls = parseOversToBalls(ld.overs2, match, ballsPerOver);
  } else if (isSecond) {
    // At chase start (0/0) with no chaseOvers, do not trust leftover first-innings overs.
    if (chaseRuns === 0 && chaseWickets === 0) {
      chaseBalls = 0;
    } else {
      chaseBalls = parseOversToBalls(ld.overs, match, ballsPerOver);
    }
  }

  let chaseBallsSafe = chaseBalls;
  // Chase still 0/0 but balls look finished ⇒ stale first-innings clock
  if (chaseRuns === 0 && chaseWickets === 0 && chaseBallsSafe >= ballsPerInnings) {
    chaseBallsSafe = 0;
  }
  if (chaseBallsSafe <= 0) {
    const nbr = Number(ld.chaseBallNbr) || 0;
    const chaseJustStarted = oversIsZero(ld.chaseOvers)
      || oversIsZero(ld.overs2)
      || (chaseRuns === 0 && chaseWickets === 0);
    if (chaseJustStarted) {
      chaseBallsSafe = 0;
    } else if (nbr > 0 && nbr < ballsPerInnings) {
      chaseBallsSafe = nbr;
    } else {
      chaseBallsSafe = 0;
    }
  }

  let team1Runs;
  let team1Wickets;
  let team1Balls;
  let team2Runs;
  let team2Wickets;
  let team2Balls;

  const firstSide = whichTeam(ld.firstTeamName, match.team1 || t1Name, match.team2 || t2Name);
  const chaseSide = whichTeam(ld.chaseTeamName, match.team1 || t1Name, match.team2 || t2Name);

  if (hasInningsLabels) {
    // first/chase innings-slot mapping, then remap onto team1/team2
    team1Runs = firstRuns;
    team1Wickets = firstWickets;
    team1Balls = firstBalls;
    team2Runs = isSecond ? chaseRuns : 0;
    team2Wickets = isSecond ? chaseWickets : 0;
    team2Balls = isSecond ? chaseBallsSafe : 0;

    if (firstSide === 2 || chaseSide === 1) {
      // Team2 batted first / team1 chasing — slot totals are first→team1 by default; swap.
      team1Runs = isSecond ? chaseRuns : 0;
      team1Wickets = isSecond ? chaseWickets : 0;
      team1Balls = isSecond ? chaseBallsSafe : 0;
      team2Runs = firstRuns;
      team2Wickets = firstWickets;
      team2Balls = firstBalls;
    } else if (firstSide == null && chaseSide == null && !isSecond) {
      // firstTeamName missing: use team cards so away batting first isn't assigned to team1
      const cardT1 = Number(match.team1?.runs ?? 0) || 0;
      const cardT2 = Number(match.team2?.runs ?? 0) || 0;
      const cardT1W = Number(match.team1?.wickets ?? 0) || 0;
      const cardT2W = Number(match.team2?.wickets ?? 0) || 0;
      if ((cardT2 > 0 || cardT2W > 0) && cardT1 === 0 && cardT1W === 0) {
        team1Runs = 0;
        team1Wickets = 0;
        team1Balls = 0;
        team2Runs = firstRuns;
        team2Wickets = firstWickets;
        team2Balls = firstBalls;
      }
    }
    // Do NOT let match.team*.runs override — those are often innings-slot ordered
    // and would undo firstTeamName remapping into a false chase win.
  } else {
    // Team-aligned feeds (CREX / list cards): score1=team1, score2=team2
    team1Runs = Number(match.team1?.runs ?? ld.score1 ?? (!isSecond ? ld.runs : 0) ?? 0);
    team1Wickets = Number(match.team1?.wickets ?? ld.wickets1 ?? (!isSecond ? ld.wickets : 0) ?? 0);
    team2Runs = Number(match.team2?.runs ?? ld.score2 ?? 0);
    team2Wickets = Number(match.team2?.wickets ?? ld.wickets2 ?? 0);
    team1Balls = parseOversToBalls(
      match.team1?.overs || ld.overs1 || (!isSecond ? ld.overs : null),
      match,
      ballsPerOver,
    );
    team2Balls = parseOversToBalls(
      match.team2?.overs || ld.overs2 || (isSecond ? ld.overs : null),
      match,
      ballsPerOver,
    );
  }

  const currentInnings = isSecond ? 2 : 1;
  let battingTeamId = t1Id;
  let bowlingTeamId = t2Id;

  if (chaseSide === 1) {
    battingTeamId = t1Id;
    bowlingTeamId = t2Id;
  } else if (chaseSide === 2) {
    battingTeamId = t2Id;
    bowlingTeamId = t1Id;
  } else if (isSecond && firstSide === 1) {
    battingTeamId = t2Id;
    bowlingTeamId = t1Id;
  } else if (isSecond && firstSide === 2) {
    battingTeamId = t1Id;
    bowlingTeamId = t2Id;
  } else if (isSecond) {
    // Unlabeled team-aligned chase: finished innings = bowling side.
    const maxWkts = rules.maxWickets || 10;
    const t1Done = team1Balls >= ballsPerInnings || team1Wickets >= maxWkts;
    const t2Done = team2Balls >= ballsPerInnings || team2Wickets >= maxWkts;
    if (t1Done && !t2Done) {
      battingTeamId = t2Id;
      bowlingTeamId = t1Id;
    } else if (t2Done && !t1Done) {
      battingTeamId = t1Id;
      bowlingTeamId = t2Id;
    } else if (team1Balls !== team2Balls) {
      if (team1Balls < team2Balls) {
        battingTeamId = t1Id;
        bowlingTeamId = t2Id;
      } else {
        battingTeamId = t2Id;
        bowlingTeamId = t1Id;
      }
    } else {
      battingTeamId = t2Id;
      bowlingTeamId = t1Id;
    }
  } else if (firstSide === 1) {
    battingTeamId = t1Id;
    bowlingTeamId = t2Id;
  } else if (firstSide === 2) {
    battingTeamId = t2Id;
    bowlingTeamId = t1Id;
  } else if (!isSecond) {
    // Unlabeled first innings: never default to team1 when only team2 is scoring
    const t1Active = team1Runs > 0 || team1Wickets > 0 || team1Balls > 0;
    const t2Active = team2Runs > 0 || team2Wickets > 0 || team2Balls > 0;
    if (t2Active && !t1Active) {
      battingTeamId = t2Id;
      bowlingTeamId = t1Id;
    } else if (t1Active && !t2Active) {
      battingTeamId = t1Id;
      bowlingTeamId = t2Id;
    }
  }

  // Prefer team-card wickets when higher — avoids "1st Dismissal" after a wicket
  // when firstWickets lagged behind team2.wickets (away batting first).
  // Do NOT override runs from team cards here — they are often innings-slot ordered.
  const cardT1Wkts = Number(match.team1?.wickets ?? 0) || 0;
  const cardT2Wkts = Number(match.team2?.wickets ?? 0) || 0;
  team1Wickets = Math.max(team1Wickets, cardT1Wkts);
  team2Wickets = Math.max(team2Wickets, cardT2Wkts);

  const battingRuns = battingTeamId === t1Id ? team1Runs : team2Runs;
  const battingBallsRaw = battingTeamId === t1Id ? team1Balls : team2Balls;
  const isTest = format === 'TEST';
  // Tests have no fixed innings ball cap — do not clamp to 450 or invent a chase target.
  const ballsCompleted = isTest
    ? Math.max(0, battingBallsRaw)
    : Math.min(Math.max(0, battingBallsRaw), ballsPerInnings);
  const ballsRemaining = isTest
    ? Math.max(1, ballsPerInnings)
    : Math.max(0, ballsPerInnings - ballsCompleted);

  const firstInningsRuns = battingTeamId === t1Id ? team2Runs : team1Runs;
  // Limited-overs chase only. Tests (and missing first totals) must not get a fake target.
  const target = !isTest && currentInnings === 2 && firstInningsRuns > 0 ? firstInningsRuns + 1 : null;
  const runsRequired = target != null ? Math.max(0, target - battingRuns) : null;

  const isCompleted = isCricketMatchCompleted(match)
    || match.matchState === 'post'
    || match.status === 'COMPLETED'
    || match.isFinished === true;
  const isLive = !isCompleted && (match.isLive === true || match.matchState === 'in' || match.status === 'LIVE');
  const status = isLive ? 'LIVE' : (isCompleted ? 'COMPLETED' : 'SCHEDULED');

  const providerOdds = extractProviderOdds(match);

  const overHistory = match.overHistory || ld.overHistory || [];
  const hasUsableBalls = Array.isArray(overHistory) && overHistory.some((row) => (
    Array.isArray(row?.balls) && row.balls.some((b) => {
      const s = String(b || '').trim();
      return s && s !== '|';
    })
  ));
  // Explicit false only when feed was checked and empty; leave undefined when unknown.
  let hasBallFeed;
  if (match.hasBallFeed === true || hasUsableBalls) hasBallFeed = true;
  else if (match.hasBallFeed === false) hasBallFeed = false;

  return createCanonicalMatchState({
    matchId: match.id || match.matchId,
    sport,
    format,
    status,
    team1: {
      id: t1Id,
      name: String(t1Name),
      runs: team1Runs,
      wickets: team1Wickets,
      balls: team1Balls,
    },
    team2: {
      id: t2Id,
      name: String(t2Name),
      runs: team2Runs,
      wickets: team2Wickets,
      balls: team2Balls,
    },
    currentInnings,
    battingTeamId,
    bowlingTeamId,
    target,
    runsRequired,
    ballsPerInnings,
    ballsCompleted,
    ballsRemaining,
    batter1: ld.batter1 || null,
    batter2: ld.batter2 || null,
    liveDetails: {
      ...ld,
      odds: providerOdds || ld.odds || null,
      overHistory: overHistory.length ? overHistory : ld.overHistory,
    },
    odds: providerOdds,
    hasBallFeed,
    overHistory: overHistory.length ? overHistory : undefined,
    providerTimestamp: Date.now(),
    stateVersion: Number(opts.stateVersion || match.stateVersion || 1),
  });
}
