/**
 * Desk control for user-facing OddsYra SRL matches (`srl_ipl_*`).
 * Sessions persist to PostgreSQL when available; in-memory fallback for dev/tests.
 */

const sessions = new Map();
let seasonOffsetMs = 0;
let pgQuery = null;
let hydratePromise = null;

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

function rowToSession(row) {
  if (!row) return null;
  let marketControls = {};
  try {
    const raw = row.market_controls;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) marketControls = raw;
    else if (typeof raw === 'string' && raw.trim()) marketControls = JSON.parse(raw);
  } catch {
    marketControls = {};
  }
  let scoreAnchors = [];
  try {
    const raw = row.score_anchors;
    if (Array.isArray(raw)) scoreAnchors = raw;
    else if (typeof raw === 'string' && raw.trim()) scoreAnchors = JSON.parse(raw);
  } catch {
    scoreAnchors = [];
  }
  const meta = marketControls._meta || {};
  return {
    matchId: row.match_id,
    startedAt: row.started_at ? new Date(row.started_at).getTime() : null,
    pausedAt: row.paused_at ? new Date(row.paused_at).getTime() : null,
    pausedElapsedMs: Number(row.paused_elapsed_ms) || 0,
    speed: Number(row.speed) || 1,
    forcedWinnerKey: row.forced_winner_key || null,
    declaredAt: row.declared_at ? new Date(row.declared_at).getTime() : null,
    declaredWinnerKey: row.declared_winner_key || null,
    declaredElapsedMs: row.declared_elapsed_ms != null ? Number(row.declared_elapsed_ms) : null,
    bettingClosed: !!row.betting_closed,
    marketControls,
    scoreAnchors: Array.isArray(scoreAnchors) ? scoreAnchors : [],
    // Extended session properties
    incidentQueue: Array.isArray(meta.incidentQueue) ? meta.incidentQueue : [],
    rainDelay: !!meta.rainDelay,
    revisedOvers: meta.revisedOvers || null,
    dlsTarget: meta.dlsTarget || null,
    customCommentary: meta.customCommentary || null,
    marginDefense: meta.marginDefense || { marginBump: 0, spreadBias: 0, autoFreezeThreshold: 50000, autoProfitMaximizer: false, targetMargin: 0.06 },
    targetScore: meta.targetScore || null,
    toss: meta.toss || null,
    lineup: meta.lineup || null,
    replayLog: Array.isArray(meta.replayLog) ? meta.replayLog : [],
  };
}

function emptySession(matchId) {
  return {
    matchId,
    startedAt: null,
    pausedAt: null,
    pausedElapsedMs: 0,
    speed: 1,
    forcedWinnerKey: null,
    declaredAt: null,
    declaredWinnerKey: null,
    declaredElapsedMs: null,
    bettingClosed: false,
    marketControls: {},
    scoreAnchors: [],
    // Extended session properties
    incidentQueue: [],
    rainDelay: false,
    revisedOvers: null,
    dlsTarget: null,
    customCommentary: null,
    marginDefense: { marginBump: 0, spreadBias: 0, autoFreezeThreshold: 50000, autoProfitMaximizer: false, targetMargin: 0.06 },
    targetScore: null,
    toss: null,
    lineup: null,
    replayLog: [],
  };
}

