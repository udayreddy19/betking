import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import { useAdminToast } from '../components/AdminToastContext';
import AdminConfirmDialog from '../components/AdminConfirmDialog';
import { startVisibleInterval } from '../utils/visibleInterval';
import './IPLSRLConsoleView.css';

const TABS = [
  { id: 'desk', label: 'Match Desk' },
  { id: 'teams', label: 'Teams' },
  { id: 'players', label: 'Players' },
  { id: 'audit', label: 'Audit' },
];

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'league', label: 'League' },
  { id: 'playoffs', label: 'Playoffs' },
  { id: 'live', label: 'Live' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'done', label: 'Completed' },
];

const MATCH_ZONES = [
  { id: 'control', label: '⚡ Control' },
  { id: 'godmode', label: '🎯 God Mode' },
  { id: 'risk', label: '🛡️ Risk' },
  { id: 'weather', label: '🌧️ Weather' },
  { id: 'broadcast', label: '📢 Broadcast' },
  { id: 'markets', label: '📊 Markets' },
];

const PHASE_LABEL = {
  pre: 'Pre-match',
  first: '1st innings',
  break: 'Innings break',
  chase: '2nd innings',
  done: 'Finished',
};

function pillClass(value) {
  const v = String(value || '').toUpperCase();
  if (v === 'LIVE') return 'srl-pill srl-pill-live';
  if (v === 'COMPLETED') return 'srl-pill srl-pill-completed';
  if (v === 'PAUSED' || v === 'READY' || v === 'ARMED') return 'srl-pill srl-pill-paused';
  return 'srl-pill srl-pill-muted';
}

function StatusPill({ value }) {
  return <span className={pillClass(value)}>{String(value || '—').toUpperCase()}</span>;
}

