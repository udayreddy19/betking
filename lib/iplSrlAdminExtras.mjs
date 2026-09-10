/**
 * OddsYra SRL admin extras:
 * checklist, toss unlock, dual-control, handoff, book heat,
 * whale correlation, stage soft-limits, player props, banners,
 * public preview parity, squad/fixture editors, highlights,
 * settlement dry-run, regression pack.
 */

import {
  getIplSrlMatchById,
  getIplSrlDeskMatches,
  getSrlPlayingXINames,
  getSrlTeamRoster,
  normalizeSrlTeamKey,
  isSrlTossVisibleToUsers,
  srlTossPublicRevealAt,
  SRL_TOSS_PUBLIC_LEAD_MS,
  redactSrlTossForPublic,
} from './iplSrlSimulator.mjs';
import {
  getSrlOperatorSession,
  setSrlTossAndLineup,
  setSrlCustomCommentary,
  setSrlOperatorBettingClosed,
  getSrlReplayLog,
  getCustomSrlMatch,
  registerCustomSrlMatch,
  queuePersist,
} from './iplSrlOperatorState.mjs';
import {
  assertSrlDangerousAction,
  getSrlDeskCoverage,
  listSrlShiftNotes,
  pushSrlDeskAlert,
  isSrlSeniorRole,
} from './iplSrlDeskOps.mjs';

const fixtureOverrides = new Map(); // matchId -> { startTime?, venue?, updatedAt, admin }
const matchBanners = new Map(); // matchId -> { type, text, at, admin }
const pendingDualControls = new Map(); // id -> pending action
const dualApprovals = new Map(); // actionKey -> { requester, at }

export const SRL_BANNER_PRESETS = {
  TOSS_LIVE: {
    type: 'TOSS_LIVE',
    label: 'Toss live',
    build: (m, toss) => {
      const name = toss?.winnerName || toss?.wonToss || 'Toss winner';
      const dec = String(toss?.decision || 'BAT').toUpperCase();
      return `🪙 TOSS LIVE: ${name} elected to ${dec} first.`;
    },
  },
  INNINGS_BREAK: {
    type: 'INNINGS_BREAK',
    label: 'Innings break',
    build: (m, _toss, ld) => {
      const score = `${ld?.firstRuns ?? ld?.runs ?? 0}/${ld?.firstWickets ?? ld?.wickets ?? 0}`;
      return `⏸️ INNINGS BREAK · ${ld?.firstTeamName || m?.team1?.shortName || 'Team'} ${score}. Chase coming up.`;
    },
  },
  POWERPLAY_DONE: {
    type: 'POWERPLAY_DONE',
    label: 'Powerplay done',
    build: () => '⚡ Powerplay complete — middle overs underway.',
  },
  MATCH_STARTING: {
    type: 'MATCH_STARTING',
    label: 'Match starting',
    build: (m) => `🟢 ${m?.team1?.shortName || '?'} vs ${m?.team2?.shortName || '?'} starting soon — markets open.`,
  },
};

function auditPush(_action, _detail, _meta = {}) {
  // Soft audit — desk alerts + caller pushAudit cover durable trail.
  return null;
}

export function getSrlFixtureOverride(matchId) {
  return fixtureOverrides.get(String(matchId)) || null;
}

export function updateSrlFixture(matchId, { startTime, venue } = {}, admin = 'admin') {
  if (!matchId) throw new Error('matchId required');
  const m = getIplSrlMatchById(matchId);
  const custom = getCustomSrlMatch(matchId);
  if (!m && !custom) throw new Error(`Match not found: ${matchId}`);

  const next = {
    ...(fixtureOverrides.get(String(matchId)) || {}),
    updatedAt: Date.now(),
    admin,
  };
  if (startTime != null) {
    const ts = typeof startTime === 'number' ? startTime : Date.parse(String(startTime));
    if (!Number.isFinite(ts)) throw new Error('Invalid startTime');
    next.startTime = ts;
  }
  if (venue != null) {
    const v = String(venue).trim();
    if (!v) throw new Error('venue required');
    next.venue = v;
  }
  fixtureOverrides.set(String(matchId), next);

  if (custom) {
    registerCustomSrlMatch({
      ...custom,
      ...(next.startTime != null ? { startTime: next.startTime, scheduleLabel: new Date(next.startTime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) } : {}),
      ...(next.venue ? { venue: next.venue } : {}),
    });
  }

  void auditPush('Fixture Updated', `${matchId} start/venue`, { admin, next });
  return { success: true, matchId, override: next };
}