function queuePersist(session) {
  void (async () => {
    const query = await getQuery();
    if (!query || !session?.matchId) return;
    try {
      if (!session.marketControls || typeof session.marketControls !== 'object') {
        session.marketControls = {};
      }
      session.marketControls._meta = {
        incidentQueue: session.incidentQueue || [],
        rainDelay: !!session.rainDelay,
        revisedOvers: session.revisedOvers || null,
        dlsTarget: session.dlsTarget || null,
        customCommentary: session.customCommentary || null,
        marginDefense: session.marginDefense || { marginBump: 0, spreadBias: 0, autoFreezeThreshold: 50000, autoProfitMaximizer: false, targetMargin: 0.06 },
        targetScore: session.targetScore || null,
        toss: session.toss || null,
        lineup: session.lineup || null,
        replayLog: (session.replayLog || []).slice(-250),
      };

      await query(
        `INSERT INTO srl_operator_sessions (
          match_id, started_at, paused_at, paused_elapsed_ms, speed,
          forced_winner_key, declared_at, declared_winner_key, declared_elapsed_ms,
          betting_closed, market_controls, score_anchors, updated_at
        ) VALUES (
          $1,
          CASE WHEN $2 IS NULL THEN NULL ELSE to_timestamp($2 / 1000.0) END,
          CASE WHEN $3 IS NULL THEN NULL ELSE to_timestamp($3 / 1000.0) END,
          $4, $5, $6,
          CASE WHEN $7 IS NULL THEN NULL ELSE to_timestamp($7 / 1000.0) END,
          $8, $9, $10, $11::jsonb, $12::jsonb, NOW()
        )
        ON CONFLICT (match_id) DO UPDATE SET
          started_at = EXCLUDED.started_at,
          paused_at = EXCLUDED.paused_at,
          paused_elapsed_ms = EXCLUDED.paused_elapsed_ms,
          speed = EXCLUDED.speed,
          forced_winner_key = EXCLUDED.forced_winner_key,
          declared_at = EXCLUDED.declared_at,
          declared_winner_key = EXCLUDED.declared_winner_key,
          declared_elapsed_ms = EXCLUDED.declared_elapsed_ms,
          betting_closed = EXCLUDED.betting_closed,
          market_controls = EXCLUDED.market_controls,
          score_anchors = EXCLUDED.score_anchors,
          updated_at = NOW()`,
        [
          session.matchId,
          session.startedAt,
          session.pausedAt,
          session.pausedElapsedMs,
          session.speed,
          session.forcedWinnerKey,
          session.declaredAt,
          session.declaredWinnerKey,
          session.declaredElapsedMs,
          !!session.bettingClosed,
          JSON.stringify(session.marketControls),
          JSON.stringify(Array.isArray(session.scoreAnchors) ? session.scoreAnchors : []),
        ],
      );
    } catch {
      // Persistence must not break operator control in dev/test.
    }
  })();
}

export function hydrateSrlOperatorSessions() {
  if (!hydratePromise) {
    hydratePromise = (async () => {
      const query = await getQuery();
      if (!query) return;
      try {
        const res = await query(`SELECT * FROM srl_operator_sessions`);
        for (const row of res.rows) {
          const session = rowToSession(row);
          if (session) sessions.set(session.matchId, session);
        }
      } catch {
        // Table may not exist yet in local dev.
      }
      try {
        const settings = await query(
          `SELECT value_num FROM srl_operator_settings WHERE key = 'season_offset_ms' LIMIT 1`,
        );
        const raw = settings.rows?.[0]?.value_num;
        if (raw != null && Number.isFinite(Number(raw))) {
          seasonOffsetMs = Math.trunc(Number(raw));
        }
      } catch {
        // Settings table may not exist yet.
      }
    })();
  }
  return hydratePromise;
}

export function getSrlOperatorSession(matchId) {
  if (!matchId) return emptySession('');
  if (!sessions.has(matchId)) sessions.set(matchId, emptySession(matchId));
  return sessions.get(matchId);
}

export function listSrlOperatorSessions() {
  return [...sessions.values()].map((s) => ({ ...s }));
}

export function getSrlOperatorElapsedMs(session, now = Date.now()) {
  if (!session?.startedAt) return 0;
  if (session.declaredElapsedMs != null) return session.declaredElapsedMs;
  if (session.pausedAt) return session.pausedElapsedMs;
  const speed = Number(session.speed) > 0 ? Number(session.speed) : 1;
  return session.pausedElapsedMs + (now - session.startedAt) * speed;
}

export function startSrlOperatorMatch(matchId, now = Date.now(), clockElapsedMs = 0) {
  const s = getSrlOperatorSession(matchId);
  if (s.declaredWinnerKey) {
    throw new Error('Match already completed');
  }
  if (s.startedAt && !s.pausedAt) {
    return { ...s };
  }
  if (s.startedAt && s.pausedAt) {
    s.startedAt = now;
    s.pausedAt = null;
    queuePersist(s);
    return { ...s };
  }
  s.startedAt = now;
  s.pausedAt = null;
  s.pausedElapsedMs = Math.max(0, Number(clockElapsedMs) || 0);
  queuePersist(s);
  return { ...s };
}

