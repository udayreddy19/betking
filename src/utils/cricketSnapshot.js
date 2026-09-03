/**
 * Canonical Cricket Match Snapshot Engine
 * 
 * Strict Single-Source-of-Truth Architecture:
 * ONE MATCH SNAPSHOT
 *   ↓
 * ONE SELECTED INNINGS
 *   ↓
 * ALL SCORECARD / PITCH / TRACKER / HEADER / INNINGS STATS DERIVE FROM THAT SAME DATA
 */

import { formatTeamShortName, teamDisplayName } from './teamShortName.js';
import { normalizeCricbuzzOvers, oversToBalls } from './oversUtils.js';
import {
  detectCricketMatchFormat,
  getCricketFormatBanner,
  getCricketFormatCardBadge,
  isMatchSRL,
  isTestMatch,
} from './cricketFormat.js';

export {
  detectCricketMatchFormat,
  getCricketFormatBanner,
  getCricketFormatCardBadge,
  isMatchSRL,
  isTestMatch,
};

export function normalizeTeamToken(name = '') {
  return String(name || '')
    .toLowerCase()
    .replace(/\(women\)|\bwomen\b|\bw\b$/gi, 'w')
    .replace(/\(men\)|\bmen\b/gi, 'm')
    .replace(/[^a-z0-9]/g, '');
}

export function teamNameMatches(teamName, token) {
  if (!teamName || !token) return false;
  const team = normalizeTeamToken(teamName);
  const hint = normalizeTeamToken(token);
  if (!team || !hint) return false;
  if (team === hint) return true;
  if (team.includes(hint) || hint.includes(team)) return true;
  return false;
}

function resolveInningsBattingTeam(rawName, team1Name, team2Name, inningsNumber) {
  if (teamNameMatches(team1Name, rawName)) return team1Name;
  if (teamNameMatches(team2Name, rawName)) return team2Name;
  if (!rawName) return (Number(inningsNumber) % 2 === 1) ? team1Name : team2Name;
  return null;
}

function oversLookEmpty(overs) {
  const n = normalizeCricbuzzOvers(overs);
  return !n || n === '0.0' || n === '0';
}

function pickScorecardOvers(innRaw, ld, isTeam1Batting, runs) {
  const fromCard = innRaw?.scoreDetails?.overs ?? innRaw?.overs;
  // Trust scorecard overs including explicit 0.0 at innings start — do not
  // fall back to the other innings' clock (that painted "82.0" onto a 0/0 XI).
  if (fromCard != null && String(fromCard).trim() !== '') {
    return normalizeCricbuzzOvers(fromCard);
  }
  const completedFallback = isTeam1Batting ? ld.firstOvers : (ld.chaseOvers || ld.overs2);
  if (!oversLookEmpty(completedFallback)) return normalizeCricbuzzOvers(completedFallback);
  if (Number(runs) > 0) return normalizeCricbuzzOvers(completedFallback || '0.0');
  const live = isTeam1Batting ? (ld.firstOvers || ld.overs) : (ld.chaseOvers || ld.overs2);
  return normalizeCricbuzzOvers(live || '0.0');
}

export function isPlaceholderPlayer(name) {
  if (!name || typeof name !== 'string') return true;
  const clean = name.trim().toLowerCase();
  if (!clean || clean === 'null' || clean === 'undefined' || clean === '—' || clean === '-') return true;
  return /^(batter|batsman|bowler|player|striker|non-striker)\s*\d*$/i.test(clean);
}

function parseExtrasObject(raw) {
  if (raw == null) {
    return {
      total: null,
      byes: null,
      legByes: null,
      wides: null,
      noBalls: null,
      penaltyRuns: null,
    };
  }
  if (typeof raw === 'number') {
    return {
      total: raw,
      byes: null,
      legByes: null,
      wides: null,
      noBalls: null,
      penaltyRuns: null,
    };
  }
  if (typeof raw === 'object') {
    const total = raw.total != null
      ? Number(raw.total)
      : ((Number(raw.byes) || 0) + (Number(raw.legByes) || 0) + (Number(raw.wides) || 0) + (Number(raw.noBalls) || 0) + (Number(raw.penaltyRuns ?? raw.penalty) || 0));
    return {
      total: Number.isFinite(total) ? total : (raw.total != null ? Number(raw.total) : null),
      byes: raw.byes != null ? Number(raw.byes) : null,
      legByes: raw.legByes != null ? Number(raw.legByes) : null,
      wides: raw.wides != null ? Number(raw.wides) : null,
      noBalls: raw.noBalls != null ? Number(raw.noBalls) : null,
      penaltyRuns: raw.penaltyRuns != null ? Number(raw.penaltyRuns) : (raw.penalty != null ? Number(raw.penalty) : null),
    };
  }
  return {
    total: null,
    byes: null,
    legByes: null,
    wides: null,
    noBalls: null,
    penaltyRuns: null,
  };
}