export function applySrlFixtureOverrideToMatch(match) {
  if (!match?.id && !match?.matchId) return match;
  const id = match.id || match.matchId;
  const ov = fixtureOverrides.get(String(id));
  if (!ov) return match;
  return {
    ...match,
    startTime: ov.startTime ?? match.startTime,
    venue: ov.venue || match.venue,
    scheduleLabel: ov.startTime
      ? new Date(ov.startTime).toLocaleString('en-IN', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata',
      })
      : match.scheduleLabel,
  };
}

/** Expand default XI to 15-man squad (XI + 4 bench) using roster padding. */
export function getSrlFullSquadNames(teamKeyOrShort) {
  const xi = getSrlPlayingXINames(teamKeyOrShort);
  if (!xi.length) return { playingXI: [], bench: [], impact: null, squad15: [] };
  const key = normalizeSrlTeamKey(teamKeyOrShort) || 'team';
  const bench = [
    `${key.toUpperCase()} Impact A`,
    `${key.toUpperCase()} Impact B`,
    `${key.toUpperCase()} Bench 3`,
    `${key.toUpperCase()} Bench 4`,
  ];
  const squad15 = [...xi.slice(0, 11), ...bench].slice(0, 15);
  return {
    playingXI: squad15.slice(0, 11),
    bench: squad15.slice(11),
    impact: squad15[11] || null,
    squad15,
  };
}

export function unlockSrlToss(matchId, { reason, admin = 'admin', role = 'SUPER_ADMIN' } = {}) {
  if (!matchId) throw new Error('matchId required');
  const note = String(reason || '').trim();
  if (!note) throw new Error('Unlock reason required');
  assertSrlDangerousAction('unlock_toss', admin, role, { note });
  const session = getSrlOperatorSession(matchId);
  if (!session.toss?.locked) {
    return { success: true, alreadyUnlocked: true, toss: session.toss };
  }
  const result = setSrlTossAndLineup(matchId, {
    tossWinnerKey: session.toss.tossWinnerKey,
    tossDecision: session.toss.decision,
    locked: false,
    userPublished: false,
    winnerName: session.toss.winnerName,
  });
  pushSrlDeskAlert(matchId, {
    level: 'warn',
    code: 'TOSS_UNLOCKED',
    message: `Toss unlocked by ${admin}: ${note}`,
  });
  void auditPush('Toss Unlocked', `${matchId} · ${note}`, { admin });
  return { success: true, ...result, reason: note };
}