export function pauseSrlOperatorMatch(matchId, now = Date.now(), clockElapsedMs = 0) {
  const s = getSrlOperatorSession(matchId);
  if (s.pausedAt || s.declaredWinnerKey) return { ...s };
  if (!s.startedAt) {
    s.startedAt = now;
    s.pausedElapsedMs = Math.max(0, Number(clockElapsedMs) || 0);
    s.pausedAt = now;
    queuePersist(s);
    return { ...s };
  }
  s.pausedElapsedMs = getSrlOperatorElapsedMs(s, now);
  s.pausedAt = now;
  queuePersist(s);
  return { ...s };
}

export function resumeSrlOperatorMatch(matchId, now = Date.now()) {
  const s = getSrlOperatorSession(matchId);
  if (!s.startedAt || !s.pausedAt || s.declaredWinnerKey) return { ...s };
  s.startedAt = now;
  s.pausedAt = null;
  queuePersist(s);
  return { ...s };
}

export function setSrlOperatorSpeed(matchId, speed) {
  const s = getSrlOperatorSession(matchId);
  s.speed = Math.max(0.25, Math.min(8, Number(speed) || 1));
  queuePersist(s);
  return { ...s };
}

export function setSrlOperatorWinner(matchId, winnerKey) {
  const s = getSrlOperatorSession(matchId);
  if (s.declaredWinnerKey) {
    throw new Error('Match already completed');
  }
  s.forcedWinnerKey = winnerKey || null;
  queuePersist(s);
  return { ...s };
}

export function declareSrlOperatorWinner(matchId, winnerKey, now = Date.now()) {
  const s = getSrlOperatorSession(matchId);
  const key = winnerKey || s.forcedWinnerKey;
  if (!key) {
    throw new Error('Winner must be set before declare');
  }
  if (!s.startedAt) {
    startSrlOperatorMatch(matchId, now);
  }
  const live = getSrlOperatorSession(matchId);
  live.forcedWinnerKey = key;
  live.declaredWinnerKey = key;
  live.declaredAt = now;
  live.declaredElapsedMs = getSrlOperatorElapsedMs(live, now);
  live.pausedAt = now;
  live.bettingClosed = true;
  queuePersist(live);
  return { ...live };
}

export function seekSrlOperatorElapsed(matchId, elapsedMs, now = Date.now(), { pause = false } = {}) {
  const s = getSrlOperatorSession(matchId);
  if (s.declaredWinnerKey) {
    throw new Error('Match already completed');
  }
  const clamped = Math.max(0, Number(elapsedMs) || 0);
  const keepPaused = pause || !!s.pausedAt;
  s.pausedElapsedMs = clamped;
  s.startedAt = now;
  s.pausedAt = keepPaused ? now : null;
  queuePersist(s);
  return { ...s };
}

export function resetSrlOperatorMatch(matchId) {
  sessions.delete(matchId);
  void (async () => {
    const query = await getQuery();
    if (!query || !matchId) return;
    try {
      await query(`DELETE FROM srl_operator_sessions WHERE match_id = $1`, [matchId]);
    } catch {
      // Persistence must not break operator control in dev/test.
    }
  })();
  return emptySession(matchId);
}

export function resetAllSrlOperatorSessions() {
  sessions.clear();
  seasonOffsetMs = 0;
}

export function getSrlSeasonOffsetMs() {
  return seasonOffsetMs;
}

export function getSrlSimNow(now = Date.now()) {
  const wall = Number(now);
  return (Number.isFinite(wall) ? wall : Date.now()) + seasonOffsetMs;
}

function persistSeasonOffset() {
  void (async () => {
    const query = await getQuery();
    if (!query) return;
    try {
      await query(
        `INSERT INTO srl_operator_settings (key, value_num, updated_at)
         VALUES ('season_offset_ms', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value_num = EXCLUDED.value_num, updated_at = NOW()`,
        [seasonOffsetMs],
      );
    } catch {
      // Persistence must not break operator control in dev/test.
    }
  })();
}

