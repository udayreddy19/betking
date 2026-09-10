/**
 * IPLSRL Admin Control Plane
 * Operator desk for SRL matches: winner selection gate, sim settings, live delivery control.
 */

import { getAllIPLSRLTeams, updateIPLSRLTeam } from './iplSrlTeamEngine.mjs';
import { getAllIPLSRLPlayers, createIPLSRLPlayer, updateIPLSRLPlayer, PLAYER_ROLES } from './iplSrlPlayerEngine.mjs';
import { getIPLSRLSeason, getIPLSRLFixtures } from './iplSrlEngine.mjs';
import { initializeIPLSRLMatch, performIPLSRLToss, MATCH_STATES } from './iplSrlMatchEngine.mjs';
import { simulateIPLSRLDelivery, BALL_OUTCOMES } from './iplSrlSimulationEngine.mjs';
import { recordIPLSRLDelivery } from './iplSrlBallEngine.mjs';
import {
  getIplSrlDeskMatches,
  getIplSrlMatchById,
  getIplSrlPointsTable,
  getIplSrlSeasonMatches,
  isIplSrlMatch,
  isSrlTossVisibleToUsers,
  srlTossPublicRevealAt,
  formatSrlIstClock,
  getSrlPlayingXINames,
  getSrlTeamRoster,
  SRL_SEASON_MATCH_COUNT,
} from './iplSrlSimulator.mjs';
import {
  applySrlFixtureOverrideToMatch,
  evaluateSrlStageSoftLimit,
  getSrlFullSquadNames,
} from './iplSrlAdminExtras.mjs';
import {
  declareSrlOperatorWinner,
  getSrlMarketControls,
  getSrlOperatorElapsedMs,
  getSrlOperatorSession,
  getSrlSeasonOffsetMs,
  getSrlSimNow,
  pauseSrlOperatorMatch,
  resetSrlOperatorMatch,
  resumeSrlOperatorMatch,
  seekSrlOperatorElapsed,
  setSrlMarketControl,
  setSrlOperatorBettingClosed,
  setSrlOperatorSpeed,
  setSrlOperatorWinner,
  setSrlSeasonOffsetMs,
  startSrlOperatorMatch,
  upsertSrlScoreAnchor,
  queueSrlIncident,
  popSrlIncident,
  getSrlIncidents,
  clearSrlIncidents,
  popSrlScoreAnchor,
  clearSrlScoreAnchors,
  popSrlReplayDelivery,
  markSrlAutoPause,
  persistSrlOperatorSession,
  setSrlIntegrityHold,
  setSrlRainDelay,
  setSrlRevisedOvers,
  setSrlCustomCommentary,
  setSrlMarginDefense,
  registerCustomSrlMatch,
  queueSrlOverBlueprint,
  setAutoProfitMaximizer,
  setSrlTossAndLineup,
  recordSrlReplayDelivery,
  getSrlReplayLog,
  OVER_BLUEPRINT_PRESETS,
  DIRECTOR_MODES,
  PLAYER_BUFF_TYPES,
  PITCH_WEAR_TYPES,
  setSrlDirectorMode,
  setSrlPlayerBuff,
  getSrlEnvironment,
  setSrlEnvironment,
  getSrlMicroMarkets,
  setSrlMicroMarketStatus,
  setSrlMicroMarketMargin,
  setSrlMicroMarketsMassSuspend,
  getSrlCashoutControl,
  setSrlCashoutConfig,
  pushSrlCashoutSweetener,
  getSrlCircuitBreaker,
  setSrlCircuitBreakerConfig,
  toggleSrlCircuitBreakerTrip,
  toggleSrlEmergencyKillSwitch,
} from './iplSrlOperatorState.mjs';
import {
  assertSrlDangerousAction,
  buildSrlMatchAlerts,
  getSrlDeskCapabilities,
  getSrlDeskCoverage,
  heartbeatSrlDeskPresence,
  listSrlShiftNotes,
  addSrlShiftNote,
  hydrateSrlDeskOps,
  getSrlInjectHistory,
  listSrlScriptPresets,
  normalizeSrlReasonCode,
  pushSrlInjectHistory,
  pushSrlDeskAlert,
  saveSrlScriptPreset,
  deleteSrlScriptPreset,
  listSrlMatchTemplates,
  saveSrlMatchTemplate,
  deleteSrlMatchTemplate,
  getSrlMatchTemplate,
  SRL_REASON_CODES,
} from './iplSrlDeskOps.mjs';
import { isOverSelection, isUnderSelection, parseOuLine } from './odds-v3/lineIdentity.mjs';

let pgQuery = null;
async function getQuery() {
  if (pgQuery) return pgQuery;
  try {
    const mod = await import('../db/pg.js');
    pgQuery = mod.query;
    return pgQuery;
  } catch {
    return null;
  }
}

export const SIM_SPEEDS = ['PAUSED', 'SLOW', 'NORMAL', 'FAST', 'ULTRA'];
export const PITCH_OPTIONS = ['BALANCED', 'BATTING_PARADISE', 'SPIN_FRIENDLY', 'PACE_BOUNCE'];
export const WEATHER_OPTIONS = ['CLEAR', 'HUMID', 'OVERCAST'];

const SPEED_MS = {
  PAUSED: 0,
  SLOW: 2500,
  NORMAL: 1200,
  FAST: 500,
  ULTRA: 150,
};

const SPEED_FACTOR = {
  PAUSED: 0,
  SLOW: 0.5,
  NORMAL: 1,
  FAST: 2,
  ULTRA: 4,
};

function isUserFacingSrlMatch(matchId) {
  return String(matchId || '').startsWith('srl_ipl_') || isIplSrlMatch({ id: matchId });
}

function controlStatusFromSrlMatch(match) {
  const op = match.operator || getSrlOperatorSession(match.id);
  if (match.matchState === 'post' || op.declaredWinnerKey) return 'COMPLETED';
  if (op.paused || op.pausedAt) return 'PAUSED';
  if (match.matchState === 'in' || op.started || op.startedAt) return 'LIVE';
  if (op.forcedWinnerKey) return 'ARMED';
  return 'READY';
}

function speedLabelFromFactor(factor) {
  const f = Number(factor);
  if (!Number.isFinite(f) || f <= 0) return 'PAUSED';
  if (f <= 0.75) return 'SLOW';
  if (f <= 1.5) return 'NORMAL';
  if (f <= 3) return 'FAST';
  return 'ULTRA';
}

function matchPhase(elapsedMs, timing = {}) {
  const firstEnd = Number(timing.firstInningsEndMs) || 0;
  const breakEnd = Number(timing.breakEndMs) || firstEnd;
  const total = Number(timing.totalDurationMs) || 0;
  if (elapsedMs <= 0) return 'pre';
  if (total && elapsedMs >= total) return 'done';
  if (firstEnd && elapsedMs < firstEnd) return 'first';
  if (breakEnd && elapsedMs < breakEnd) return 'break';
  return 'chase';
}

function clockForSrlMatch(match, now = Date.now()) {
  const timing = match.sim?.timing || {};
  const durationMs = Number(match.sim?.totalDuration || match.expectedDurationMs || timing.totalDurationMs) || 1;
  const op = getSrlOperatorSession(match.id);
  const clockElapsed = Math.max(0, now - Number(match.startTime || 0));
  const elapsedMs = op.startedAt || op.pausedAt
    ? getSrlOperatorElapsedMs(op, now)
    : (now < Number(match.startTime || 0) ? 0 : clockElapsed);
  return {
    elapsedMs,
    durationMs,
    progressPct: Math.max(0, Math.min(100, (elapsedMs / durationMs) * 100)),
    msPerBall: Number(timing.msPerBall) || 0,
    firstInningsEndMs: Number(timing.firstInningsEndMs) || 0,
    breakEndMs: Number(timing.breakEndMs) || 0,
    phase: matchPhase(elapsedMs, timing),
    operatorSpeed: Number(op.speed) || 1,
  };
}

function mapSrlDeskMatch(match) {
  const base = applySrlFixtureOverrideToMatch(match) || match;
  const ld = base.liveDetails || {};
  const session = getSrlOperatorSession(base.id);
  const op = { ...session, ...(base.operator || {}) };
  const controlStatus = controlStatusFromSrlMatch(base);
  const clock = clockForSrlMatch(base);
  const winnerKey = op.declaredWinnerKey || op.forcedWinnerKey;
  const winnerTeam = winnerKey === base.team1?.key
    ? base.team1
    : winnerKey === base.team2?.key
      ? base.team2
      : null;
  const naturalWinnerKey = base.sim?.winner || ld.winnerKey || null;
  const started = new Date(base.startTime);
  const homeSquad = getSrlFullSquadNames(base.team1?.key || base.team1?.shortName);
  const awaySquad = getSrlFullSquadNames(base.team2?.key || base.team2?.shortName);
  const row = {
    matchId: base.id,
    status: base.matchState,
    controlStatus,
    homeTeamId: base.team1?.key,
    homeTeam: base.team1?.name,
    homeShort: base.team1?.shortName,
    awayTeamId: base.team2?.key,
    awayTeam: base.team2?.name,
    awayShort: base.team2?.shortName,
    venue: base.venue || base.league || 'OddsYra SRL',
    startTime: base.startTime,
    date: Number.isFinite(started.getTime()) ? started.toISOString().slice(0, 10) : '',
    timeDisplay: base.scheduleLabel || base.time,
    stageLabel: base.stageLabel || 'League',
    matchNo: base.matchNo || null,
    playoff: !!base.playoff,
    forcedWinnerTeamId: winnerKey,
    forcedWinnerName: winnerTeam ? `${winnerTeam.shortName} · ${winnerTeam.name}` : null,
    naturalWinnerId: naturalWinnerKey,
    commentary: ld.commentary || '',
    userBanner: session.userBanner || null,
    canStart: controlStatus === 'READY' || controlStatus === 'ARMED',
    canResume: controlStatus === 'PAUSED',
    canPause: controlStatus === 'LIVE',
    canDeclare: controlStatus !== 'COMPLETED',
    canSeek: controlStatus !== 'COMPLETED',
    canReset: true,
    clockDriven: !(op.started || op.startedAt || op.paused || op.pausedAt),
    bettingClosed: !!base.bettingClosed || !!op.bettingClosed,
    clock,
    score: {
      innings1: {
        runs: ld.firstRuns ?? ld.runs ?? 0,
        wickets: ld.firstWickets ?? ld.wickets ?? 0,
        overs: String(ld.firstOvers ?? ld.overs ?? '0.0'),
      },
      innings2: {
        runs: ld.chaseRuns ?? ld.score2 ?? 0,
        wickets: ld.chaseWickets ?? ld.wickets2 ?? 0,
        overs: String(ld.chaseOvers ?? ld.overs2 ?? '0.0'),
      },
      firstTeamName: ld.firstTeamName || base.team1?.name || null,
      chaseTeamName: ld.chaseTeamName || base.team2?.name || null,
      target: (() => {
        const dls = Number(op.dlsTarget ?? ld.target);
        if (Number.isFinite(dls) && dls > 0) return dls;
        const phase = String(ld.phase || clock.phase || '');
        const inChase = Number(ld.inningsId) === 2 || phase === 'chase' || phase === 'chase-complete';
        if (!inChase) return null;
        const first = Number(ld.firstRuns ?? ld.runs);
        return Number.isFinite(first) ? first + 1 : null;
      })(),
      winnerId: op.declaredWinnerKey || (base.matchState === 'post' ? winnerKey : null),
      result: ld.resultSummary || (base.matchState === 'post' ? ld.commentary : null),
    },
    speed: speedLabelFromFactor(clock.operatorSpeed),
    pitch: controlState.pitch,
    weather: controlState.weather,
    autoPlay: !!controlState.autoPlay,
    lastDelivery: null,
    toss: session.toss || ld.toss || op.toss || null,
    lineup: session.lineup || op.lineup || null,
    overHistory: Array.isArray(base.overHistory) && base.overHistory.length
      ? base.overHistory
      : (Array.isArray(ld.overHistory) ? ld.overHistory : []),
    liveDetails: ld,
    squads: Array.isArray(base.squads) && base.squads.length
      ? base.squads
      : [
        getSrlTeamRoster(base.team1?.key) || { name: base.team1?.name, players: [] },
        getSrlTeamRoster(base.team2?.key) || { name: base.team2?.name, players: [] },
      ].filter(Boolean),
    defaultHomeXI: homeSquad.playingXI.length
      ? homeSquad.playingXI
      : getSrlPlayingXINames(base.team1?.key || base.team1?.shortName),
    defaultAwayXI: awaySquad.playingXI.length
      ? awaySquad.playingXI
      : getSrlPlayingXINames(base.team2?.key || base.team2?.shortName),
    defaultHomeSquad15: homeSquad.squad15,
    defaultAwaySquad15: awaySquad.squad15,
    defaultHomeImpact: homeSquad.impact,
    defaultAwayImpact: awaySquad.impact,
    book: emptySrlMatchBook(),
    rainDelay: !!op.rainDelay || !!base.rainDelay,
    revisedOvers: op.revisedOvers || base.oversPerInnings || 20,
    dlsTarget: op.dlsTarget || null,
    customCommentary: op.customCommentary || null,
    marginDefense: op.marginDefense || { marginBump: 0, spreadBias: 0, autoFreezeThreshold: 50000, autoProfitMaximizer: false, targetMargin: 0.06 },
    autoProfitMaximizer: !!op.marginDefense?.autoProfitMaximizer,
    targetMargin: op.marginDefense?.targetMargin || 0.06,
    incidentQueueLength: (session.incidentQueue || []).length,
    incidentQueue: session.incidentQueue || [],
    nextQueuedIncident: (session.incidentQueue || [])[0] || null,
    scoreAnchors: Array.isArray(session.scoreAnchors) ? session.scoreAnchors : [],
    scoreAnchorsCount: Array.isArray(session.scoreAnchors) ? session.scoreAnchors.length : 0,
    replayCount: (session.replayLog || []).length,
    directorMode: op.directorMode || 'REALISTIC',
    playerBuffs: op.playerBuffs || {},
    environment: op.environment || { dewFactor: 0, pitchWear: 'FRESH_BELTER', swingIndex: 15, overcast: false },
    cashoutControl: op.cashoutControl || { globalHaircut: 0.10, cashoutHalted: false, sweetenerOffers: {} },
    circuitBreaker: session.circuitBreaker || op.circuitBreaker || { velocityLimit: 100000, isTripped: false, trippedAt: null, stageCaps: { powerplay: 50000, middle: 35000, death: 15000 }, emergencyKillSwitch: false },
    microMarketsCount: (op.microMarkets || session.microMarkets || []).length,
    injectHistory: getSrlInjectHistory(base.id, { limit: 20 }),
    injectHistoryCount: (session.injectHistory || []).length,
    integrityHold: session.integrityHold || null,
    scoreDrift: null,
    deskAlerts: [],
    needsSettlement: false,
    msToStart: Number.isFinite(Number(base.startTime)) ? Number(base.startTime) - Date.now() : null,
  };
  row.scoreDrift = computeScoreDriftForMatch(base, session);
  const mwCtrl = session.marketControls?.match_winner || session.marketControls?.winner;
  const mwSettled = mwCtrl && ['DECLARED', 'VOIDED'].includes(String(mwCtrl.status || '').toUpperCase());
  row.needsSettlement = (controlStatus === 'COMPLETED' || base.matchState === 'post') && !mwSettled;
  row.deskAlerts = buildSrlMatchAlerts(row, session, { coverage: getSrlDeskCoverage() });
  return row;
}

function boardTotalsFromLive(ld = {}) {
  const phase = String(ld.phase || '');
  const inChase = Number(ld.inningsId) === 2 || phase === 'chase' || phase === 'chase-complete';
  return {
    innings: inChase ? 2 : 1,
    runs: inChase
      ? Number(ld.chaseRuns ?? ld.score2 ?? ld.runs ?? 0)
      : Number(ld.firstRuns ?? ld.runs ?? 0),
    wickets: inChase
      ? Number(ld.chaseWickets ?? ld.wickets2 ?? ld.wickets ?? 0)
      : Number(ld.firstWickets ?? ld.wickets ?? 0),
    overs: String(
      inChase
        ? (ld.chaseOvers ?? ld.overs2 ?? ld.overs ?? '0.0')
        : (ld.firstOvers ?? ld.overs ?? '0.0'),
    ),
    firstRuns: Number(ld.firstRuns ?? ld.runs ?? 0),
    firstWickets: Number(ld.firstWickets ?? ld.wickets ?? 0),
    chaseRuns: Number(ld.chaseRuns ?? ld.score2 ?? 0),
    chaseWickets: Number(ld.chaseWickets ?? ld.wickets2 ?? 0),
  };
}

function computeScoreDriftForMatch(match, session) {
  const anchors = Array.isArray(session?.scoreAnchors) ? session.scoreAnchors : [];
  if (!anchors.length) {
    return { runsDelta: 0, wicketsDelta: 0, anchored: null, natural: null, warning: false };
  }
  const saved = session.scoreAnchors;
  session.scoreAnchors = [];
  let naturalMatch = null;
  try {
    naturalMatch = getIplSrlMatchById(match.id);
  } finally {
    session.scoreAnchors = saved;
  }
  const anchored = boardTotalsFromLive(match.liveDetails || {});
  const natural = boardTotalsFromLive(naturalMatch?.liveDetails || {});
  const runsDelta = anchored.runs - natural.runs;
  const wicketsDelta = anchored.wickets - natural.wickets;
  return {
    runsDelta,
    wicketsDelta,
    anchored: {
      display: `${anchored.runs}/${anchored.wickets} (${anchored.overs})`,
      ...anchored,
    },
    natural: {
      display: `${natural.runs}/${natural.wickets} (${natural.overs})`,
      ...natural,
    },
    warning: Math.abs(runsDelta) >= 6 || Math.abs(wicketsDelta) >= 2,
  };
}

const controlState = {
  speed: 'NORMAL',
  pitch: 'BALANCED',
  weather: 'CLEAR',
  autoPlay: false,
  matches: new Map(), // matchId -> controlled match
  audit: [],
  timers: new Map(),
  srlAutoTimers: new Map(),
};

function nowIso() {
  return new Date().toISOString();
}

function pushAudit(action, detail, meta = {}) {
  controlState.audit.unshift({
    id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    action,
    detail,
    time: nowIso(),
    admin: meta.admin || 'SUPER_ADMIN',
  });
  if (controlState.audit.length > 200) controlState.audit.length = 200;
}

