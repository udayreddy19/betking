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
  };
}

function queuePersist(session) {
  void (async () => {
    const query = await getQuery();
    if (!query || !session?.matchId) return;
    try {
      await query(
        `INSERT INTO srl_operator_sessions (
          match_id, started_at, paused_at, paused_elapsed_ms, speed,
          forced_winner_key, declared_at, declared_winner_key, declared_elapsed_ms,
          betting_closed, market_controls, updated_at
        ) VALUES (
          $1,
          CASE WHEN $2 IS NULL THEN NULL ELSE to_timestamp($2 / 1000.0) END,
          CASE WHEN $3 IS NULL THEN NULL ELSE to_timestamp($3 / 1000.0) END,
          $4, $5, $6,
          CASE WHEN $7 IS NULL THEN NULL ELSE to_timestamp($7 / 1000.0) END,
          $8, $9, $10, $11::jsonb, NOW()
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
          JSON.stringify(session.marketControls && typeof session.marketControls === 'object'
            ? session.marketControls
            : {}),
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