export function setSrlSeasonOffsetMs(ms) {
  const next = Math.trunc(Number(ms) || 0);
  if (!Number.isFinite(next)) {
    seasonOffsetMs = 0;
  } else {
    const cap = 400 * 24 * 60 * 60 * 1000;
    seasonOffsetMs = Math.max(-cap, Math.min(cap, next));
  }
  persistSeasonOffset();
  return seasonOffsetMs;
}

export function setSrlOperatorBettingClosed(matchId, closed) {
  const s = getSrlOperatorSession(matchId);
  s.bettingClosed = !!closed;
  queuePersist(s);
  return { ...s };
}

export function isSrlBettingClosed(matchId) {
  if (!matchId || !String(matchId).startsWith('srl_ipl_')) return false;
  return !!getSrlOperatorSession(matchId).bettingClosed;
}

export function clearSrlOperatorWinner(matchId) {
  const s = getSrlOperatorSession(matchId);
  if (s.declaredWinnerKey) {
    throw new Error('Match already completed');
  }
  s.forcedWinnerKey = null;
  queuePersist(s);
  return { ...s };
}

export function getSrlMarketControls(matchId) {
  const s = getSrlOperatorSession(matchId);
  return { ...(s.marketControls || {}) };
}

/**
 * Upsert operator control for one market.
 * @param {'OPEN'|'SUSPENDED'|'DECLARED'|'VOIDED'} status
 */
export function setSrlMarketControl(matchId, marketId, patch = {}) {
  if (!matchId || !marketId) throw new Error('matchId and marketId required');
  const s = getSrlOperatorSession(matchId);
  if (!s.marketControls || typeof s.marketControls !== 'object') s.marketControls = {};
  const prev = s.marketControls[marketId] || {};
  const next = {
    ...prev,
    ...patch,
    marketId,
    updatedAt: Date.now(),
  };
  if (next.status) next.status = String(next.status).toUpperCase();
  s.marketControls[marketId] = next;
  queuePersist(s);
  return { ...next };
}

export function clearSrlMarketControl(matchId, marketId) {
  const s = getSrlOperatorSession(matchId);
  if (!s.marketControls?.[marketId]) return null;
  delete s.marketControls[marketId];
  queuePersist(s);
  return true;
}

export function getSrlScoreAnchors(matchId) {
  const s = getSrlOperatorSession(matchId);
  return Array.isArray(s.scoreAnchors) ? [...s.scoreAnchors] : [];
}

/**
 * Upsert a scoreboard anchor so live/sim state rebases from a declared total.
 * Replaces any prior anchor for the same innings+atOver (or same marketId).
 */
export function upsertSrlScoreAnchor(matchId, anchor) {
  if (!matchId || !anchor) throw new Error('matchId and anchor required');
  const s = getSrlOperatorSession(matchId);
  const list = Array.isArray(s.scoreAnchors) ? [...s.scoreAnchors] : [];
  const innings = Number(anchor.innings) || 1;
  const atOver = Number(anchor.atOver);
  const marketId = anchor.marketId || null;
  const next = {
    ...anchor,
    innings,
    atOver: Number.isFinite(atOver) ? atOver : null,
    ballIndex: Number.isFinite(Number(anchor.ballIndex)) ? Number(anchor.ballIndex) : null,
    runs: Math.max(0, Math.round(Number(anchor.runs) || 0)),
    naturalRunsAtAnchor: Number.isFinite(Number(anchor.naturalRunsAtAnchor))
      ? Number(anchor.naturalRunsAtAnchor)
      : null,
    updatedAt: Date.now(),
  };
  const filtered = list.filter((a) => {
    if (marketId && a.marketId === marketId) return false;
    if (next.atOver != null && Number(a.innings) === innings && Number(a.atOver) === next.atOver) return false;
    return true;
  });
  filtered.push(next);
  s.scoreAnchors = filtered;
  queuePersist(s);
  return next;
}

// ---------------------------------------------------------------------------
// Extended Incident Queue & Simulation Intervention (God Mode)
// ---------------------------------------------------------------------------