export function requestSrlDualControl(action, {
  matchId,
  payload = {},
  admin = 'admin',
  role = 'SUPER_ADMIN',
  note = '',
} = {}) {
  const allowed = new Set(['kill_switch', 'void_market', 'force_winner', 'mass_void', 'settlement_wizard']);
  if (!allowed.has(action)) throw new Error(`Dual-control not configured for ${action}`);
  if (!isSrlSeniorRole(role)) throw new Error('Senior role required to request dual-control');
  const id = `dc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const entry = {
    id,
    action,
    matchId: matchId || null,
    payload,
    note: String(note || '').trim() || null,
    requester: admin,
    requesterRole: role,
    status: 'PENDING',
    createdAt: Date.now(),
    expiresAt: Date.now() + 10 * 60_000,
  };
  pendingDualControls.set(id, entry);
  if (matchId) {
    pushSrlDeskAlert(matchId, {
      level: 'warn',
      code: 'DUAL_CONTROL',
      message: `Awaiting second approval: ${action} (by ${admin})`,
    });
  }
  return { success: true, pending: entry };
}

export function listSrlDualControlPending({ matchId } = {}) {
  const now = Date.now();
  const out = [];
  for (const [id, entry] of pendingDualControls) {
    if (entry.expiresAt < now) {
      entry.status = 'EXPIRED';
      pendingDualControls.delete(id);
      continue;
    }
    if (matchId && entry.matchId !== matchId) continue;
    if (entry.status === 'PENDING') out.push(entry);
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

export async function approveSrlDualControl(pendingId, {
  admin = 'admin',
  role = 'SUPER_ADMIN',
  note = '',
} = {}) {
  const entry = pendingDualControls.get(String(pendingId));
  if (!entry || entry.status !== 'PENDING') throw new Error('Pending dual-control not found');
  if (entry.expiresAt < Date.now()) {
    pendingDualControls.delete(String(pendingId));
    throw new Error('Dual-control request expired');
  }
  if (!isSrlSeniorRole(role)) throw new Error('Senior role required to approve');
  if (String(admin) === String(entry.requester)) {
    throw new Error('Second admin required — requester cannot self-approve');
  }
  entry.status = 'APPROVED';
  entry.approver = admin;
  entry.approveNote = String(note || '').trim() || null;
  entry.approvedAt = Date.now();
  pendingDualControls.delete(String(pendingId));
  dualApprovals.set(`${entry.action}:${entry.matchId || 'global'}`, {
    requester: entry.requester,
    approver: admin,
    at: Date.now(),
    pendingId,
  });

  const { toggleIPLSRLEmergencyKillSwitch, declareIPLsRLWinnerSafe, setIPLsRLMarketVoidSafe } = await importDualExecutors();
  let result = null;
  if (entry.action === 'kill_switch' && entry.matchId) {
    result = toggleIPLSRLEmergencyKillSwitch(entry.matchId, true, admin, role, {
      note: entry.note || note || 'dual-control',
      skipNote: true,
    });
  } else if (entry.action === 'force_winner' && entry.matchId && entry.payload?.teamId) {
    result = await declareIPLsRLWinnerSafe(entry.matchId, entry.payload.teamId, admin, role, {
      note: entry.note || note || 'dual-control',
      skipNote: true,
      skipCooldown: true,
    });
  } else if (entry.action === 'void_market' && entry.matchId && entry.payload?.marketId) {
    result = await setIPLsRLMarketVoidSafe(entry.matchId, entry.payload.marketId, admin, role, {
      note: entry.note || note || 'dual-control',
      skipDual: true,
    });
  } else {
    result = { acknowledged: true, action: entry.action, payload: entry.payload };
  }

  void auditPush('Dual-Control Approved', `${entry.action} · ${entry.matchId || '—'}`, {
    admin,
    requester: entry.requester,
  });
  return { success: true, entry, result };
}

async function importDualExecutors() {
  const mod = await import('./iplSrlAdminControl.mjs');
  return {
    toggleIPLSRLEmergencyKillSwitch: mod.toggleIPLSRLEmergencyKillSwitch,
    declareIPLsRLWinnerSafe: mod.declareIPLSRLWinner,
    setIPLsRLMarketVoidSafe: async (matchId, marketId, admin, role, opts) => mod.declareIPLSRLMarketOutcome(matchId, {
      marketId,
      voidMarket: true,
      admin,
      role,
      note: opts?.note,
      skipDangerCheck: !!opts?.skipDual,
    }),
  };
}

export function hasRecentDualApproval(action, matchId, withinMs = 120_000) {
  const hit = dualApprovals.get(`${action}:${matchId || 'global'}`);
  if (!hit) return false;
  return Date.now() - hit.at <= withinMs;
}

export function getSrlMatchChecklist(matchId) {
  if (!matchId) throw new Error('matchId required');
  const m = applySrlFixtureOverrideToMatch(getIplSrlMatchById(matchId));
  if (!m) throw new Error(`Match not found: ${matchId}`);
  const session = getSrlOperatorSession(matchId);
  const toss = session.toss || m.toss;
  const lineup = session.lineup;
  const homeXI = lineup?.homePlayingXI?.length || 0;
  const awayXI = lineup?.awayPlayingXI?.length || 0;
  const mw = session.marketControls?.match_winner || session.marketControls?.winner;
  const mwSettled = mw && ['DECLARED', 'VOIDED'].includes(String(mw.status || '').toUpperCase());
  const steps = [
    {
      id: 'fixture',
      label: 'Fixture ready',
      ok: !!(m.team1?.key && m.team2?.key && m.team1.key !== 'tbd' && m.team2.key !== 'tbd'),
      detail: `${m.team1?.shortName || '?'} vs ${m.team2?.shortName || '?'}`,
    },
    {
      id: 'toss_lock',
      label: 'Toss locked',
      ok: !!toss?.locked,
      detail: toss?.locked
        ? `${toss.winnerName || toss.tossWinnerKey} · ${toss.decision}${toss.userPublished ? ' · live' : ' · deferred'}`
        : 'Not locked',
    },
    {
      id: 'lineup',
      label: 'Lineups set',
      ok: homeXI >= 11 && awayXI >= 11,
      detail: `Home ${homeXI}/11 · Away ${awayXI}/11`,
    },
    {
      id: 'book_open',
      label: 'Book open',
      ok: !session.bettingClosed && !session.circuitBreaker?.emergencyKillSwitch,
      detail: session.bettingClosed ? 'Betting closed' : 'Betting open',
    },
    {
      id: 'live',
      label: 'Match live / started',
      ok: m.matchState === 'in' || !!session.startedAt,
      detail: m.matchState || 'pre',
    },
    {
      id: 'settle',
      label: 'Match winner settled',
      ok: !!mwSettled || m.matchState === 'post' && !!session.declaredWinnerKey,
      detail: mwSettled ? 'Settled' : (session.declaredWinnerKey ? `Declared ${session.declaredWinnerKey}` : 'Open'),
    },
  ];
  const done = steps.filter((s) => s.ok).length;
  return {
    matchId,
    progress: { done, total: steps.length, pct: Math.round((done / steps.length) * 100) },
    steps,
    next: steps.find((s) => !s.ok) || null,
  };
}

export async function getSrlShiftHandoffPack() {
  const coverage = getSrlDeskCoverage();
  const notes = listSrlShiftNotes();
  const desk = getIplSrlDeskMatches().map(applySrlFixtureOverrideToMatch);
  const now = Date.now();
  const upcoming = desk
    .filter((m) => m.matchState === 'pre' && Number(m.startTime) > now)
    .sort((a, b) => a.startTime - b.startTime)
    .slice(0, 8)
    .map((m) => ({
      matchId: m.id,
      fixture: `${m.team1?.shortName} vs ${m.team2?.shortName}`,
      startTime: m.startTime,
      scheduleLabel: m.scheduleLabel,
      tossLocked: !!getSrlOperatorSession(m.id).toss?.locked,
      tossDeferred: !!getSrlOperatorSession(m.id).toss?.locked && !getSrlOperatorSession(m.id).toss?.userPublished,
    }));
  const live = desk
    .filter((m) => m.matchState === 'in')
    .map((m) => {
      const s = getSrlOperatorSession(m.id);
      return {
        matchId: m.id,
        fixture: `${m.team1?.shortName} vs ${m.team2?.shortName}`,
        bettingClosed: !!s.bettingClosed,
        kill: !!s.circuitBreaker?.emergencyKillSwitch,
        deferredToss: !!s.toss?.locked && !s.toss?.userPublished,
      };
    });
  const deferredToss = desk
    .filter((m) => {
      const t = getSrlOperatorSession(m.id).toss;
      return t?.locked && !t.userPublished;
    })
    .map((m) => ({
      matchId: m.id,
      fixture: `${m.team1?.shortName} vs ${m.team2?.shortName}`,
      publicRevealAt: getSrlOperatorSession(m.id).toss?.publicRevealAt || srlTossPublicRevealAt(m.startTime),
    }));

  return {
    at: now,
    coverage,
    shiftNotes: notes.slice(0, 12),
    live,
    upcoming,
    deferredToss,
    dualPending: listSrlDualControlPending(),
  };
}

function familyForMarketId(marketId) {
  const id = String(marketId || '').toLowerCase();
  if (/toss|bat_first/.test(id)) return 'toss';
  if (/match_winner|winner|1x2|moneyline/.test(id)) return 'winner';
  if (/total|over_under|runs_|overs_0/.test(id)) return 'totals';
  if (/player|batter|bowler|sixes|fours|top_/.test(id)) return 'player_props';
  return 'other';
}

export async function getSrlBookHeatMap(matchId) {
  const { getIPLSRLMatchMarkets } = await import('./iplSrlAdminControl.mjs');
  const desk = await getIPLSRLMatchMarkets(matchId);
  const families = {
    toss: { stake: 0, bets: 0, liability: 0, markets: 0 },
    winner: { stake: 0, bets: 0, liability: 0, markets: 0 },
    totals: { stake: 0, bets: 0, liability: 0, markets: 0 },
    player_props: { stake: 0, bets: 0, liability: 0, markets: 0 },
    other: { stake: 0, bets: 0, liability: 0, markets: 0 },
  };
  for (const m of desk.markets || []) {
    const fam = familyForMarketId(m.marketId);
    const stake = Number(m.book?.stake || 0);
    const bets = Number(m.book?.bets || 0);
    const liability = Number(m.book?.worstCaseLiability || m.book?.liability || stake);
    families[fam].stake += stake;
    families[fam].bets += bets;
    families[fam].liability += liability;
    families[fam].markets += 1;
  }
  return {
    matchId,
    openStake: desk.openStake || 0,
    openBets: desk.openBets || 0,
    families,
  };
}

export async function getSrlWhaleCorrelationAlerts(matchId) {
  const { getSrlLiveWagerTape } = await import('./iplSrlAdminControl.mjs');
  const tape = await getSrlLiveWagerTape(matchId, { limit: 100 });
  const byUser = new Map();
  for (const w of tape.wagers || []) {
    const uid = String(w.userId || w.userEmail || 'unknown');
    if (!byUser.has(uid)) {
      byUser.set(uid, { userId: uid, userEmail: w.userEmail, stakes: 0, bets: 0, markets: new Set(), legs: [] });
    }
    const row = byUser.get(uid);
    row.stakes += Number(w.stake) || 0;
    row.bets += 1;
    row.markets.add(String(w.marketTitle || w.market_id || ''));
    row.legs.push({
      market: w.marketTitle,
      selection: w.selection,
      stake: w.stake,
      odds: w.odds,
    });
  }
  const alerts = [...byUser.values()]
    .map((u) => ({
      userId: u.userId,
      userEmail: u.userEmail,
      stakes: u.stakes,
      bets: u.bets,
      marketCount: u.markets.size,
      correlated: u.markets.size >= 2 && u.bets >= 2,
      whale: u.stakes >= 10000 || u.bets >= 3,
      legs: u.legs.slice(0, 8),
    }))
    .filter((u) => u.correlated || u.whale)
    .sort((a, b) => b.stakes - a.stakes);

  return {
    matchId,
    alertCount: alerts.length,
    alerts: alerts.slice(0, 25),
  };
}

/** Soft-limit by innings stage — close betting only if stage stake exceeds cap (no full kill). */
export function evaluateSrlStageSoftLimit(matchId, matchBook = {}) {
  const m = getIplSrlMatchById(matchId);
  const session = getSrlOperatorSession(matchId);
  const cb = session.circuitBreaker || {};
  const caps = cb.stageCaps || { powerplay: 50000, middle: 35000, death: 15000 };
  const ld = m?.liveDetails || {};
  const overs = parseFloat(String(ld.overs ?? ld.firstOvers ?? ld.chaseOvers ?? 0)) || 0;
  let stage = 'powerplay';
  if (overs >= 16) stage = 'death';
  else if (overs >= 6) stage = 'middle';
  const cap = Number(caps[stage]) || 0;
  const stake = Number(matchBook.totalStake || matchBook.stake || 0);
  const breached = cap > 0 && stake >= cap;
  if (breached && !session.stageSoftLimited) {
    session.stageSoftLimited = { stage, cap, stake, at: Date.now() };
    setSrlOperatorBettingClosed(matchId, true);
    queuePersist(session);
    pushSrlDeskAlert(matchId, {
      level: 'warn',
      code: 'STAGE_SOFT_LIMIT',
      message: `${stage} soft-limit: stake ₹${Math.round(stake).toLocaleString('en-IN')} ≥ ₹${Math.round(cap).toLocaleString('en-IN')} — book paused (not killed)`,
    });
  }
  return {
    matchId,
    stage,
    cap,
    stake,
    breached,
    bettingClosed: !!session.bettingClosed,
  };
}

export async function openSrlPlayerPropMarkets(matchId, {
  players = [],
  propType = 'top_batter',
  admin = 'admin',
} = {}) {
  if (!matchId) throw new Error('matchId required');
  const m = getIplSrlMatchById(matchId);
  if (!m) throw new Error(`Match not found: ${matchId}`);
  const session = getSrlOperatorSession(matchId);
  const names = (players.length
    ? players
    : [
      ...(session.lineup?.homePlayingXI || getSrlPlayingXINames(m.team1?.key)).slice(0, 3),
      ...(session.lineup?.awayPlayingXI || getSrlPlayingXINames(m.team2?.key)).slice(0, 3),
    ]).map((n) => String(n).trim()).filter(Boolean).slice(0, 8);

  if (!names.length) throw new Error('No players available for props');

  if (!Array.isArray(session.microMarkets)) session.microMarkets = [];
  const created = [];
  for (const name of names) {
    const marketId = `player_${propType}_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
    const existing = session.microMarkets.find((x) => x.marketId === marketId);
    if (existing) {
      existing.status = 'OPEN';
      created.push(existing);
      continue;
    }
    const row = {
      marketId,
      marketType: propType.toUpperCase(),
      name: propType === 'sixes' ? `${name} — Sixes O/U 1.5` : `${name} — Top batter candidate`,
      player: name,
      status: 'OPEN',
      openedAt: Date.now(),
      admin,
      selections: propType === 'sixes'
        ? [
          { selectionId: `${marketId}_over`, name: 'Over 1.5', odds: 1.9 },
          { selectionId: `${marketId}_under`, name: 'Under 1.5', odds: 1.9 },
        ]
        : [
          { selectionId: `${marketId}_yes`, name: 'Yes', odds: 3.5 },
          { selectionId: `${marketId}_no`, name: 'No', odds: 1.3 },
        ],
    };
    session.microMarkets.push(row);
    created.push(row);
  }
  queuePersist(session);
  void auditPush('Player Props Opened', `${matchId} · ${created.length} · ${propType}`, { admin });
  return { success: true, matchId, propType, markets: created };
}

