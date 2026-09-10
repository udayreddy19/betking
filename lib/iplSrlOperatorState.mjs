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
    directorMode: meta.directorMode || 'REALISTIC',
    playerBuffs: meta.playerBuffs || {},
    microMarkets: Array.isArray(meta.microMarkets) ? meta.microMarkets : null,
    environment: meta.environment || { dewFactor: 0, pitchWear: 'FRESH_BELTER', swingIndex: 15, overcast: false },
    cashoutControl: meta.cashoutControl || { globalHaircut: 0.10, cashoutHalted: false, sweetenerOffers: {} },
    circuitBreaker: meta.circuitBreaker || { velocityLimit: 100000, isTripped: false, trippedAt: null, stageCaps: { powerplay: 50000, middle: 35000, death: 15000 }, emergencyKillSwitch: false },
    injectHistory: Array.isArray(meta.injectHistory) ? meta.injectHistory : [],
    deskAlerts: Array.isArray(meta.deskAlerts) ? meta.deskAlerts : [],
    lastAutoPauseAt: meta.lastAutoPauseAt || null,
    integrityHold: meta.integrityHold || null,
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
    directorMode: 'REALISTIC',
    playerBuffs: {},
    microMarkets: null,
    environment: { dewFactor: 0, pitchWear: 'FRESH_BELTER', swingIndex: 15, overcast: false },
    cashoutControl: { globalHaircut: 0.10, cashoutHalted: false, sweetenerOffers: {} },
    circuitBreaker: { velocityLimit: 100000, isTripped: false, trippedAt: null, stageCaps: { powerplay: 50000, middle: 35000, death: 15000 }, emergencyKillSwitch: false },
    injectHistory: [],
    deskAlerts: [],
    lastAutoPauseAt: null,
    integrityHold: null,
  };
}