export function queueSrlIncident(matchId, incident) {
  if (!matchId || !incident) throw new Error('matchId and incident required');
  const s = getSrlOperatorSession(matchId);
  if (!Array.isArray(s.incidentQueue)) s.incidentQueue = [];
  const next = {
    id: `inc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type: String(incident.type || 'DOT').toUpperCase(), // WICKET, SIX, FOUR, SINGLE, DOT, WIDE, NO_BALL
    subType: incident.subType || null, // bowled, caught, lbw, run_out
    customCommentary: incident.customCommentary || null,
    runs: Number.isFinite(Number(incident.runs)) ? Number(incident.runs) : null,
    timestamp: Date.now(),
  };
  s.incidentQueue.push(next);
  queuePersist(s);
  return next;
}

export function popSrlIncident(matchId) {
  const s = getSrlOperatorSession(matchId);
  if (!Array.isArray(s.incidentQueue) || s.incidentQueue.length === 0) return null;
  const item = s.incidentQueue.shift();
  queuePersist(s);
  return item;
}

export function getSrlIncidents(matchId) {
  const s = getSrlOperatorSession(matchId);
  return Array.isArray(s.incidentQueue) ? [...s.incidentQueue] : [];
}

export function clearSrlIncidents(matchId) {
  const s = getSrlOperatorSession(matchId);
  s.incidentQueue = [];
  queuePersist(s);
  return true;
}

// ---------------------------------------------------------------------------
// Rain Delay & DLS Overs Reduction
// ---------------------------------------------------------------------------

export function setSrlRainDelay(matchId, isDelayed = true) {
  const s = getSrlOperatorSession(matchId);
  s.rainDelay = !!isDelayed;
  if (isDelayed) {
    s.pausedAt = s.pausedAt || Date.now();
    s.bettingClosed = true;
  }
  queuePersist(s);
  return { rainDelay: s.rainDelay, bettingClosed: s.bettingClosed };
}

export function setSrlRevisedOvers(matchId, { overs, dlsTarget } = {}) {
  const s = getSrlOperatorSession(matchId);
  s.revisedOvers = Number(overs) || null;
  s.dlsTarget = Number(dlsTarget) || null;
  queuePersist(s);
  return { revisedOvers: s.revisedOvers, dlsTarget: s.dlsTarget };
}

// ---------------------------------------------------------------------------
// Custom Commentary & Event Tags
// ---------------------------------------------------------------------------

export function setSrlCustomCommentary(matchId, { text, eventTag } = {}) {
  const s = getSrlOperatorSession(matchId);
  s.customCommentary = text ? { text, eventTag: eventTag || 'GENERAL', at: Date.now() } : null;
  queuePersist(s);
  return s.customCommentary;
}

// ---------------------------------------------------------------------------
// Dynamic Margin Defense & Liability Radar
// ---------------------------------------------------------------------------

export function setSrlMarginDefense(matchId, { marginBump, spreadBias, autoFreezeThreshold } = {}) {
  const s = getSrlOperatorSession(matchId);
  const prev = s.marginDefense || { marginBump: 0, spreadBias: 0, autoFreezeThreshold: 50000, autoProfitMaximizer: false, targetMargin: 0.06 };
  s.marginDefense = {
    ...prev,
    marginBump: marginBump != null ? Math.max(0, Math.min(0.20, Number(marginBump) || 0)) : (prev.marginBump || 0),
    spreadBias: spreadBias != null ? Math.max(-0.20, Math.min(0.20, Number(spreadBias) || 0)) : (prev.spreadBias || 0),
    autoFreezeThreshold: autoFreezeThreshold != null ? Math.max(1000, Number(autoFreezeThreshold) || 50000) : (prev.autoFreezeThreshold || 50000),
    updatedAt: Date.now(),
  };
  queuePersist(s);
  return { ...s.marginDefense };
}

// ---------------------------------------------------------------------------
// Custom Exhibition Matches Store
// ---------------------------------------------------------------------------

const customMatches = new Map();

export function registerCustomSrlMatch(matchData) {
  if (!matchData?.id) throw new Error('Match id required');
  customMatches.set(matchData.id, { ...matchData, registeredAt: Date.now() });
  return customMatches.get(matchData.id);
}

export function listCustomSrlMatches() {
  return [...customMatches.values()];
}

export function getCustomSrlMatch(matchId) {
  return customMatches.get(matchId) || null;
}

// ---------------------------------------------------------------------------
// Over Blueprint & Narrative Scripting Engine
// ---------------------------------------------------------------------------

export const OVER_BLUEPRINT_PRESETS = {
  DEFEND_DEATH_OVER: {
    id: 'DEFEND_DEATH_OVER',
    name: 'Defend Death Over (6 runs, 1 Wicket)',
    balls: [
      { type: 'DOT', runs: 0 },
      { type: 'SINGLE', runs: 1 },
      { type: 'WICKET', runs: 0, subType: 'bowled' },
      { type: 'DOT', runs: 0 },
      { type: 'SINGLE', runs: 1 },
      { type: 'DOT', runs: 0 },
    ],
  },
  CHASE_CLIMAX: {
    id: 'CHASE_CLIMAX',
    name: 'Chase Climax Thriller (17 runs, Boundary Finish)',
    balls: [
      { type: 'FOUR', runs: 4 },
      { type: 'DOT', runs: 0 },
      { type: 'SIX', runs: 6 },
      { type: 'DOUBLE', runs: 2 },
      { type: 'SINGLE', runs: 1 },
      { type: 'FOUR', runs: 4 },
    ],
  },
  HAT_TRICK_COLLAPSE: {
    id: 'HAT_TRICK_COLLAPSE',
    name: 'Hat-trick Collapse (3 Wickets in an Over)',
    balls: [
      { type: 'WICKET', runs: 0, subType: 'bowled' },
      { type: 'WICKET', runs: 0, subType: 'caught' },
      { type: 'WICKET', runs: 0, subType: 'lbw' },
      { type: 'DOT', runs: 0 },
      { type: 'SINGLE', runs: 1 },
      { type: 'DOT', runs: 0 },
    ],
  },
  POWERPLAY_BLITZ: {
    id: 'POWERPLAY_BLITZ',
    name: 'Powerplay Blitz (22 runs)',
    balls: [
      { type: 'FOUR', runs: 4 },
      { type: 'SIX', runs: 6 },
      { type: 'FOUR', runs: 4 },
      { type: 'DOUBLE', runs: 2 },
      { type: 'SIX', runs: 6 },
      { type: 'DOT', runs: 0 },
    ],
  },
  MAIDEN_OVER: {
    id: 'MAIDEN_OVER',
    name: 'Maiden Over (6 Dot Balls)',
    balls: [
      { type: 'DOT', runs: 0 },
      { type: 'DOT', runs: 0 },
      { type: 'DOT', runs: 0 },
      { type: 'DOT', runs: 0 },
      { type: 'DOT', runs: 0 },
      { type: 'DOT', runs: 0 },
    ],
  },
  TIE_SUPER_OVER: {
    id: 'TIE_SUPER_OVER',
    name: 'Super Over Thriller (10 runs / Tie outcome)',
    balls: [
      { type: 'SINGLE', runs: 1 },
      { type: 'FOUR', runs: 4 },
      { type: 'DOT', runs: 0 },
      { type: 'DOUBLE', runs: 2 },
      { type: 'SINGLE', runs: 1 },
      { type: 'DOUBLE', runs: 2 },
    ],
  },
};

export function queueSrlOverBlueprint(matchId, { preset, balls } = {}) {
  if (!matchId) throw new Error('matchId required');
  const s = getSrlOperatorSession(matchId);
  if (!Array.isArray(s.incidentQueue)) s.incidentQueue = [];

  let list = [];
  if (preset && OVER_BLUEPRINT_PRESETS[preset]) {
    list = OVER_BLUEPRINT_PRESETS[preset].balls;
  } else if (Array.isArray(balls) && balls.length > 0) {
    list = balls;
  } else {
    throw new Error('Valid blueprint preset or balls array required');
  }

  const queued = [];
  for (const b of list) {
    const next = {
      id: `inc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: String(b.type || (typeof b === 'string' ? b : 'DOT')).toUpperCase(),
      subType: b.subType || null,
      customCommentary: b.customCommentary || null,
      runs: Number.isFinite(Number(b.runs)) ? Number(b.runs) : null,
      timestamp: Date.now(),
    };
    s.incidentQueue.push(next);
    queued.push(next);
  }

  queuePersist(s);
  return { success: true, queuedCount: queued.length, incidentQueue: s.incidentQueue };
}