function Panel({ title, hint, children }) {
  return (
    <section className="srl-panel">
      <div className="srl-panel-head">
        <h3>{title}</h3>
        {hint && <span className="srl-hint">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function formatClock(ms) {
  const total = Math.max(0, Math.round(Number(ms) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatInr(amount) {
  const n = Number(amount) || 0;
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function fixtureFilter(m, filter) {
  if (filter === 'league') return !m.playoff;
  if (filter === 'playoffs') return !!m.playoff;
  if (filter === 'live') return m.controlStatus === 'LIVE' || m.controlStatus === 'PAUSED';
  if (filter === 'upcoming') return m.controlStatus === 'READY' || m.controlStatus === 'ARMED';
  if (filter === 'done') return m.controlStatus === 'COMPLETED';
  return true;
}

function declarePreview(match, teamId) {
  const book = match?.book || {};
  const home = book.home || { stake: 0, payout: 0, bets: 0 };
  const away = book.away || { stake: 0, payout: 0, bets: 0 };
  const other = book.other || { stake: 0, payout: 0, bets: 0 };
  const isHome = teamId === match.homeTeamId;
  const payout = isHome ? home.payout : away.payout;
  const total = Number(book.totalStake) || (home.stake + away.stake + other.stake);
  const house = total - payout;
  const short = isHome ? match.homeShort : match.awayShort;
  return {
    teamId,
    short,
    payout,
    house,
    total,
    bets: isHome ? home.bets : away.bets,
    heavier: book.heavier === (isHome ? 'home' : 'away'),
  };
}

function pickDefaultMatchId(matches) {
  return matches.find((m) => m.controlStatus === 'LIVE' || m.controlStatus === 'PAUSED')?.matchId
    || matches.find((m) => m.controlStatus === 'READY' || m.controlStatus === 'ARMED')?.matchId
    || matches[0]?.matchId
    || null;
}

/* ═══════════════════════════════════════════════════════════════════════════
   SCOREBOARD HERO — always visible at top of cockpit
   ═══════════════════════════════════════════════════════════════════════════ */
function ScoreboardHero({ match }) {
  if (!match) return null;
  const s = match.score || {};
  const i1 = s.innings1 || {};
  const i2 = s.innings2 || {};
  const clock = match.clock || {};
  const isLive = match.controlStatus === 'LIVE';

  return (
    <div className="srl-scoreboard-hero">
      <div className="srl-score-team">
        <span className="srl-score-team-name">{match.homeShort}</span>
        <span className="srl-score-runs">{i1.runs || 0}/{i1.wickets || 0}</span>
        <span className="srl-score-overs">{i1.overs || '0.0'} ov</span>
      </div>

      <div className="srl-score-divider">
        <span className="srl-score-vs">vs</span>
        <span className={`srl-phase-pill ${isLive ? 'is-live' : match.controlStatus === 'COMPLETED' ? 'is-completed' : 'is-pre'}`}>
          {isLive && <span className="srl-live-dot" style={{ marginRight: 6 }} />}
          {PHASE_LABEL[clock.phase] || match.controlStatus}
        </span>
        {s.target > 0 && <span className="srl-score-target">T {s.target}</span>}
      </div>

      <div className="srl-score-team">
        <span className="srl-score-team-name">{match.awayShort}</span>
        <span className="srl-score-runs">{i2.runs || 0}/{i2.wickets || 0}</span>
        <span className="srl-score-overs">{i2.overs || '0.0'} ov</span>
      </div>

      <div className="srl-score-meta-row" style={{ gridColumn: '1 / -1' }}>
        <span>{match.venue} · {match.speed}</span>
        <span>
          Open: <strong>{formatInr(match.book?.totalStake)}</strong>
          {' · '}{(match.book?.home?.bets || 0) + (match.book?.away?.bets || 0) + (match.book?.other?.bets || 0)} bets
        </span>
        {match.commentary && (
          <span style={{ fontStyle: 'italic', color: 'var(--srl-accent)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {match.commentary}
          </span>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */
export default function IPLSRLConsoleView() {
  const { showToast } = useAdminToast();
  const [tab, setTab] = useState('desk');
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [snap, setSnap] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedMatchId, setSelectedMatchId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dragMs, setDragMs] = useState(null);
  const [jumpNo, setJumpNo] = useState('1');
  const [jumpAt, setJumpAt] = useState('live');
  const [declareAsk, setDeclareAsk] = useState(null);
  const [marketAsk, setMarketAsk] = useState(null);
  const [marketsDesk, setMarketsDesk] = useState(null);
  const [marketsLoading, setMarketsLoading] = useState(false);
  const [marketsError, setMarketsError] = useState(null);
  const [marketFilter, setMarketFilter] = useState('all');
  const [targetInput, setTargetInput] = useState('');
  const [oversReductionInput, setOversReductionInput] = useState('12');
  const [commentaryText, setCommentaryText] = useState('');
  const [commentaryTag, setCommentaryTag] = useState('DRS_REVIEW');
  const [marginBump, setMarginBump] = useState('0.05');
  const [spreadBias, setSpreadBias] = useState('0.00');
  const [showExhibitionModal, setShowExhibitionModal] = useState(false);
  const [exhibitionHome, setExhibitionHome] = useState('csk');
  const [exhibitionAway, setExhibitionAway] = useState('mi');
  const [exhibitionVenue, setExhibitionVenue] = useState('Wankhede Arena');
  const [exhibitionPitch, setExhibitionPitch] = useState('BALANCED');
  const [matchZone, setMatchZone] = useState('control');
  const draggingRef = useRef(false);

  const applySnap = useCallback((data) => {
    setSnap(data);
    setSelectedMatchId((prev) => {
      if (prev && data.matches?.some((m) => m.matchId === prev)) return prev;
      return pickDefaultMatchId(data.matches || []);
    });
  }, []);

  const refresh = useCallback(() => {
    return adminApiClient.get('/iplsrl/control')
      .then((data) => {
        applySnap(data);
        setError(null);
      })
      .catch((err) => setError(err.message || 'Failed to load SRL control desk'));
  }, [applySnap]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    refresh().finally(() => { if (!cancelled) setLoading(false); });
    const stop = startVisibleInterval(() => { refresh().catch(() => {}); }, 2500, { runImmediately: false });
    return () => {
      cancelled = true;
      stop();
    };
  }, [refresh]);

  useEffect(() => {
    setDragMs(null);
  }, [selectedMatchId]);

  useEffect(() => {
    if (!selectedMatchId) {
      setMarketsDesk(null);
      setMarketsError(null);
      return undefined;
    }
    let cancelled = false;
    const loadMarkets = () => {
      setMarketsLoading(true);
      adminApiClient.get(`/iplsrl/matches/${encodeURIComponent(selectedMatchId)}/markets`)
        .then((data) => {
          if (cancelled) return;
          setMarketsDesk(data);
          setMarketsError(null);
        })
        .catch((err) => {
          if (cancelled) return;
          setMarketsError(err.message || 'Failed to load markets');
        })
        .finally(() => {
          if (!cancelled) setMarketsLoading(false);
        });
    };
    loadMarkets();
    const stop = startVisibleInterval(loadMarkets, 5000, { runImmediately: false });
    return () => {
      cancelled = true;
      stop();
    };
  }, [selectedMatchId]);

  const visibleMarkets = useMemo(() => {
    const list = marketsDesk?.markets || [];
    if (marketFilter === 'open') {
      return list.filter((m) => String(m.status || '').toUpperCase() === 'OPEN' || (m.book?.bets || 0) > 0);
    }
    if (marketFilter === 'staked') return list.filter((m) => (m.book?.bets || 0) > 0);
    if (marketFilter === 'locked') {
      return list.filter((m) => ['SUSPENDED', 'DETERMINED', 'VOID', 'VOIDED', 'SETTLED'].includes(String(m.status || '').toUpperCase()));
    }
    if (marketFilter === 'toss') {
      return list.filter((m) => /toss|bat_first/i.test(`${m.marketId} ${m.title || ''} ${m.name || ''}`));
    }
    if (marketFilter === 'winner') {
      return list.filter((m) => /match_winner|winner|most_|top_|h2h/i.test(String(m.marketId || '')));
    }
    if (marketFilter === 'totals') {
      return list.filter((m) => /total|range|btts|fours|sixes|wickets|ladder/i.test(String(m.marketId || '')));
    }
    if (marketFilter === 'innings') {
      return list.filter((m) => /^i[12]_/i.test(String(m.marketId || '')) || /innings|team_total|over_|delivery|wicket_in|dismissal/i.test(String(m.marketId || '')));
    }
    return list;
  }, [marketsDesk, marketFilter]);

  const selected = useMemo(
    () => snap?.matches?.find((m) => m.matchId === selectedMatchId) || null,
    [snap, selectedMatchId],
  );

  const counts = useMemo(() => {
    const matches = snap?.matches || [];
    return {
      all: matches.length,
      league: matches.filter((m) => fixtureFilter(m, 'league')).length,
      playoffs: matches.filter((m) => fixtureFilter(m, 'playoffs')).length,
      live: matches.filter((m) => fixtureFilter(m, 'live')).length,
      upcoming: matches.filter((m) => fixtureFilter(m, 'upcoming')).length,
      done: matches.filter((m) => fixtureFilter(m, 'done')).length,
    };
  }, [snap]);

  const fixtures = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (snap?.matches || []).filter((m) => {
      if (!fixtureFilter(m, filter)) return false;
      if (!q) return true;
      const hay = [
        m.matchNo, m.stageLabel, m.homeShort, m.awayShort, m.homeTeam, m.awayTeam, m.matchId,
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [snap, filter, query]);

  const clock = selected?.clock || {};
  const durationMs = Math.max(1, Number(clock.durationMs) || 1);
  const elapsedMs = dragMs != null ? dragMs : Number(clock.elapsedMs) || 0;
  const seasonClock = snap?.seasonClock || {};

  useEffect(() => {
    if (selected?.matchNo) setJumpNo(String(selected.matchNo));
  }, [selectedMatchId, selected?.matchNo]);

  const run = async (fn, okMsg) => {
    setBusy(true);
    try {
      const data = await fn();
      if (data?.matches || data?.settings) applySnap(data);
      else if (data?.snapshot) applySnap(data.snapshot);
      else await refresh();
      if (data?.matchId && Array.isArray(data.markets)) setMarketsDesk(data);
      else if (data?.markets?.matchId && Array.isArray(data.markets.markets)) setMarketsDesk(data.markets);
      else if (selectedMatchId) {
        try {
          const md = await adminApiClient.get(`/iplsrl/matches/${encodeURIComponent(selectedMatchId)}/markets`);
          setMarketsDesk(md);
        } catch {
          // keep previous markets desk
        }
      }
      if (okMsg) {
        const board = data?.play?.scoreDisplay ? ` · board ${data.play.scoreDisplay}` : '';
        showToast(`${okMsg}${board}`, 'success');
      }
    } catch (err) {
      showToast(err.message || 'Action failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const seek = (body, msg) => run(
    () => adminApiClient.post('/iplsrl/matches/seek', { matchId: selected.matchId, ...body }),
    msg,
  );

  const commitSeek = (ms, pause) => {
    setDragMs(null);
    seek({ elapsedMs: ms, pause }, 'Clock updated');
  };

  if (loading && !snap) {
    return <div style={{ padding: 40, color: 'var(--admin-text-muted)' }}>Loading OddsYra SRL console…</div>;
  }

  /* ─── RENDER ─── */
  return (
    <div className="srl-console">
      {/* ═══ HERO ═══ */}
      <div className="srl-console-hero">
        <div>
          <p className="srl-console-kicker">Sports · OddsYra SRL</p>
          <h2>Match Control</h2>
          <p>
            Institutional-grade match control cockpit. Select a fixture, manage live play, inject incidents,
            defend margins, and settle markets — all from one screen.
          </p>
          {error && <p className="srl-console-error">{error}</p>}
        </div>
        <div className="srl-console-stats">
          <div className="srl-stat"><strong>{counts.all}</strong><span>Matches</span></div>
          <div className="srl-stat"><strong>{counts.live}</strong><span>Live</span></div>
          <div className="srl-stat"><strong>{counts.upcoming}</strong><span>Upcoming</span></div>
          <div className="srl-stat"><strong>{counts.done}</strong><span>Done</span></div>
        </div>
      </div>

      {/* ═══ TOP TABS ═══ */}
      <div className="srl-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`srl-tab${tab === t.id ? ' is-on' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══════════════ MATCH DESK ═══════════════ */}
      {tab === 'desk' && snap && (
        <div className="srl-desk">
          {/* ─── LEFT RAIL: Season + Fixtures ─── */}
          <div className="srl-stack">
            <Panel title="Season" hint={`${snap.season?.name || 'Season'} · Ed ${snap.season?.edition || '—'}`}>
              <div className="srl-settings">
                <label className="srl-field">
                  Speed
                  <select
                    value={snap.settings.speed}
                    disabled={busy}
                    onChange={(e) => run(() => adminApiClient.post('/iplsrl/settings', { speed: e.target.value }), `Speed → ${e.target.value}`)}
                  >
                    {(snap.options?.speeds || []).map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <label className="srl-field">
                  Pitch
                  <select
                    value={snap.settings.pitch}
                    disabled={busy}
                    onChange={(e) => run(() => adminApiClient.post('/iplsrl/settings', { pitch: e.target.value }), 'Pitch updated')}
                  >
                    {(snap.options?.pitches || []).map((s) => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}
                  </select>
                </label>
                <label className="srl-field">
                  Weather
                  <select
                    value={snap.settings.weather}
                    disabled={busy}
                    onChange={(e) => run(() => adminApiClient.post('/iplsrl/settings', { weather: e.target.value }), 'Weather updated')}
                  >
                    {(snap.options?.weather || []).map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
              </div>
              <label className="srl-check">
                <input
                  type="checkbox"
                  checked={!!snap.settings.autoPlay}
                  disabled={busy}
                  onChange={(e) => run(() => adminApiClient.post('/iplsrl/settings', { autoPlay: e.target.checked }), e.target.checked ? 'Auto-play on' : 'Auto-play off')}
                />
                Auto-play after manual start
              </label>
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="srl-btn srl-btn-blue"
                  style={{ flex: 1 }}
                  disabled={busy}
                  onClick={() => setShowExhibitionModal(true)}
                >
                  ➕ Exhibition Match
                </button>
              </div>
            </Panel>

            <Panel title="Season clock" hint={seasonClock.jumped ? 'Offset' : 'Wall clock'}>
              <p className="srl-hint" style={{ margin: '0 0 8px' }}>
                {seasonClock.label || 'Wall clock'}
                {seasonClock.jumped ? ' · users see this time' : ''}
              </p>
              <div className="srl-jump">
                <label className="srl-field">
                  Match #
                  <input
                    className="srl-input"
                    type="number"
                    min={1}
                    max={74}
                    value={jumpNo}
                    disabled={busy}
                    onChange={(e) => setJumpNo(e.target.value)}
                  />
                </label>
                <label className="srl-field">
                  Land at
                  <select
                    className="srl-input"
                    value={jumpAt}
                    disabled={busy}
                    onChange={(e) => setJumpAt(e.target.value)}
                  >
                    <option value="start">Before toss</option>
                    <option value="live">In play</option>
                    <option value="end">Result in</option>
                  </select>
                </label>
                <button
                  type="button"
                  className="srl-btn srl-btn-blue"
                  disabled={busy}
                  onClick={() => run(
                    () => adminApiClient.post('/iplsrl/season/jump', { matchNo: Number(jumpNo), at: jumpAt }),
                    `Season jumped to match #${jumpNo}`,
                  )}
                >
                  Jump
                </button>
                <button
                  type="button"
                  className="srl-btn srl-btn-slate"
                  disabled={busy || !seasonClock.jumped}
                  onClick={() => run(
                    () => adminApiClient.post('/iplsrl/season/reset-clock'),
                    'Season back on wall clock',
                  )}
                >
                  Real time
                </button>
              </div>
            </Panel>

            <Panel title="Fixtures" hint={`${fixtures.length} of ${counts.all}`}>
              <div className="srl-filters" style={{ marginBottom: 8 }}>
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={`srl-filter${filter === f.id ? ' is-on' : ''}`}
                    onClick={() => setFilter(f.id)}
                  >
                    {f.label} · {counts[f.id]}
                  </button>
                ))}
              </div>
              <label className="srl-field srl-fixture-search">
                Search
                <input
                  type="search"
                  value={query}
                  placeholder="Team, #, Qualifier…"
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <div className="srl-fixture-list">
                {fixtures.map((m) => (
                  <button
                    key={m.matchId}
                    type="button"
                    className={`srl-fixture${selectedMatchId === m.matchId ? ' is-on' : ''}${m.playoff ? ' is-playoff' : ''}${m.bettingClosed ? ' is-closed' : ''}`}
                    onClick={() => setSelectedMatchId(m.matchId)}
                  >
                    <div className="srl-fixture-top">
                      <strong>
                        {m.matchNo ? `#${m.matchNo} ` : ''}
                        {m.homeShort} vs {m.awayShort}
                      </strong>
                      <StatusPill value={m.bettingClosed ? 'BET OFF' : m.controlStatus} />
                    </div>
                    <div className="srl-fixture-meta">
                      {m.stageLabel || 'League'} · {m.date} · {m.timeDisplay || '—'}
                    </div>
                    <div className="srl-fixture-note" style={{ color: m.forcedWinnerName ? '#34d399' : undefined }}>
                      {m.controlStatus === 'COMPLETED'
                        ? (m.score?.result || 'Completed')
                        : m.forcedWinnerName
                          ? `Scripted: ${m.forcedWinnerName}`
                          : `${m.score?.innings1?.runs || 0}/${m.score?.innings1?.wickets || 0} → ${m.score?.innings2?.runs || 0}/${m.score?.innings2?.wickets || 0}`}
                    </div>
                    <div className="srl-progress-mini" aria-hidden="true">
                      <i style={{ width: `${Math.max(0, Math.min(100, m.clock?.progressPct || 0))}%` }} />
                    </div>
                  </button>
                ))}
                {!fixtures.length && (
                  <p className="srl-hint" style={{ margin: 0 }}>No fixtures in this filter.</p>
                )}
              </div>
            </Panel>
          </div>

          {/* ─── RIGHT: Match Cockpit ─── */}
          <div className="srl-stack">
            {!selected ? (
              <Panel title="Select a match" hint="Pick a fixture from the rail">
                <p className="srl-hint" style={{ margin: 0 }}>Select a fixture to open the cockpit.</p>
              </Panel>
            ) : (
              <>
                {/* Scoreboard Hero — always visible */}
                <ScoreboardHero match={selected} />

                {/* Match Zone Tabs */}
                <div className="srl-match-tabs">
                  {MATCH_ZONES.map((z) => (
                    <button
                      key={z.id}
                      type="button"
                      className={`srl-match-tab${matchZone === z.id ? ' is-on' : ''}`}
                      onClick={() => setMatchZone(z.id)}
                    >
                      {z.label}
                    </button>
                  ))}
                </div>

                {/* ═══ ZONE: CONTROL ═══ */}
                {matchZone === 'control' && (
                  <div className="srl-tab-body" key="control">
                    {/* Timeline */}
                    <div className="srl-timeline">
                      <div className="srl-timeline-top">
                        <span>{PHASE_LABEL[clock.phase] || 'Clock'}</span>
                        <span>{formatClock(elapsedMs)} / {formatClock(durationMs)}</span>
                      </div>
                      <input
                        className="srl-slider"
                        type="range"
                        min={0}
                        max={Math.max(1, durationMs - 1)}
                        step={Math.max(1000, Number(clock.msPerBall) || 1000)}
                        value={Math.min(elapsedMs, durationMs - 1)}
                        disabled={busy || selected.controlStatus === 'COMPLETED'}
                        onPointerDown={() => {
                          draggingRef.current = true;
                          setDragMs(elapsedMs);
                        }}
                        onChange={(e) => setDragMs(Number(e.target.value))}
                        onPointerUp={(e) => {
                          if (!draggingRef.current) return;
                          draggingRef.current = false;
                          commitSeek(Number(e.currentTarget.value), selected.controlStatus === 'PAUSED');
                        }}
                      />
                      <div className="srl-markers">
                        <button type="button" className="srl-chip" disabled={busy || !selected.canSeek} onClick={() => seek({ marker: 'over_back', pause: true }, 'Rewound one over')}>−1 over</button>
                        <button type="button" className="srl-chip" disabled={busy || !selected.canSeek} onClick={() => seek({ marker: 'ball' }, 'Advanced one ball')}>+1 ball</button>
                        <button type="button" className="srl-chip" disabled={busy || !selected.canSeek} onClick={() => seek({ marker: 'over' }, 'Skipped one over')}>+1 over</button>
                        <button type="button" className="srl-chip" disabled={busy || !selected.canSeek} onClick={() => seek({ marker: 'innings_break', pause: true }, 'Jumped to innings break')}>Innings break</button>
                        <button type="button" className="srl-chip" disabled={busy || !selected.canSeek} onClick={() => seek({ marker: 'second_innings' }, 'Opened 2nd innings')}>2nd innings</button>
                        <button type="button" className="srl-chip" disabled={busy || !selected.canSeek} onClick={() => seek({ marker: 'finish', pause: true }, 'Jumped to the death')}>Death overs</button>
                      </div>
                    </div>

                    {/* Play controls */}
                    <div className="srl-zone" style={{ marginTop: 12 }}>
                      <div className="srl-zone-label --accent">Match Controls</div>
                      <div className="srl-actions">
                        <button
                          type="button"
                          className="srl-btn srl-btn-blue"
                          disabled={busy || selected.controlStatus === 'LIVE' || selected.controlStatus === 'COMPLETED'}
                          onClick={() => run(() => adminApiClient.post('/iplsrl/matches/start', { matchId: selected.matchId }), 'Match started for users')}
                        >
                          ▶ Start
                        </button>
                        {selected.canPause ? (
                          <button type="button" className="srl-btn srl-btn-orange" disabled={busy} onClick={() => run(() => adminApiClient.post('/iplsrl/matches/pause', { matchId: selected.matchId }), 'Paused')}>
                            ⏸ Pause
                          </button>
                        ) : (
                          <button type="button" className="srl-btn srl-btn-teal" disabled={busy || !selected.canResume} onClick={() => run(() => adminApiClient.post('/iplsrl/matches/resume', { matchId: selected.matchId }), 'Resumed')}>
                            ▶ Resume
                          </button>
                        )}
                        <select
                          className="srl-input"
                          value={selected.speed}
                          disabled={busy || selected.controlStatus === 'COMPLETED'}
                          onChange={(e) => run(() => adminApiClient.post('/iplsrl/matches/speed', { matchId: selected.matchId, speed: e.target.value }), `Speed ${e.target.value}`)}
                          style={{ height: 38, maxWidth: 120 }}
                        >
                          {(snap.options?.speeds || []).map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <button
                          type="button"
                          className="srl-btn srl-btn-violet"
                          disabled={busy}
                          onClick={() => run(() => adminApiClient.post('/iplsrl/matches/reset', { matchId: selected.matchId }), 'Returned to published clock')}
                        >
                          Reset to clock
                        </button>
                        <button
                          type="button"
                          className={`srl-btn ${selected.bettingClosed ? 'srl-btn-teal' : 'srl-btn-orange'}`}
                          disabled={busy || selected.controlStatus === 'COMPLETED'}
                          onClick={() => run(
                            () => adminApiClient.post('/iplsrl/matches/betting', {
                              matchId: selected.matchId,
                              closed: !selected.bettingClosed,
                            }),
                            selected.bettingClosed ? 'Betting opened' : 'Betting closed for users',
                          )}
                        >
                          {selected.bettingClosed ? '🟢 Open betting' : '🔴 Close betting'}
                        </button>
                      </div>
                    </div>

                    {/* Winner control */}
                    <div className="srl-winner" style={{ marginTop: 12 }}>
                      <div className="srl-winner-label">Winner control</div>
                      <div className="srl-actions" style={{ marginBottom: 8 }}>
                        <button
                          type="button"
                          className="srl-btn"
                          style={actionFill(selected.forcedWinnerTeamId === selected.homeTeamId)}
                          disabled={busy || selected.controlStatus === 'COMPLETED'}
                          onClick={() => run(
                            () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/force-winner`, { teamId: selected.homeTeamId }),
                            `${selected.homeShort} set to win`,
                          )}
                        >
                          Script {selected.homeShort}
                        </button>
                        <button
                          type="button"
                          className="srl-btn"
                          style={actionFill(selected.forcedWinnerTeamId === selected.awayTeamId)}
                          disabled={busy || selected.controlStatus === 'COMPLETED'}
                          onClick={() => run(
                            () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/force-winner`, { teamId: selected.awayTeamId }),
                            `${selected.awayShort} set to win`,
                          )}
                        >
                          Script {selected.awayShort}
                        </button>
                      </div>
                      {selected.forcedWinnerTeamId && selected.controlStatus !== 'COMPLETED' && (
                        <button
                          type="button"
                          className="srl-btn srl-btn-slate srl-btn-wide"
                          disabled={busy}
                          onClick={() => run(
                            () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/force-winner`, { teamId: null }),
                            'Winner cleared',
                          )}
                          style={{ marginBottom: 8 }}
                        >
                          Clear scripted winner
                        </button>
                      )}
                      <div className="srl-actions" style={{ marginBottom: 0 }}>
                        <button
                          type="button"
                          className="srl-btn srl-btn-amber"
                          disabled={busy || selected.controlStatus === 'COMPLETED'}
                          onClick={() => setDeclareAsk(declarePreview(selected, selected.homeTeamId))}
                        >
                          Declare {selected.homeShort} now
                        </button>
                        <button
                          type="button"
                          className="srl-btn srl-btn-amber"
                          disabled={busy || selected.controlStatus === 'COMPLETED'}
                          onClick={() => setDeclareAsk(declarePreview(selected, selected.awayTeamId))}
                        >
                          Declare {selected.awayShort} now
                        </button>
                      </div>
                    </div>

                    {/* Open stakes */}
                    <div className="srl-book" style={{ marginTop: 12 }}>
                      <div className="srl-winner-label" style={{ color: 'var(--srl-live)' }}>Open stakes · match winner</div>
                      <div className="srl-book-grid">
                        <div className={`srl-book-side${selected.book?.heavier === 'home' ? ' is-heavy' : ''}`}>
                          <span>{selected.homeShort}</span>
                          <strong>{formatInr(selected.book?.home?.stake)}</strong>
                          <em>{selected.book?.home?.bets || 0} bets · pays {formatInr(selected.book?.home?.payout)}</em>
                        </div>
                        <div className={`srl-book-side${selected.book?.heavier === 'away' ? ' is-heavy' : ''}`}>
                          <span>{selected.awayShort}</span>
                          <strong>{formatInr(selected.book?.away?.stake)}</strong>
                          <em>{selected.book?.away?.bets || 0} bets · pays {formatInr(selected.book?.away?.payout)}</em>
                        </div>
                      </div>
                      {selected.book?.other?.stake > 0 && (
                        <p className="srl-hint" style={{ margin: '8px 0 0' }}>
                          Other markets: {formatInr(selected.book.other.stake)} across {selected.book.other.bets} bets
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* ═══ ZONE: GOD MODE ═══ */}
                {matchZone === 'godmode' && (
                  <div className="srl-tab-body" key="godmode">
                    <div className="srl-zone">
                      <div className="srl-zone-label --warn" style={{ justifyContent: 'space-between' }}>
                        <span>⚡ Next-Ball Incident Injector</span>
                        {selected.incidentQueueLength > 0 && (
                          <span className="srl-pill srl-pill-live">
                            {selected.incidentQueueLength} armed
                          </span>
                        )}
                      </div>
                      <div className="srl-incident-grid">
                        {[
                          { type: 'WICKET', subType: 'Bowled', icon: '💥', label: 'Wicket (Bowled)', msg: '💥 Bowled Wicket injected!' },
                          { type: 'WICKET', subType: 'Caught Behind', icon: '🧤', label: 'Wicket (Caught)', msg: '🧤 Caught Wicket injected!' },
                          { type: 'SIX', icon: '🚀', label: 'Boundary SIX', msg: '🚀 Boundary SIX injected!' },
                          { type: 'FOUR', icon: '⚡', label: 'Boundary FOUR', msg: '⚡ Boundary FOUR injected!' },
                          { type: 'DOT', icon: '🎯', label: 'Dot Ball (0)', msg: '🎯 Dot Ball injected!' },
                          { type: 'WIDE', icon: '⚠️', label: 'Wide (+1)', msg: '⚠️ Wide (+1 extra) injected!' },
                          { type: 'NO_BALL', icon: '🚨', label: 'No Ball (+1)', msg: '🚨 No Ball (+1 & Free Hit) injected!' },
                        ].map((inc) => (
                          <button
                            key={`${inc.type}-${inc.subType || ''}`}
                            type="button"
                            className="srl-incident-btn"
                            disabled={busy || selected.controlStatus === 'COMPLETED'}
                            onClick={() => run(
                              () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/incident`, {
                                type: inc.type,
                                ...(inc.subType ? { subType: inc.subType } : {}),
                                instant: true,
                              }),
                              inc.msg,
                            )}
                          >
                            <span className="srl-incident-icon">{inc.icon}</span>
                            <span className="srl-incident-label">{inc.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="srl-zone">
                      <div className="srl-zone-label --accent">🎯 Pinpoint Chase Target & Tie Game</div>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <label className="srl-field" style={{ flex: 1, minWidth: 140 }}>
                          Chase Target
                          <input
                            type="number"
                            placeholder="e.g. 175"
                            value={targetInput}
                            onChange={(e) => setTargetInput(e.target.value)}
                            className="srl-input"
                            style={{ height: 36 }}
                          />
                        </label>
                        <button
                          type="button"
                          className="srl-btn srl-btn-teal"
                          style={{ height: 36 }}
                          disabled={busy || !targetInput}
                          onClick={() => run(
                            () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/target`, { target: Number(targetInput) }),
                            `Target pinned to ${targetInput}`,
                          )}
                        >
                          Set Target
                        </button>
                        <button
                          type="button"
                          className="srl-btn srl-btn-orange"
                          style={{ height: 36 }}
                          disabled={busy || selected.controlStatus === 'COMPLETED'}
                          onClick={() => run(
                            () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/tie-game`),
                            '⚔️ Match Anchored for Super Over!',
                          )}
                        >
                          ⚔️ Force Tie (Super Over)
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ═══ ZONE: RISK ═══ */}
                {matchZone === 'risk' && (
                  <div className="srl-tab-body" key="risk">
                    <div className="srl-radar-card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                        <div className="srl-zone-label --live" style={{ margin: 0 }}>
                          🛡️ Live Liability Radar
                        </div>
                        <span className={`srl-pill ${selected.book?.riskFlag === 'CRITICAL' ? 'srl-pill-completed' : (selected.book?.riskFlag === 'WARNING' ? 'srl-pill-paused' : 'srl-pill-live')}`}>
                          {selected.book?.riskFlag || 'BALANCED'}
                        </span>
                      </div>

                      <div className="srl-radar-stats">
                        <div className="srl-radar-stat-box">
                          <label>Home ({selected.homeShort}) Win P&L</label>
                          <strong style={{ color: (selected.book?.projectedPnlHome ?? 0) >= 0 ? '#10b981' : '#f87171' }}>
                            {(selected.book?.projectedPnlHome ?? 0) >= 0 ? '+' : ''}{formatInr(selected.book?.projectedPnlHome || 0)}
                          </strong>
                        </div>
                        <div className="srl-radar-stat-box">
                          <label>Away ({selected.awayShort}) Win P&L</label>
                          <strong style={{ color: (selected.book?.projectedPnlAway ?? 0) >= 0 ? '#10b981' : '#f87171' }}>
                            {(selected.book?.projectedPnlAway ?? 0) >= 0 ? '+' : ''}{formatInr(selected.book?.projectedPnlAway || 0)}
                          </strong>
                        </div>
                        <div className="srl-radar-stat-box">
                          <label>Worst-Case Liability</label>
                          <strong style={{ color: (selected.book?.worstCaseLiability ?? 0) > 20000 ? '#f59e0b' : 'var(--admin-text)' }}>
                            {formatInr(selected.book?.worstCaseLiability || 0)}
                          </strong>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <label className="srl-field" style={{ flex: 1, minWidth: 130 }}>
                          Margin Bump (+%)
                          <select
                            value={marginBump}
                            onChange={(e) => setMarginBump(e.target.value)}
                            className="srl-input"
                            style={{ height: 36 }}
                          >
                            <option value="0.00">+0% Standard</option>
                            <option value="0.03">+3% Defensive</option>
                            <option value="0.05">+5% High-Vol</option>
                            <option value="0.08">+8% Death Overs</option>
                            <option value="0.12">+12% Peak Risk</option>
                          </select>
                        </label>
                        <label className="srl-field" style={{ flex: 1, minWidth: 130 }}>
                          Spread Bias
                          <select
                            value={spreadBias}
                            onChange={(e) => setSpreadBias(e.target.value)}
                            className="srl-input"
                            style={{ height: 36 }}
                          >
                            <option value="0.00">Neutral (0.00)</option>
                            <option value="0.05">+{selected.homeShort} / -{selected.awayShort}</option>
                            <option value="-0.05">+{selected.awayShort} / -{selected.homeShort}</option>
                          </select>
                        </label>
                        <button
                          type="button"
                          className="srl-btn srl-btn-blue"
                          style={{ height: 36 }}
                          disabled={busy}
                          onClick={() => run(
                            () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/margin`, {
                              marginBump: Number(marginBump),
                              spreadBias: Number(spreadBias),
                            }),
                            'Margin defense updated',
                          )}
                        >
                          Apply Defense
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ═══ ZONE: WEATHER ═══ */}
                {matchZone === 'weather' && (
                  <div className="srl-tab-body" key="weather">
                    <div className="srl-zone">
                      <div className="srl-zone-label --info">🌧️ DLS Engine & Rain Delays</div>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className={`srl-btn ${selected.rainDelay ? 'srl-btn-teal' : 'srl-btn-orange'}`}
                          disabled={busy || selected.controlStatus === 'COMPLETED'}
                          onClick={() => run(
                            () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/rain-delay`, { isDelayed: !selected.rainDelay }),
                            selected.rainDelay ? 'Rain cleared · Match resumed' : 'Rain delay started · Betting held',
                          )}
                        >
                          {selected.rainDelay ? '☀️ Clear Rain Delay' : '🌧️ Start Rain Delay'}
                        </button>
                        <label className="srl-field" style={{ width: 130 }}>
                          Shorten Overs
                          <select
                            value={oversReductionInput}
                            onChange={(e) => setOversReductionInput(e.target.value)}
                            className="srl-input"
                            style={{ height: 36 }}
                          >
                            <option value="15">15 overs</option>
                            <option value="12">12 overs</option>
                            <option value="10">10 overs</option>
                            <option value="8">8 overs</option>
                            <option value="5">5 overs (Min)</option>
                          </select>
                        </label>
                        <button
                          type="button"
                          className="srl-btn srl-btn-blue"
                          style={{ height: 36 }}
                          disabled={busy || selected.controlStatus === 'COMPLETED'}
                          onClick={() => run(
                            () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/reduce-overs`, { overs: Number(oversReductionInput) }),
                            `Match reduced to ${oversReductionInput} overs (DLS recalculation applied)`,
                          )}
                        >
                          Apply DLS Reduction
                        </button>
                      </div>
                      {selected.dlsTarget && (
                        <p className="srl-hint" style={{ marginTop: 8, fontWeight: 700, color: 'var(--srl-accent-strong)', fontSize: '0.82rem' }}>
                          Revised DLS Target: {selected.dlsTarget}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* ═══ ZONE: BROADCAST ═══ */}
                {matchZone === 'broadcast' && (
                  <div className="srl-tab-body" key="broadcast">
                    <div className="srl-zone">
                      <div className="srl-zone-label --accent">📢 Broadcast Live Commentary</div>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <input
                          type="text"
                          placeholder="Type custom breaking commentary..."
                          value={commentaryText}
                          onChange={(e) => setCommentaryText(e.target.value)}
                          className="srl-input"
                          style={{ flex: 1, minWidth: 200, height: 36 }}
                        />
                        <button
                          type="button"
                          className="srl-btn srl-btn-blue"
                          style={{ height: 36 }}
                          disabled={busy || !commentaryText.trim()}
                          onClick={() => {
                            run(
                              () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/commentary`, { text: commentaryText, eventTag: commentaryTag }),
                              'Commentary broadcasted!',
                            );
                            setCommentaryText('');
                          }}
                        >
                          Broadcast
                        </button>
                      </div>
                      <div className="srl-tag-chips">
                        {['DRS_REVIEW', 'STRATEGIC_TIMEOUT', 'FREE_HIT', 'INJURY_STOPPAGE', 'GENERAL'].map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            className={`srl-tag-chip${commentaryTag === tag ? ' is-active' : ''}`}
                            onClick={() => setCommentaryTag(tag)}
                          >
                            {tag.replace('_', ' ')}
                          </button>
                        ))}
                      </div>
                    </div>

                    {selected.commentary && (
                      <div className="srl-zone" style={{ marginTop: 12 }}>
                        <div className="srl-zone-label --accent">Current Commentary</div>
                        <p className="srl-commentary" style={{ margin: 0 }}>{selected.commentary}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* ═══ ZONE: MARKETS ═══ */}
                {matchZone === 'markets' && (
                  <div className="srl-tab-body" key="markets">
                    <div className="srl-markets">
                      <div className="srl-zone-label --accent" style={{ justifyContent: 'space-between' }}>
                        <span>
                          All Markets
                          {marketsDesk
                            ? ` · ${marketsDesk.marketCount ?? marketsDesk.markets?.length ?? 0} markets · ${marketsDesk.openBets || 0} bets · ${formatInr(marketsDesk.openStake)}`
                            : ''}
                        </span>
                      </div>

                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                        <button
                          type="button"
                          className="srl-btn srl-btn-violet"
                          style={{ fontSize: '0.72rem', padding: '6px 12px' }}
                          disabled={busy}
                          onClick={() => run(
                            () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/bulk-settle`, { phase: 'toss' }),
                            'Toss markets settled in bulk!',
                          )}
                        >
                          ⚡ Settle Toss
                        </button>
                        <button
                          type="button"
                          className="srl-btn srl-btn-violet"
                          style={{ fontSize: '0.72rem', padding: '6px 12px' }}
                          disabled={busy}
                          onClick={() => run(
                            () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/bulk-settle`, { phase: 'innings1' }),
                            '1st Innings markets settled in bulk!',
                          )}
                        >
                          ⚡ Settle 1st Innings
                        </button>
                      </div>

                      <div className="srl-market-filters">
                        {[
                          { id: 'all', label: 'All odds' },
                          { id: 'toss', label: 'Toss' },
                          { id: 'winner', label: 'Winner' },
                          { id: 'totals', label: 'Totals' },
                          { id: 'innings', label: 'Innings / overs' },
                          { id: 'open', label: 'Open + staked' },
                          { id: 'staked', label: 'With stakes' },
                          { id: 'locked', label: 'Locked / settled' },
                        ].map((f) => (
                          <button
                            key={f.id}
                            type="button"
                            className={`srl-chip${marketFilter === f.id ? ' is-on' : ''}`}
                            onClick={() => setMarketFilter(f.id)}
                          >
                            {f.label}
                            {f.id === 'toss' && marketsDesk?.tossMarkets?.length
                              ? ` · ${marketsDesk.tossMarkets.length}`
                              : ''}
                          </button>
                        ))}
                      </div>
                      {marketsLoading && !marketsDesk && (
                        <p className="srl-hint">Loading markets…</p>
                      )}
                      {marketsError && <p className="srl-console-error">{marketsError}</p>}
                      <div className="srl-market-list">
                        {visibleMarkets.map((market) => {
                          const status = String(market.status || 'OPEN').toUpperCase();
                          const settled = ['DETERMINED', 'VOID', 'VOIDED'].includes(status);
                          const mid = encodeURIComponent(market.marketId);
                          return (
                            <div key={market.marketId} className={`srl-market-card${settled || status === 'SUSPENDED' ? ' is-locked' : ''}`}>
                              <div className="srl-market-card__head">
                                <div>
                                  <strong>{market.title || market.name}</strong>
                                  <span className="srl-hint">
                                    {market.marketId}
                                    {market.line != null ? ` · line ${market.line}` : ''}
                                    {(market.book?.bets || 0) > 0
                                      ? ` · ${market.book.bets} bets · ${formatInr(market.book.stake)}`
                                      : ''}
                                  </span>
                                </div>
                                <div className="srl-market-card__actions">
                                  <StatusPill value={status} />
                                  <button
                                    type="button"
                                    className="srl-chip"
                                    disabled={busy || settled}
                                    onClick={() => run(
                                      () => adminApiClient.post(
                                        `/iplsrl/matches/${selected.matchId}/markets/${mid}/suspend`,
                                        { suspended: status !== 'SUSPENDED' },
                                      ),
                                      status === 'SUSPENDED' ? 'Market opened' : 'Market locked',
                                    )}
                                  >
                                    {status === 'SUSPENDED' ? 'Unlock' : 'Lock'}
                                  </button>
                                  <button
                                    type="button"
                                    className="srl-chip"
                                    disabled={busy || settled}
                                    onClick={() => setMarketAsk({
                                      marketId: market.marketId,
                                      title: market.title || market.name,
                                      voidMarket: true,
                                      bets: market.book?.bets || 0,
                                      stake: market.book?.stake || 0,
                                    })}
                                  >
                                    Void
                                  </button>
                                </div>
                              </div>
                              <div className="srl-market-sels">
                                {(market.selections || []).map((sel) => (
                                    <button
                                      key={sel.selectionId}
                                      type="button"
                                      className={`srl-market-sel${sel.won ? ' is-won' : ''}`}
                                      disabled={busy || settled}
                                      title={settled ? 'Already settled' : 'Declare this selection the winner'}
                                      onClick={() => setMarketAsk({
                                        marketId: market.marketId,
                                        title: market.title || market.name,
                                        selectionId: sel.selectionId,
                                        selectionName: sel.name,
                                        voidMarket: false,
                                        bets: sel.book?.bets || 0,
                                        stake: sel.book?.stake || 0,
                                        payout: sel.book?.payout || 0,
                                        odds: sel.odds,
                                      })}
                                    >
                                      <span>{sel.name}</span>
                                      <strong>{sel.odds != null ? Number(sel.odds).toFixed(2) : '—'}</strong>
                                      <em>
                                        {(sel.book?.bets || 0) > 0
                                          ? `${sel.book.bets} · ${formatInr(sel.book.stake)}`
                                          : 'No open bets'}
                                      </em>
                                    </button>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                        {!marketsLoading && visibleMarkets.length === 0 && (
                          <p className="srl-hint">No markets in this filter.</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Standings — always visible below cockpit */}
            <Panel title="Standings" hint="10 teams · W=2 pts">
              <div className="srl-standings">
                {(snap.standings || []).map((row) => (
                  <div key={row.teamId} className="srl-stand-row">
                    <span className="srl-hint">{row.rank}</span>
                    <strong>{row.shortName}</strong>
                    <span className="srl-hint">{row.played ?? row.matches ?? 0} P · {row.won ?? 0} W · {row.points} pts</span>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </div>
      )}

      {/* ═══ TEAMS TAB ═══ */}
      {tab === 'teams' && snap && (
        <Panel title="Teams & strength ratings" hint={`${snap.teams?.length || 0} teams`}>
          <div className="srl-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Team</th>
                  <th>Short</th>
                  <th>Venue</th>
                  <th>Rating</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(snap.teams || []).map((t) => (
                  <tr key={t.teamId}>
                    <td><strong>{t.teamName}</strong></td>
                    <td>{t.shortName}</td>
                    <td>{t.homeVenue}</td>
                    <td>
                      <input
                        type="number"
                        className="srl-input"
                        defaultValue={t.strengthRating}
                        style={{ width: 72, padding: '6px 8px' }}
                        onBlur={(e) => {
                          const val = Number(e.target.value);
                          if (val === t.strengthRating) return;
                          run(() => adminApiClient.post(`/iplsrl/teams/${t.teamId}/rating`, { strengthRating: val }), 'Rating updated');
                        }}
                      />
                    </td>
                    <td><StatusPill value={t.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* ═══ PLAYERS TAB ═══ */}
      {tab === 'players' && snap && (
        <Panel title="Player roster" hint={`${snap.players?.length || 0} players`}>
          <div className="srl-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Team</th>
                  <th>Role</th>
                  <th>Bat</th>
                  <th>Bowl</th>
                  <th>Form</th>
                </tr>
              </thead>
              <tbody>
                {(snap.players || []).slice(0, 80).map((p) => (
                  <tr key={p.playerId}>
                    <td><strong>{p.name}</strong></td>
                    <td>{p.teamId}</td>
                    <td>{p.role}</td>
                    <td>{p.battingRating}</td>
                    <td>{p.bowlingRating}</td>
                    <td>{p.formRating}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* ═══ AUDIT TAB ═══ */}
      {tab === 'audit' && snap && (
        <Panel title="Operator audit log" hint={`${snap.audit?.length || 0} recent`}>
          <div className="srl-audit">
            {(snap.audit || []).map((a) => (
              <div key={a.id} className="srl-audit-row">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <strong style={{ fontSize: '0.82rem' }}>{a.action}</strong>
                  <span className="srl-hint">{a.time}</span>
                </div>
                <div className="srl-hint" style={{ marginTop: 4 }}>{a.detail}</div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* ═══ DIALOGS ═══ */}
      <AdminConfirmDialog
        isOpen={!!declareAsk}
        variant="warning"
        icon="🏏"
        title={`Declare ${declareAsk?.short} winner?`}
        description="This settles the match for users and pays match-winner bets. Betting on this fixture closes."
        details={declareAsk ? [
          { label: 'Winner', value: declareAsk.short },
          { label: 'Open stake on this side', value: `${declareAsk.bets} bets` },
          { label: 'Payout if they win', value: formatInr(declareAsk.payout) },
          { label: 'House after payout', value: formatInr(declareAsk.house) },
          { label: 'All open stake', value: formatInr(declareAsk.total) },
        ] : []}
        confirmLabel={`Declare ${declareAsk?.short || ''}`}
        cancelLabel="Cancel"
        loading={busy}
        onCancel={() => setDeclareAsk(null)}
        onConfirm={() => {
          const ask = declareAsk;
          setDeclareAsk(null);
          if (!ask || !selected) return;
          run(
            () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/declare`, { teamId: ask.teamId }),
            `${ask.short} declared winner`,
          );
        }}
      />

      <AdminConfirmDialog
        isOpen={!!marketAsk}
        variant={marketAsk?.voidMarket ? 'danger' : 'warning'}
        icon={marketAsk?.voidMarket ? '⊘' : '✓'}
        title={marketAsk?.voidMarket
          ? `Void ${marketAsk?.title}?`
          : `Declare ${marketAsk?.selectionName}?`}
        description={marketAsk?.voidMarket
          ? 'Voids every open bet on this market and locks the line for users.'
          : 'Pays this selection, loses other open bets on the market, locks the line, and seeks the match clock so the scoreboard matches the declare (e.g. Over 88.5 → 89 by that over).'}
        details={marketAsk ? [
          { label: 'Market', value: marketAsk.title || marketAsk.marketId },
          ...(marketAsk.voidMarket ? [] : [
            { label: 'Winning selection', value: marketAsk.selectionName || marketAsk.selectionId },
            { label: 'Odds', value: marketAsk.odds != null ? Number(marketAsk.odds).toFixed(2) : '—' },
            { label: 'Board effect', value: 'Seek + score anchor to match this result' },
          ]),
          { label: 'Open bets affected', value: String(marketAsk.bets || 0) },
          { label: 'Open stake', value: formatInr(marketAsk.stake) },
          ...(marketAsk.voidMarket ? [] : [
            { label: 'Payout if this wins', value: formatInr(marketAsk.payout) },
          ]),
        ] : []}
        confirmLabel={marketAsk?.voidMarket ? 'Void market' : 'Declare & play'}
        cancelLabel="Cancel"
        loading={busy}
        onCancel={() => setMarketAsk(null)}
        onConfirm={() => {
          const ask = marketAsk;
          setMarketAsk(null);
          if (!ask || !selected) return;
          const mid = encodeURIComponent(ask.marketId);
          run(
            () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/markets/${mid}/declare`, {
              winningSelectionId: ask.voidMarket ? null : ask.selectionId,
              voidMarket: !!ask.voidMarket,
            }),
            ask.voidMarket
              ? `${ask.title} voided`
              : `${ask.selectionName} declared — board updated`,
          );
        }}
      />

      {/* ═══ EXHIBITION MODAL ═══ */}
      {showExhibitionModal && (
        <div className="srl-modal-overlay" onClick={() => setShowExhibitionModal(false)}>
          <div className="srl-modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>➕ Exhibition Match</h3>
              <button
                type="button"
                className="srl-chip"
                onClick={() => setShowExhibitionModal(false)}
              >
                ✕
              </button>
            </div>
            <p className="srl-hint" style={{ margin: 0 }}>
              Create an on-demand virtual fixture with immediate betting markets.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label className="srl-field">
                Home Team
                <select
                  value={exhibitionHome}
                  onChange={(e) => setExhibitionHome(e.target.value)}
                  className="srl-input"
                >
                  {(snap?.teams || []).map((t) => (
                    <option key={t.teamId} value={t.teamId}>{t.shortName} · {t.name}</option>
                  ))}
                </select>
              </label>
              <label className="srl-field">
                Away Team
                <select
                  value={exhibitionAway}
                  onChange={(e) => setExhibitionAway(e.target.value)}
                  className="srl-input"
                >
                  {(snap?.teams || []).map((t) => (
                    <option key={t.teamId} value={t.teamId}>{t.shortName} · {t.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label className="srl-field">
                Venue
                <input
                  type="text"
                  value={exhibitionVenue}
                  onChange={(e) => setExhibitionVenue(e.target.value)}
                  className="srl-input"
                />
              </label>
              <label className="srl-field">
                Pitch Condition
                <select
                  value={exhibitionPitch}
                  onChange={(e) => setExhibitionPitch(e.target.value)}
                  className="srl-input"
                >
                  <option value="BALANCED">Balanced</option>
                  <option value="BATTING_PARADISE">Batting Paradise</option>
                  <option value="SPIN_FRIENDLY">Spin Friendly</option>
                  <option value="PACE_BOUNCE">Pace & Bounce</option>
                </select>
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
              <button
                type="button"
                className="srl-btn srl-btn-slate"
                onClick={() => setShowExhibitionModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="srl-btn srl-btn-blue"
                disabled={busy || exhibitionHome === exhibitionAway}
                onClick={() => {
                  run(
                    () => adminApiClient.post('/iplsrl/matches/custom', {
                      homeTeamId: exhibitionHome,
                      awayTeamId: exhibitionAway,
                      venue: exhibitionVenue,
                      pitch: exhibitionPitch,
                    }),
                    'Exhibition match created & launched live!',
                  );
                  setShowExhibitionModal(false);
                }}
              >
                Launch Match
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function actionFill(on) {
  return { background: on ? '#16a34a' : '#334155' };
}