function teamLabel(teamId) {
  const t = getAllIPLSRLTeams().find((x) => x.teamId === teamId);
  return t ? `${t.shortName} · ${t.teamName}` : teamId;
}

function ensureDeskMatches(limit = 24) {
  const fixtures = getIPLSRLFixtures().slice(0, limit);
  fixtures.forEach((fx) => {
    if (controlState.matches.has(fx.fixtureId)) return;
    controlState.matches.set(fx.fixtureId, {
      ...initializeIPLSRLMatch(fx),
      matchId: fx.fixtureId,
      fixture: fx,
      forcedWinnerTeamId: null,
      forcedWinnerName: null,
      speed: controlState.speed,
      pitch: controlState.pitch,
      weather: controlState.weather,
      autoPlay: false,
      lastDelivery: null,
      startedAt: null,
      pausedAt: null,
      controlStatus: 'READY', // READY | ARMED | LIVE | PAUSED | COMPLETED
    });
  });
}

function getMatchOrThrow(matchId) {
  ensureDeskMatches();
  const m = controlState.matches.get(matchId);
  if (!m) throw new Error(`Match not found: ${matchId}`);
  return m;
}

function clearAutoTimer(matchId) {
  const t = controlState.timers.get(matchId);
  if (t) {
    clearInterval(t);
    controlState.timers.delete(matchId);
  }
}

function clearSrlAutoTimer(matchId) {
  const t = controlState.srlAutoTimers.get(matchId);
  if (t) {
    clearInterval(t);
    controlState.srlAutoTimers.delete(matchId);
  }
}

/** Kick delivery/micro-market settlement as soon as the desk advances a ball. */
function scheduleSrlDeliverySettlement(matchId) {
  void (async () => {
    try {
      const { refreshSrlOperatorSession } = await import('./iplSrlOperatorState.mjs');
      await refreshSrlOperatorSession(matchId);
      const match = getIplSrlMatchById(matchId, Date.now(), { forPublic: false });
      if (!match) return;
      const { runEventDrivenSettlementForMatch } = await import('./settlement/settlementEventBridge.mjs');
      await runEventDrivenSettlementForMatch(match);
    } catch (err) {
      console.error('[srlSettlement]', matchId, err?.message || err);
    }
  })();
}

/** Drain armed incident queue for live OddsYra SRL matches when global auto-play is on. */
function scheduleSrlOperatorAutoPlay(matchId) {
  clearSrlAutoTimer(matchId);
  if (!controlState.autoPlay || controlState.speed === 'PAUSED') return;
  if (!isUserFacingSrlMatch(matchId)) return;
  const op = getSrlOperatorSession(matchId);
  if (!op.startedAt || op.pausedAt || op.declaredWinnerKey) return;
  const ms = SPEED_MS[controlState.speed] || SPEED_MS.NORMAL;
  if (!ms) return;
  const timer = setInterval(() => {
    try {
      if (!controlState.autoPlay || controlState.speed === 'PAUSED') {
        clearSrlAutoTimer(matchId);
        return;
      }
      const sess = getSrlOperatorSession(matchId);
      if (!sess.startedAt || sess.pausedAt || sess.declaredWinnerKey) {
        clearSrlAutoTimer(matchId);
        return;
      }
      if (!(sess.incidentQueue || []).length) return;
      triggerDelivery(matchId, { admin: 'AUTO' });
    } catch {
      clearSrlAutoTimer(matchId);
    }
  }, ms);
  controlState.srlAutoTimers.set(matchId, timer);
}

function scheduleAutoPlay(matchId) {
  clearAutoTimer(matchId);
  const m = getMatchOrThrow(matchId);
  if (!m.autoPlay || m.controlStatus !== 'LIVE' || m.speed === 'PAUSED') return;
  const ms = SPEED_MS[m.speed] || SPEED_MS.NORMAL;
  if (!ms) return;
  const timer = setInterval(() => {
    try {
      const live = controlState.matches.get(matchId);
      if (!live || live.controlStatus !== 'LIVE' || live.speed === 'PAUSED' || !live.autoPlay) {
        clearAutoTimer(matchId);
        return;
      }
      triggerDelivery(matchId, { admin: 'AUTO' });
    } catch {
      clearAutoTimer(matchId);
    }
  }, ms);
  controlState.timers.set(matchId, timer);
}

function pitchMultiplier(pitch) {
  if (pitch === 'BATTING_PARADISE') return { bat: 1.12, bowl: 0.92 };
  if (pitch === 'SPIN_FRIENDLY') return { bat: 0.96, bowl: 1.08 };
  if (pitch === 'PACE_BOUNCE') return { bat: 0.97, bowl: 1.1 };
  return { bat: 1, bowl: 1 };
}

function applyWinnerBias(match, battingTeamId, bowlerBase, batterBase) {
  const winnerId = match.forcedWinnerTeamId;
  if (!winnerId) return { batter: batterBase, bowler: bowlerBase };

  const battingIsWinner = battingTeamId === winnerId;
  // Push simulation toward the pre-selected winner without hard-coding every ball.
  if (battingIsWinner) {
    return {
      batter: Math.min(99, batterBase * 1.18),
      bowler: Math.max(40, bowlerBase * 0.88),
    };
  }
  return {
    batter: Math.max(40, batterBase * 0.86),
    bowler: Math.min(99, bowlerBase * 1.16),
  };
}

function currentInnings(match) {
  return match.currentInnings === 1 ? match.innings1 : match.innings2;
}

function maybeCompleteInnings(match) {
  const inn = currentInnings(match);
  const allOut = inn.wickets >= 10;
  const oversDone = inn.overs >= 20;
  if (!allOut && !oversDone) return;

  inn.completed = true;
  if (match.currentInnings === 1) {
    match.targetScore = inn.runs + 1;
    match.currentInnings = 2;
    match.status = MATCH_STATES.IN_PROGRESS;
    pushAudit('Innings Break', `${match.matchId} target ${match.targetScore}`);
    return;
  }

  // Second innings complete — decide winner (respect forced winner when scores allow; otherwise force narrative)
  const i1 = match.innings1.runs;
  const i2 = match.innings2.runs;
  let winnerId = i2 > i1 ? match.innings2.battingTeamId : match.innings1.battingTeamId;
  if (i1 === i2) winnerId = match.forcedWinnerTeamId || winnerId;

  // If forced winner differs from natural result, nudge scoreboard to match operator intent.
  if (match.forcedWinnerTeamId && winnerId !== match.forcedWinnerTeamId) {
    if (match.forcedWinnerTeamId === match.innings2.battingTeamId) {
      match.innings2.runs = i1 + 2;
      winnerId = match.forcedWinnerTeamId;
      match.winMargin = `won by ${match.innings2.runs - i1} runs (operator scripted)`;
    } else {
      match.innings2.wickets = Math.min(10, match.innings2.wickets + 1);
      match.innings2.runs = Math.max(0, i1 - 5);
      winnerId = match.forcedWinnerTeamId;
      match.winMargin = `won by ${i1 - match.innings2.runs} runs (operator scripted)`;
    }
  } else if (winnerId === match.innings2.battingTeamId) {
    match.winMargin = `won by ${10 - match.innings2.wickets} wickets`;
  } else {
    match.winMargin = `won by ${i1 - match.innings2.runs} runs`;
  }

  match.winnerId = winnerId;
  match.resultSummary = `${teamLabel(winnerId)} ${match.winMargin}`;
  match.status = MATCH_STATES.COMPLETED;
  match.controlStatus = 'COMPLETED';
  match.autoPlay = false;
  clearAutoTimer(match.matchId);
  pushAudit('Match Completed', `${match.matchId} · ${match.resultSummary}`);
}

function emptySrlSideBook() {
  return { stake: 0, payout: 0, bets: 0 };
}

export function emptySrlMatchBook() {
  return {
    home: emptySrlSideBook(),
    away: emptySrlSideBook(),
    other: emptySrlSideBook(),
    totalStake: 0,
    heavier: null,
  };
}

function selectionSide(row, match) {
  const id = String(row.selection_id || '').trim().toLowerCase();
  const name = String(row.selection_name || '').trim().toLowerCase();
  const homeTokens = [match.homeTeamId, match.homeShort, match.homeTeam, '1', 'home']
    .filter(Boolean)
    .map((v) => String(v).trim().toLowerCase());
  const awayTokens = [match.awayTeamId, match.awayShort, match.awayTeam, '2', 'away']
    .filter(Boolean)
    .map((v) => String(v).trim().toLowerCase());
  if (homeTokens.includes(id) || homeTokens.some((t) => t.length > 1 && (name === t || name.includes(t)))) {
    return 'home';
  }
  if (awayTokens.includes(id) || awayTokens.some((t) => t.length > 1 && (name === t || name.includes(t)))) {
    return 'away';
  }
  return 'other';
}

export function applySrlStakeRows(matches, rows = []) {
  const books = new Map(matches.map((m) => [m.matchId, emptySrlMatchBook()]));
  for (const row of rows) {
    const match = matches.find((m) => m.matchId === row.match_id);
    if (!match) continue;
    const book = books.get(match.matchId);
    const side = selectionSide(row, match);
    const stake = Number(row.stake) || 0;
    const payout = Number(row.payout) || 0;
    const bets = Number(row.bets) || 0;
    book[side].stake += stake;
    book[side].payout += payout;
    book[side].bets += bets;
  }
  for (const book of books.values()) {
    book.totalStake = book.home.stake + book.away.stake + book.other.stake;
    if (book.home.stake > book.away.stake) book.heavier = 'home';
    else if (book.away.stake > book.home.stake) book.heavier = 'away';
    else book.heavier = null;
    book.projectedPnlHome = book.totalStake - book.home.payout;
    book.projectedPnlAway = book.totalStake - book.away.payout;
    book.worstCaseLiability = Math.max(0, book.home.payout - book.totalStake, book.away.payout - book.totalStake);
    book.riskFlag = book.worstCaseLiability > 50000 ? 'CRITICAL' : (book.worstCaseLiability > 10000 ? 'WARNING' : 'BALANCED');
  }
  return matches.map((m) => ({ ...m, book: books.get(m.matchId) || emptySrlMatchBook() }));
}

export async function enrichSnapshotWithStakes(payload) {
  const snap = payload?.matches ? payload : payload?.snapshot;
  if (!snap?.matches?.length) return payload;
  let rows = [];
  try {
    const { query } = await import('../db/pg.js');
    const ids = snap.matches.map((m) => m.matchId).filter(Boolean);
    if (ids.length) {
      const res = await query(
        `SELECT match_id,
                selection_id,
                SUM(stake)::float AS stake,
                SUM(COALESCE(potential_payout, stake * odds, 0))::float AS payout,
                COUNT(*)::int AS bets
         FROM bets
         WHERE match_id = ANY($1::text[])
           AND UPPER(COALESCE(status, '')) IN ('ACCEPTED', 'PENDING', 'OPEN')
         GROUP BY match_id, selection_id`,
        [ids],
      );
      rows = res.rows || [];
    }
  } catch {
    rows = [];
  }
  const coverage = getSrlDeskCoverage();
  const matches = applySrlStakeRows(snap.matches, rows).map((m) => {
    const session = getSrlOperatorSession(m.matchId);
    const withBook = { ...m };
    maybeAutoPauseOnLiability(withBook, session, { coverage });
    maybeTripVelocityBreaker(withBook, session);
    try {
      evaluateSrlStageSoftLimit(withBook.matchId, withBook.book || {});
    } catch {
      // never break snapshot
    }
    return {
      ...withBook,
      deskAlerts: buildSrlMatchAlerts(withBook, getSrlOperatorSession(m.matchId), { coverage }),
    };
  });
  const next = {
    ...snap,
    matches,
    reasonCodes: SRL_REASON_CODES,
    deskCoverage: coverage,
    shiftNotes: listSrlShiftNotes(),
  };
  if (payload?.matches) return next;
  return { ...payload, snapshot: next };
}

function maybeAutoPauseOnLiability(match, session, { coverage = null } = {}) {
  if (!match?.matchId || !isUserFacingSrlMatch(match.matchId)) return;
  if (match.controlStatus !== 'LIVE') return;
  const threshold = Number(session?.marginDefense?.autoFreezeThreshold || match.marginDefense?.autoFreezeThreshold || 50000);
  const liability = Number(match.book?.worstCaseLiability || 0);
  const noSeniorTighten = coverage && !coverage.seniorOnline && liability >= threshold * 0.6 && threshold > 0;
  if (!(liability >= threshold && threshold > 0) && !noSeniorTighten) return;
  if (session?.lastAutoPauseAt && Date.now() - session.lastAutoPauseAt < 60_000) return;
  try {
    pauseSrlOperatorMatch(match.matchId);
    clearSrlAutoTimer(match.matchId);
    setSrlOperatorBettingClosed(match.matchId, true);
    markSrlAutoPause(match.matchId);
    const msg = noSeniorTighten && !(liability >= threshold)
      ? `Auto-paused: no senior online · liability ₹${Math.round(liability).toLocaleString('en-IN')}`
      : `Auto-paused: liability ₹${Math.round(liability).toLocaleString('en-IN')}`;
    pushSrlDeskAlert(match.matchId, {
      level: 'danger',
      code: 'AUTO_PAUSE',
      message: msg,
    });
    pushAudit('Liability Auto-Pause', `${match.matchId} liability ${liability} ≥ ${threshold}`, { admin: 'SYSTEM' });
    match.controlStatus = 'PAUSED';
    match.bettingClosed = true;
    void raiseSrlOpsPager({
      code: 'AUTO_PAUSE',
      matchId: match.matchId,
      message: msg,
      severity: 'HIGH',
    });
  } catch {
    // Never break snapshot enrichment.
  }
}

function maybeTripVelocityBreaker(match, session) {
  if (!match?.matchId || match.controlStatus !== 'LIVE') return;
  const cb = session?.circuitBreaker || match.circuitBreaker || {};
  if (cb.isTripped || cb.emergencyKillSwitch) return;
  const limit = Number(cb.velocityLimit) || 0;
  const totalStake = Number(match.book?.totalStake || 0);
  if (!(limit > 0 && totalStake >= limit)) return;
  try {
    toggleSrlCircuitBreakerTrip(match.matchId, true);
    pushSrlDeskAlert(match.matchId, {
      level: 'danger',
      code: 'BREAKER',
      message: `Velocity breaker: stake ₹${Math.round(totalStake).toLocaleString('en-IN')} ≥ ₹${Math.round(limit).toLocaleString('en-IN')}`,
    });
    pushAudit('Circuit Breaker Trip', `${match.matchId} stake ${totalStake} ≥ ${limit}`, { admin: 'SYSTEM' });
    void raiseSrlOpsPager({
      code: 'BREAKER',
      matchId: match.matchId,
      message: `Velocity breaker tripped on ${match.matchId}`,
      severity: 'HIGH',
    });
  } catch {
    // ignore
  }
}

async function raiseSrlOpsPager({ code, matchId, message, severity = 'HIGH' } = {}) {
  try {
    const { raiseOpsAlert } = await import('./opsAlertEngine.mjs');
    await raiseOpsAlert({
      category: 'BETTING',
      severity,
      title: `SRL ${code}`,
      message: message || code,
      entityType: 'srl_desk',
      entityId: matchId || null,
      dedupeKey: `srl:${code}:${matchId || 'desk'}`,
      source: 'srl_desk_ops',
    });
  } catch {
    // pager is best-effort
  }
  try {
    const { dispatchAlertWebhook } = await import('./alertWebhookEngine.mjs');
    await dispatchAlertWebhook({
      priority: severity,
      title: `SRL ${code}`,
      message: message || code,
      type: 'SLACK',
    });
  } catch {
    // optional
  }
}

function describeSeasonClock(now = Date.now()) {
  const offsetMs = getSrlSeasonOffsetMs();
  const season = getIplSrlSeasonMatches(now);
  const live = season.find((m) => m.matchState === 'in');
  const upcoming = season.find((m) => m.matchState === 'pre' && m.team1?.key !== 'tbd');
  const focus = live || upcoming || season[0];
  return {
    offsetMs,
    effectiveNow: getSrlSimNow(now),
    jumped: offsetMs !== 0,
    matchNo: focus?.matchNo || null,
    matchId: focus?.id || null,
    stageLabel: focus?.stageLabel || null,
    matchState: focus?.matchState || null,
    label: focus
      ? `#${focus.matchNo} ${focus.team1?.shortName || ''} vs ${focus.team2?.shortName || ''} · ${focus.scheduleLabel || ''}`.trim()
      : 'Wall clock',
  };
}

export function getIPLSRLControlSnapshot() {
  ensureDeskMatches();
  const season = getIPLSRLSeason();
  const matches = getIplSrlDeskMatches().map(mapSrlDeskMatch);
  const deskCoverage = getSrlDeskCoverage();

  return {
    season: {
      seasonId: season.seasonId,
      name: season.name,
      edition: season.edition,
      status: season.status,
      teams: getAllIPLSRLTeams().length,
      players: getAllIPLSRLPlayers().length,
    },
    settings: {
      speed: controlState.speed,
      pitch: controlState.pitch,
      weather: controlState.weather,
      autoPlay: controlState.autoPlay,
    },
    matches,
    deskCoverage,
    shiftNotes: listSrlShiftNotes(),
    seasonClock: describeSeasonClock(),
    standings: getIplSrlPointsTable().map((row) => ({
      rank: row.rank,
      teamId: row.key,
      teamName: row.name,
      shortName: row.shortName,
      matches: row.played,
      played: row.played,
      won: row.won,
      lost: row.lost,
      points: row.points,
      nrr: row.nrr,
    })),
    teams: getAllIPLSRLTeams(),
    players: getAllIPLSRLPlayers(),
    audit: controlState.audit.slice(0, 40),
    options: {
      speeds: SIM_SPEEDS,
      pitches: PITCH_OPTIONS,
      weather: WEATHER_OPTIONS,
      playerRoles: PLAYER_ROLES,
    },
  };
}