export function queuePersist(session) {
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
        directorMode: session.directorMode || 'REALISTIC',
        playerBuffs: session.playerBuffs || {},
        microMarkets: session.microMarkets || null,
        environment: session.environment || { dewFactor: 0, pitchWear: 'FRESH_BELTER', swingIndex: 15, overcast: false },
        cashoutControl: session.cashoutControl || { globalHaircut: 0.10, cashoutHalted: false, sweetenerOffers: {} },
        circuitBreaker: session.circuitBreaker || { velocityLimit: 100000, isTripped: false, trippedAt: null, stageCaps: { powerplay: 50000, middle: 35000, death: 15000 }, emergencyKillSwitch: false },
        injectHistory: (session.injectHistory || []).slice(-100),
        deskAlerts: (session.deskAlerts || []).slice(-40),
        lastAutoPauseAt: session.lastAutoPauseAt || null,
        integrityHold: session.integrityHold || null,
      };

      await query(
        `INSERT INTO srl_operator_sessions (
          match_id, started_at, paused_at, paused_elapsed_ms, speed,
          forced_winner_key, declared_at, declared_winner_key, declared_elapsed_ms,
          betting_closed, market_controls, score_anchors, updated_at
        ) VALUES (
          $1,
          CASE WHEN $2::float8 IS NULL THEN NULL ELSE to_timestamp($2::float8 / 1000.0) END,
          CASE WHEN $3::float8 IS NULL THEN NULL ELSE to_timestamp($3::float8 / 1000.0) END,
          COALESCE($4::bigint, 0),
          COALESCE($5::numeric, 1),
          $6,
          CASE WHEN $7::float8 IS NULL THEN NULL ELSE to_timestamp($7::float8 / 1000.0) END,
          $8,
          $9::bigint,
          COALESCE($10::boolean, false),
          COALESCE($11::jsonb, '{}'::jsonb),
          COALESCE($12::jsonb, '[]'::jsonb),
          NOW()
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
          session.startedAt == null ? null : Number(session.startedAt),
          session.pausedAt == null ? null : Number(session.pausedAt),
          session.pausedElapsedMs == null ? 0 : Math.round(Number(session.pausedElapsedMs)) || 0,
          Number(session.speed) || 1,
          session.forcedWinnerKey || null,
          session.declaredAt == null ? null : Number(session.declaredAt),
          session.declaredWinnerKey || null,
          session.declaredElapsedMs == null ? null : Math.round(Number(session.declaredElapsedMs)),
          !!session.bettingClosed,
          JSON.stringify(session.marketControls || {}),
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
  if (session.declaredElapsedMs != null) return Math.round(Number(session.declaredElapsedMs) || 0);
  if (session.pausedAt) return Math.round(Number(session.pausedElapsedMs) || 0);
  const speed = Number(session.speed) > 0 ? Number(session.speed) : 1;
  return Math.round(Math.max(0, (Number(session.pausedElapsedMs) || 0) + (now - session.startedAt) * speed));
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
  s.pausedElapsedMs = Math.round(Math.max(0, Number(clockElapsedMs) || 0));
  queuePersist(s);
  return { ...s };
}

export function pauseSrlOperatorMatch(matchId, now = Date.now(), clockElapsedMs = 0) {
  const s = getSrlOperatorSession(matchId);
  if (s.pausedAt || s.declaredWinnerKey) return { ...s };
  if (!s.startedAt) {
    s.startedAt = now;
    s.pausedElapsedMs = Math.round(Math.max(0, Number(clockElapsedMs) || 0));
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
  const clamped = Math.round(Math.max(0, Number(elapsedMs) || 0));
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

/** Best-effort JSON blob store for desk presets / templates / shift notes. */
export async function saveSrlOperatorSettingJson(key, value) {
  const query = await getQuery();
  if (!query || !key) return false;
  try {
    await query(
      `INSERT INTO srl_operator_settings (key, value_json, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = NOW()`,
      [String(key), JSON.stringify(value ?? null)],
    );
    return true;
  } catch {
    try {
      // Older DBs without value_json — no-op.
      return false;
    } catch {
      return false;
    }
  }
}

export async function loadSrlOperatorSettingJson(key, fallback = null) {
  const query = await getQuery();
  if (!query || !key) return fallback;
  try {
    const res = await query(
      `SELECT value_json FROM srl_operator_settings WHERE key = $1 LIMIT 1`,
      [String(key)],
    );
    const raw = res.rows?.[0]?.value_json;
    if (raw == null) return fallback;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return fallback;
  }
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
 * Replaces any prior anchor for the same innings+ballIndex (or same marketId).
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
    wickets: Number.isFinite(Number(anchor.wickets)) ? Math.max(0, Math.min(10, Math.round(Number(anchor.wickets)))) : null,
    naturalWicketsAtAnchor: Number.isFinite(Number(anchor.naturalWicketsAtAnchor))
      ? Number(anchor.naturalWicketsAtAnchor)
      : null,
    applyNow: !!anchor.applyNow,
    source: anchor.source || null,
    updatedAt: Date.now(),
  };
  const filtered = list.filter((a) => {
    if (marketId && a.marketId === marketId) return false;
    // Prefer ballIndex identity so extras / multi-injects in the same over do not erase prior anchors.
    if (next.ballIndex != null && Number.isFinite(Number(a.ballIndex))) {
      return !(Number(a.innings) === innings && Number(a.ballIndex) === next.ballIndex);
    }
    if (
      next.ballIndex == null
      && next.atOver != null
      && Number(a.innings) === innings
      && Number(a.atOver) === next.atOver
      && !Number.isFinite(Number(a.ballIndex))
    ) {
      return false;
    }
    return true;
  });
  filtered.push(next);
  s.scoreAnchors = filtered;
  queuePersist(s);
  return next;
}

/** Remove and return the most recently upserted score anchor (for undo). */
export function popSrlScoreAnchor(matchId) {
  const s = getSrlOperatorSession(matchId);
  if (!Array.isArray(s.scoreAnchors) || s.scoreAnchors.length === 0) return null;
  const removed = s.scoreAnchors.pop();
  queuePersist(s);
  return removed;
}

/** Clear every scoreboard anchor for a match (natural sim board resumes). */
export function clearSrlScoreAnchors(matchId) {
  const s = getSrlOperatorSession(matchId);
  const removed = Array.isArray(s.scoreAnchors) ? s.scoreAnchors.length : 0;
  s.scoreAnchors = [];
  queuePersist(s);
  return { cleared: removed };
}

/** Remove and return the latest replay delivery entry (for undo). */
export function popSrlReplayDelivery(matchId) {
  const s = getSrlOperatorSession(matchId);
  if (!Array.isArray(s.replayLog) || s.replayLog.length === 0) return null;
  const removed = s.replayLog.pop();
  queuePersist(s);
  return removed;
}

export function pushSrlInjectHistoryEntry(matchId, entry) {
  if (!matchId || !entry) return null;
  const s = getSrlOperatorSession(matchId);
  if (!Array.isArray(s.injectHistory)) s.injectHistory = [];
  const next = {
    id: entry.id || `ih_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    at: entry.at || Date.now(),
    admin: entry.admin || null,
    reasonCode: entry.reasonCode || 'script',
    type: entry.type || null,
    subType: entry.subType || null,
    advancedClock: !!entry.advancedClock,
    ballIndex: entry.ballIndex ?? null,
    innings: entry.innings ?? null,
    boardBefore: entry.boardBefore || null,
    boardAfter: entry.boardAfter || null,
    note: entry.note || null,
  };
  s.injectHistory.push(next);
  if (s.injectHistory.length > 100) s.injectHistory = s.injectHistory.slice(-100);
  queuePersist(s);
  return next;
}