// ---------------------------------------------------------------------------
// Smart Margin Defense & Profit Maximizer
// ---------------------------------------------------------------------------

export function setAutoProfitMaximizer(matchId, { enabled = true, targetMargin = 0.06, autoBias = true } = {}) {
  const s = getSrlOperatorSession(matchId);
  if (!s.marginDefense) {
    s.marginDefense = { marginBump: 0, spreadBias: 0, autoFreezeThreshold: 50000 };
  }
  s.marginDefense.autoProfitMaximizer = !!enabled;
  s.marginDefense.targetMargin = Math.max(0.02, Math.min(0.20, Number(targetMargin) || 0.06));
  s.marginDefense.autoBias = !!autoBias;
  s.marginDefense.updatedAt = Date.now();
  queuePersist(s);
  return { ...s.marginDefense };
}

// ---------------------------------------------------------------------------
// Pre-Match Toss & Starting Lineup Desk
// ---------------------------------------------------------------------------

export function setSrlTossAndLineup(matchId, { tossWinnerKey, tossDecision, homePlayingXI, awayPlayingXI, homeImpactPlayer, awayImpactPlayer } = {}) {
  const s = getSrlOperatorSession(matchId);
  s.toss = {
    winner: tossWinnerKey || null,
    decision: String(tossDecision || 'BAT').toUpperCase(), // BAT or BOWL
    timestamp: Date.now(),
  };

  if (homePlayingXI || awayPlayingXI || homeImpactPlayer || awayImpactPlayer) {
    s.lineup = {
      homePlayingXI: Array.isArray(homePlayingXI) ? homePlayingXI : (s.lineup?.homePlayingXI || []),
      awayPlayingXI: Array.isArray(awayPlayingXI) ? awayPlayingXI : (s.lineup?.awayPlayingXI || []),
      homeImpactPlayer: homeImpactPlayer || s.lineup?.homeImpactPlayer || null,
      awayImpactPlayer: awayImpactPlayer || s.lineup?.awayImpactPlayer || null,
      updatedAt: Date.now(),
    };
  }

  queuePersist(s);
  return { toss: s.toss, lineup: s.lineup };
}