export function updateIPLSRLGlobalSettings({ speed, pitch, weather, autoPlay, admin } = {}) {
  if (speed && SIM_SPEEDS.includes(speed)) controlState.speed = speed;
  if (pitch && PITCH_OPTIONS.includes(pitch)) controlState.pitch = pitch;
  if (weather && WEATHER_OPTIONS.includes(weather)) controlState.weather = weather;
  if (typeof autoPlay === 'boolean') controlState.autoPlay = autoPlay;

  // Propagate defaults to non-live matches
  for (const m of controlState.matches.values()) {
    if (m.controlStatus === 'READY' || m.controlStatus === 'ARMED') {
      m.speed = controlState.speed;
      m.pitch = controlState.pitch;
      m.weather = controlState.weather;
    }
  }

  if (controlState.autoPlay) {
    for (const m of getIplSrlDeskMatches()) {
      if (m.matchState === 'in') scheduleSrlOperatorAutoPlay(m.id);
    }
  } else {
    for (const id of [...controlState.srlAutoTimers.keys()]) clearSrlAutoTimer(id);
  }

  pushAudit('Settings Updated', `speed=${controlState.speed} pitch=${controlState.pitch} weather=${controlState.weather}`, { admin });
  return getIPLSRLControlSnapshot();
}

export function setIPLSRLForcedWinner(matchId, teamId, admin) {
  if (isUserFacingSrlMatch(matchId)) {
    const match = getIplSrlMatchById(matchId);
    if (!match) throw new Error(`Match not found: ${matchId}`);
    const valid = [match.team1?.key, match.team2?.key].includes(teamId);
    if (!valid) throw new Error('Winner must be one of the two competing teams');
    setSrlOperatorWinner(matchId, teamId);
    const name = teamId === match.team1.key ? match.team1.name : match.team2.name;
    pushAudit('Winner Scripted', `${matchId} → ${name}`, { admin });
    return getIPLSRLControlSnapshot();
  }

  const m = getMatchOrThrow(matchId);
  const valid = [m.homeTeam.teamId, m.awayTeam.teamId].includes(teamId);
  if (!valid) throw new Error('Forced winner must be one of the two competing teams');
  if (m.controlStatus === 'COMPLETED') {
    throw new Error('Match already completed');
  }

  m.forcedWinnerTeamId = teamId;
  m.forcedWinnerName = teamLabel(teamId);
  if (m.controlStatus !== 'LIVE' && m.controlStatus !== 'PAUSED') m.controlStatus = 'ARMED';
  pushAudit('Winner Scripted', `${matchId} → ${m.forcedWinnerName}`, { admin });
  return getIPLSRLControlSnapshot();
}

export function clearIPLSRLForcedWinner(matchId, admin) {
  if (isUserFacingSrlMatch(matchId)) {
    const op = getSrlOperatorSession(matchId);
    if (op.declaredWinnerKey) throw new Error('Match already completed');
    setSrlOperatorWinner(matchId, null);
    pushAudit('Winner Cleared', matchId, { admin });
    return getIPLSRLControlSnapshot();
  }

  const m = getMatchOrThrow(matchId);
  if (m.controlStatus === 'COMPLETED') {
    throw new Error('Match already completed');
  }
  m.forcedWinnerTeamId = null;
  m.forcedWinnerName = null;
  if (m.controlStatus !== 'LIVE' && m.controlStatus !== 'PAUSED') m.controlStatus = 'READY';
  pushAudit('Winner Cleared', matchId, { admin });
  return getIPLSRLControlSnapshot();
}

export async function declareIPLSRLWinner(matchId, teamId, admin, role = 'SUPER_ADMIN', { note, skipNote = false, skipCooldown = false } = {}) {
  assertSrlDangerousAction('declare', admin, role, { note, skipNote, skipCooldown });
  if (!isUserFacingSrlMatch(matchId)) {
    throw new Error('Declare winner is only available on user-facing IPL SRL matches');
  }
  const match = getIplSrlMatchById(matchId);
  if (!match) throw new Error(`Match not found: ${matchId}`);
  const valid = [match.team1?.key, match.team2?.key].includes(teamId);
  if (!valid) throw new Error('Winner must be one of the two competing teams');
  declareSrlOperatorWinner(matchId, teamId);
  clearSrlAutoTimer(matchId);
  const name = teamId === match.team1.key ? match.team1.name : match.team2.name;

  // Pay open match_winner bets (same path as market declare).
  let settled = null;
  try {
    const winningSelectionId = teamId === match.team1?.key
      ? (match.team1?.key || '1')
      : (match.team2?.key || '2');
    settled = await declareIPLSRLMarketOutcome(matchId, {
      marketId: 'match_winner',
      winningSelectionId,
      admin,
      role,
      skipDangerCheck: true,
    });
  } catch (err) {
    settled = { error: err.message || 'match_winner_settle_failed' };
  }

  pushAudit('Winner Declared', `${matchId} → ${name}${note ? ` · ${note}` : ''}`, { admin });
  return {
    ...getIPLSRLControlSnapshot(),
    winnerSettled: settled,
  };
}

export function startIPLSRLControlledMatch(matchId, { admin } = {}) {
  if (isUserFacingSrlMatch(matchId)) {
    const current = getIplSrlMatchById(matchId);
    const clockElapsed = current ? Math.max(0, Date.now() - Number(current.startTime || 0)) : 0;
    startSrlOperatorMatch(matchId, Date.now(), clockElapsed);
    const factor = SPEED_FACTOR[controlState.speed] ?? 1;
    if (controlState.speed === 'PAUSED') {
      pauseSrlOperatorMatch(matchId);
    } else if (factor !== 1) {
      setSrlOperatorSpeed(matchId, factor);
    }
    pushAudit('Match Started', `${matchId} now live for users`, { admin });
    scheduleSrlOperatorAutoPlay(matchId);
    return getIPLSRLControlSnapshot();
  }

  const m = getMatchOrThrow(matchId);
  if (m.controlStatus === 'COMPLETED') throw new Error('Match already completed');
  if (m.controlStatus === 'LIVE') throw new Error('Match already live');

  if (!m.toss) performIPLSRLToss(m, Date.now());
  m.status = MATCH_STATES.IN_PROGRESS;
  m.controlStatus = 'LIVE';
  m.startedAt = nowIso();
  m.pausedAt = null;
  m.speed = controlState.speed === 'PAUSED' ? 'NORMAL' : controlState.speed;
  m.pitch = controlState.pitch;
  m.weather = controlState.weather;
  m.autoPlay = controlState.autoPlay;

  pushAudit('Match Started', matchId, { admin });
  if (m.autoPlay) scheduleAutoPlay(matchId);
  return getIPLSRLControlSnapshot();
}

export function pauseIPLSRLControlledMatch(matchId, { admin } = {}) {
  if (isUserFacingSrlMatch(matchId)) {
    const current = getIplSrlMatchById(matchId);
    const clockElapsed = current ? Math.max(0, Date.now() - Number(current.startTime || 0)) : 0;
    pauseSrlOperatorMatch(matchId, Date.now(), clockElapsed);
    clearSrlAutoTimer(matchId);
    pushAudit('Match Paused', matchId, { admin });
    return getIPLSRLControlSnapshot();
  }

  const m = getMatchOrThrow(matchId);
  if (m.controlStatus !== 'LIVE') throw new Error('Only live matches can be paused');
  m.controlStatus = 'PAUSED';
  m.pausedAt = nowIso();
  m.autoPlay = false;
  clearAutoTimer(matchId);
  pushAudit('Match Paused', matchId, { admin });
  return getIPLSRLControlSnapshot();
}

export function resumeIPLSRLControlledMatch(matchId, { admin, autoPlay = true } = {}) {
  if (isUserFacingSrlMatch(matchId)) {
    resumeSrlOperatorMatch(matchId);
    pushAudit('Match Resumed', matchId, { admin });
    scheduleSrlOperatorAutoPlay(matchId);
    return getIPLSRLControlSnapshot();
  }

  const m = getMatchOrThrow(matchId);
  if (m.controlStatus !== 'PAUSED') throw new Error('Only paused matches can be resumed');
  m.controlStatus = 'LIVE';
  m.pausedAt = null;
  m.autoPlay = !!autoPlay;
  pushAudit('Match Resumed', matchId, { admin });
  if (m.autoPlay) scheduleAutoPlay(matchId);
  return getIPLSRLControlSnapshot();
}

export function setIPLSRLMatchSpeed(matchId, speed, admin) {
  if (!SIM_SPEEDS.includes(speed)) throw new Error('Invalid speed');

  if (isUserFacingSrlMatch(matchId)) {
    if (speed === 'PAUSED') {
      pauseSrlOperatorMatch(matchId);
      clearSrlAutoTimer(matchId);
    } else {
      const op = getSrlOperatorSession(matchId);
      if (op.pausedAt && op.startedAt && !op.declaredWinnerKey) {
        resumeSrlOperatorMatch(matchId);
      }
      setSrlOperatorSpeed(matchId, SPEED_FACTOR[speed] || 1);
      scheduleSrlOperatorAutoPlay(matchId);
    }
    controlState.speed = speed;
    pushAudit('Match Speed', `${matchId} → ${speed}`, { admin });
    return getIPLSRLControlSnapshot();
  }

  const m = getMatchOrThrow(matchId);
  m.speed = speed;
  if (speed === 'PAUSED' && m.controlStatus === 'LIVE') {
    m.controlStatus = 'PAUSED';
    m.autoPlay = false;
    clearAutoTimer(matchId);
  } else if (m.controlStatus === 'LIVE' && m.autoPlay) {
    scheduleAutoPlay(matchId);
  }
  pushAudit('Match Speed', `${matchId} → ${speed}`, { admin });
  return getIPLSRLControlSnapshot();
}