/**
 * Builds an immutable, canonical MatchSnapshot object from raw match / liveDetails / scorecard.
 * Guarantees zero cross-snapshot and zero cross-innings data bleeding.
 * 
 * @param {object} match
 * @returns {object} Canonical MatchSnapshot
 */
export function buildCanonicalMatchSnapshot(match) {
  if (!match) return null;

  const matchId = String(match.id || match.matchId || '');
  const providerEventId = String(match.scoreboardEventId || match.cricbuzzMatchId || match.espnEventId || match.tencricEventId || matchId);
  const snapshotTimestamp = match.fetchedAt || match.updated_at || new Date().toISOString();
  const snapshotId = `snap_${matchId}_${Date.parse(snapshotTimestamp) || Date.now()}`;

  const matchFormat = detectCricketMatchFormat(match);
  const formatBanner = getCricketFormatBanner(matchFormat);
  const formatCardBadge = getCricketFormatCardBadge(matchFormat);
  const isSRL = isMatchSRL(match);
  const isTest = matchFormat === 'TEST' || matchFormat === 'FIRST_CLASS' || isTestMatch(match);

  const team1Name = match.team1?.name || match.team1 || match.homeTeam || 'Team 1';
  const team2Name = match.team2?.name || match.team2 || match.awayTeam || 'Team 2';
  const team1Short = formatTeamShortName(team1Name, match.team1?.shortName);
  const team2Short = formatTeamShortName(team2Name, match.team2?.shortName);
  const team1Display = teamDisplayName(team1Name);
  const team2Display = teamDisplayName(team2Name);

  const ld = match.liveDetails || {};
  const scorecardInningsRaw = Array.isArray(match.scorecardInnings) ? match.scorecardInnings : [];
  const testInningsRaw = Array.isArray(ld.testInnings) ? ld.testInnings : [];

  // Parse all available innings (supporting up to 4 innings for Test matches)
  const inningsList = [];

  if (scorecardInningsRaw.length > 0) {
    scorecardInningsRaw.forEach((innRaw, idx) => {
      const inningsNumber = Number(innRaw.inningsId ?? innRaw.innings ?? innRaw.inningsNumber ?? (idx + 1));
      const battingTeamName = innRaw.batTeamName || innRaw.battingTeam || innRaw.teamName
        || (innRaw.batTeamId && teamNameMatches(team1Name, innRaw.batTeamId) ? team1Name : '')
        || (innRaw.batTeamId && teamNameMatches(team2Name, innRaw.batTeamId) ? team2Name : '');
      const normalizedBatTeam = resolveInningsBattingTeam(battingTeamName, team1Name, team2Name, inningsNumber);
      if (!normalizedBatTeam) return;
      const isTeam1Batting = teamNameMatches(team1Name, normalizedBatTeam);
      const normalizedBowlTeam = isTeam1Batting ? team2Name : team1Name;

      const runs = Number(innRaw.scoreDetails?.runs ?? innRaw.runs ?? (isTeam1Batting ? ld.firstRuns ?? ld.score1 ?? ld.runs : ld.chaseRuns ?? ld.score2 ?? ld.runs) ?? 0);
      const wickets = Number(innRaw.scoreDetails?.wickets ?? innRaw.wickets ?? (isTeam1Batting ? ld.firstWickets ?? ld.wickets1 ?? ld.wickets : ld.chaseWickets ?? ld.wickets2 ?? ld.wickets) ?? 0);
      const overs = pickScorecardOvers(innRaw, ld, isTeam1Batting, runs);

      const batters = (innRaw.batters || []).map((b) => ({
        id: b.id || b.batId || null,
        name: b.name || b.batName || '',
        runs: Number(b.runs ?? 0),
        balls: Number(b.balls ?? 0),
        fours: b.fours != null ? Number(b.fours) : 0,
        sixes: b.sixes != null ? Number(b.sixes) : 0,
        sr: b.sr || (b.balls > 0 ? ((b.runs / b.balls) * 100).toFixed(1) : '0.0'),
        dismissal: b.dismissal || b.outDesc || (b.notOut ? 'not out' : 'batting'),
        notOut: Boolean(b.notOut || !b.dismissal || /^(batting|not out)$/i.test(String(b.dismissal || ''))),
        isAtCrease: Boolean(b.notOut || /^(batting|not out)$/i.test(String(b.dismissal || ''))),
      })).filter((b) => b.name && !isPlaceholderPlayer(b.name));

      const bowlers = (innRaw.bowlers || []).map((b) => ({
        id: b.id || b.bowlerId || b.bowlId || null,
        name: b.name || b.bowlName || '',
        overs: normalizeCricbuzzOvers(b.overs || '0.0'),
        maidens: Number(b.maidens ?? 0),
        runs: Number(b.runs ?? 0),
        wickets: Number(b.wickets ?? 0),
        economy: b.economy || (b.overs > 0 ? (b.runs / oversToBalls(b.overs) * 6).toFixed(1) : '0.0'),
      })).filter((b) => b.name && !isPlaceholderPlayer(b.name));

      const atCreaseBatters = batters.filter((b) => b.isAtCrease && ((b.balls ?? 0) > 0 || (b.runs ?? 0) > 0 || /batting/i.test(String(b.dismissal || ''))));
      const liveStriker = ld.batter1?.name && !isPlaceholderPlayer(ld.batter1.name) ? ld.batter1 : null;
      const liveNon = ld.batter2?.name && !isPlaceholderPlayer(ld.batter2.name) ? ld.batter2 : null;
      const mergeCrease = (card, live) => {
        if (!card && !live) return null;
        if (!card) return { ...live, isAtCrease: true, notOut: true };
        if (!live) return card;
        const same = String(card.name).toLowerCase().includes(String(live.name).toLowerCase())
          || String(live.name).toLowerCase().includes(String(card.name).toLowerCase());
        if (!same) return card;
        return {
          ...card,
          name: live.name || card.name,
          runs: Math.max(Number(card.runs) || 0, Number(live.runs) || 0),
          balls: Math.max(Number(card.balls) || 0, Number(live.balls) || 0),
          fours: Math.max(Number(card.fours) || 0, Number(live.fours) || 0),
          sixes: Math.max(Number(card.sixes) || 0, Number(live.sixes) || 0),
        };
      };
      const striker = mergeCrease(atCreaseBatters[0], liveStriker) || atCreaseBatters[0] || liveStriker;
      const nonStriker = mergeCrease(atCreaseBatters[1], liveNon) || atCreaseBatters[1] || liveNon;

      // Active bowler in this innings: prioritize liveDetails bowler if matching, else active bowler with balls or first/last
      let currentBowler = null;
      if (ld.bowler?.name && bowlers.some((b) => b.name.toLowerCase() === ld.bowler.name.toLowerCase())) {
        currentBowler = bowlers.find((b) => b.name.toLowerCase() === ld.bowler.name.toLowerCase());
      } else {
        currentBowler = bowlers.find((b) => /\.\d*[1-9]/.test(String(b.overs || ''))) || bowlers[bowlers.length - 1] || null;
      }

      const isLiveInnings = Number(ld.inningsId) === inningsNumber
        || idx === scorecardInningsRaw.length - 1;
      const rawExtras = innRaw.extrasData || innRaw.extrasBreakdown || innRaw.extras;
      const extras = parseExtrasObject(rawExtras ?? (isLiveInnings ? (ld.extrasBreakdown || ld.extras) : null));

      // Calculate fours and sixes
      let fours = innRaw.fours != null ? Number(innRaw.fours) : null;
      let sixes = innRaw.sixes != null ? Number(innRaw.sixes) : null;
      if (batters.length > 0) {
        fours = batters.reduce((s, b) => s + (b.fours ?? 0), 0);
        sixes = batters.reduce((s, b) => s + (b.sixes ?? 0), 0);
      }
      if (isLiveInnings && ld.fours != null) fours = Math.max(Number(fours) || 0, Number(ld.fours));
      if (isLiveInnings && ld.sixes != null) sixes = Math.max(Number(sixes) || 0, Number(ld.sixes));
      if (extras.total == null && isLiveInnings && batters.length > 0) {
        const gap = runs - batters.reduce((s, b) => s + (b.runs ?? 0), 0);
        if (gap > 0 && gap < 40) extras.total = gap;
      }

      // Reconcile score
      const batterRunsSum = batters.reduce((s, b) => s + (b.runs ?? 0), 0);
      const extrasTotal = extras.total != null ? extras.total : 0;
      const calculatedTotal = batterRunsSum + extrasTotal;
      const isReconciled = calculatedTotal === runs;
      let reconciliationStatus = 'RECONCILIATION_PARTIAL_DATA';
      if (batters.length >= 10 || innRaw.isDeclared || runs === 0) {
        if (isReconciled) {
          reconciliationStatus = 'RECONCILIATION_MATCH';
        } else {
          reconciliationStatus = 'CRICKET_SCORE_RECONCILIATION_MISMATCH';
          console.warn(`CRICKET_SCORE_RECONCILIATION_MISMATCH for match ${matchId} innings ${inningsNumber}: calculated=${calculatedTotal}, actual=${runs}`);
        }
      }

      let inningsOrdinal = '1st INNS';
      if (isTest) {
        inningsOrdinal = inningsNumber > 2 ? '2nd INNS' : '1st INNS';
      } else if (inningsNumber > 1) {
        inningsOrdinal = `${inningsNumber === 2 ? '2nd' : `${inningsNumber}th`} INNS`;
      }

      inningsList.push({
        inningsId: inningsNumber,
        inningsNumber,
        inningsLabel: `${teamDisplayName(normalizedBatTeam)} — ${inningsOrdinal}`,
        inningsName: `${teamDisplayName(normalizedBatTeam)} ${inningsOrdinal}`,
        battingTeamName: normalizedBatTeam,
        battingTeamShort: formatTeamShortName(normalizedBatTeam),
        bowlingTeamName: normalizedBowlTeam,
        bowlingTeamShort: formatTeamShortName(normalizedBowlTeam),
        score: runs,
        runs,
        wickets,
        overs,
        status: innRaw.isDeclared ? 'declared' : (wickets >= 10 ? 'all_out' : 'in_progress'),
        batters,
        bowlers,
        currentBatters: { striker, nonStriker },
        currentBowler,
        extras,
        fours,
        sixes,
        reconciliation: {
          status: reconciliationStatus,
          isReconciled,
          calculatedTotal,
          actualTotal: runs,
        },
        isCurrent: false,
      });
    });
  }

  // Handle multi-innings from ld.testInnings when scorecardInnings was omitted (Tests only)
  if (isTest && inningsList.length === 0 && testInningsRaw.length > 0) {
    testInningsRaw.forEach((tInn, idx) => {
      const inningsNumber = Number(tInn.inningsId ?? (idx + 1));
      const battingTeamName = tInn.batTeam || tInn.teamName || tInn.team || '';
      const normalizedBatTeam = resolveInningsBattingTeam(battingTeamName, team1Name, team2Name, inningsNumber);
      if (!normalizedBatTeam) return;
      const isTeam1Batting = teamNameMatches(team1Name, normalizedBatTeam);
      const normalizedBowlTeam = isTeam1Batting ? team2Name : team1Name;

      const runs = Number(tInn.runs ?? 0);
      const wickets = Number(tInn.wickets ?? 0);
      const overs = normalizeCricbuzzOvers(tInn.overs || '0.0');

      const inningsOrdinal = inningsNumber > 2 ? '2nd INNS' : '1st INNS';

      inningsList.push({
        inningsId: inningsNumber,
        inningsNumber,
        inningsLabel: `${teamDisplayName(normalizedBatTeam)} — ${inningsOrdinal}`,
        inningsName: `${teamDisplayName(normalizedBatTeam)} ${inningsOrdinal}`,
        battingTeamName: normalizedBatTeam,
        battingTeamShort: formatTeamShortName(normalizedBatTeam),
        bowlingTeamName: normalizedBowlTeam,
        bowlingTeamShort: formatTeamShortName(normalizedBowlTeam),
        score: runs,
        runs,
        wickets,
        overs,
        status: tInn.declared ? 'declared' : (wickets >= 10 ? 'all_out' : 'in_progress'),
        batters: [],
        bowlers: [],
        currentBatters: {
          striker: ld.batter1?.name && !isPlaceholderPlayer(ld.batter1.name) ? { ...ld.batter1 } : null,
          nonStriker: ld.batter2?.name && !isPlaceholderPlayer(ld.batter2.name) ? { ...ld.batter2 } : null,
        },
        currentBowler: ld.bowler?.name && !isPlaceholderPlayer(ld.bowler.name) ? { ...ld.bowler } : null,
        extras: parseExtrasObject(tInn.extras ?? ld.extras),
        fours: tInn.fours != null ? Number(tInn.fours) : (ld.fours != null ? Number(ld.fours) : null),
        sixes: tInn.sixes != null ? Number(tInn.sixes) : (ld.sixes != null ? Number(ld.sixes) : null),
        reconciliation: { status: 'RECONCILIATION_PARTIAL_DATA', isReconciled: true, calculatedTotal: runs, actualTotal: runs },
        isCurrent: false,
      });
    });
  }

  // If no scorecard innings or testInnings existed, build canonical 1st (and 2nd) innings from liveDetails
  if (inningsList.length === 0) {
    let firstBatTeam = team1Name;
    if (ld.firstTeamName) {
      firstBatTeam = teamNameMatches(team2Name, ld.firstTeamName) ? team2Name : team1Name;
    } else {
      const t1r = Number(match.team1?.runs ?? ld.score1 ?? 0);
      const t2r = Number(match.team2?.runs ?? ld.score2 ?? 0);
      if (t2r > 0 && t1r === 0) firstBatTeam = team2Name;
    }

    const firstBowlTeam = (firstBatTeam === team1Name) ? team2Name : team1Name;
    const isTeam1BattingFirst = (firstBatTeam === team1Name);

    const firstRuns = Number(ld.firstRuns ?? (isTeam1BattingFirst ? match.team1?.runs ?? ld.score1 : match.team2?.runs ?? ld.score2) ?? ld.runs ?? 0);
    const firstWkts = Number(ld.firstWickets ?? (isTeam1BattingFirst ? match.team1?.wickets ?? ld.wickets1 : match.team2?.wickets ?? ld.wickets2) ?? ld.wickets ?? 0);
    const firstOvs = normalizeCricbuzzOvers(ld.firstOvers || (isTeam1BattingFirst ? match.team1?.overs : match.team2?.overs) || ld.overs || '0.0');

    inningsList.push({
      inningsId: 1,
      inningsNumber: 1,
      inningsLabel: `${teamDisplayName(firstBatTeam)} — 1st INNS`,
      inningsName: `${teamDisplayName(firstBatTeam)} 1st INNS`,
      battingTeamName: firstBatTeam,
      battingTeamShort: formatTeamShortName(firstBatTeam),
      bowlingTeamName: firstBowlTeam,
      bowlingTeamShort: formatTeamShortName(firstBowlTeam),
      score: firstRuns,
      runs: firstRuns,
      wickets: firstWkts,
      overs: firstOvs,
      status: 'in_progress',
      batters: [],
      bowlers: [],
      currentBatters: {
        striker: ld.batter1?.name && !isPlaceholderPlayer(ld.batter1.name) ? { ...ld.batter1 } : null,
        nonStriker: ld.batter2?.name && !isPlaceholderPlayer(ld.batter2.name) ? { ...ld.batter2 } : null,
      },
      currentBowler: ld.bowler?.name && !isPlaceholderPlayer(ld.bowler.name) ? { ...ld.bowler } : null,
      extras: parseExtrasObject(ld.extras),
      fours: ld.fours != null ? Number(ld.fours) : null,
      sixes: ld.sixes != null ? Number(ld.sixes) : null,
      reconciliation: { status: 'RECONCILIATION_PARTIAL_DATA', isReconciled: true, calculatedTotal: firstRuns, actualTotal: firstRuns },
      isCurrent: true,
    });

    const chaseOversMeaningful = ld.chaseOvers != null
      && String(ld.chaseOvers).trim() !== ''
      && String(ld.chaseOvers) !== '0'
      && String(ld.chaseOvers) !== '0.0';
    const fakeChaseStub = Number(ld.chaseRuns || 0) === 0
      && Number(ld.chaseWickets || 0) > 0
      && !chaseOversMeaningful
      && firstWkts < 10;
    const isSecond = !fakeChaseStub && (
      Number(ld.chaseRuns) > 0
      || chaseOversMeaningful
      || (ld.chaseTeamName && (Number(ld.chaseRuns) >= 0 && ld.chaseRuns != null))
      || (Number(ld.inningsId) >= 2 && (Number(ld.chaseRuns) > 0 || chaseOversMeaningful || Number(ld.chaseWickets || 0) === 0))
    );
    if (isSecond) {
      const secondBatTeam = firstBowlTeam;
      const secondBowlTeam = firstBatTeam;
      const chaseRuns = Number(
        ld.chaseRuns != null
          ? ld.chaseRuns
          : 0,
      );
      // Never fall back chase wickets to first-innings / opposing team wickets for empty stubs
      const chaseWkts = Number(ld.chaseWickets != null ? ld.chaseWickets : 0);
      const chaseOvs = normalizeCricbuzzOvers(ld.chaseOvers || '0.0');

      inningsList.push({
        inningsId: 2,
        inningsNumber: 2,
        inningsLabel: `${teamDisplayName(secondBatTeam)} — 2nd INNS`,
        inningsName: `${teamDisplayName(secondBatTeam)} 2nd INNS`,
        battingTeamName: secondBatTeam,
        battingTeamShort: formatTeamShortName(secondBatTeam),
        bowlingTeamName: secondBowlTeam,
        bowlingTeamShort: formatTeamShortName(secondBowlTeam),
        score: chaseRuns,
        runs: chaseRuns,
        wickets: chaseWkts,
        overs: chaseOvs,
        status: 'in_progress',
        batters: [],
        bowlers: [],
        currentBatters: {
          striker: ld.batter1?.name && !isPlaceholderPlayer(ld.batter1.name) ? { ...ld.batter1 } : null,
          nonStriker: ld.batter2?.name && !isPlaceholderPlayer(ld.batter2.name) ? { ...ld.batter2 } : null,
        },
        currentBowler: ld.bowler?.name && !isPlaceholderPlayer(ld.bowler.name) ? { ...ld.bowler } : null,
        extras: parseExtrasObject(ld.extras),
        fours: ld.fours != null ? Number(ld.fours) : null,
        sixes: ld.sixes != null ? Number(ld.sixes) : null,
        reconciliation: { status: 'RECONCILIATION_PARTIAL_DATA', isReconciled: true, calculatedTotal: chaseRuns, actualTotal: chaseRuns },
        isCurrent: true,
      });
      inningsList[0].isCurrent = false;
    }
  }

  // Reconcile: If scorecard was missing the active current innings of either team, add it to inningsList!
  const hasTeam1Innings = inningsList.some((inn) => teamNameMatches(team1Name, inn.battingTeamName));
  const hasTeam2Innings = inningsList.some((inn) => teamNameMatches(team2Name, inn.battingTeamName));

  const t1Runs = Number(match.team1?.runs ?? ld.firstRuns ?? ld.score1 ?? (ld.firstTeamName && teamNameMatches(team1Name, ld.firstTeamName) ? ld.runs : null) ?? 0);
  const t1Wkts = Number(match.team1?.wickets ?? ld.firstWickets ?? ld.wickets1 ?? 0);
  const t1Ovs = normalizeCricbuzzOvers(match.team1?.overs || ld.firstOvers || ld.overs || '0.0');

  const t2Runs = Number(match.team2?.runs ?? ld.chaseRuns ?? ld.score2 ?? (ld.chaseTeamName && teamNameMatches(team2Name, ld.chaseTeamName) ? ld.runs : null) ?? 0);
  const t2Wkts = Number(match.team2?.wickets ?? ld.chaseWickets ?? ld.wickets2 ?? 0);
  const t2Ovs = normalizeCricbuzzOvers(match.team2?.overs || ld.chaseOvers || ld.overs2 || '0.0');

  const isT1Active = (t1Runs > 0 || (t1Ovs && t1Ovs !== '0.0' && t1Ovs !== '0') || t1Wkts > 0);
  const isT2Active = (t2Runs > 0 || (t2Ovs && t2Ovs !== '0.0' && t2Ovs !== '0') || t2Wkts > 0);

  if (!hasTeam1Innings && isT1Active) {
    const nextInnNumber = inningsList.length + 1;
    const inningsOrdinal = isTest ? (nextInnNumber > 2 ? '2nd INNS' : '1st INNS') : (nextInnNumber > 1 ? `${nextInnNumber}nd INNS` : '1st INNS');
    const liveBatters = [];
    if (ld.batter1?.name && !isPlaceholderPlayer(ld.batter1.name)) liveBatters.push({ ...ld.batter1, isAtCrease: true, notOut: true });
    if (ld.batter2?.name && !isPlaceholderPlayer(ld.batter2.name)) liveBatters.push({ ...ld.batter2, isAtCrease: true, notOut: true });
    const liveBowlers = [];
    if (ld.bowler?.name && !isPlaceholderPlayer(ld.bowler.name)) liveBowlers.push({ ...ld.bowler });

    inningsList.push({
      inningsId: nextInnNumber,
      inningsNumber: nextInnNumber,
      inningsLabel: `${teamDisplayName(team1Name)} — ${inningsOrdinal}`,
      inningsName: `${teamDisplayName(team1Name)} ${inningsOrdinal}`,
      battingTeamName: team1Name,
      battingTeamShort: team1Short,
      bowlingTeamName: team2Name,
      bowlingTeamShort: team2Short,
      score: t1Runs,
      runs: t1Runs,
      wickets: t1Wkts,
      overs: t1Ovs,
      status: t1Wkts >= 10 ? 'all_out' : 'in_progress',
      batters: liveBatters,
      bowlers: liveBowlers,
      currentBatters: { striker: liveBatters[0] || null, nonStriker: liveBatters[1] || null },
      currentBowler: liveBowlers[0] || null,
      extras: parseExtrasObject(ld.extras),
      fours: ld.fours != null ? Number(ld.fours) : null,
      sixes: ld.sixes != null ? Number(ld.sixes) : null,
      reconciliation: { status: 'RECONCILIATION_PARTIAL_DATA', isReconciled: true, calculatedTotal: t1Runs, actualTotal: t1Runs },
      isCurrent: true,
    });
  }

  if (!hasTeam2Innings && isT2Active) {
    const nextInnNumber = inningsList.length + 1;
    const inningsOrdinal = isTest ? (nextInnNumber > 2 ? '2nd INNS' : '1st INNS') : (nextInnNumber > 1 ? `${nextInnNumber}nd INNS` : '1st INNS');
    const liveBatters = [];
    if (ld.batter1?.name && !isPlaceholderPlayer(ld.batter1.name)) liveBatters.push({ ...ld.batter1, isAtCrease: true, notOut: true });
    if (ld.batter2?.name && !isPlaceholderPlayer(ld.batter2.name)) liveBatters.push({ ...ld.batter2, isAtCrease: true, notOut: true });
    const liveBowlers = [];
    if (ld.bowler?.name && !isPlaceholderPlayer(ld.bowler.name)) liveBowlers.push({ ...ld.bowler });

    inningsList.push({
      inningsId: nextInnNumber,
      inningsNumber: nextInnNumber,
      inningsLabel: `${teamDisplayName(team2Name)} — ${inningsOrdinal}`,
      inningsName: `${teamDisplayName(team2Name)} ${inningsOrdinal}`,
      battingTeamName: team2Name,
      battingTeamShort: team2Short,
      bowlingTeamName: team1Name,
      bowlingTeamShort: team1Short,
      score: t2Runs,
      runs: t2Runs,
      wickets: t2Wkts,
      overs: t2Ovs,
      status: t2Wkts >= 10 ? 'all_out' : 'in_progress',
      batters: liveBatters,
      bowlers: liveBowlers,
      currentBatters: { striker: liveBatters[0] || null, nonStriker: liveBatters[1] || null },
      currentBowler: liveBowlers[0] || null,
      extras: parseExtrasObject(ld.extras),
      fours: ld.fours != null ? Number(ld.fours) : null,
      sixes: ld.sixes != null ? Number(ld.sixes) : null,
      reconciliation: { status: 'RECONCILIATION_PARTIAL_DATA', isReconciled: true, calculatedTotal: t2Runs, actualTotal: t2Runs },
      isCurrent: true,
    });
  }

  if (!isTest && inningsList.length > 2) {
    inningsList.sort((a, b) => Number(a.inningsNumber) - Number(b.inningsNumber));
    inningsList.length = 2;
  }

  // Determine which innings is currently in progress
  let currentInnings = null;
  if (ld.inningsId != null) {
    currentInnings = inningsList.find((i) => i.inningsId === Number(ld.inningsId));
  }
  if (!currentInnings) {
    // 1. Pick any uncompleted in-progress innings (wickets < 10 && status !== 'declared')
    const inProgress = inningsList.filter((i) => i.status === 'in_progress' && i.wickets < 10);
    if (inProgress.length > 0) {
      currentInnings = inProgress[inProgress.length - 1];
    }
  }
  if (!currentInnings) {
    // 2. Pick the latest innings with active batters at crease or scored overs/runs
    const withActivity = inningsList.filter((i) => i.batters?.some((b) => b.isAtCrease) || (i.overs && i.overs !== '0.0' && i.overs !== '0') || i.score > 0);
    currentInnings = withActivity[withActivity.length - 1] || inningsList[0];
  }
  inningsList.forEach((i) => { i.isCurrent = Boolean(currentInnings && i.inningsId === currentInnings.inningsId); });

  // Build unambiguous header scores (never 0/0 for unbatted teams!)
  const team1Innings = inningsList.filter((i) => teamNameMatches(team1Name, i.battingTeamName));
  const team2Innings = inningsList.filter((i) => teamNameMatches(team2Name, i.battingTeamName));

  const formatTeamHeaderScore = (innsArr) => {
    if (!innsArr || innsArr.length === 0) return 'Yet to bat';
    return innsArr.map((i) => {
      const ovsText = i.overs && i.overs !== '0.0' ? ` (${i.overs})` : '';
      return `${i.score}/${i.wickets}${ovsText}`;
    }).join(' & ');
  };

  const team1ScoreText = formatTeamHeaderScore(team1Innings);
  const team2ScoreText = formatTeamHeaderScore(team2Innings);

  const isLive = Boolean(match.isLive || match.matchState === 'in');
  const isCompleted = match.status === 'COMPLETED' || match.matchState === 'post' || match.isCompleted;
  const statusChip = isLive ? 'LIVE' : (isCompleted ? 'COMPLETED' : 'UPCOMING');

  return {
    providerEventId,
    snapshotId,
    snapshotTimestamp,
    match: {
      id: matchId,
      matchId,
      team1: { name: team1Name, shortName: team1Short, displayName: team1Display },
      team2: { name: team2Name, shortName: team2Short, displayName: team2Display },
      status: match.status || (isLive ? 'LIVE' : (isCompleted ? 'COMPLETED' : 'SCHEDULED')),
      isLive,
      matchState: match.matchState || (isLive ? 'in' : 'pre'),
      matchFormat,
      formatBanner,
      formatCardBadge,
      isSRL,
      statusChip,
      time: match.time || 'Live',
      league: match.league || match.seriesName || 'Cricket',
      commentary: ld.commentary || match.commentary || '',
    },
    innings: inningsList,
    currentInningsId: currentInnings?.inningsId || 1,
    currentBattingTeam: currentInnings?.battingTeamName || team1Name,
    currentBowlingTeam: currentInnings?.bowlingTeamName || team2Name,
    headerScores: {
      team1Display,
      team1Short,
      team1ScoreText,
      team1HasBatted: team1Innings.length > 0 || isT1Active,
      team2Display,
      team2Short,
      team2ScoreText,
      team2HasBatted: team2Innings.length > 0 || isT2Active,
    },
  };
}