export function pushSrlMatchBanner(matchId, {
  preset = 'TOSS_LIVE',
  text = null,
  admin = 'admin',
} = {}) {
  if (!matchId) throw new Error('matchId required');
  const m = getIplSrlMatchById(matchId);
  if (!m) throw new Error(`Match not found: ${matchId}`);
  const session = getSrlOperatorSession(matchId);
  const cfg = SRL_BANNER_PRESETS[preset] || null;
  const body = text
    || (cfg ? cfg.build(m, session.toss || m.toss, m.liveDetails || {}) : null);
  if (!body) throw new Error('Banner text or preset required');
  const banner = {
    type: cfg?.type || 'CUSTOM',
    text: body,
    at: Date.now(),
    admin,
  };
  matchBanners.set(String(matchId), banner);
  session.userBanner = banner;
  setSrlCustomCommentary(matchId, { text: body, eventTag: banner.type });
  queuePersist(session);
  pushSrlDeskAlert(matchId, {
    level: 'info',
    code: 'USER_BANNER',
    message: body,
  });
  return { success: true, banner };
}

export function getSrlMatchBanner(matchId) {
  const session = getSrlOperatorSession(matchId);
  return session.userBanner || matchBanners.get(String(matchId)) || null;
}

export async function getSrlPublicPreviewParity(matchId) {
  const { getIPLSRLPublicPreview, getIPLSRLMatchMarkets } = await import('./iplSrlAdminControl.mjs');
  const deskMatch = getIplSrlMatchById(matchId);
  if (!deskMatch) throw new Error(`Match not found: ${matchId}`);
  const publicMatch = redactSrlTossForPublic({ ...deskMatch }, Date.now());
  const deskPreview = getIPLSRLPublicPreview(matchId);
  const publicPreview = {
    ...deskPreview,
    toss: publicMatch.toss,
    commentary: publicMatch.liveDetails?.commentary || deskPreview.commentary,
    banner: getSrlMatchBanner(matchId),
  };
  let deskMarkets = [];
  let publicMarkets = [];
  try {
    const mk = await getIPLSRLMatchMarkets(matchId);
    deskMarkets = (mk.markets || []).slice(0, 12).map((x) => ({
      marketId: x.marketId,
      status: x.status,
      name: x.name,
    }));
    // Public view redacts toss settlement leakage before T-25
    const tossVisible = isSrlTossVisibleToUsers(deskMatch);
    publicMarkets = deskMarkets.map((x) => {
      if (!tossVisible && /toss|bat_first/i.test(x.marketId) && x.status === 'SETTLED') {
        return { ...x, status: 'SUSPENDED', redacted: true };
      }
      return x;
    });
  } catch {
    // ignore
  }
  return {
    matchId,
    tossVisibleToUsers: isSrlTossVisibleToUsers(deskMatch),
    publicRevealAt: srlTossPublicRevealAt(deskMatch.startTime),
    desk: { preview: deskPreview, markets: deskMarkets, toss: deskMatch.toss },
    public: { preview: publicPreview, markets: publicMarkets, toss: publicMatch.toss },
    diffs: {
      tossHidden: !!(deskMatch.toss && !publicMatch.toss),
      commentaryDiffers: String(deskPreview.commentary || '') !== String(publicPreview.commentary || ''),
    },
  };
}