export function triggerDelivery(matchId, { admin, incident: directIncident } = {}) {
  if (isUserFacingSrlMatch(matchId)) {
    const incident = directIncident || popSrlIncident(matchId);
    const before = getIplSrlMatchById(matchId);
    const ldBefore = before?.liveDetails || {};
    const innBefore = Number(before?.currentInnings || ldBefore.inningsId || 1);
    const chaseBefore = innBefore === 2
      || ldBefore.phase === 'chase'
      || ldBefore.phase === 'chase-complete';
    const runsBefore = chaseBefore
      ? Number(ldBefore.chaseRuns ?? ldBefore.score2 ?? ldBefore.runs ?? 0)
      : Number(ldBefore.firstRuns ?? ldBefore.runs ?? 0);
    const wicketsBefore = chaseBefore
      ? Number(ldBefore.chaseWickets ?? ldBefore.wickets2 ?? ldBefore.wickets ?? 0)
      : Number(ldBefore.firstWickets ?? ldBefore.wickets ?? 0);
    const oversBefore = String(
      chaseBefore
        ? (ldBefore.chaseOvers ?? ldBefore.overs2 ?? ldBefore.overs ?? '0.0')
        : (ldBefore.firstOvers ?? ldBefore.overs ?? '0.0'),
    );

    const incidentType = incident ? String(incident.type || '').toUpperCase() : null;
    const isExtra = incidentType === 'WIDE' || incidentType === 'NO_BALL';
    // Extras do not consume a legal delivery — keep the over counter where it is.
    if (!isExtra) {
      seekIPLSRLMatch(matchId, { marker: 'ball' }, admin);
    }

    const m = getIplSrlMatchById(matchId);
    let runs = 0;
    let isWicket = false;
    let outcome = 'BALL';
    let commentary = null;

    if (incident) {
      const type = incidentType;
      const ld = m?.liveDetails || {};
      const inn = Number(m?.currentInnings || ld.inningsId || innBefore || 1);
      const isChase = inn === 2 || ld.phase === 'chase' || ld.phase === 'chase-complete';
      const curRuns = isExtra
        ? runsBefore
        : (isChase
          ? Number(ld.chaseRuns ?? ld.score2 ?? ld.runs ?? 0)
          : Number(ld.firstRuns ?? ld.runs ?? 0));
      const curWickets = isExtra
        ? wicketsBefore
        : (isChase
          ? Number(ld.chaseWickets ?? ld.wickets2 ?? ld.wickets ?? 0)
          : Number(ld.firstWickets ?? ld.wickets ?? 0));
      const oversStr = isExtra
        ? oversBefore
        : String(
          isChase
            ? (ld.chaseOvers ?? ld.overs2 ?? ld.overs ?? '0.0')
            : (ld.firstOvers ?? ld.overs ?? '0.0'),
        );
      const parts = String(oversStr).trim().match(/^(\d+)(?:\.(\d+))?$/);
      const completed = parts ? Number(parts[1]) : 0;
      const ballsInOver = parts ? Number(parts[2] || 0) : 0;
      const ballCount = (completed * 6) + Math.min(5, Math.max(0, ballsInOver));
      const ballIndex = Math.max(0, isExtra ? ballCount : (ballCount - 1));
      const atOver = Number(`${completed}.${ballsInOver}`);

      const addRuns = ({
        SIX: 6,
        FOUR: 4,
        DOUBLE: 2,
        SINGLE: 1,
        WIDE: 1,
        NO_BALL: 1,
        DOT: 0,
        WICKET: 0,
      })[type];

      if (type === 'WICKET') {
        isWicket = true;
        outcome = 'WICKET';
        commentary = incident.customCommentary || `WICKET! ${incident.subType || 'Bowled'}! Timber! Batter is dismissed.`;
      } else if (type === 'SIX') {
        runs = 6;
        outcome = 'SIX';
        commentary = incident.customCommentary || 'MAXIMUM! Smashed 95 meters into the top tier for SIX!';
      } else if (type === 'FOUR') {
        runs = 4;
        outcome = 'FOUR';
        commentary = incident.customCommentary || 'FOUR! Pierces the infield with precision!';
      } else if (type === 'DOUBLE') {
        runs = 2;
        outcome = 'DOUBLE';
        commentary = incident.customCommentary || 'Two runs taken.';
      } else if (type === 'SINGLE') {
        runs = 1;
        outcome = 'SINGLE';
        commentary = incident.customCommentary || 'Single taken.';
      } else if (type === 'DOT') {
        outcome = 'DOT';
        commentary = incident.customCommentary || 'Dot ball. Play and a miss outside off.';
      } else if (type === 'WIDE' || type === 'NO_BALL') {
        runs = 1;
        outcome = type;
        commentary = incident.customCommentary || (type === 'WIDE' ? 'Wide ball signal from umpire.' : 'No ball! Free hit signaled!');
      }

      if (addRuns != null) {
        const desiredRuns = Math.max(0, Math.round(Number(runsBefore) || 0) + addRuns);
        // Wicket injects bump FoW. Non-wicket injects only rebase runs — never freeze
        // wickets below the natural/sim FoW (that left header 17/0 while scorecard showed bowled).
        const desiredWickets = isWicket
          ? Math.max(0, Math.min(10, Math.round(Number(wicketsBefore) || 0) + 1))
          : null;
        upsertSrlScoreAnchor(matchId, {
          innings: inn,
          runs: desiredRuns,
          ...(desiredWickets != null ? { wickets: desiredWickets } : {}),
          naturalRunsAtAnchor: curRuns,
          naturalWicketsAtAnchor: curWickets,
          atOver: Number.isFinite(atOver) ? atOver : ballCount / 10,
          ballIndex,
          applyNow: true,
          source: 'incident',
          advancedClock: !isExtra,
          incidentType: type,
          wicketType: isWicket ? (incident.subType || 'out') : null,
          admin: admin || null,
          boardBefore: { runs: runsBefore, wickets: wicketsBefore, overs: oversBefore },
          reasonCode: normalizeSrlReasonCode(incident.reasonCode),
        });
      }

      if (commentary) {
        setSrlCustomCommentary(matchId, { text: commentary, eventTag: outcome });
      }
      pushAudit('Incident Executed', `${matchId} → ${outcome} (${runs}r${isWicket ? ' W' : ''}) [${normalizeSrlReasonCode(incident.reasonCode)}]`, { admin });
    }

    const mFinal = getIplSrlMatchById(matchId);
    const ldFinal = mFinal?.liveDetails || {};
    const finalInn = Number(mFinal?.currentInnings || ldFinal.inningsId || 1);
    const finalIsChase = finalInn === 2 || ldFinal.phase === 'chase';
    const oversDoneFinal = String(
      finalIsChase
        ? (ldFinal.chaseOvers ?? ldFinal.overs2 ?? ldFinal.overs ?? oversBefore)
        : (ldFinal.firstOvers ?? ldFinal.overs ?? oversBefore),
    );
    const boardRuns = finalIsChase
      ? Number(ldFinal.chaseRuns ?? ldFinal.score2 ?? ldFinal.runs ?? 0)
      : Number(ldFinal.firstRuns ?? ldFinal.runs ?? 0);
    const boardWickets = finalIsChase
      ? Number(ldFinal.chaseWickets ?? ldFinal.wickets2 ?? ldFinal.wickets ?? 0)
      : Number(ldFinal.firstWickets ?? ldFinal.wickets ?? 0);
    const playerName = (val, fallback) => {
      if (val == null || val === '') return fallback;
      if (typeof val === 'string' || typeof val === 'number') return String(val);
      if (typeof val === 'object') return val.displayName || val.name || val.shortName || fallback;
      return fallback;
    };
    recordSrlReplayDelivery(matchId, {
      ballId: `del_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      overNumber: Math.floor(Number(String(oversDoneFinal).split('.')[0]) || 0),
      ballInOver: Number(String(oversDoneFinal).split('.')[1] || 0),
      innings: finalInn,
      bowler: playerName(ldFinal.bowler, 'Bowler'),
      batsman: playerName(ldFinal.batsman || ldFinal.batter1, 'Striker'),
      outcome,
      runs,
      wicket: isWicket,
      wicketType: incident?.subType || null,
      commentary,
      score: { runs: boardRuns, wickets: boardWickets, overs: oversDoneFinal },
      timestamp: Date.now(),
    });

    if (incident) {
      pushSrlInjectHistory(matchId, {
        admin,
        reasonCode: incident.reasonCode,
        type: outcome,
        subType: incident.subType || null,
        advancedClock: !isExtra,
        ballIndex: null,
        innings: finalInn,
        boardBefore: { runs: runsBefore, wickets: wicketsBefore, overs: oversBefore },
        boardAfter: { runs: boardRuns, wickets: boardWickets, overs: oversDoneFinal },
      });
    }

    scheduleSrlDeliverySettlement(matchId);

    return {
      snapshot: getIPLSRLControlSnapshot(),
      delivery: { outcome, runs, isWicket, commentary, at: nowIso() },
    };
  }
  const m = getMatchOrThrow(matchId);
  if (m.controlStatus === 'PAUSED') throw new Error('Match is paused');
  if (m.controlStatus !== 'LIVE') throw new Error('Start the match (with a forced winner) before simulating deliveries');
  if (m.status === MATCH_STATES.COMPLETED) throw new Error('Match already completed');

  if (m.status === MATCH_STATES.INNINGS_BREAK) {
    m.status = MATCH_STATES.IN_PROGRESS;
  }

  const inn = currentInnings(m);
  const battingTeamId = inn.battingTeamId;
  const bowlingTeamId = inn.bowlingTeamId;
  const batTeam = battingTeamId === m.homeTeam.teamId ? m.homeTeam : m.awayTeam;
  const bowlTeam = bowlingTeamId === m.homeTeam.teamId ? m.homeTeam : m.awayTeam;
  const batter = (batTeam.playingXI || [])[Math.min(inn.wickets, 10)] || { name: 'Batter', battingRating: 80 };
  const bowler = (bowlTeam.playingXI || [])[inn.overs % Math.max(1, (bowlTeam.playingXI || []).length)] || { name: 'Bowler', bowlingRating: 80 };

  const env = pitchMultiplier(m.pitch);
  const biased = applyWinnerBias(
    m,
    battingTeamId,
    (bowler.bowlingRating || 80) * env.bowl,
    (batter.battingRating || 80) * env.bat,
  );

  const delivery = simulateIPLSRLDelivery({
    striker: { ...batter, battingRating: biased.batter },
    bowler: { ...bowler, bowlingRating: biased.bowler },
    overNum: inn.overs + 1,
    ballNum: inn.balls + 1,
    wicketsLost: inn.wickets,
    targetScore: m.currentInnings === 2 ? m.targetScore : null,
    currentRuns: inn.runs,
    seed: Date.now() + inn.runs * 17 + inn.balls,
  });

  const runs = (delivery.runs || 0) + (delivery.extras || 0);
  inn.runs += runs;
  if (delivery.isWicket) inn.wickets += 1;

  if (!delivery.isExtra) {
    inn.balls += 1;
    if (inn.balls >= 6) {
      inn.overs += 1;
      inn.balls = 0;
    }
  }

  const ballRecord = {
    matchId,
    over: inn.overs,
    ball: inn.balls,
    battingTeamId,
    outcome: delivery.outcome,
    runs,
    isWicket: !!delivery.isWicket,
    striker: batter.name || batter.displayName,
    bowler: bowler.name || bowler.displayName,
    at: nowIso(),
  };
  recordIPLSRLDelivery(ballRecord);
  m.lastDelivery = ballRecord;

  maybeCompleteInnings(m);
  pushAudit('Delivery', `${matchId} · ${delivery.outcome}${delivery.isWicket ? ' WICKET' : ''} +${runs}`, { admin });
  return { snapshot: getIPLSRLControlSnapshot(), delivery: ballRecord };
}

export function seekIPLSRLMatch(matchId, { elapsedMs, deltaMs, marker, pause } = {}, admin) {
  if (!isUserFacingSrlMatch(matchId)) {
    throw new Error('Clock seek is only available on OddsYra SRL matches');
  }
  const now = Date.now();
  const match = getIplSrlMatchById(matchId, now);
  if (!match) throw new Error(`Match not found: ${matchId}`);
  if (match.matchState === 'post' && getSrlOperatorSession(matchId).declaredWinnerKey) {
    throw new Error('Match already completed');
  }

  const clock = clockForSrlMatch(match, now);
  let next = clock.elapsedMs;
  if (Number.isFinite(Number(elapsedMs))) {
    next = Number(elapsedMs);
  } else if (Number.isFinite(Number(deltaMs))) {
    next = clock.elapsedMs + Number(deltaMs);
  } else if (marker === 'ball') {
    next = clock.elapsedMs + (clock.msPerBall || 15_000);
  } else if (marker === 'ball_back') {
    next = clock.elapsedMs - (clock.msPerBall || 15_000);
  } else if (marker === 'over') {
    next = clock.elapsedMs + (clock.msPerBall || 15_000) * 6;
  } else if (marker === 'over_back') {
    next = clock.elapsedMs - (clock.msPerBall || 15_000) * 6;
  } else if (marker === 'innings_break') {
    next = clock.firstInningsEndMs || next;
  } else if (marker === 'second_innings') {
    next = clock.breakEndMs || next;
  } else if (marker === 'finish') {
    next = Math.max(0, clock.durationMs - 1);
  } else {
    throw new Error('elapsedMs, deltaMs, or marker is required');
  }

  next = Math.round(Math.max(0, Math.min(clock.durationMs - 1, next)));
  seekSrlOperatorElapsed(matchId, next, now, { pause: !!pause });
  pushAudit('Match Seek', `${matchId} → ${Math.round(next / 60000)}m (${marker || 'manual'})`, { admin });
  // +1 ball / +1 over must settle next-delivery / over markets — not only /delivery.
  if (marker === 'ball' || marker === 'over' || marker === 'finish' || Number.isFinite(Number(deltaMs))) {
    scheduleSrlDeliverySettlement(matchId);
  }
  return getIPLSRLControlSnapshot();
}

export function resetIPLSRLMatch(matchId, admin) {
  if (!isUserFacingSrlMatch(matchId)) {
    throw new Error('Reset is only available on OddsYra SRL matches');
  }
  resetSrlOperatorMatch(matchId);
  pushAudit('Match Reset', `${matchId} returned to the published clock`, { admin });
  return getIPLSRLControlSnapshot();
}

export function setIPLSRLBettingClosed(matchId, closed, admin) {
  if (!isUserFacingSrlMatch(matchId)) {
    throw new Error('Betting hold is only available on OddsYra SRL matches');
  }
  if (!getIplSrlMatchById(matchId)) throw new Error(`Match not found: ${matchId}`);
  setSrlOperatorBettingClosed(matchId, !!closed);
  pushAudit(closed ? 'Betting Closed' : 'Betting Opened', String(matchId), { admin });
  return getIPLSRLControlSnapshot();
}

export function jumpIPLSRLSeason({ matchNo, at = 'live' } = {}, admin) {
  const n = Math.round(Number(matchNo));
  if (!Number.isFinite(n) || n < 1 || n > SRL_SEASON_MATCH_COUNT) {
    throw new Error(`matchNo must be between 1 and ${SRL_SEASON_MATCH_COUNT}`);
  }
  const wall = Date.now();
  const match = getIplSrlSeasonMatches(wall).find((m) => Number(m.matchNo) === n);
  if (!match?.startTime) throw new Error(`No match #${n} on the current cycle`);
  const duration = Number(match.endTime ? match.endTime - match.startTime : match.expectedDurationMs) || (3.5 * 3600 * 1000);
  const mode = String(at || 'live').toLowerCase();
  let target = match.startTime + 90_000;
  if (mode === 'start' || mode === 'toss' || mode === 'upcoming') target = match.startTime - 8_000;
  else if (mode === 'end' || mode === 'result' || mode === 'done') target = match.startTime + duration + 2_000;
  setSrlSeasonOffsetMs(target - wall);
  pushAudit('Season Jump', `Match #${n} · ${mode}`, { admin });
  return getIPLSRLControlSnapshot();
}

export function resetIPLSRLSeasonClock(admin) {
  setSrlSeasonOffsetMs(0);
  pushAudit('Season Clock Reset', 'Returned to wall clock', { admin });
  return getIPLSRLControlSnapshot();
}

export function clearIPLSRLIncidentQueue(matchId, admin = 'admin') {
  if (!isUserFacingSrlMatch(matchId)) throw new Error('Only OddsYra SRL matches');
  clearSrlIncidents(matchId);
  pushAudit('Incident Queue Cleared', String(matchId), { admin });
  return { success: true, snapshot: getIPLSRLControlSnapshot() };
}

export function injectIPLSRLIncident(matchId, incident, admin) {
  if (!isUserFacingSrlMatch(matchId)) throw new Error('Incidents only available on OddsYra SRL matches');
  const reasonCode = normalizeSrlReasonCode(incident?.reasonCode);
  if (incident?.instant) {
    const payload = {
      id: `inc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: String(incident.type || 'DOT').toUpperCase(),
      subType: incident.subType || null,
      customCommentary: incident.customCommentary || null,
      runs: Number.isFinite(Number(incident.runs)) ? Number(incident.runs) : null,
      reasonCode,
      timestamp: Date.now(),
    };
    pushAudit('Incident Instant', `${matchId} → ${payload.type} [${reasonCode}] ${payload.subType || ''}`, { admin });
    const result = triggerDelivery(matchId, { admin, incident: payload });
    scheduleSrlOperatorAutoPlay(matchId);
    return result;
  }
  const queued = queueSrlIncident(matchId, { ...incident, reasonCode });
  pushAudit('Incident Queued', `${matchId} → ${incident.type} [${reasonCode}] ${incident.subType || ''}`, { admin });
  scheduleSrlOperatorAutoPlay(matchId);
  return { success: true, queued, snapshot: getIPLSRLControlSnapshot() };
}

export function undoIPLSRLLastInject(matchId, admin = 'admin', { count = 1 } = {}) {
  if (!isUserFacingSrlMatch(matchId)) throw new Error('Undo only available on OddsYra SRL matches');
  const n = Math.max(1, Math.min(20, Math.round(Number(count) || 1)));
  const removedList = [];
  const replayRemoved = [];
  for (let i = 0; i < n; i++) {
    const removed = popSrlScoreAnchor(matchId);
    if (!removed) break;
    const replay = popSrlReplayDelivery(matchId);
    if (removed.advancedClock) {
      seekIPLSRLMatch(matchId, { marker: 'ball_back', pause: true }, admin);
    }
    removedList.push(removed);
    if (replay) replayRemoved.push(replay);
    // trim matching history tip
    const s = getSrlOperatorSession(matchId);
    if (Array.isArray(s.injectHistory) && s.injectHistory.length) s.injectHistory.pop();
    persistSrlOperatorSession(matchId);
  }
  if (!removedList.length) throw new Error('No inject anchors to undo');
  setSrlCustomCommentary(matchId, {
    text: `Undo ×${removedList.length}: removed ${removedList.map((r) => r.incidentType || 'inject').join(', ')}`,
    eventTag: 'UNDO',
  });
  pushAudit('Inject Undone', `${matchId} → ×${removedList.length}`, { admin });
  return {
    success: true,
    undone: removedList.length,
    removed: removedList[0],
    removedList,
    replayRemoved,
    snapshot: getIPLSRLControlSnapshot(),
  };
}

export function clearIPLSRLScoreAnchors(matchId, admin = 'admin', role = 'SUPER_ADMIN', { note, skipNote = false } = {}) {
  assertSrlDangerousAction('clear_anchors', admin, role, { note, skipNote });
  if (!isUserFacingSrlMatch(matchId)) throw new Error('Clear anchors only available on OddsYra SRL matches');
  const result = clearSrlScoreAnchors(matchId);
  pushAudit('Anchors Cleared', `${matchId} → removed ${result.cleared}${note ? ` · ${note}` : ''}`, { admin });
  return {
    success: true,
    ...result,
    snapshot: getIPLSRLControlSnapshot(),
  };
}

export function pinpointIPLSRLTarget(matchId, targetRuns, admin) {
  if (!isUserFacingSrlMatch(matchId)) throw new Error('Only available on OddsYra SRL matches');
  const target = Math.max(1, Math.round(Number(targetRuns) || 150));
  setSrlRevisedOvers(matchId, { dlsTarget: target });
  upsertSrlScoreAnchor(matchId, {
    innings: 1,
    runs: target - 1,
    atOver: 20,
    ballIndex: 119,
  });
  pushAudit('Target Pinpointed', `${matchId} target set to ${target}`, { admin });
  return getIPLSRLControlSnapshot();
}

export function triggerIPLSRLTieGame(matchId, admin) {
  if (!isUserFacingSrlMatch(matchId)) throw new Error('Only available on OddsYra SRL matches');
  const match = getIplSrlMatchById(matchId);
  const runs1 = match?.score?.innings1?.runs || match?.liveDetails?.firstRuns || 170;
  upsertSrlScoreAnchor(matchId, {
    innings: 2,
    runs: runs1,
    atOver: 20,
    ballIndex: 119,
  });
  pushAudit('Tie Game Triggered', `${matchId} Innings 2 anchored to ${runs1} for Super Over`, { admin });
  return getIPLSRLControlSnapshot();
}

export function toggleIPLSRLRainDelay(matchId, isDelayed = true, admin) {
  if (!isUserFacingSrlMatch(matchId)) throw new Error('Only available on OddsYra SRL matches');
  setSrlRainDelay(matchId, isDelayed);
  pushAudit(isDelayed ? 'Rain Delay Started' : 'Rain Delay Cleared', String(matchId), { admin });
  return getIPLSRLControlSnapshot();
}

export function reduceIPLSRLOvers(matchId, revisedOvers, admin) {
  if (!isUserFacingSrlMatch(matchId)) throw new Error('Only available on OddsYra SRL matches');
  const overs = Math.max(5, Math.min(20, Number(revisedOvers) || 10));
  const match = getIplSrlMatchById(matchId);
  const runs1 = match?.score?.innings1?.runs || match?.liveDetails?.firstRuns || 170;
  const dlsTarget = Math.round((runs1 * (overs / 20)) + ((20 - overs) * 1.6));
  setSrlRevisedOvers(matchId, { overs, dlsTarget });
  pushAudit('Overs Reduced (DLS)', `${matchId} → ${overs} overs, revised DLS target: ${dlsTarget}`, { admin });
  return getIPLSRLControlSnapshot();
}

export function setIPLSRLMarginDefense(matchId, { marginBump = 0, spreadBias = 0, autoFreezeThreshold = 50000 } = {}, admin) {
  if (!isUserFacingSrlMatch(matchId)) throw new Error('Only available on OddsYra SRL matches');
  const defense = setSrlMarginDefense(matchId, { marginBump, spreadBias, autoFreezeThreshold });
  pushAudit('Margin Defense Set', `${matchId} → margin +${(marginBump * 100).toFixed(1)}%, bias: ${spreadBias}`, { admin });
  return { success: true, marginDefense: defense, snapshot: getIPLSRLControlSnapshot() };
}

export function broadcastIPLSRLCommentary(matchId, { text, eventTag } = {}, admin) {
  if (!isUserFacingSrlMatch(matchId)) throw new Error('Only available on OddsYra SRL matches');
  setSrlCustomCommentary(matchId, { text, eventTag });
  pushAudit('Commentary Broadcast', `[${eventTag || 'LIVE'}] ${text}`, { admin });
  return getIPLSRLControlSnapshot();
}

export async function bulkSettleIPLSRLMarkets(matchId, phase = 'toss', admin = 'admin', role = 'SUPER_ADMIN') {
  if (!isUserFacingSrlMatch(matchId)) throw new Error('Only available on OddsYra SRL matches');
  const match = getIplSrlMatchById(matchId);
  if (!match) throw new Error('Match not found');

  const settled = [];
  const paid = [];
  if (phase === 'toss') {
    const tossWinner = match.toss?.tossWinnerKey || match.toss?.winner || match.team1?.key;
    const tossDecision = String(match.toss?.decision || 'bat').toUpperCase() === 'BOWL' ? 'BOWL' : 'BAT';
    const batFirstKey = tossDecision === 'BAT'
      ? tossWinner
      : (tossWinner === match.team1?.key ? match.team2?.key : match.team1?.key);
    for (const [marketId, winningSelectionId] of [
      ['toss_winner', tossWinner],
      ['toss_and_bat', tossDecision === 'BAT' ? 'toss_and_bat_yes' : 'toss_and_bat_no'],
      ['toss_and_bowl', tossDecision === 'BOWL' ? 'toss_and_bowl_yes' : 'toss_and_bowl_no'],
      ['team_bat_first', batFirstKey],
    ]) {
      try {
        const res = await declareIPLSRLMarketOutcome(matchId, {
          marketId,
          winningSelectionId,
          admin,
          role,
          skipDangerCheck: true,
        });
        settled.push(marketId);
        paid.push({ marketId, settled: res.settled });
      } catch (err) {
        // Fall back to control-only if market has no open book.
        setSrlMarketControl(matchId, marketId, {
          status: 'DECLARED',
          winningSelectionId,
          settledAt: Date.now(),
        });
        settled.push(marketId);
        paid.push({ marketId, error: err.message });
      }
    }
  } else if (phase === 'innings1') {
    const i1Runs = match.liveDetails?.firstRuns ?? match.score?.innings1?.runs ?? 160;
    const winningSelectionId = i1Runs > 165 ? 'over' : 'under';
    try {
      const res = await declareIPLSRLMarketOutcome(matchId, {
        marketId: 'i1_total_runs',
        winningSelectionId,
        admin,
        role,
        skipDangerCheck: true,
      });
      settled.push('i1_total_runs');
      paid.push({ marketId: 'i1_total_runs', settled: res.settled });
    } catch (err) {
      setSrlMarketControl(matchId, 'i1_total_runs', {
        status: 'DECLARED',
        settledAt: Date.now(),
        winningSelectionId,
      });
      settled.push('i1_total_runs');
      paid.push({ marketId: 'i1_total_runs', error: err.message });
    }
  }
  pushAudit('Bulk Market Settlement', `${matchId} ${phase} settled ${settled.length} markets`, { admin });
  return {
    success: true,
    phase,
    settledCount: settled.length,
    markets: settled,
    paid,
    snapshot: getIPLSRLControlSnapshot(),
  };
}

export function createIPLSRLCustomMatch({ homeTeamId = 'csk', awayTeamId = 'mi', venue = 'Exhibition Arena', pitch = 'BALANCED', speed = 'NORMAL' } = {}, admin) {
  const teams = getAllIPLSRLTeams();
  const home = teams.find((t) => t.teamId === homeTeamId || t.shortName.toLowerCase() === String(homeTeamId).toLowerCase()) || teams[0];
  const away = teams.find((t) => t.teamId === awayTeamId || t.shortName.toLowerCase() === String(awayTeamId).toLowerCase()) || teams[1];
  const matchId = `srl_custom_${Date.now()}`;
  const now = Date.now();
  const homeKey = String(home.teamId || homeTeamId).replace(/_srl$/i, '').toLowerCase();
  const awayKey = String(away.teamId || awayTeamId).replace(/_srl$/i, '').toLowerCase();
  const homeXI = getSrlPlayingXINames(homeKey);
  const awayXI = getSrlPlayingXINames(awayKey);

  const customMatch = {
    id: matchId,
    source: 'srl',
    scoreSource: 'sim',
    league: 'OddsYra SRL Exhibition',
    seriesName: 'OddsYra SRL Exhibition Cup',
    matchType: 'T20',
    matchFormat: 'T20',
    oversPerInnings: 20,
    sport: 'cricket',
    team1: { key: homeKey, name: home.teamName || home.name, shortName: home.shortName, rating: home.strengthRating || 80 },
    team2: { key: awayKey, name: away.teamName || away.name, shortName: away.shortName, rating: away.strengthRating || 80 },
    odds: { team1: 1.90, team2: 1.90 },
    startTime: now - 10000,
    scheduleLabel: 'Live Exhibition',
    venue,
    pitch,
    speed,
    matchState: 'in',
    isLive: true,
    time: 'Live',
    stageLabel: 'Exhibition',
    squads: [
      getSrlTeamRoster(homeKey) || { name: home.shortName, players: homeXI.map((name) => ({ name })) },
      getSrlTeamRoster(awayKey) || { name: away.shortName, players: awayXI.map((name) => ({ name })) },
    ],
    liveDetails: {
      runs: 45,
      wickets: 1,
      overs: '5.2',
      firstRuns: 45,
      firstWickets: 1,
      firstOvers: '5.2',
      commentary: `Exhibition Clash: ${home.teamName || home.name} vs ${away.teamName || away.name} at ${venue}.`,
    },
    srlMarkets: { totalRuns: 165.5, overOdds: 1.85, underOdds: 1.85 },
  };

  registerCustomSrlMatch(customMatch);
  // Seed desk lineup so Playing XI shows without a manual save.
  if (homeXI.length || awayXI.length) {
    setSrlTossAndLineup(matchId, {
      homePlayingXI: homeXI,
      awayPlayingXI: awayXI,
    });
  }
  pushAudit('Custom Match Created', `${matchId}: ${home.shortName} vs ${away.shortName} (${venue})`, { admin });
  return { success: true, match: customMatch, snapshot: getIPLSRLControlSnapshot() };
}

export function updateTeamStrength(teamId, strengthRating, admin) {
  updateIPLSRLTeam(teamId, { strengthRating: Number(strengthRating) });
  pushAudit('Team Rating', `${teamLabel(teamId)} → ${strengthRating}`, { admin });
  return getIPLSRLControlSnapshot();
}

export async function adminCreateTeam(payload, admin) {
  const { createIPLSRLTeam } = await import('./iplSrlTeamEngine.mjs');
  const created = createIPLSRLTeam(payload);
  pushAudit('Team Created', created.teamName, { admin });
  return { snapshot: getIPLSRLControlSnapshot(), team: created };
}

export async function adminCreatePlayer(payload, admin) {
  const created = createIPLSRLPlayer(payload);
  pushAudit('Player Created', `${created.name} → ${created.teamId}`, { admin });
  return { snapshot: getIPLSRLControlSnapshot(), player: created };
}

export async function adminUpdatePlayer(playerId, updates, admin) {
  const updated = updateIPLSRLPlayer(playerId, updates);
  pushAudit('Player Updated', playerId, { admin });
  return { snapshot: getIPLSRLControlSnapshot(), player: updated };
}

export function sameSrlSelectionId(a, b) {
  const x = String(a || '').trim().toLowerCase();
  const y = String(b || '').trim().toLowerCase();
  if (!x || !y) return false;
  if (x === y) return true;
  const strip = (v) => v.replace(/^sel_/, '');
  return strip(x) === strip(y);
}

/** Parse i1_overs_0_10_total → { innings, targetOver } */
export function parseSrlOversTotalMarketId(marketId) {
  const m = String(marketId || '').match(/^(?:i(\d+)_)?overs_0_(\d+)_total$/i);
  if (!m) return null;
  return {
    innings: Number(m[1] || 1),
    targetOver: Number(m[2]),
  };
}

/** Over 88.5 needs 89; Under 88.5 needs 88 (strict > / < line). */
export function targetRunsForOuDeclare(side, line) {
  const n = Number(line);
  if (!Number.isFinite(n)) return null;
  if (side === 'over') return Math.floor(n) + 1;
  if (side === 'under') return Math.floor(n);
  return null;
}

function parseOuSideAndLine(selectionId, selectionName = '') {
  const side = isOverSelection(selectionId, selectionName)
    ? 'over'
    : (isUnderSelection(selectionId, selectionName) ? 'under' : null);
  const line = parseOuLine(selectionId) ?? parseOuLine(selectionName);
  return { side, line };
}

/**
 * Seek the match clock to the declared milestone and rebase the scoreboard
 * so e.g. Over 88.5 at 10 overs shows 89/x (10.0 ov) and continues from there.
 */
export function driveSrlMatchPlayForMarketDeclare(matchId, {
  marketId,
  winningSelectionId,
  admin = 'admin',
} = {}) {
  const oversMkt = parseSrlOversTotalMarketId(marketId);
  const ou = parseOuSideAndLine(winningSelectionId);
  let innings = oversMkt?.innings || null;
  let targetOver = oversMkt?.targetOver || null;
  let targetRuns = (ou.side && ou.line != null) ? targetRunsForOuDeclare(ou.side, ou.line) : null;

  // Full innings team total → anchor at 20 overs / innings end.
  if (!oversMkt && /(?:^|_)team_total/i.test(String(marketId || '')) && ou.side && ou.line != null) {
    const inn = String(marketId).match(/^i(\d+)_/i);
    innings = inn ? Number(inn[1]) : 1;
    targetOver = 20;
    targetRuns = targetRunsForOuDeclare(ou.side, ou.line);
  }

  if (!innings || !targetOver || targetRuns == null) {
    return null;
  }

  const now = Date.now();
  let match = getIplSrlMatchById(matchId, now);
  if (!match?.sim?.timing) throw new Error(`Match not found: ${matchId}`);

  const op = getSrlOperatorSession(matchId);
  if (!op.startedAt && !op.declaredWinnerKey) {
    const clockElapsed = Math.max(0, now - Number(match.startTime || 0));
    startSrlOperatorMatch(matchId, now, clockElapsed);
    match = getIplSrlMatchById(matchId, now);
  }

  const msPerBall = Number(match.sim.timing.msPerBall) || 15_000;
  const ballIndex = Math.max(0, Math.round(targetOver * 6) - 1);
  const timeline = innings === 1 ? match.sim.first?.timeline : match.sim.second?.timeline;
  const frame = timeline?.[Math.min(ballIndex, (timeline?.length || 1) - 1)];
  const naturalRunsAtAnchor = Number(frame?.runs || 0);
  const wicketsAtAnchor = Number(frame?.wickets || 0);

  let elapsedMs;
  if (innings === 1) {
    elapsedMs = (ballIndex + 0.5) * msPerBall;
  } else {
    const breakEnd = Number(match.sim.timing.breakEndMs) || 0;
    elapsedMs = breakEnd + (ballIndex + 0.5) * msPerBall;
  }
  const durationMs = Number(match.sim.timing.totalDurationMs || match.expectedDurationMs) || elapsedMs + 1;
  elapsedMs = Math.max(0, Math.min(durationMs - 1, elapsedMs));

  seekSrlOperatorElapsed(matchId, elapsedMs, now, { pause: true });

  const anchor = upsertSrlScoreAnchor(matchId, {
    innings,
    atOver: targetOver,
    ballIndex,
    runs: targetRuns,
    naturalRunsAtAnchor,
    wickets: wicketsAtAnchor,
    naturalWicketsAtAnchor: wicketsAtAnchor,
    marketId,
    winningSelectionId,
    side: ou.side,
    line: ou.line,
    source: 'declare',
    adminId: admin,
  });

  // Evidence for settlement graders that read over snapshots.
  void (async () => {
    try {
      const { ensureMatchOverSnapshotsTable } = await import('./matchOverSnapshotStore.mjs');
      await ensureMatchOverSnapshotsTable();
      const { query } = await import('../db/pg.js');
      await query(
        `INSERT INTO match_over_snapshots (
           match_id, innings, over_num, score_at_end, wickets_at_end, overs_raw, recorded_at
         ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (match_id, innings, over_num) DO UPDATE SET
           score_at_end = EXCLUDED.score_at_end,
           wickets_at_end = EXCLUDED.wickets_at_end,
           overs_raw = EXCLUDED.overs_raw,
           recorded_at = NOW()`,
        [matchId, innings, targetOver, targetRuns, wicketsAtAnchor, `${targetOver}.0`],
      );
    } catch {
      // Snapshot write is best-effort.
    }
  })();

  pushAudit(
    'Score Anchored',
    `${matchId} · i${innings} @ ${targetOver} ov → ${targetRuns} (${ou.side} ${ou.line})`,
    { admin },
  );

  return {
    innings,
    targetOver,
    targetRuns,
    side: ou.side,
    line: ou.line,
    elapsedMs,
    anchor,
    scoreDisplay: `${targetRuns}/${wicketsAtAnchor} (${targetOver}.0 ov)`,
  };
}

function emptySelBook() {
  return { stake: 0, payout: 0, bets: 0 };
}

async function loadOpenStakeRows(matchId) {
  try {
    const { query } = await import('../db/pg.js');
    const res = await query(
      `SELECT b.market_id,
              b.selection_id,
              COALESCE(MAX(bs.selection_name), b.selection_id) AS selection_name,
              SUM(b.stake)::float AS stake,
              SUM(COALESCE(b.potential_payout, b.stake * b.odds, 0))::float AS payout,
              COUNT(*)::int AS bets
       FROM bets b
       LEFT JOIN bet_selections bs ON bs.bet_id = b.bet_id
       WHERE b.match_id = $1
         AND UPPER(COALESCE(b.status, '')) IN ('ACCEPTED', 'PENDING', 'OPEN')
       GROUP BY b.market_id, b.selection_id`,
      [matchId],
    );
    return res.rows || [];
  } catch {
    return [];
  }
}

async function loadOpenBetIds(matchId, marketId) {
  const { query } = await import('../db/pg.js');
  const res = await query(
    `SELECT bet_id, market_id, selection_id, stake,
            COALESCE(potential_payout, stake * odds, 0)::float AS payout,
            status
     FROM bets
     WHERE match_id = $1::text
       AND market_id = $2::text
       AND UPPER(COALESCE(status, '')) IN ('ACCEPTED', 'PENDING', 'OPEN')
     ORDER BY created_at ASC NULLS LAST, bet_id ASC`,
    [String(matchId), String(marketId || '')],
  );
  return res.rows || [];
}

async function generateSrlPublicMarkets(matchId) {
  const match = getIplSrlMatchById(matchId);
  if (!match) throw new Error(`Match not found: ${matchId}`);
  // Same V4 book users see (includes toss family + full catalog) — not V3-only.
  const { generatePublicMatchOddsSnapshot } = await import('./odds-v4/engineDispatch.mjs');
  const { SRL_MARGIN_CONFIG } = await import('./odds-v3/pricing/MarginCalculator.mjs');
  const { resolveSrlV4Margins } = await import('./odds-v4/v4HouseProtect.mjs');
  const margins = resolveSrlV4Margins(SRL_MARGIN_CONFIG);
  const { publicSnapshot } = generatePublicMatchOddsSnapshot(match, {
    debug: false,
    margins,
  });
  const markets = [...(publicSnapshot?.markets || [])];

  // Operator desk must always expose toss-family markets for control/settlement,
  // even if live odds-engine hid them as settled/unpriceable from the public user board.
  const hasToss = markets.some((m) => m.marketId === 'toss_winner');
  if (!hasToss) {
    try {
      const { buildCanonicalFromMatch } = await import('./odds-v3/buildCanonicalFromMatch.mjs');
      const { generateTossFamilyMarketsV4 } = await import('./odds-v4/markets/TossWinnerMarketV4.mjs');
      const canonical = buildCanonicalFromMatch(match);
      const tossMarkets = generateTossFamilyMarketsV4(canonical, {}, margins);
      for (const tm of tossMarkets) {
        if (!markets.some((m) => m.marketId === tm.marketId)) {
          markets.push(tm);
        }
      }
    } catch (err) {
      log.warn('Failed generating toss markets for admin desk', { matchId, err });
    }
  }

  return { match, markets };
}

/** Operator desk ordering: card/toss first, then by open stake, then name. */
function srlDeskMarketRank(marketId) {
  const id = String(marketId || '').toLowerCase();
  if (id === 'toss_winner') return 0;
  if (id === 'toss_and_bat' || id === 'toss_and_bowl') return 1;
  if (id === 'team_bat_first') return 2;
  if (id === 'match_winner') return 3;
  if (id === 'match_total') return 4;
  if (id.startsWith('toss') || id.includes('toss')) return 5;
  return 50;
}

function applyControlToMarket(market, control) {
  if (!control) return market;
  const status = String(control.status || '').toUpperCase();
  const winning = control.winningSelectionId || null;
  let nextStatus = market.status;
  if (status === 'SUSPENDED') nextStatus = 'SUSPENDED';
  if (status === 'DECLARED') nextStatus = 'DETERMINED';
  if (status === 'VOIDED') nextStatus = 'VOID';
  const selections = (market.selections || market.options || []).map((s) => {
    const id = s.selectionId || s.selection;
    const isWinner = winning && sameSrlSelectionId(id, winning);
    const locked = nextStatus !== 'OPEN';
    return {
      ...s,
      won: status === 'DECLARED' ? isWinner : s.won,
      bettable: locked ? false : s.bettable,
      odds: locked ? (s.odds ?? null) : s.odds,
      status: locked ? (isWinner && status === 'DECLARED' ? 'WON' : nextStatus) : (s.status || 'ACTIVE'),
    };
  });
  return {
    ...market,
    status: nextStatus,
    control,
    selections,
    options: selections,
  };
}

/**
 * Desk payload: every live odd for a match + open stake book + operator controls.
 */
export async function getIPLSRLMatchMarkets(matchId) {
  if (!isUserFacingSrlMatch(matchId)) {
    throw new Error('Market desk is only available for OddsYra SRL matches');
  }
  const { match, markets: generated } = await generateSrlPublicMarkets(matchId);
  const controls = getSrlMarketControls(matchId);
  const stakeRows = await loadOpenStakeRows(matchId);

  const byMarket = new Map();
  for (const m of generated) {
    byMarket.set(m.marketId, {
      marketId: m.marketId,
      name: m.name || m.title || m.marketId,
      title: m.title || m.name || m.marketId,
      category: m.category || 'main',
      line: m.line ?? null,
      status: m.status || 'OPEN',
      selections: (m.selections || m.options || []).map((s) => ({
        selectionId: s.selectionId || s.selection,
        name: s.name || s.selectionId || s.selection,
        odds: s.odds,
        bettable: s.bettable !== false,
        book: emptySelBook(),
      })),
      book: emptySelBook(),
      control: controls[m.marketId] || null,
    });
  }

  for (const row of stakeRows) {
    const marketId = String(row.market_id || 'match_winner');
    if (!byMarket.has(marketId)) {
      byMarket.set(marketId, {
        marketId,
        name: marketId,
        title: marketId,
        category: 'open_bets',
        line: null,
        status: 'OPEN',
        selections: [],
        book: emptySelBook(),
        control: controls[marketId] || null,
      });
    }
    const market = byMarket.get(marketId);
    const selId = String(row.selection_id || '');
    let sel = market.selections.find((s) => sameSrlSelectionId(s.selectionId, selId));
    if (!sel) {
      sel = {
        selectionId: selId,
        name: row.selection_name || selId,
        odds: null,
        bettable: false,
        book: emptySelBook(),
      };
      market.selections.push(sel);
    }
    const stake = Number(row.stake) || 0;
    const payout = Number(row.payout) || 0;
    const bets = Number(row.bets) || 0;
    sel.book.stake += stake;
    sel.book.payout += payout;
    sel.book.bets += bets;
    market.book.stake += stake;
    market.book.payout += payout;
    market.book.bets += bets;
  }

  const markets = [...byMarket.values()]
    .map((m) => applyControlToMarket(m, controls[m.marketId]))
    .sort((a, b) => {
      const rankDiff = srlDeskMarketRank(a.marketId) - srlDeskMarketRank(b.marketId);
      if (rankDiff) return rankDiff;
      const openDiff = (b.book?.bets || 0) - (a.book?.bets || 0);
      if (openDiff) return openDiff;
      return String(a.name).localeCompare(String(b.name));
    });

  const tossMarkets = markets.filter((m) => /toss|bat_first/i.test(String(m.marketId)));

  return {
    matchId,
    homeShort: match.team1?.shortName,
    awayShort: match.team2?.shortName,
    homeTeamId: match.team1?.key,
    awayTeamId: match.team2?.key,
    controlStatus: controlStatusFromSrlMatch(match),
    engine: 'OddsEngineV4',
    markets,
    tossMarkets,
    marketCount: markets.length,
    openStake: markets.reduce((n, m) => n + (Number(m.book?.stake) || 0), 0),
    openBets: markets.reduce((n, m) => n + (Number(m.book?.bets) || 0), 0),
  };
}

export async function setIPLSRLMarketSuspended(matchId, marketId, suspended, admin) {
  if (!isUserFacingSrlMatch(matchId)) {
    throw new Error('Only OddsYra SRL matches support market control');
  }
  if (!marketId) throw new Error('marketId required');
  const { marketSuspensionEngine } = await import('./marketSuspensionEngine.mjs');
  if (suspended) {
    await marketSuspensionEngine.addSuspensionCause(marketId, 'MANUAL_ADMIN', 'ADMIN', admin || 'admin');
    setSrlMarketControl(matchId, marketId, {
      status: 'SUSPENDED',
      suspendedAt: Date.now(),
      adminId: admin || 'admin',
    });
    pushAudit('Market Suspended', `${matchId} · ${marketId}`, { admin });
  } else {
    await marketSuspensionEngine.clearSuspensionCause(marketId, 'MANUAL_ADMIN');
    const prev = getSrlMarketControls(matchId)[marketId];
    if (prev?.status === 'DECLARED' || prev?.status === 'VOIDED') {
      // Keep settled declaration; only lift suspension flag if somehow both set.
      setSrlMarketControl(matchId, marketId, { ...prev, status: prev.status });
    } else {
      setSrlMarketControl(matchId, marketId, {
        status: 'OPEN',
        winningSelectionId: null,
        adminId: admin || 'admin',
      });
    }
    pushAudit('Market Opened', `${matchId} · ${marketId}`, { admin });
  }
  return getIPLSRLMatchMarkets(matchId);
}

/**
 * Declare a winning selection (or void) for one market and settle all open bets on it.
 */
export async function declareIPLSRLMarketOutcome(matchId, {
  marketId,
  winningSelectionId = null,
  voidMarket = false,
  admin = 'admin',
  role = 'SUPER_ADMIN',
  note = null,
  skipDangerCheck = false,
  skipNote = false,
} = {}) {
  if (voidMarket && !skipDangerCheck) {
    assertSrlDangerousAction('void_market', admin, role, { note, skipNote });
  }
  if (!isUserFacingSrlMatch(matchId)) {
    throw new Error('Only OddsYra SRL matches support market declare');
  }
  if (!marketId) throw new Error('marketId required');
  if (!voidMarket && !winningSelectionId) {
    throw new Error('winningSelectionId required (or set voidMarket)');
  }

  const openBets = await loadOpenBetIds(matchId, marketId);
  const { adminDeclareBetOutcome } = await import('./adminBetRedeclare.mjs');
  const results = [];
  let won = 0;
  let lost = 0;
  let voided = 0;
  let failed = 0;

  for (const bet of openBets) {
    try {
      let outcome = 'VOID';
      if (!voidMarket) {
        outcome = sameSrlSelectionId(bet.selection_id, winningSelectionId) ? 'WON' : 'LOST';
      }
      const settled = await adminDeclareBetOutcome({
        betId: bet.bet_id,
        outcome,
        reason: voidMarket
          ? `SRL admin voided market ${marketId}`
          : `SRL admin declared ${marketId} → ${winningSelectionId}`,
        adminId: admin,
      });
      results.push({ betId: bet.bet_id, outcome, status: settled.status });
      if (outcome === 'WON') won += 1;
      else if (outcome === 'LOST') lost += 1;
      else voided += 1;
    } catch (err) {
      failed += 1;
      results.push({ betId: bet.bet_id, error: err.message || 'settle_failed' });
    }
  }

  const control = setSrlMarketControl(matchId, marketId, {
    status: voidMarket ? 'VOIDED' : 'DECLARED',
    winningSelectionId: voidMarket ? null : winningSelectionId,
    declaredAt: Date.now(),
    adminId: admin,
    settled: { won, lost, voided, failed, total: openBets.length },
  });

  let play = null;
  if (!voidMarket && winningSelectionId) {
    try {
      play = driveSrlMatchPlayForMarketDeclare(matchId, {
        marketId,
        winningSelectionId,
        admin,
      });
      if (play) {
        setSrlMarketControl(matchId, marketId, {
          ...control,
          play,
        });
      }
    } catch (err) {
      play = { error: err.message || 'play_drive_failed' };
    }
  }

  // Keep match-winner declare in sync with the classic winner control.
  if (!voidMarket && (marketId === 'match_winner' || marketId === 'winner')) {
    const match = getIplSrlMatchById(matchId);
    const winId = String(winningSelectionId || '').replace(/^sel_/i, '');
    const teamKey = [match?.team1?.key, match?.team2?.key].find((k) => sameSrlSelectionId(k, winId)
      || sameSrlSelectionId(k, winningSelectionId)
      || (winningSelectionId === '1' && k === match?.team1?.key)
      || (winningSelectionId === '2' && k === match?.team2?.key));
    if (teamKey && !getSrlOperatorSession(matchId).declaredWinnerKey) {
      try {
        declareSrlOperatorWinner(matchId, teamKey);
      } catch {
        // Market settle succeeded; match-level declare is best-effort.
      }
    }
  }

  try {
    const { marketSuspensionEngine } = await import('./marketSuspensionEngine.mjs');
    await marketSuspensionEngine.addSuspensionCause(marketId, 'MANUAL_ADMIN', 'ADMIN', admin);
  } catch {
    // Suspension overlay is best-effort after declare.
  }

  pushAudit(
    voidMarket ? 'Market Voided' : 'Market Declared',
    `${matchId} · ${marketId}${winningSelectionId ? ` → ${winningSelectionId}` : ''} · ${openBets.length} bets`,
    { admin },
  );

  const markets = await getIPLSRLMatchMarkets(matchId);
  return {
    success: failed === 0,
    control,
    play,
    settled: { won, lost, voided, failed, total: openBets.length },
    results,
    markets,
    snapshot: getIPLSRLControlSnapshot(),
  };
}

export function scriptIPLSRLOver(matchId, { preset, balls } = {}, admin = 'admin') {
  if (!matchId) throw new Error('matchId required');
  const result = queueSrlOverBlueprint(matchId, { preset, balls });
  const label = preset ? (OVER_BLUEPRINT_PRESETS[preset]?.name || preset) : `${balls?.length || 6} custom balls`;
  pushAudit('Over Scripted', `${matchId} → ${label}`, { admin });
  return {
    ...result,
    preset,
    snapshot: getIPLSRLControlSnapshot(),
  };
}

export function toggleIPLSRLProfitMaximizer(matchId, { enabled = true, targetMargin = 0.06, autoBias = true, marginBump = null } = {}, admin = 'admin') {
  if (!matchId) throw new Error('matchId required');
  const defense = setAutoProfitMaximizer(matchId, { enabled, targetMargin, autoBias });
  if (marginBump != null) {
    setSrlMarginDefense(matchId, { marginBump });
  }
  pushAudit('Profit Maximizer', `${matchId} → ${enabled ? 'ACTIVE' : 'OFF'} (${(targetMargin * 100).toFixed(0)}% target margin)`, { admin });
  return {
    success: true,
    defense,
    snapshot: getIPLSRLControlSnapshot(),
  };
}

const SRL_TOSS_MARKET_IDS = ['toss_winner', 'toss_and_bat', 'toss_and_bowl', 'team_bat_first'];

async function settleSrlTossFamilyMarkets(matchId, {
  winnerTeamId,
  decisionNorm,
  team1Key,
  team2Key,
  admin,
  role,
}) {
  const batFirstKey = decisionNorm === 'BAT'
    ? winnerTeamId
    : (winnerTeamId === team1Key ? team2Key : team1Key);
  const paid = [];
  const settleOne = async (marketId, winningSelectionId) => {
    try {
      const res = await declareIPLSRLMarketOutcome(matchId, {
        marketId,
        winningSelectionId,
        admin,
        role,
        skipDangerCheck: true,
      });
      paid.push({ marketId, settled: res.settled });
    } catch (err) {
      paid.push({ marketId, error: err.message });
    }
  };
  await settleOne('toss_winner', winnerTeamId);
  await settleOne('toss_and_bat', decisionNorm === 'BAT' ? 'toss_and_bat_yes' : 'toss_and_bat_no');
  await settleOne('toss_and_bowl', decisionNorm === 'BOWL' ? 'toss_and_bowl_yes' : 'toss_and_bowl_no');
  if (batFirstKey) await settleOne('team_bat_first', batFirstKey);
  return paid;
}

async function suspendSrlTossFamilyMarkets(matchId, admin) {
  for (const marketId of SRL_TOSS_MARKET_IDS) {
    try {
      await setIPLSRLMarketSuspended(matchId, marketId, true, admin);
    } catch {
      // Market may not exist yet — ignore.
    }
  }
}

/**
 * Publish locked toss to users: commentary + settle markets.
 * Safe to call once window opens (T-25) or immediately when already in window.
 */
export async function publishSrlTossToUsers(matchId, admin = 'SYSTEM', role = 'SUPER_ADMIN', now = Date.now()) {
  if (!matchId) throw new Error('matchId required');
  const m = getIplSrlMatchById(matchId, now);
  if (!m) throw new Error(`Match not found: ${matchId}`);
  const session = getSrlOperatorSession(matchId);
  const toss = session.toss;
  if (!toss?.locked || !toss.tossWinnerKey) {
    return { success: false, reason: 'toss_not_locked' };
  }
  if (toss.userPublished) {
    return { success: true, alreadyPublished: true, toss };
  }
  if (!isSrlTossVisibleToUsers(m, now)) {
    return {
      success: false,
      reason: 'too_early',
      publicRevealAt: srlTossPublicRevealAt(m.startTime),
      toss,
    };
  }

  const winnerTeamId = toss.tossWinnerKey;
  const winnerName = toss.winnerName
    || (winnerTeamId === m.team1?.key ? m.team1?.name : m.team2?.name)
    || winnerTeamId;
  const decisionNorm = String(toss.decision || 'BAT').toUpperCase() === 'BOWL' ? 'BOWL' : 'BAT';

  setSrlCustomCommentary(matchId, {
    text: `🪙 TOSS: ${winnerName} won the toss and elected to ${decisionNorm} first.`,
    eventTag: 'TOSS',
  });
  const settled = await settleSrlTossFamilyMarkets(matchId, {
    winnerTeamId,
    decisionNorm,
    team1Key: m.team1?.key,
    team2Key: m.team2?.key,
    admin,
    role,
  });
  setSrlTossAndLineup(matchId, {
    tossWinnerKey: winnerTeamId,
    tossDecision: decisionNorm,
    locked: true,
    winnerName,
    userPublished: true,
    publicRevealAt: srlTossPublicRevealAt(m.startTime),
  });
  pushSrlDeskAlert(matchId, {
    level: 'info',
    code: 'TOSS_PUBLISHED',
    message: `Toss live for users (T-25): ${winnerName} → ${decisionNorm}`,
  });
  return {
    success: true,
    published: true,
    settled,
    toss: getSrlOperatorSession(matchId).toss,
  };
}

export async function executeIPLSRLToss(matchId, {
  winnerTeamId,
  decision = 'BAT',
  lockAndDeclare = false,
} = {}, admin = 'admin', role = 'SUPER_ADMIN', now = Date.now()) {
  if (!matchId) throw new Error('matchId required');
  const m = getIplSrlMatchById(matchId, now);
  if (!m) throw new Error(`Match not found: ${matchId}`);
  const valid = [m.team1?.key, m.team2?.key].includes(winnerTeamId);
  if (!valid) throw new Error('Toss winner must be one of the competing teams');

  const winnerName = winnerTeamId === m.team1?.key ? m.team1?.name : m.team2?.name;
  const decisionNorm = String(decision || 'BAT').toUpperCase() === 'BOWL' ? 'BOWL' : 'BAT';
  const revealAt = srlTossPublicRevealAt(m.startTime);
  const visibleNow = isSrlTossVisibleToUsers(m, now);

  const result = setSrlTossAndLineup(matchId, {
    tossWinnerKey: winnerTeamId,
    tossDecision: decisionNorm,
    locked: lockAndDeclare ? true : undefined,
    winnerName,
    userPublished: lockAndDeclare ? visibleNow : undefined,
    publicRevealAt: lockAndDeclare ? revealAt : undefined,
  });

  let settled = null;
  let deferred = false;
  if (lockAndDeclare) {
    if (visibleNow) {
      setSrlCustomCommentary(matchId, {
        text: `🪙 TOSS: ${winnerName} won the toss and elected to ${decisionNorm} first.`,
        eventTag: 'TOSS',
      });
      settled = await settleSrlTossFamilyMarkets(matchId, {
        winnerTeamId,
        decisionNorm,
        team1Key: m.team1?.key,
        team2Key: m.team2?.key,
        admin,
        role,
      });
      pushSrlDeskAlert(matchId, {
        level: 'info',
        code: 'TOSS_LOCKED',
        message: `Toss locked & live for users: ${winnerName} → ${decisionNorm}`,
      });
    } else {
      deferred = true;
      // Hold markets closed so the known desk result cannot be bet / leaked via SETTLED.
      await suspendSrlTossFamilyMarkets(matchId, admin);
      pushSrlDeskAlert(matchId, {
        level: 'info',
        code: 'TOSS_LOCKED_DEFERRED',
        message: `Toss locked (desk). Users see it from ${revealAt ? formatSrlIstClock(revealAt) : 'T-25'} IST — markets suspended until then.`,
      });
    }
  }

  pushAudit(
    lockAndDeclare
      ? (deferred ? 'Toss Locked (Deferred Publish)' : 'Toss Locked & Declared')
      : 'Toss Decided',
    `${matchId} → ${winnerName} (${decisionNorm})${
      lockAndDeclare
        ? (deferred ? ' · users at T-25' : ' · users live')
        : ''
    }`,
    { admin },
  );
  return {
    success: true,
    ...result,
    lockAndDeclare: !!lockAndDeclare,
    deferred,
    publicRevealAt: revealAt,
    settled,
    snapshot: getIPLSRLControlSnapshot(),
  };
}

export function updateIPLSRLLineup(matchId, { teamId, playingXI = [], impactPlayer = null } = {}, admin = 'admin') {
  if (!matchId) throw new Error('matchId required');
  const m = getIplSrlMatchById(matchId);
  if (!m) throw new Error(`Match not found: ${matchId}`);
  const isHome = teamId === m.team1?.key;

  const result = setSrlTossAndLineup(matchId, {
    ...(isHome ? { homePlayingXI: playingXI, homeImpactPlayer: impactPlayer } : { awayPlayingXI: playingXI, awayImpactPlayer: impactPlayer }),
  });
  pushAudit('Lineup Updated', `${matchId} → ${teamId} (${playingXI.length} players)`, { admin });
  return {
    success: true,
    ...result,
    snapshot: getIPLSRLControlSnapshot(),
  };
}

export function getIPLSRLMatchReplay(matchId) {
  if (!matchId) throw new Error('matchId required');
  let deliveries = getSrlReplayLog(matchId);

  // If no recorded deliveries yet, synthesize a realistic delivery trace based on current score
  if (!deliveries.length) {
    const m = getIplSrlMatchById(matchId);
    const ld = m?.liveDetails || {};
    const totalOvers = Math.max(0, Math.min(20, Math.floor(Number(ld.firstOvers ?? ld.overs ?? 0))));
    const curRuns = Number(ld.firstRuns ?? ld.runs ?? 0);
    const bowlers = [m?.team2?.shortName ? `${m.team2.shortName} Pacer` : 'Bowler 1', 'Spinner 1', 'Pacer 2'];
    const batsmen = [m?.team1?.shortName ? `${m.team1.shortName} Opener` : 'Batter 1', 'Batter 2'];

    let runAcc = 0;
    for (let ov = 0; ov < Math.min(totalOvers, 10); ov++) {
      for (let b = 1; b <= 6; b++) {
        const outcomes = ['DOT', 'SINGLE', 'FOUR', 'SINGLE', 'DOT', 'DOUBLE', 'SIX'];
        const outcome = outcomes[(ov * 6 + b) % outcomes.length];
        const ballRuns = outcome === 'SIX' ? 6 : outcome === 'FOUR' ? 4 : outcome === 'DOUBLE' ? 2 : outcome === 'SINGLE' ? 1 : 0;
        runAcc += ballRuns;
        deliveries.push({
          ballId: `del_sim_${ov}_${b}`,
          overNumber: ov,
          ballInOver: b,
          innings: 1,
          bowler: bowlers[ov % bowlers.length],
          batsman: batsmen[(ov + b) % batsmen.length],
          outcome,
          runs: ballRuns,
          wicket: false,
          commentary: outcome === 'SIX' ? '🚀 Dispatched over mid-wicket for a massive SIX!' : outcome === 'FOUR' ? '⚡ Driven crisply through extra cover for FOUR.' : 'Good length delivery outside off, pushed towards cover.',
          score: { runs: runAcc, overs: `${ov}.${b}` },
          odds: { home: 1.85, away: 1.95 },
          timestamp: Date.now() - (totalOvers - ov) * 120000 - (6 - b) * 20000,
        });
      }
    }
  }

  return {
    matchId,
    totalDeliveries: deliveries.length,
    deliveries,
    fallOfWickets: deliveries
      .filter((d) => d.wicket)
      .map((d) => ({
        innings: d.innings,
        over: `${d.overNumber}.${d.ballInOver}`,
        batsman: d.batsman,
        bowler: d.bowler,
        wicketType: d.wicketType || 'out',
        score: d.score,
      })),
  };
}

export function exportIPLSRLMatchAudit(matchId) {
  if (!matchId) throw new Error('matchId required');
  const s = getSrlOperatorSession(matchId);
  const m = getIplSrlMatchById(matchId);
  const replay = getIPLSRLMatchReplay(matchId);
  const anchors = Array.isArray(s.scoreAnchors) ? s.scoreAnchors : [];
  const auditTrail = controlState.audit.filter((a) => String(a.detail || '').includes(matchId));

  const deliveries = (replay.deliveries || []).map((d, idx) => {
    const prev = replay.deliveries[idx - 1];
    return {
      ...d,
      wicketType: d.wicketType || null,
      boardBefore: prev?.score || null,
      boardAfter: d.score || null,
      admin: d.admin || null,
    };
  });

  const fallOfWickets = deliveries
    .filter((d) => d.wicket)
    .map((d) => ({
      innings: d.innings,
      over: `${d.overNumber}.${d.ballInOver}`,
      batsman: d.batsman,
      bowler: d.bowler,
      wicketType: d.wicketType || 'out',
      score: d.score,
      commentary: d.commentary,
    }));

  return {
    matchId,
    exportedAt: new Date().toISOString(),
    fixture: `${m?.team1?.name || '?'} vs ${m?.team2?.name || '?'}`,
    match: {
      id: m?.id,
      fixture: `${m?.team1?.name} vs ${m?.team2?.name}`,
      status: m?.matchState,
      score: m?.liveDetails,
      toss: s.toss || m?.toss || m?.liveDetails?.toss || null,
    },
    session: {
      ...s,
      scoreAnchorsCount: anchors.length,
    },
    anchors,
    fallOfWickets,
    auditTrail,
    deliveries,
  };
}

export function simulateSrlWhatIf(matchId) {
  if (!matchId) throw new Error('matchId required');
  const m = getIplSrlMatchById(matchId);
  if (!m) throw new Error(`Match not found: ${matchId}`);
  const ld = m?.liveDetails || {};

  const currentRuns = Number(ld.firstRuns ?? ld.runs ?? 0);
  const currentWickets = Number(ld.firstWickets ?? ld.wickets ?? 0);
  const oversDone = Number(ld.firstOvers ?? ld.overs ?? 0);
  const fullOvers = Math.floor(oversDone);
  const ballInOver = Math.round((oversDone % 1) * 10);
  const nextBallOver = ballInOver >= 5 ? `${fullOvers + 1}.0` : `${fullOvers}.${ballInOver + 1}`;

  const book = m.book || emptySrlMatchBook();
  const homeStake = Number(book.home?.stake || 0);
  const awayStake = Number(book.away?.stake || 0);
  const homePayout = Number(book.home?.payout || 0);
  const awayPayout = Number(book.away?.payout || 0);

  const homeOddsCurrent = Number(m?.homeOdds || m?.liveOdds?.home || 1.90);
  const awayOddsCurrent = Number(m?.awayOdds || m?.liveOdds?.away || 1.90);
  const invHome = 1 / Math.max(1.01, homeOddsCurrent);
  const invAway = 1 / Math.max(1.01, awayOddsCurrent);
  const baseHomeProb = (invHome + invAway) > 0 ? invHome / (invHome + invAway) : 0.50;

  const outcomes = [
    { type: 'DOT', label: '0 Dot Ball', runs: 0, wicket: false },
    { type: 'SINGLE', label: '1 Single', runs: 1, wicket: false },
    { type: 'DOUBLE', label: '2 Double', runs: 2, wicket: false },
    { type: 'FOUR', label: '4 Boundary Four', runs: 4, wicket: false },
    { type: 'SIX', label: '6 Maximum Six', runs: 6, wicket: false },
    { type: 'WICKET_BOWLED', label: 'Wicket (Bowled)', runs: 0, wicket: true, subType: 'Bowled' },
    { type: 'WICKET_CAUGHT', label: 'Wicket (Caught)', runs: 0, wicket: true, subType: 'Caught Behind' },
  ];

  const scenarios = outcomes.map((o) => {
    const projRuns = currentRuns + o.runs;
    const projWickets = Math.min(10, currentWickets + (o.wicket ? 1 : 0));

    let homeProbDelta = 0;
    if (o.type === 'SIX') homeProbDelta = 0.06;
    else if (o.type === 'FOUR') homeProbDelta = 0.035;
    else if (o.type === 'DOUBLE') homeProbDelta = 0.02;
    else if (o.type === 'SINGLE') homeProbDelta = 0.01;
    else if (o.type === 'DOT') homeProbDelta = -0.015;
    else if (o.wicket) homeProbDelta = -0.09;

    const projHomeProb = Math.max(0.08, Math.min(0.92, baseHomeProb + homeProbDelta));
    const projAwayProb = 1 - projHomeProb;
    const baseMarginHold = Number(m.marginDefense?.targetMargin || 0.06);
    const holdMultiplier = 1 - baseMarginHold;
    const projHomeOdds = Number(((1 / projHomeProb) * holdMultiplier).toFixed(2));
    const projAwayOdds = Number(((1 / projAwayProb) * holdMultiplier).toFixed(2));

    const totalStake = homeStake + awayStake;
    const housePnlHomeWin = totalStake - homePayout;
    const housePnlAwayWin = totalStake - awayPayout;
    const weightedHousePnl = Math.round(projHomeProb * housePnlHomeWin + projAwayProb * housePnlAwayWin);

    return {
      type: o.type,
      label: o.label,
      runs: o.runs,
      wicket: o.wicket,
      subType: o.subType || null,
      projectedScore: `${projRuns}/${projWickets}`,
      projectedOvers: nextBallOver,
      projectedOdds: {
        home: projHomeOdds,
        away: projAwayOdds,
        homeShort: m.team1?.shortName || 'HOME',
        awayShort: m.team2?.shortName || 'AWAY',
      },
      projectedHousePnl: weightedHousePnl,
      marginImpact: weightedHousePnl >= 0 ? `+₹${weightedHousePnl.toLocaleString('en-IN')}` : `-₹${Math.abs(weightedHousePnl).toLocaleString('en-IN')}`,
      recommended: false,
    };
  });

  let maxPnlIdx = 0;
  for (let i = 1; i < scenarios.length; i++) {
    if (scenarios[i].projectedHousePnl > scenarios[maxPnlIdx].projectedHousePnl) {
      maxPnlIdx = i;
    }
  }
  scenarios[maxPnlIdx].recommended = true;

  return {
    matchId,
    currentScore: `${currentRuns}/${currentWickets}`,
    currentOvers: String(oversDone),
    scenarios,
    bestHousePick: scenarios[maxPnlIdx],
  };
}

/**
 * Execute a What-If scenario: inject the ball AND nudge micro-market hold / cashout haircut.
 */
export function executeSrlWhatIf(matchId, { type, subType = null, nudgeMarkets = true } = {}, admin = 'admin') {
  if (!matchId) throw new Error('matchId required');
  const matrix = simulateSrlWhatIf(matchId);
  const pick = matrix.scenarios.find((s) => s.type === type) || matrix.bestHousePick;
  if (!pick) throw new Error('No What-If scenario available');

  const incidentType = String(pick.type || type || '').includes('WICKET')
    ? 'WICKET'
    : String(pick.type || type || 'DOT').toUpperCase();
  const result = injectIPLSRLIncident(matchId, {
    type: incidentType,
    subType: subType || pick.subType || null,
    instant: true,
  }, admin);

  let marketNudge = null;
  let cashoutNudge = null;
  if (nudgeMarkets) {
    const holdBump = pick.wicket ? 0.14 : (pick.runs >= 6 ? 0.12 : (pick.runs >= 4 ? 0.10 : 0.08));
    const haircut = pick.wicket ? 0.18 : (pick.runs >= 4 ? 0.14 : 0.10);
    try {
      const markets = getSrlMicroMarkets(matchId, getIplSrlMatchById(matchId));
      const primary = markets.find((m) => m.status === 'OPEN') || markets[0];
      if (primary?.id) {
        marketNudge = setSrlMicroMarketMargin(matchId, { marketId: primary.id, holdPercent: holdBump });
      }
    } catch {
      marketNudge = null;
    }
    try {
      cashoutNudge = setSrlCashoutConfig(matchId, { globalHaircut: haircut });
      setSrlMarginDefense(matchId, { marginBump: Math.min(0.12, holdBump - 0.04) });
    } catch {
      cashoutNudge = null;
    }
  }

  pushAudit(
    'What-If Executed',
    `${matchId} → ${pick.label} · hold/cashout nudged`,
    { admin, projectedHousePnl: pick.projectedHousePnl },
  );

  return {
    success: true,
    scenario: pick,
    marketNudge: marketNudge?.market || null,
    cashoutNudge: cashoutNudge?.cashoutControl || null,
    delivery: result?.delivery || null,
    snapshot: result?.snapshot || getIPLSRLControlSnapshot(),
  };
}

export async function getSrlLiveWagerTape(matchId, { limit = 20 } = {}) {
  if (!matchId) throw new Error('matchId required');

  const query = await getQuery();
  let bets = [];
  if (query) {
    try {
      const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
      const res = await query(
        `SELECT b.bet_id, b.user_id, COALESCE(u.email, CONCAT('usr_', SUBSTRING(b.user_id::text, 1, 8))) AS user_email,
                b.market_id, b.selection_id, b.odds, b.stake, b.potential_payout, b.status, b.created_at
         FROM bets b
         LEFT JOIN users u ON b.user_id = u.user_id
         WHERE b.match_id = $1
         ORDER BY b.created_at DESC
         LIMIT ${limitNum}`,
        [String(matchId)],
      );
      bets = (res.rows || []).map((r) => ({
        betId: r.bet_id,
        userId: r.user_id,
        userEmail: r.user_email || `usr_${String(r.user_id).slice(-4)}`,
        marketTitle: r.market_id,
        selection: r.selection_id,
        odds: Number(r.odds),
        stake: Number(r.stake),
        potentialPayout: Number(r.potential_payout),
        isWhale: Number(r.stake) >= 10000,
        userTier: Number(r.stake) >= 25000 ? 'WHALE' : (Number(r.stake) >= 10000 ? 'SHARP' : 'REGULAR'),
        placedAt: r.created_at,
        status: r.status,
      }));
    } catch {
      bets = [];
    }
  }

  return {
    matchId,
    totalWagers: bets.length,
    whaleCount: bets.filter((b) => b.isWhale).length,
    wagers: bets,
  };
}

export function setIPLSRLDirectorMode(matchId, mode, admin = 'admin') {
  if (!matchId) throw new Error('matchId required');
  const res = setSrlDirectorMode(matchId, mode);
  pushAudit('Director Mode Changed', `${matchId} → ${res.directorMode}`, { admin });
  return {
    ...res,
    snapshot: getIPLSRLControlSnapshot(),
  };
}

export function setIPLSRLPlayerBuff(matchId, { playerKey, role, buff } = {}, admin = 'admin') {
  if (!matchId) throw new Error('matchId required');
  const res = setSrlPlayerBuff(matchId, { playerKey, role, buff });
  pushAudit('Player Buff Updated', `${matchId} → ${playerKey || role}: ${buff || 'CLEARED'}`, { admin });
  return {
    ...res,
    snapshot: getIPLSRLControlSnapshot(),
  };
}

// ---------------------------------------------------------------------------
// 1. Environmental Physics Engine Controller
// ---------------------------------------------------------------------------

export function setIPLSRLEnvironment(matchId, env = {}, admin = 'admin') {
  if (!matchId) throw new Error('matchId required');
  const res = setSrlEnvironment(matchId, env);
  pushAudit('Atmosphere Physics Updated', `${matchId} → Dew: ${res.environment.dewFactor}%, Pitch: ${res.environment.pitchWear}`, { admin });
  return {
    ...res,
    snapshot: getIPLSRLControlSnapshot(),
  };
}

// ---------------------------------------------------------------------------
// 2. Dynamic Micro-Markets & Rapid Flash Desk Controller
// ---------------------------------------------------------------------------

export function getIPLSRLMicroMarkets(matchId) {
  if (!matchId) throw new Error('matchId required');
  const m = getIplSrlMatchById(matchId);
  const markets = getSrlMicroMarkets(matchId, m);
  return {
    matchId,
    totalMarkets: markets.length,
    markets,
  };
}

export function setIPLSRLMicroMarketStatus(matchId, { marketId, status } = {}, admin = 'admin') {
  if (!matchId || !marketId) throw new Error('matchId and marketId required');
  const res = setSrlMicroMarketStatus(matchId, { marketId, status });
  pushAudit('Micro-Market Status Changed', `${matchId} → ${marketId}: ${res.market.status}`, { admin });
  return {
    ...res,
    snapshot: getIPLSRLControlSnapshot(),
  };
}

export function setIPLSRLMicroMarketMargin(matchId, { marketId, holdPercent } = {}, admin = 'admin') {
  if (!matchId || !marketId) throw new Error('matchId and marketId required');
  const res = setSrlMicroMarketMargin(matchId, { marketId, holdPercent });
  pushAudit('Micro-Market Margin Updated', `${matchId} → ${marketId}: ${(res.market.holdPercent * 100).toFixed(0)}% juice`, { admin });
  return {
    ...res,
    snapshot: getIPLSRLControlSnapshot(),
  };
}

export function setIPLSRLMicroMarketsMassSuspend(matchId, suspend = true, admin = 'admin', role = 'SUPER_ADMIN') {
  if (!matchId) throw new Error('matchId required');
  if (suspend) assertSrlDangerousAction('mass_suspend', admin, role);
  const res = setSrlMicroMarketsMassSuspend(matchId, suspend);
  pushAudit('Micro-Markets Mass Action', `${matchId} → All markets ${suspend ? 'SUSPENDED' : 'OPENED'}`, { admin });
  return {
    ...res,
    snapshot: getIPLSRLControlSnapshot(),
  };
}

// ---------------------------------------------------------------------------
// 3. Live Cash-Out Haircut & Liability Buyback Desk
// ---------------------------------------------------------------------------

export async function getIPLSRLCashout(matchId) {
  if (!matchId) throw new Error('matchId required');
  const ctrl = getSrlCashoutControl(matchId);
  const m = getIplSrlMatchById(matchId);
  const wagers = await getSrlLiveWagerTape(matchId, { limit: 50 });

  const openPositions = (wagers.wagers || [])
    .filter((w) => !w.status || ['ACCEPTED', 'PENDING', 'OPEN'].includes(String(w.status).toUpperCase()))
    .map((w) => {
      // Calculate real fair cashout value based on market price movement
      const liveMarket = (m?.markets || []).find((mk) => mk.id === w.marketTitle || mk.name === w.marketTitle);
      const currentOddsRaw = liveMarket?.odds?.[w.selection] || (w.selection === m?.team1?.shortName ? m?.homeOdds : (w.selection === m?.team2?.shortName ? m?.awayOdds : w.odds));
      const currentOdds = Number(currentOddsRaw) > 0 ? Number(currentOddsRaw) : Number(w.odds);
      const ratio = currentOdds > 0 ? Number(w.odds) / currentOdds : 1.0;
      const rawValue = Math.max(1, Math.round(Number(w.stake) * Math.min(ratio, Number(w.odds))));
      const feeAmount = Math.round(rawValue * (Number(ctrl.globalHaircut) || 0.10));
      const offerValue = Math.max(0, rawValue - feeAmount);
      const hasSweetener = !!ctrl.sweetenerOffers?.[w.betId];
      const sweetenerBonus = hasSweetener ? Math.round(offerValue * (Number(ctrl.sweetenerOffers[w.betId].bonusPercent || 5) / 100)) : 0;

      return {
        betId: w.betId,
        userTier: w.userTier,
        stake: w.stake,
        selection: w.selection,
        odds: w.odds,
        fairValue: rawValue,
        haircutFee: feeAmount,
        cashoutOffer: offerValue + sweetenerBonus,
        hasSweetener,
        sweetenerBonus,
        isHalted: !!ctrl.cashoutHalted,
      };
    });

  return {
    matchId,
    cashoutControl: ctrl,
    eligibleCount: openPositions.length,
    positions: openPositions,
  };
}

export function setIPLSRLCashoutConfig(matchId, { globalHaircut, cashoutHalted } = {}, admin = 'admin') {
  if (!matchId) throw new Error('matchId required');
  const res = setSrlCashoutConfig(matchId, { globalHaircut, cashoutHalted });
  pushAudit('Cashout Config Updated', `${matchId} → Haircut: ${(res.cashoutControl.globalHaircut * 100).toFixed(0)}%, Halted: ${res.cashoutControl.cashoutHalted}`, { admin });
  return {
    ...res,
    snapshot: getIPLSRLControlSnapshot(),
  };
}

export function pushIPLSRLCashoutSweetener(matchId, { betId, bonusPercent = 5 } = {}, admin = 'admin') {
  if (!matchId || !betId) throw new Error('matchId and betId required');
  const res = pushSrlCashoutSweetener(matchId, { betId, bonusPercent });
  pushAudit('Cashout Sweetener Pushed', `${matchId} → Bet ${betId}: +${bonusPercent}% buyback bonus`, { admin });
  return {
    ...res,
    snapshot: getIPLSRLControlSnapshot(),
  };
}

// ---------------------------------------------------------------------------
// 4. Automated Circuit Breakers & Risk Kill-Switches
// ---------------------------------------------------------------------------

export function getIPLSRLCircuitBreaker(matchId) {
  if (!matchId) throw new Error('matchId required');
  return {
    matchId,
    circuitBreaker: getSrlCircuitBreaker(matchId),
  };
}

export function setIPLSRLCircuitBreakerConfig(matchId, config = {}, admin = 'admin') {
  if (!matchId) throw new Error('matchId required');
  const res = setSrlCircuitBreakerConfig(matchId, config);
  pushAudit('Circuit Breaker Config Updated', `${matchId} → Velocity Limit: ₹${res.circuitBreaker.velocityLimit}`, { admin });
  return {
    ...res,
    snapshot: getIPLSRLControlSnapshot(),
  };
}

export function toggleIPLSRLEmergencyKillSwitch(matchId, active, admin = 'admin', role = 'SUPER_ADMIN', { note, skipNote = false } = {}) {
  if (!matchId) throw new Error('matchId required');
  if (active) assertSrlDangerousAction('kill_switch', admin, role, { note, skipNote });
  const res = toggleSrlEmergencyKillSwitch(matchId, active);
  pushAudit(
    'RED PHONE KILL SWITCH',
    `${matchId} → Emergency Lock: ${res.emergencyKillSwitch ? 'ACTIVATED' : 'DISENGAGED'}${note ? ` · ${note}` : ''}`,
    { admin },
  );
  return {
    ...res,
    snapshot: getIPLSRLControlSnapshot(),
  };
}

// ---------------------------------------------------------------------------
// 5. 2D Tactical Pitch Map, Wagon Wheel & H2H Matchup Visualizer
// ---------------------------------------------------------------------------

export function getIPLSRLTacticalRadar(matchId) {
  if (!matchId) throw new Error('matchId required');
  const m = getIplSrlMatchById(matchId);
  const ld = m?.liveDetails || {};
  const replay = getSrlReplayLog(matchId);

  // Pitch heatmap breakdown (counts in 5 length zones)
  const pitchHeat = {
    YORKER: 0,
    FULL_LENGTH: 0,
    GOOD_LENGTH: 0,
    BACK_OF_LENGTH: 0,
    SHORT_PITCH: 0,
  };

  // Radial Wagon Wheel breakdown (8 zones)
  const wagonWheel = {
    THIRD_MAN: { runs: 0, boundaries: 0 },
    POINT: { runs: 0, boundaries: 0 },
    COVER: { runs: 0, boundaries: 0 },
    MID_OFF: { runs: 0, boundaries: 0 },
    LONG_ON: { runs: 0, boundaries: 0 },
    MID_WICKET: { runs: 0, boundaries: 0 },
    SQUARE_LEG: { runs: 0, boundaries: 0 },
    FINE_LEG: { runs: 0, boundaries: 0 },
  };

  for (const b of replay) {
    const pz = b.pitchZone || (b.wicket ? 'YORKER' : (b.runs >= 4 ? 'FULL_LENGTH' : 'GOOD_LENGTH'));
    if (pitchHeat[pz] !== undefined) pitchHeat[pz]++;
    else pitchHeat.GOOD_LENGTH++;

    const wz = b.wagonZone || (b.runs >= 4 ? 'COVER' : 'MID_OFF');
    if (wagonWheel[wz]) {
      wagonWheel[wz].runs += (Number(b.runs) || 0);
      if (b.runs >= 4) wagonWheel[wz].boundaries++;
    }
  }

  const striker = ld.batsman || m?.team1?.playingXI?.[0]?.name || 'Striker';
  const bowler = ld.bowler || m?.team2?.playingXI?.[0]?.name || 'Bowler';

  // Real Head-to-Head metrics calculated from replay deliveries
  const h2hDeliveries = replay.filter(
    (b) => String(b.batsman || '').toLowerCase() === String(striker || '').toLowerCase() &&
           String(b.bowler || '').toLowerCase() === String(bowler || '').toLowerCase()
  );
  const ballsFaced = h2hDeliveries.length;
  const runsScored = h2hDeliveries.reduce((sum, b) => sum + (Number(b.runs) || 0), 0);
  const dismissals = h2hDeliveries.filter((b) => b.wicket).length;
  const dotBalls = h2hDeliveries.filter((b) => !b.runs && !b.wicket).length;
  const boundaries = h2hDeliveries.filter((b) => b.runs >= 4).length;
  const strikeRate = ballsFaced > 0 ? Number(((runsScored / ballsFaced) * 100).toFixed(1)) : 0;
  const dotBallPercent = ballsFaced > 0 ? Number(((dotBalls / ballsFaced) * 100).toFixed(1)) : 0;

  let verdict = 'Even Matchup';
  if (ballsFaced === 0) {
    verdict = 'No deliveries recorded between active pair';
  } else if (dismissals >= 2) {
    verdict = `Bowler Advantage · ${dismissals} Dismissals in ${ballsFaced} balls`;
  } else if (strikeRate >= 160) {
    verdict = `Batter Dominant · ${strikeRate} SR`;
  } else if (dotBallPercent >= 50) {
    verdict = `Bowler Pressure · ${dotBallPercent}% Dot Balls`;
  }

  return {
    matchId,
    striker,
    bowler,
    totalBallsTracked: replay.length,
    pitchHeat,
    wagonWheel,
    h2hMatchup: {
      striker,
      bowler,
      ballsFaced,
      runsScored,
      dismissals,
      strikeRate,
      dotBallPercent,
      boundaryCount: boundaries,
      verdict,
    },
  };
}

export function getIPLSRLPublicPreview(matchId) {
  if (!matchId) throw new Error('matchId required');
  const m = getIplSrlMatchById(matchId);
  if (!m) throw new Error(`Match not found: ${matchId}`);
  const ld = m.liveDetails || {};
  const session = getSrlOperatorSession(matchId);
  return {
    matchId,
    fixture: `${m.team1?.shortName || '?'} vs ${m.team2?.shortName || '?'}`,
    home: { key: m.team1?.key, name: m.team1?.name, short: m.team1?.shortName },
    away: { key: m.team2?.key, name: m.team2?.name, short: m.team2?.shortName },
    status: m.matchState,
    time: m.time,
    isLive: !!m.isLive,
    commentary: ld.commentary || '',
    banner: session.userBanner || null,
    toss: m.toss || ld.toss || null,
    firstTeamName: ld.firstTeamName || null,
    chaseTeamName: ld.chaseTeamName || null,
    score: {
      first: `${ld.firstRuns ?? ld.runs ?? 0}/${ld.firstWickets ?? ld.wickets ?? 0} (${ld.firstOvers ?? ld.overs ?? '0.0'})`,
      chase: `${ld.chaseRuns ?? ld.score2 ?? 0}/${ld.chaseWickets ?? ld.wickets2 ?? 0} (${ld.chaseOvers ?? ld.overs2 ?? '0.0'})`,
      target: ld.target || null,
    },
    battingNow: ld.phase === 'chase' || ld.phase === 'chase-complete'
      ? (ld.chaseTeamName || m.team2?.name)
      : (ld.firstTeamName || m.team1?.name),
  };
}

export function getIPLSRLInjectHistory(matchId, { limit = 40 } = {}) {
  return {
    matchId,
    history: getSrlInjectHistory(matchId, { limit }),
  };
}

export function listIPLSRLScriptPresets() {
  return {
    builtIn: Object.values(OVER_BLUEPRINT_PRESETS || {}),
    custom: listSrlScriptPresets(),
  };
}

export function saveIPLSRLScriptPreset(body = {}, admin = 'admin') {
  const preset = saveSrlScriptPreset({ ...body, admin });
  pushAudit('Script Preset Saved', `${preset.name} (${preset.balls.length} balls)`, { admin });
  return { success: true, preset, presets: listIPLSRLScriptPresets() };
}

export function deleteIPLSRLScriptPreset(presetId, admin = 'admin') {
  const res = deleteSrlScriptPreset(presetId);
  pushAudit('Script Preset Deleted', String(presetId), { admin });
  return { success: true, ...res, presets: listIPLSRLScriptPresets() };
}

export function getIPLSRLDeskCapabilitiesForRole(role = 'SUPER_ADMIN') {
  return getSrlDeskCapabilities(role);
}

export function getIPLSRLScoreDrift(matchId) {
  if (!matchId) throw new Error('matchId required');
  const match = getIplSrlMatchById(matchId);
  if (!match) throw new Error(`Match not found: ${matchId}`);
  const session = getSrlOperatorSession(matchId);
  return {
    matchId,
    ...computeScoreDriftForMatch(match, session),
  };
}

export function rehearseIPLSRLQueue(matchId) {
  if (!isUserFacingSrlMatch(matchId)) throw new Error('Queue rehearsal only for OddsYra SRL matches');
  const match = getIplSrlMatchById(matchId);
  if (!match) throw new Error(`Match not found: ${matchId}`);
  const queue = getSrlIncidents(matchId);
  const start = boardTotalsFromLive(match.liveDetails || {});
  let runs = start.runs;
  let wickets = start.wickets;
  let overs = start.overs;
  const steps = [];

  const bumpOvers = (ov) => {
    const m = String(ov).trim().match(/^(\d+)(?:\.(\d+))?$/);
    if (!m) return ov;
    let completed = Number(m[1]);
    let balls = Number(m[2] || 0) + 1;
    if (balls >= 6) {
      completed += 1;
      balls = 0;
    }
    return `${completed}.${balls}`;
  };

  for (const inc of queue) {
    const type = String(inc.type || 'DOT').toUpperCase();
    const isExtra = type === 'WIDE' || type === 'NO_BALL';
    const add = ({ SIX: 6, FOUR: 4, DOUBLE: 2, SINGLE: 1, WIDE: 1, NO_BALL: 1, DOT: 0, WICKET: 0 })[type] ?? 0;
    const before = { runs, wickets, overs };
    runs += add;
    if (type === 'WICKET') wickets = Math.min(10, wickets + 1);
    if (!isExtra) overs = bumpOvers(overs);
    steps.push({
      id: inc.id,
      type,
      subType: inc.subType || null,
      before: { ...before },
      after: { runs, wickets, overs },
    });
  }

  return {
    matchId,
    queueLength: queue.length,
    current: start,
    steps,
    projected: { runs, wickets, overs, display: `${runs}/${wickets} (${overs})` },
    dryRun: true,
  };
}

export function engageIPLSRLIntegrityHold(matchId, { note, release = false } = {}, admin = 'admin', role = 'SUPER_ADMIN') {
  if (!isUserFacingSrlMatch(matchId)) throw new Error('Integrity hold only for OddsYra SRL matches');
  if (release) {
    assertSrlDangerousAction('integrity_hold', admin, role, { note: note || 'release', skipNote: !note });
    setSrlIntegrityHold(matchId, { active: false });
    pushAudit('Integrity Hold Released', String(matchId), { admin });
    return { success: true, integrityHold: null, snapshot: getIPLSRLControlSnapshot() };
  }
  const trimmed = String(note || '').trim();
  assertSrlDangerousAction('integrity_hold', admin, role, { note: trimmed });
  if (!trimmed) throw new Error('Integrity hold requires a mandatory note');
  pauseSrlOperatorMatch(matchId);
  clearSrlAutoTimer(matchId);
  setSrlOperatorBettingClosed(matchId, true);
  try {
    setSrlMicroMarketsMassSuspend(matchId, true);
  } catch {
    // micro-markets may be uninitialized
  }
  setSrlIntegrityHold(matchId, { active: true, note: trimmed, admin });
  setSrlCustomCommentary(matchId, {
    text: `INTEGRITY HOLD: ${trimmed}`,
    eventTag: 'INTEGRITY',
  });
  pushSrlDeskAlert(matchId, { level: 'danger', code: 'INTEGRITY', message: trimmed });
  pushAudit('Integrity Hold Engaged', `${matchId} · ${trimmed}`, { admin });
  return {
    success: true,
    integrityHold: getSrlOperatorSession(matchId).integrityHold,
    snapshot: getIPLSRLControlSnapshot(),
  };
}

export function getIPLSRLPostMatchReport(matchId) {
  if (!matchId) throw new Error('matchId required');
  const match = getIplSrlMatchById(matchId);
  if (!match) throw new Error(`Match not found: ${matchId}`);
  const session = getSrlOperatorSession(matchId);
  const desk = mapSrlDeskMatch(match);
  const history = getSrlInjectHistory(matchId, { limit: 100 });
  const byReason = {};
  for (const h of history) {
    const key = h.reasonCode || 'other';
    byReason[key] = (byReason[key] || 0) + 1;
  }
  const auditTrail = controlState.audit.filter((a) => String(a.detail || '').includes(matchId)).slice(0, 40);
  const settlementSteps = auditTrail
    .filter((a) => /settlement|declare|bulk|betting closed/i.test(`${a.action} ${a.detail}`))
    .map((a) => ({ action: a.action, detail: a.detail, time: a.time, admin: a.admin }));

  return {
    matchId,
    exportedAt: new Date().toISOString(),
    fixture: `${match.team1?.name || '?'} vs ${match.team2?.name || '?'}`,
    status: match.matchState,
    controlStatus: desk.controlStatus,
    result: match.liveDetails?.resultSummary || match.liveDetails?.commentary || null,
    score: boardTotalsFromLive(match.liveDetails || {}),
    book: desk.book,
    projectedPnlHome: desk.book?.projectedPnlHome ?? null,
    projectedPnlAway: desk.book?.projectedPnlAway ?? null,
    worstCaseLiability: desk.book?.worstCaseLiability ?? null,
    injectCount: history.length,
    injectsByReason: byReason,
    scoreAnchorsCount: (session.scoreAnchors || []).length,
    scoreDrift: desk.scoreDrift,
    settlementSteps,
    auditTrail,
    exportHint: `/api/admin/iplsrl/matches/${encodeURIComponent(matchId)}/export`,
  };
}

export function listIPLSRLMatchTemplates() {
  return { templates: listSrlMatchTemplates() };
}

export function saveIPLSRLMatchTemplate(body = {}, admin = 'admin') {
  const tmpl = saveSrlMatchTemplate({ ...body, admin });
  pushAudit('Match Template Saved', tmpl.name, { admin });
  return { success: true, template: tmpl, templates: listSrlMatchTemplates() };
}

export function deleteIPLSRLMatchTemplate(templateId, admin = 'admin') {
  const res = deleteSrlMatchTemplate(templateId);
  pushAudit('Match Template Deleted', String(templateId), { admin });
  return { success: true, ...res, templates: listSrlMatchTemplates() };
}

export function applyIPLSRLMatchTemplate(matchId, templateId, admin = 'admin') {
  if (!isUserFacingSrlMatch(matchId)) throw new Error('Templates only for OddsYra SRL matches');
  const tmpl = getSrlMatchTemplate(templateId);
  if (!tmpl) throw new Error('Template not found');
  const cfg = tmpl.config || {};
  if (cfg.directorMode) setSrlDirectorMode(matchId, cfg.directorMode);
  if (cfg.marginDefense) setSrlMarginDefense(matchId, cfg.marginDefense);
  if (cfg.cashoutControl) setSrlCashoutConfig(matchId, cfg.cashoutControl);
  if (cfg.environment) setSrlEnvironment(matchId, cfg.environment);
  if (cfg.circuitBreaker?.velocityLimit != null) {
    setSrlCircuitBreakerConfig(matchId, { velocityLimit: cfg.circuitBreaker.velocityLimit });
  }
  pushAudit('Match Template Applied', `${matchId} ← ${tmpl.name}`, { admin });
  return {
    success: true,
    template: tmpl,
    snapshot: getIPLSRLControlSnapshot(),
  };
}

export function captureIPLSRLMatchTemplateFromMatch(matchId, { name } = {}, admin = 'admin') {
  if (!matchId) throw new Error('matchId required');
  const s = getSrlOperatorSession(matchId);
  return saveIPLSRLMatchTemplate({
    name: name || `Desk ${matchId}`,
    config: {
      directorMode: s.directorMode || 'REALISTIC',
      marginDefense: s.marginDefense || {},
      cashoutControl: s.cashoutControl || {},
      environment: s.environment || null,
      circuitBreaker: s.circuitBreaker || null,
    },
  }, admin);
}

export async function runIPLSRLSettlementWizard(matchId, {
  declareTeamId = null,
  settleToss = true,
  settleMatchMarkets = true,
  closeBetting = true,
  exportAudit = true,
  note = null,
} = {}, admin = 'admin', role = 'SUPER_ADMIN') {
  assertSrlDangerousAction('settlement_wizard', admin, role, { note });
  if (!isUserFacingSrlMatch(matchId)) throw new Error('Settlement wizard only for OddsYra SRL matches');
  const steps = [];
  const wizardNote = String(note || '').trim() || 'Settlement wizard';

  if (closeBetting) {
    setSrlOperatorBettingClosed(matchId, true);
    steps.push({ id: 'betting_closed', ok: true });
  }
  if (settleToss) {
    const tossRes = await bulkSettleIPLSRLMarkets(matchId, 'toss', admin, role);
    steps.push({ id: 'toss_settled', ok: true, markets: tossRes.markets || tossRes.settled || [], paid: tossRes.paid });
  }
  if (declareTeamId) {
    const declared = await declareIPLSRLWinner(matchId, declareTeamId, admin, role, {
      note: wizardNote,
      skipNote: true,
      skipCooldown: true,
    });
    steps.push({
      id: 'winner_declared',
      ok: true,
      teamId: declareTeamId,
      winnerSettled: declared.winnerSettled || null,
    });
  }
  if (settleMatchMarkets) {
    try {
      const matchRes = await bulkSettleIPLSRLMarkets(matchId, 'innings1', admin, role);
      steps.push({ id: 'match_markets_settled', ok: true, markets: matchRes.markets || matchRes.settled || [], paid: matchRes.paid });
    } catch (err) {
      steps.push({ id: 'match_markets_settled', ok: false, error: err.message });
    }
  }
  let audit = null;
  if (exportAudit) {
    audit = exportIPLSRLMatchAudit(matchId);
    steps.push({ id: 'audit_exported', ok: true });
  }
  pushAudit('Settlement Wizard', `${matchId} → ${steps.map((s) => s.id).join(' → ')} · ${wizardNote}`, { admin });
  return {
    success: true,
    matchId,
    steps,
    audit,
    snapshot: getIPLSRLControlSnapshot(),
  };
}

const srlPagerDedup = new Map();

function shouldRaiseSrlPager(key, ttlMs = 5 * 60_000) {
  const last = srlPagerDedup.get(key) || 0;
  if (Date.now() - last < ttlMs) return false;
  srlPagerDedup.set(key, Date.now());
  return true;
}

/**
 * Server-side desk sweep: liability pause, velocity breaker, offline pagers,
 * deferred toss publish at T-25, and auto-pay match_winner when the board
 * has completed with a known winner.
 */
export async function runSrlDeskOpsSweep() {
  await hydrateSrlDeskOps();
  const coverage = getSrlDeskCoverage();
  const enriched = await enrichSnapshotWithStakes(getIPLSRLControlSnapshot());
  const matches = enriched?.matches || [];
  const actions = [];

  for (const m of matches) {
    if (!m?.matchId) continue;
    const startIn = Number(m.msToStart);
    if (
      coverage.deskOffline
      && Number.isFinite(startIn)
      && startIn > 0
      && startIn <= 15 * 60_000
      && shouldRaiseSrlPager(`start:${m.matchId}`)
    ) {
      void raiseSrlOpsPager({
        code: 'STARTING_SOON',
        matchId: m.matchId,
        message: `${m.homeShort} vs ${m.awayShort} starts in ${Math.max(1, Math.round(startIn / 60_000))}m — desk offline`,
        severity: 'HIGH',
      });
      actions.push({ matchId: m.matchId, action: 'pager_starting_soon' });
    }
    if (
      coverage.deskOffline
      && m.controlStatus === 'LIVE'
      && shouldRaiseSrlPager(`offline:${m.matchId}`, 10 * 60_000)
    ) {
      void raiseSrlOpsPager({
        code: 'DESK_OFFLINE',
        matchId: m.matchId,
        message: `${m.homeShort} vs ${m.awayShort} LIVE with no operator on desk`,
        severity: 'HIGH',
      });
      actions.push({ matchId: m.matchId, action: 'pager_desk_offline' });
    }
    if (
      !coverage.seniorOnline
      && coverage.onlineCount > 0
      && m.controlStatus === 'LIVE'
      && Number(m.book?.worstCaseLiability || 0) >= Number(m.marginDefense?.autoFreezeThreshold || 50000) * 0.6
      && shouldRaiseSrlPager(`noserior:${m.matchId}`, 10 * 60_000)
    ) {
      void raiseSrlOpsPager({
        code: 'NO_SENIOR',
        matchId: m.matchId,
        message: `Elevated liability on ${m.matchId} with no senior online`,
        severity: 'HIGH',
      });
      actions.push({ matchId: m.matchId, action: 'pager_no_senior' });
    }

    // Auto-publish desk-locked toss once the public T-25 window opens.
    if (m.toss?.locked && !m.toss?.userPublished) {
      try {
        const pub = await publishSrlTossToUsers(m.matchId, 'SYSTEM', 'SUPER_ADMIN');
        if (pub?.published) {
          actions.push({ matchId: m.matchId, action: 'toss_published' });
        }
      } catch (err) {
        actions.push({ matchId: m.matchId, action: 'toss_publish_failed', error: err.message });
      }
    }

    if (!m.needsSettlement) continue;
    const winnerKey = m.forcedWinnerTeamId || m.naturalWinnerId || m.score?.winnerId;
    if (!winnerKey) continue;
    try {
      await declareIPLSRLWinner(m.matchId, winnerKey, 'SYSTEM', 'SUPER_ADMIN', {
        note: 'Clock-complete auto-settle',
        skipNote: true,
        skipCooldown: true,
      });
      actions.push({ matchId: m.matchId, action: 'auto_settle_match_winner', winnerKey });
      pushSrlDeskAlert(m.matchId, {
        level: 'info',
        code: 'AUTO_SETTLE',
        message: `Auto-settled match_winner → ${winnerKey}`,
      });
    } catch (err) {
      actions.push({ matchId: m.matchId, action: 'auto_settle_failed', error: err.message });
    }
  }

  return {
    ok: true,
    coverage,
    matchCount: matches.length,
    actions,
    deskCoverage: coverage,
  };
}

export function heartbeatIPLSRLDeskPresence(payload = {}) {
  return heartbeatSrlDeskPresence(payload);
}

export function addIPLSRLShiftNote(payload = {}) {
  return addSrlShiftNote(payload);
}

export function listIPLSRLShiftNotes() {
  return listSrlShiftNotes();
}

export { PLAYER_ROLES, BALL_OUTCOMES, OVER_BLUEPRINT_PRESETS, DIRECTOR_MODES, PLAYER_BUFF_TYPES, PITCH_WEAR_TYPES, SRL_REASON_CODES, hydrateSrlDeskOps };