/**
 * Derives consistent UI data for a selected innings from a canonical MatchSnapshot.
 * GUARANTEES:
 * - Batters belong to the selected innings batting team
 * - Bowlers belong to the selected innings bowling team
 * - Scores, overs, wickets, extras, fours, sixes belong to the selected innings
 */
export function deriveSelectedInningsView(snapshot, selectedInningsNameOrId = null) {
  if (!snapshot || !snapshot.innings || snapshot.innings.length === 0) {
    return null;
  }

  let selected = null;
  if (selectedInningsNameOrId != null) {
    const searchToken = String(selectedInningsNameOrId).trim().toLowerCase();
    selected = snapshot.innings.find(
      (inn) => String(inn.inningsId) === String(selectedInningsNameOrId)
        || String(inn.inningsNumber) === String(selectedInningsNameOrId)
        || inn.inningsName.toLowerCase() === searchToken
        || inn.inningsLabel?.toLowerCase() === searchToken
        || inn.battingTeamName.toLowerCase() === searchToken
        || teamNameMatches(inn.battingTeamName, searchToken.replace(/\s*(?:1st|2nd|\d+th)?\s*inns?$/i, '')),
    );
  }

  // Default to current live/in-progress innings
  if (!selected) {
    selected = snapshot.innings.find((i) => i.isCurrent) || snapshot.innings[snapshot.innings.length - 1];
  }

  const isCurrentLive = Boolean(selected.isCurrent && snapshot.match.isLive);

  const striker = selected.currentBatters?.striker || null;
  const nonStriker = selected.currentBatters?.nonStriker || null;
  const currentBowler = selected.currentBowler
    || selected.bowlers?.[selected.bowlers.length - 1]
    || null;

  return {
    snapshotId: snapshot.snapshotId,
    snapshotTimestamp: snapshot.snapshotTimestamp,
    providerEventId: snapshot.providerEventId,
    matchId: snapshot.match.id,
    matchFormat: snapshot.match.matchFormat,
    formatBanner: snapshot.match.formatBanner,
    formatCardBadge: snapshot.match.formatCardBadge || getCricketFormatCardBadge(snapshot.match.matchFormat),
    isSRL: Boolean(snapshot.match.isSRL),
    statusChip: snapshot.match.statusChip,
    selectedInningsId: selected.inningsId,
    selectedInningsNumber: selected.inningsNumber,
    selectedInningsLabel: selected.inningsLabel || selected.inningsName,
    selectedInningsName: selected.inningsName,
    battingTeamName: selected.battingTeamName,
    battingTeamShort: selected.battingTeamShort,
    bowlingTeamName: selected.bowlingTeamName,
    bowlingTeamShort: selected.bowlingTeamShort,
    score: selected.score,
    runs: selected.score,
    wickets: selected.wickets,
    overs: selected.overs,
    status: selected.status,
    isCurrentLive,
    batters: selected.batters || [],
    bowlers: selected.bowlers || [],
    striker: striker?.name ? striker : null,
    nonStriker: nonStriker?.name ? nonStriker : null,
    currentBowler: currentBowler?.name ? currentBowler : null,
    extras: selected.extras || { total: null, byes: null, legByes: null, wides: null, noBalls: null, penaltyRuns: null },
    fours: selected.fours != null ? selected.fours : null,
    sixes: selected.sixes != null ? selected.sixes : null,
    reconciliation: selected.reconciliation || { status: 'RECONCILIATION_PARTIAL_DATA', isReconciled: true, calculatedTotal: selected.score, actualTotal: selected.score },
    headerScores: snapshot.headerScores,
    allInnings: snapshot.innings.map((inn) => ({
      inningsId: inn.inningsId,
      inningsNumber: inn.inningsNumber,
      inningsLabel: inn.inningsLabel || inn.inningsName,
      inningsName: inn.inningsName,
      battingTeamName: inn.battingTeamName,
      score: inn.score,
      wickets: inn.wickets,
      overs: inn.overs,
      extras: inn.extras,
      fours: inn.fours,
      sixes: inn.sixes,
    })),
  };
}