export function updateSrlMatchSquad(matchId, {
  teamId,
  squad15 = [],
  impactPlayer = null,
  admin = 'admin',
} = {}) {
  if (!matchId) throw new Error('matchId required');
  const m = getIplSrlMatchById(matchId);
  if (!m) throw new Error(`Match not found: ${matchId}`);
  const names = (Array.isArray(squad15) ? squad15 : String(squad15).split(','))
    .map((n) => String(n).trim())
    .filter(Boolean)
    .slice(0, 15);
  if (names.length < 11) throw new Error('Need at least 11 players for Playing XI');
  const playingXI = names.slice(0, 11);
  const impact = impactPlayer || names[11] || null;
  const isHome = teamId === m.team1?.key;
  const result = setSrlTossAndLineup(matchId, isHome
    ? { homePlayingXI: playingXI, homeImpactPlayer: impact }
    : { awayPlayingXI: playingXI, awayImpactPlayer: impact });
  const session = getSrlOperatorSession(matchId);
  if (!session.squads) session.squads = {};
  session.squads[teamId] = { squad15: names, impact, updatedAt: Date.now(), admin };
  queuePersist(session);
  void auditPush('Squad Updated', `${matchId} · ${teamId} · ${names.length}`, { admin });
  return { success: true, teamId, playingXI, impact, squad15: names, lineup: result.lineup };
}