// ---------------------------------------------------------------------------
// Match Delivery History & Audit Replay Log
// ---------------------------------------------------------------------------

export function recordSrlReplayDelivery(matchId, delivery) {
  if (!matchId || !delivery) return null;
  const s = getSrlOperatorSession(matchId);
  if (!Array.isArray(s.replayLog)) s.replayLog = [];

  const entry = {
    ballId: delivery.ballId || `ball_${s.replayLog.length + 1}`,
    overNumber: delivery.overNumber ?? 0,
    ballInOver: delivery.ballInOver ?? 0,
    innings: delivery.innings ?? 1,
    bowler: delivery.bowler || 'Bowler',
    batsman: delivery.batsman || 'Striker',
    outcome: delivery.outcome || 'DOT',
    runs: Number(delivery.runs) || 0,
    wicket: !!delivery.wicket,
    wicketType: delivery.wicketType || null,
    extraType: delivery.extraType || null,
    commentary: delivery.commentary || null,
    score: delivery.score ? { ...delivery.score } : null,
    odds: delivery.odds ? { ...delivery.odds } : null,
    timestamp: delivery.timestamp || Date.now(),
  };

  s.replayLog.push(entry);
  if (s.replayLog.length > 250) {
    s.replayLog = s.replayLog.slice(-250);
  }
  queuePersist(s);
  return entry;
}

export function getSrlReplayLog(matchId) {
  const s = getSrlOperatorSession(matchId);
  return Array.isArray(s.replayLog) ? [...s.replayLog] : [];
}

export function clearSrlReplayLog(matchId) {
  const s = getSrlOperatorSession(matchId);
  s.replayLog = [];
  queuePersist(s);
  return true;
}