export function getSrlInjectHistoryEntries(matchId, limit = 40) {
  const s = getSrlOperatorSession(matchId);
  const list = Array.isArray(s.injectHistory) ? s.injectHistory : [];
  return list.slice(-Math.max(1, Math.min(100, limit))).reverse();
}

export function pushSrlDeskAlertEntry(matchId, alert) {
  const s = getSrlOperatorSession(matchId);
  if (!Array.isArray(s.deskAlerts)) s.deskAlerts = [];
  const next = {
    id: `al_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    level: alert.level || 'info',
    code: alert.code || 'INFO',
    message: alert.message || '',
    at: Date.now(),
  };
  s.deskAlerts.unshift(next);
  s.deskAlerts = s.deskAlerts.slice(0, 40);
  queuePersist(s);
  return next;
}

export function markSrlAutoPause(matchId, at = Date.now()) {
  const s = getSrlOperatorSession(matchId);
  s.lastAutoPauseAt = at;
  queuePersist(s);
  return s.lastAutoPauseAt;
}

export function persistSrlOperatorSession(matchId) {
  const s = getSrlOperatorSession(matchId);
  queuePersist(s);
  return true;
}

export function setSrlIntegrityHold(matchId, { active = true, note = null, admin = null } = {}) {
  const s = getSrlOperatorSession(matchId);
  s.integrityHold = active
    ? { active: true, note: note ? String(note).slice(0, 400) : null, at: Date.now(), admin: admin || null }
    : null;
  queuePersist(s);
  return s.integrityHold;
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
    reasonCode: incident.reasonCode || 'script',
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

export function setSrlTossAndLineup(matchId, {
  tossWinnerKey,
  tossDecision,
  homePlayingXI,
  awayPlayingXI,
  homeImpactPlayer,
  awayImpactPlayer,
  locked = null,
  winnerName = null,
  userPublished = null,
  publicRevealAt = null,
} = {}) {
  const s = getSrlOperatorSession(matchId);
  if (s.toss?.locked && tossWinnerKey && tossWinnerKey !== s.toss.tossWinnerKey) {
    throw new Error('Toss is locked for users — unlock before changing the result');
  }
  const decision = String(tossDecision || s.toss?.decision || 'BAT').toUpperCase();
  const nextWinner = tossWinnerKey || s.toss?.tossWinnerKey || null;
  const nextLocked = locked == null ? !!s.toss?.locked : !!locked;
  s.toss = {
    winner: nextWinner,
    tossWinnerKey: nextWinner,
    winnerName: winnerName || s.toss?.winnerName || null,
    wonToss: winnerName || s.toss?.wonToss || null,
    decision, // BAT or BOWL
    timestamp: Date.now(),
    locked: nextLocked,
    declaredAt: nextLocked ? (s.toss?.declaredAt || Date.now()) : (s.toss?.declaredAt || null),
    // Desk may lock anytime; users only see result once userPublished (at/after T-25).
    userPublished: userPublished == null ? !!s.toss?.userPublished : !!userPublished,
    publicRevealAt: publicRevealAt != null
      ? Number(publicRevealAt)
      : (s.toss?.publicRevealAt ?? null),
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

// ---------------------------------------------------------------------------
// Autonomous AI Match Director & Player Buffs
// ---------------------------------------------------------------------------

export const DIRECTOR_MODES = {
  REALISTIC: { id: 'REALISTIC', label: 'Realistic Normal', desc: 'Natural IPL cricket probability distribution', icon: '🏏' },
  THRILLER_FINISH: { id: 'THRILLER_FINISH', label: 'Thriller Finish Guaranteed', desc: 'Forces an intense final over finish (runs needed <= 10 in 20th over)', icon: '🎬' },
  IPL_CARNAGE: { id: 'IPL_CARNAGE', label: 'IPL Carnage Mode', desc: 'Boundary frenzy targeting 215+ total score', icon: '🔥' },
  COLLAPSE_CLAWBACK: { id: 'COLLAPSE_CLAWBACK', label: 'Collapse & Clawback', desc: 'Top-order wicket collapse followed by heroic middle-order rebuild', icon: '📉' },
  SPIN_WEB: { id: 'SPIN_WEB', label: 'Spin Web Trap', desc: 'Low-scoring turning track with heavy dot ball pressure', icon: '🕸️' },
};

export const PLAYER_BUFF_TYPES = {
  GOD_MODE: { id: 'GOD_MODE', label: 'God Mode (+45% Boundaries)', desc: 'Surges boundary hitting probability', icon: '🔥' },
  COLD_SLUMP: { id: 'COLD_SLUMP', label: 'Cold Slump (+Wicket Risk)', desc: 'Increases dot balls and dismissal chance', icon: '❄️' },
  DEATH_YORKER: { id: 'DEATH_YORKER', label: 'Death Yorker Precision', desc: 'Surges dot balls and bowled dismissals', icon: '🎯' },
  PINCH_HITTER: { id: 'PINCH_HITTER', label: 'Pinch Hitter Blitz', desc: 'High-risk maximum scoring rate', icon: '⚡' },
};

export function setSrlDirectorMode(matchId, mode) {
  if (!matchId) throw new Error('matchId required');
  const s = getSrlOperatorSession(matchId);
  const m = String(mode || 'REALISTIC').toUpperCase();
  s.directorMode = DIRECTOR_MODES[m] ? m : 'REALISTIC';
  queuePersist(s);
  return { success: true, matchId, directorMode: s.directorMode };
}

export function setSrlPlayerBuff(matchId, { playerKey, role, buff } = {}) {
  if (!matchId) throw new Error('matchId required');
  const s = getSrlOperatorSession(matchId);
  if (!s.playerBuffs || typeof s.playerBuffs !== 'object') s.playerBuffs = {};

  const key = playerKey || role || 'striker';
  if (!buff) {
    delete s.playerBuffs[key];
  } else {
    s.playerBuffs[key] = {
      buff: String(buff).toUpperCase(),
      appliedAt: Date.now(),
    };
  }
  queuePersist(s);
  return { success: true, matchId, playerBuffs: s.playerBuffs };
}

// ---------------------------------------------------------------------------
// 1. Environmental Physics Engine (Dew, Pitch Wear & Swing Index)
// ---------------------------------------------------------------------------

export const PITCH_WEAR_TYPES = {
  FRESH_BELTER: { id: 'FRESH_BELTER', label: 'Fresh Belter (True Bounce)', desc: 'True bounce, 200+ par score, ideal for stroke-play', batMultiplier: 1.15, bowlMultiplier: 0.90, icon: '⚡' },
  DRY_DUSTBOWL: { id: 'DRY_DUSTBOWL', label: 'Dry Dustbowl (Sharp Turn)', desc: 'Sharp spin turn, low bounce, high LBW/bowled rate', batMultiplier: 0.85, bowlMultiplier: 1.25, icon: '🏜️' },
  GREEN_SEAMER: { id: 'GREEN_SEAMER', label: 'Green Seamer (Late Movement)', desc: 'Seam & swing movement with high edge conversion to keeper/slips', batMultiplier: 0.88, bowlMultiplier: 1.20, icon: '🌿' },
  CRACKED_MINEFIELD: { id: 'CRACKED_MINEFIELD', label: 'Cracked Minefield (Variable)', desc: 'Unpredictable variable bounce, chaotic wicket spikes', batMultiplier: 0.78, bowlMultiplier: 1.35, icon: '💥' },
};

export function getSrlEnvironment(matchId) {
  const s = getSrlOperatorSession(matchId);
  return s.environment || { dewFactor: 0, pitchWear: 'FRESH_BELTER', swingIndex: 15, overcast: false };
}

export function setSrlEnvironment(matchId, env = {}) {
  if (!matchId) throw new Error('matchId required');
  const s = getSrlOperatorSession(matchId);
  const cur = s.environment || { dewFactor: 0, pitchWear: 'FRESH_BELTER', swingIndex: 15, overcast: false };
  const pitchWear = env.pitchWear && PITCH_WEAR_TYPES[String(env.pitchWear).toUpperCase()] ? String(env.pitchWear).toUpperCase() : cur.pitchWear;
  const dewFactor = typeof env.dewFactor === 'number' ? Math.max(0, Math.min(100, Math.round(env.dewFactor))) : cur.dewFactor;
  const swingIndex = typeof env.swingIndex === 'number' ? Math.max(0, Math.min(100, Math.round(env.swingIndex))) : cur.swingIndex;
  const overcast = typeof env.overcast === 'boolean' ? env.overcast : cur.overcast;

  s.environment = {
    dewFactor,
    pitchWear,
    swingIndex,
    overcast,
  };
  queuePersist(s);
  return { success: true, matchId, environment: s.environment };
}

// ---------------------------------------------------------------------------
// 2. Dynamic Micro-Markets & Rapid Flash Betting Desk
// ---------------------------------------------------------------------------

export function generateDefaultSrlMicroMarkets(matchId, currentMatch = null) {
  const ld = currentMatch?.liveDetails || {};
  const oversDone = Number(ld.overs || 0);
  const nextOverNum = Math.floor(oversDone) + 1;
  const striker = ld.batsman || currentMatch?.team1?.playingXI?.[0]?.name || 'Striker';
  const curRuns = Number(ld.firstRuns ?? ld.runs ?? 0);
  const crr = oversDone > 0 ? curRuns / oversDone : 8.0;
  const dynamicLine = Number((Math.max(6, Math.min(15, Math.round(crr))) + 0.5).toFixed(1));

  return [
    {
      id: `mkt_${matchId}_over_${nextOverNum}_runs`,
      type: 'OVER_RUNS',
      title: `Over ${nextOverNum}.0 Total Runs`,
      subtitle: `Will ${nextOverNum}.0 over yield over or under ${dynamicLine} runs?`,
      line: dynamicLine,
      status: 'OPEN',
      holdPercent: 0.08,
      outcomes: [
        { id: 'over', label: `Over ${dynamicLine} Runs`, odds: 1.88, liability: 0 },
        { id: 'under', label: `Under ${dynamicLine} Runs`, odds: 1.88, liability: 0 },
      ],
    },
    {
      id: `mkt_${matchId}_boundary_next_3`,
      type: 'BOUNDARY_3',
      title: 'Boundary in Next 3 Deliveries?',
      subtitle: 'Will a 4 or 6 be scored in balls 1, 2, or 3 from now?',
      status: 'OPEN',
      holdPercent: 0.07,
      outcomes: [
        { id: 'yes', label: 'Yes (Boundary Scored)', odds: 1.62, liability: 0 },
        { id: 'no', label: 'No Boundaries', odds: 2.24, liability: 0 },
      ],
    },
    {
      id: `mkt_${matchId}_dismissal_method`,
      type: 'DISMISSAL_METHOD',
      title: 'Method of Next Dismissal',
      subtitle: 'How will the next wicket fall?',
      status: 'OPEN',
      holdPercent: 0.10,
      outcomes: [
        { id: 'caught', label: 'Caught / Behind', odds: 2.10, liability: 0 },
        { id: 'bowled', label: 'Bowled / Stumped', odds: 3.25, liability: 0 },
        { id: 'lbw', label: 'LBW (Leg Before)', odds: 4.40, liability: 0 },
        { id: 'run_out', label: 'Run Out / Direct Hit', odds: 7.50, liability: 0 },
      ],
    },
    {
      id: `mkt_${matchId}_striker_milestone`,
      type: 'MILESTONE',
      title: `${striker} to Reach 50 Runs`,
      subtitle: `Will ${striker} achieve a half-century this innings?`,
      status: 'OPEN',
      holdPercent: 0.08,
      outcomes: [
        { id: 'yes', label: 'Yes (50+ Runs)', odds: 2.05, liability: 0 },
        { id: 'no', label: 'No (Under 50)', odds: 1.76, liability: 0 },
      ],
    },
  ];
}

export function getSrlMicroMarkets(matchId, currentMatch = null) {
  const s = getSrlOperatorSession(matchId);
  if (!Array.isArray(s.microMarkets) || s.microMarkets.length === 0) {
    s.microMarkets = generateDefaultSrlMicroMarkets(matchId, currentMatch);
    queuePersist(s);
  }
  return [...s.microMarkets];
}

export function setSrlMicroMarketStatus(matchId, { marketId, status } = {}) {
  if (!matchId) throw new Error('matchId required');
  const s = getSrlOperatorSession(matchId);
  const list = getSrlMicroMarkets(matchId);
  const target = list.find((m) => m.id === marketId);
  if (!target) throw new Error(`Micro-market ${marketId} not found`);

  target.status = String(status || 'SUSPENDED').toUpperCase();
  s.microMarkets = list;
  queuePersist(s);
  return { success: true, matchId, market: target };
}

export function setSrlMicroMarketMargin(matchId, { marketId, holdPercent } = {}) {
  if (!matchId) throw new Error('matchId required');
  const s = getSrlOperatorSession(matchId);
  const list = getSrlMicroMarkets(matchId);
  const target = list.find((m) => m.id === marketId);
  if (!target) throw new Error(`Micro-market ${marketId} not found`);

  const hold = Math.max(0.04, Math.min(0.25, Number(holdPercent) || 0.08));
  target.holdPercent = hold;
  // Recalculate odds to reflect new hold
  if (Array.isArray(target.outcomes) && target.outcomes.length === 2) {
    const fairOdds = 2.0;
    const juiceOdds = Number((fairOdds / (1 + hold)).toFixed(2));
    target.outcomes = target.outcomes.map((o) => ({ ...o, odds: juiceOdds }));
  }
  s.microMarkets = list;
  queuePersist(s);
  return { success: true, matchId, market: target };
}

export function setSrlMicroMarketsMassSuspend(matchId, suspend = true) {
  if (!matchId) throw new Error('matchId required');
  const s = getSrlOperatorSession(matchId);
  const list = getSrlMicroMarkets(matchId);
  s.microMarkets = list.map((m) => ({
    ...m,
    status: suspend ? 'SUSPENDED' : 'OPEN',
  }));
  queuePersist(s);
  return { success: true, matchId, massSuspended: !!suspend, microMarkets: s.microMarkets };
}

// ---------------------------------------------------------------------------
// 3. Live Cash-Out Haircut & Liability Buyback Desk
// ---------------------------------------------------------------------------

export function getSrlCashoutControl(matchId) {
  const s = getSrlOperatorSession(matchId);
  return s.cashoutControl || { globalHaircut: 0.10, cashoutHalted: false, sweetenerOffers: {} };
}

export function setSrlCashoutConfig(matchId, { globalHaircut, cashoutHalted } = {}) {
  if (!matchId) throw new Error('matchId required');
  const s = getSrlOperatorSession(matchId);
  const cur = s.cashoutControl || { globalHaircut: 0.10, cashoutHalted: false, sweetenerOffers: {} };
  s.cashoutControl = {
    ...cur,
    globalHaircut: typeof globalHaircut === 'number' ? Math.max(0.02, Math.min(0.30, globalHaircut)) : cur.globalHaircut,
    cashoutHalted: typeof cashoutHalted === 'boolean' ? cashoutHalted : cur.cashoutHalted,
  };
  queuePersist(s);
  return { success: true, matchId, cashoutControl: s.cashoutControl };
}

export function pushSrlCashoutSweetener(matchId, { betId, bonusPercent = 5 } = {}) {
  if (!matchId || !betId) throw new Error('matchId and betId required');
  const s = getSrlOperatorSession(matchId);
  const cur = s.cashoutControl || { globalHaircut: 0.10, cashoutHalted: false, sweetenerOffers: {} };
  const offers = { ...(cur.sweetenerOffers || {}) };
  offers[betId] = {
    betId,
    bonusPercent: Number(bonusPercent) || 5,
    pushedAt: Date.now(),
    expiresAt: Date.now() + 120000, // 2-min window
  };
  s.cashoutControl = { ...cur, sweetenerOffers: offers };
  queuePersist(s);
  return { success: true, matchId, betId, sweetenerOffer: offers[betId] };
}

// ---------------------------------------------------------------------------
// 4. Automated Circuit Breakers & Risk Kill-Switches
// ---------------------------------------------------------------------------

export function getSrlCircuitBreaker(matchId) {
  const s = getSrlOperatorSession(matchId);
  return s.circuitBreaker || {
    velocityLimit: 100000,
    isTripped: false,
    trippedAt: null,
    stageCaps: { powerplay: 50000, middle: 35000, death: 15000 },
    emergencyKillSwitch: false,
  };
}

export function setSrlCircuitBreakerConfig(matchId, { velocityLimit, stageCaps } = {}) {
  if (!matchId) throw new Error('matchId required');
  const s = getSrlOperatorSession(matchId);
  const cur = s.circuitBreaker || {
    velocityLimit: 100000,
    isTripped: false,
    trippedAt: null,
    stageCaps: { powerplay: 50000, middle: 35000, death: 15000 },
    emergencyKillSwitch: false,
  };
  s.circuitBreaker = {
    ...cur,
    velocityLimit: Number(velocityLimit) > 0 ? Number(velocityLimit) : cur.velocityLimit,
    stageCaps: stageCaps && typeof stageCaps === 'object' ? { ...cur.stageCaps, ...stageCaps } : cur.stageCaps,
  };
  queuePersist(s);
  return { success: true, matchId, circuitBreaker: s.circuitBreaker };
}

export function toggleSrlCircuitBreakerTrip(matchId, isTripped) {
  if (!matchId) throw new Error('matchId required');
  const s = getSrlOperatorSession(matchId);
  const cur = getSrlCircuitBreaker(matchId);
  s.circuitBreaker = {
    ...cur,
    isTripped: !!isTripped,
    trippedAt: isTripped ? Date.now() : null,
  };
  // If tripped, auto-close betting to protect house
  if (isTripped) {
    s.bettingClosed = true;
  }
  queuePersist(s);
  return { success: true, matchId, circuitBreaker: s.circuitBreaker };
}

export function toggleSrlEmergencyKillSwitch(matchId, active) {
  if (!matchId) throw new Error('matchId required');
  const s = getSrlOperatorSession(matchId);
  const cur = getSrlCircuitBreaker(matchId);
  const shouldLock = typeof active === 'boolean' ? active : !cur.emergencyKillSwitch;
  s.circuitBreaker = {
    ...cur,
    emergencyKillSwitch: shouldLock,
  };
  s.bettingClosed = shouldLock;
  queuePersist(s);
  return { success: true, matchId, emergencyKillSwitch: shouldLock, bettingClosed: s.bettingClosed };
}