export function getSrlHighlightsReel(matchId, { lastOvers = 6 } = {}) {
  if (!matchId) throw new Error('matchId required');
  const m = getIplSrlMatchById(matchId);
  if (!m) throw new Error(`Match not found: ${matchId}`);
  const deliveries = getSrlReplayLog(matchId);
  const wickets = deliveries.filter((d) => d.wicket);
  const boundaries = deliveries.filter((d) => Number(d.runs) >= 4);
  const oversWanted = Math.max(1, Math.min(20, Number(lastOvers) || 6));
  const maxOver = deliveries.reduce((n, d) => Math.max(n, Number(d.overNumber) || 0), 0);
  const fromOver = Math.max(0, maxOver - oversWanted + 1);
  const recent = deliveries.filter((d) => (Number(d.overNumber) || 0) >= fromOver);
  const lines = [
    `*OddsYra SRL Highlights*`,
    `${m.team1?.shortName || '?'} vs ${m.team2?.shortName || '?'}`,
    `Last ${oversWanted} overs · ${recent.length} balls`,
    '',
    ...recent.slice(-36).map((d) => {
      const tag = d.wicket ? 'W' : (d.runs >= 6 ? '6' : d.runs >= 4 ? '4' : String(d.runs ?? 0));
      return `• ${d.overNumber}.${d.ballInOver} ${d.batsman || 'Batter'} vs ${d.bowler || 'Bowler'} → ${tag}${d.commentary ? ` — ${d.commentary}` : ''}`;
    }),
    '',
    `Wickets: ${wickets.length} · Boundaries: ${boundaries.length}`,
  ];
  return {
    matchId,
    fixture: `${m.team1?.shortName} vs ${m.team2?.shortName}`,
    wickets: wickets.length,
    boundaries: boundaries.length,
    recentBalls: recent.length,
    whatsappText: lines.join('\n'),
    deliveries: recent.slice(-40),
  };
}

