/**
 * IPLSRL Admin Control Plane
 * Operator desk for SRL matches: winner selection gate, sim settings, live delivery control.
 */

import { getAllIPLSRLTeams, updateIPLSRLTeam } from './iplSrlTeamEngine.mjs';
import { getAllIPLSRLPlayers, createIPLSRLPlayer, updateIPLSRLPlayer, PLAYER_ROLES } from './iplSrlPlayerEngine.mjs';
import { getIPLSRLSeason, getIPLSRLStandings, getIPLSRLFixtures } from './iplSrlEngine.mjs';
import { initializeIPLSRLMatch, performIPLSRLToss, MATCH_STATES } from './iplSrlMatchEngine.mjs';
import { simulateIPLSRLDelivery, BALL_OUTCOMES } from './iplSrlSimulationEngine.mjs';
import { recordIPLSRLDelivery } from './iplSrlBallEngine.mjs';
import { getIplSrlDeskMatches, getIplSrlMatchById, isIplSrlMatch } from './iplSrlSimulator.mjs';
import {
  declareSrlOperatorWinner,
  getSrlOperatorElapsedMs,
  getSrlOperatorSession,
  pauseSrlOperatorMatch,
  resetSrlOperatorMatch,
  resumeSrlOperatorMatch,
  seekSrlOperatorElapsed,
  setSrlOperatorSpeed,
  setSrlOperatorWinner,
  startSrlOperatorMatch,
} from './iplSrlOperatorState.mjs';

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
  const ld = match.liveDetails || {};
  const op = match.operator || {};
  const controlStatus = controlStatusFromSrlMatch(match);
  const clock = clockForSrlMatch(match);
  const winnerKey = op.declaredWinnerKey || op.forcedWinnerKey;
  const winnerTeam = winnerKey === match.team1?.key
    ? match.team1
    : winnerKey === match.team2?.key
      ? match.team2
      : null;
  const naturalWinnerKey = match.sim?.winner || ld.winnerKey || null;
  const started = new Date(match.startTime);
  return {
    matchId: match.id,
    status: match.matchState,
    controlStatus,
    homeTeamId: match.team1?.key,
    homeTeam: match.team1?.name,
    homeShort: match.team1?.shortName,
    awayTeamId: match.team2?.key,
    awayTeam: match.team2?.name,
    awayShort: match.team2?.shortName,
    venue: match.league || 'OddsYra SRL',
    startTime: match.startTime,
    date: Number.isFinite(started.getTime()) ? started.toISOString().slice(0, 10) : '',
    timeDisplay: match.scheduleLabel || match.time,
    forcedWinnerTeamId: winnerKey,
    forcedWinnerName: winnerTeam ? `${winnerTeam.shortName} · ${winnerTeam.name}` : null,
    naturalWinnerId: naturalWinnerKey,
    commentary: ld.commentary || '',
    canStart: controlStatus === 'READY' || controlStatus === 'ARMED',
    canResume: controlStatus === 'PAUSED',
    canPause: controlStatus === 'LIVE',
    canDeclare: controlStatus !== 'COMPLETED',
    canSeek: controlStatus !== 'COMPLETED',
    canReset: true,
    clockDriven: !(op.started || op.startedAt || op.paused || op.pausedAt),
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
      target: ld.firstRuns != null ? ld.firstRuns + 1 : null,
      winnerId: op.declaredWinnerKey || (match.matchState === 'post' ? winnerKey : null),
      result: ld.resultSummary || (match.matchState === 'post' ? ld.commentary : null),
    },
    speed: speedLabelFromFactor(clock.operatorSpeed),
    pitch: controlState.pitch,
    weather: controlState.weather,
    autoPlay: true,
    lastDelivery: null,
    toss: null,
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

export function getIPLSRLControlSnapshot() {
  ensureDeskMatches();
  const season = getIPLSRLSeason();
  const matches = getIplSrlDeskMatches().map(mapSrlDeskMatch);

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
    standings: getIPLSRLStandings().slice(0, 8),
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

  pushAudit('Settings Updated', `speed=${controlState.speed} pitch=${controlState.pitch} weather=${controlState.weather}`, { admin });
  return getIPLSRLControlSnapshot();
}

export function setIPLSRLForcedWinner(matchId, teamId, admin) {
  if (isUserFacingSrlMatch(matchId)) {
    const match = getIplSrlDeskMatches().find((m) => m.id === matchId);
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

export function declareIPLSRLWinner(matchId, teamId, admin) {
  if (!isUserFacingSrlMatch(matchId)) {
    throw new Error('Declare winner is only available on user-facing IPL SRL matches');
  }
  const match = getIplSrlDeskMatches().find((m) => m.id === matchId);
  if (!match) throw new Error(`Match not found: ${matchId}`);
  const valid = [match.team1?.key, match.team2?.key].includes(teamId);
  if (!valid) throw new Error('Winner must be one of the two competing teams');
  declareSrlOperatorWinner(matchId, teamId);
  const name = teamId === match.team1.key ? match.team1.name : match.team2.name;
  pushAudit('Winner Declared', `${matchId} → ${name}`, { admin });
  return getIPLSRLControlSnapshot();
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
    } else {
      const op = getSrlOperatorSession(matchId);
      if (op.pausedAt && op.startedAt && !op.declaredWinnerKey) {
        resumeSrlOperatorMatch(matchId);
      }
      setSrlOperatorSpeed(matchId, SPEED_FACTOR[speed] || 1);
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

export function triggerDelivery(matchId, { admin } = {}) {
  if (isUserFacingSrlMatch(matchId)) {
    const snapshot = seekIPLSRLMatch(matchId, { marker: 'ball' }, admin);
    return { snapshot, delivery: { outcome: 'BALL', runs: 0, isWicket: false, at: nowIso() } };
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

  next = Math.max(0, Math.min(clock.durationMs - 1, next));
  seekSrlOperatorElapsed(matchId, next, now, { pause: !!pause });
  pushAudit('Match Seek', `${matchId} → ${Math.round(next / 60000)}m (${marker || 'manual'})`, { admin });
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

export { PLAYER_ROLES, BALL_OUTCOMES };