export async function dryRunSrlSettlement(matchId, {
  winningTeamId = null,
  phase = 'match_winner',
} = {}) {
  if (!matchId) throw new Error('matchId required');
  const m = getIplSrlMatchById(matchId);
  if (!m) throw new Error(`Match not found: ${matchId}`);
  const winner = winningTeamId || m.sim?.winner || m.liveDetails?.winnerKey || m.team1?.key;
  const { query } = await import('../db/pg.js').catch(() => ({ query: null }));
  let rows = [];
  if (query) {
    try {
      const res = await query(
        `SELECT bet_id, user_id, market_id, selection_id, stake,
                COALESCE(potential_payout, stake * odds, 0)::float AS payout, odds, status
         FROM bets
         WHERE match_id = $1
           AND UPPER(COALESCE(status, '')) IN ('ACCEPTED', 'PENDING', 'OPEN')`,
        [String(matchId)],
      );
      rows = res.rows || [];
    } catch {
      rows = [];
    }
  }

  const marketFilter = phase === 'toss'
    ? (id) => /toss|bat_first/i.test(id)
    : phase === 'innings1'
      ? (id) => /i1_|innings_1|first_innings/i.test(id)
      : (id) => /match_winner|winner/i.test(id);

  const relevant = rows.filter((r) => marketFilter(String(r.market_id || '')));
  const winners = [];
  const losers = [];
  for (const r of relevant) {
    const sel = String(r.selection_id || '');
    const won = phase === 'match_winner'
      ? sel === winner || sel.includes(String(winner))
      : false;
    const entry = {
      betId: r.bet_id,
      userId: r.user_id,
      marketId: r.market_id,
      selectionId: r.selection_id,
      stake: Number(r.stake) || 0,
      payout: Number(r.payout) || 0,
    };
    if (won) winners.push(entry);
    else losers.push(entry);
  }

  const payTotal = winners.reduce((n, w) => n + w.payout, 0);
  const takeTotal = losers.reduce((n, w) => n + w.stake, 0);
  return {
    dryRun: true,
    matchId,
    phase,
    assumedWinner: winner,
    openBets: relevant.length,
    winners: winners.slice(0, 50),
    losersCount: losers.length,
    winnersCount: winners.length,
    projectedPayout: payTotal,
    projectedRetain: takeTotal,
    projectedHousePnl: takeTotal - (payTotal - winners.reduce((n, w) => n + w.stake, 0)),
    note: 'No bets were settled — preview only.',
  };
}

export async function runSrlRegressionPack(admin = 'SYSTEM') {
  const results = [];
  const pass = (id, ok, detail) => results.push({ id, ok: !!ok, detail });

  try {
    const { SRL_TOSS_PUBLIC_LEAD_MS: lead } = await import('./iplSrlSimulator.mjs');
    pass('toss_lead_ms', lead === 25 * 60 * 1000, `lead=${lead}`);
  } catch (err) {
    pass('toss_lead_ms', false, err.message);
  }

  try {
    const desk = getIplSrlDeskMatches();
    const sample = desk.find((m) => m.matchState === 'pre' && m.team1?.key !== 'tbd') || desk[0];
    if (!sample) throw new Error('no matches');
    const early = Number(sample.startTime) - SRL_TOSS_PUBLIC_LEAD_MS - 60_000;
    const visibleEarly = isSrlTossVisibleToUsers(sample, early);
    const atReveal = isSrlTossVisibleToUsers(sample, Number(sample.startTime) - SRL_TOSS_PUBLIC_LEAD_MS + 1000);
    pass('toss_t25_gate', !visibleEarly && atReveal, `early=${visibleEarly} reveal=${atReveal}`);

    const checklist = getSrlMatchChecklist(sample.id);
    pass('checklist', checklist.steps.length === 6, `steps=${checklist.steps.length}`);

    const squad = getSrlFullSquadNames(sample.team1?.key);
    pass('squad15', squad.squad15.length === 15, `n=${squad.squad15.length}`);

    const heat = await getSrlBookHeatMap(sample.id);
    pass('book_heat', !!heat.families, 'families ok');

    const parity = await getSrlPublicPreviewParity(sample.id);
    pass('preview_parity', parity.desk && parity.public, 'desk/public present');

    const dry = await dryRunSrlSettlement(sample.id, { winningTeamId: sample.team1?.key });
    pass('settle_dry_run', dry.dryRun === true, dry.note);

    const highlights = getSrlHighlightsReel(sample.id);
    pass('highlights', typeof highlights.whatsappText === 'string', `chars=${highlights.whatsappText.length}`);
  } catch (err) {
    pass('pack_sample', false, err.message);
  }

  const ok = results.every((r) => r.ok);
  void auditPush('Regression Pack', `${ok ? 'PASS' : 'FAIL'} · ${results.length} checks`, { admin });
  return { ok, ranAt: Date.now(), results };
}

export { SRL_TOSS_PUBLIC_LEAD_MS };
