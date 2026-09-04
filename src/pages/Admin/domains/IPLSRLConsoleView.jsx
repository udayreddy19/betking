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
  const [marketFilter, setMarketFilter] = useState('open');
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
      return list.filter((m) => ['SUSPENDED', 'DETERMINED', 'VOID', 'VOIDED'].includes(String(m.status || '').toUpperCase()));
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

  return (
    <div className="srl-console">
      <div className="srl-console-hero">
        <div>
          <p className="srl-console-kicker">Sports · OddsYra SRL</p>
          <h2>Match control</h2>
          <p>
            Fixtures auto-play on the published clock. Pause, scrub, close betting, jump the season to a match, or
            declare any market — the board seeks to that score (e.g. Over 88.5 → 89 by 10 overs).
          </p>
          {error && <p className="srl-console-error">{error}</p>}
        </div>
        <div className="srl-console-stats">
          <div className="srl-stat"><strong>{counts.all}</strong><span>Matches</span></div>
          <div className="srl-stat"><strong>{counts.league}</strong><span>League</span></div>
          <div className="srl-stat"><strong>{counts.playoffs}</strong><span>Playoffs</span></div>
          <div className="srl-stat"><strong>{counts.live}</strong><span>Live</span></div>
          <div className="srl-stat"><strong>{counts.upcoming}</strong><span>Upcoming</span></div>
          <div className="srl-stat"><strong>{counts.done}</strong><span>Done</span></div>
        </div>
      </div>

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

      {tab === 'desk' && snap && (
        <div className="srl-desk">
          <div className="srl-stack">
            <Panel title="Season conditions" hint={`${snap.season?.name || 'Season'} · Ed ${snap.season?.edition || '—'}`}>
              <div className="srl-settings">
                <label className="srl-field">
                  Default speed
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
                Auto-play deliveries after a manual start
              </label>
            </Panel>

            <Panel title="Season clock" hint={seasonClock.jumped ? 'Offset from wall clock' : 'Following wall clock'}>
              <p className="srl-hint" style={{ margin: '0 0 10px' }}>
                {seasonClock.label || 'Wall clock'}
                {seasonClock.jumped ? ' · users see this time, not real time' : ''}
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

            <Panel title="Fixtures" hint={`${fixtures.length} of ${counts.all} shown · 70 league + 4 playoffs`}>
              <div className="srl-filters" style={{ marginBottom: 12 }}>
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
                Search fixtures
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
                      {m.matchNo ? `#${m.matchNo}` : ''} {m.stageLabel || 'League'} · {m.date} · {m.timeDisplay || '—'} · {PHASE_LABEL[m.clock?.phase] || m.venue}
                    </div>
                    <div className="srl-fixture-note" style={{ color: m.forcedWinnerName ? '#34d399' : undefined }}>
                      {m.controlStatus === 'COMPLETED'
                        ? (m.score?.result || 'Completed')
                        : m.forcedWinnerName
                          ? `Scripted winner: ${m.forcedWinnerName}`
                          : `${m.score?.innings1?.runs || 0}/${m.score?.innings1?.wickets || 0} → ${m.score?.innings2?.runs || 0}/${m.score?.innings2?.wickets || 0}`}
                    </div>
                    <div className="srl-fixture-meta" style={{ marginTop: 4 }}>
                      Open stake {m.homeShort} {formatInr(m.book?.home?.stake)} · {m.awayShort} {formatInr(m.book?.away?.stake)}
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

          <div className="srl-stack">
            <Panel title="Selected match" hint={selected?.matchId || 'Pick a fixture'}>
              {!selected ? (
                <p className="srl-hint" style={{ margin: 0 }}>Select a fixture from the desk.</p>
              ) : (
                <>
                  <div className="srl-match-title">{selected.homeTeam} vs {selected.awayTeam}</div>
                  <div className="srl-match-sub">
                    {selected.venue} · {selected.clockDriven ? 'Published clock' : 'Operator override'} · {selected.speed}
                  </div>

                  <div className="srl-scoreboard">
                    <div className="srl-score">
                      <span>Innings 1</span>
                      <strong>{selected.score.innings1.runs}/{selected.score.innings1.wickets}</strong>
                      <em>{selected.score.innings1.overs} ov</em>
                    </div>
                    <div className="srl-score">
                      <span>Innings 2</span>
                      <strong>{selected.score.innings2.runs}/{selected.score.innings2.wickets}</strong>
                      <em>{selected.score.innings2.overs} ov{selected.score.target ? ` · T ${selected.score.target}` : ''}</em>
                    </div>
                  </div>
                  {selected.commentary && <p className="srl-commentary">{selected.commentary}</p>}

                  <div className="srl-book">
                    <div className="srl-winner-label">Open stakes · match winner</div>
                    <div className="srl-book-grid">
                      <div className={`srl-book-side${selected.book?.heavier === 'home' ? ' is-heavy' : ''}`}>
                        <span>{selected.homeShort}</span>
                        <strong>{formatInr(selected.book?.home?.stake)}</strong>
                        <em>{selected.book?.home?.bets || 0} bets · pays {formatInr(selected.book?.home?.payout)} if they win</em>
                      </div>
                      <div className={`srl-book-side${selected.book?.heavier === 'away' ? ' is-heavy' : ''}`}>
                        <span>{selected.awayShort}</span>
                        <strong>{formatInr(selected.book?.away?.stake)}</strong>
                        <em>{selected.book?.away?.bets || 0} bets · pays {formatInr(selected.book?.away?.payout)} if they win</em>
                      </div>
                    </div>
                    {selected.book?.other?.stake > 0 && (
                      <p className="srl-hint" style={{ margin: '8px 0 0' }}>
                        Other markets: {formatInr(selected.book.other.stake)} across {selected.book.other.bets} bets
                      </p>
                    )}
                    <p className="srl-hint" style={{ margin: '8px 0 0' }}>
                      Total open {formatInr(selected.book?.totalStake)}.
                      {selected.book?.heavier === 'home'
                        ? ` More money is on ${selected.homeShort} — declaring them winner pays ${formatInr(selected.book.home.payout)}.`
                        : selected.book?.heavier === 'away'
                          ? ` More money is on ${selected.awayShort} — declaring them winner pays ${formatInr(selected.book.away.payout)}.`
                          : ' Stakes are even or empty.'}
                    </p>
                  </div>

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

                  <div className="srl-actions">
                    <button
                      type="button"
                      className="srl-btn srl-btn-blue"
                      disabled={busy || selected.controlStatus === 'LIVE' || selected.controlStatus === 'COMPLETED'}
                      onClick={() => run(() => adminApiClient.post('/iplsrl/matches/start', { matchId: selected.matchId }), 'Match started for users')}
                    >
                      Start / take over
                    </button>
                    {selected.canPause ? (
                      <button type="button" className="srl-btn srl-btn-orange" disabled={busy} onClick={() => run(() => adminApiClient.post('/iplsrl/matches/pause', { matchId: selected.matchId }), 'Paused')}>
                        Pause
                      </button>
                    ) : (
                      <button type="button" className="srl-btn srl-btn-teal" disabled={busy || !selected.canResume} onClick={() => run(() => adminApiClient.post('/iplsrl/matches/resume', { matchId: selected.matchId }), 'Resumed')}>
                        Resume
                      </button>
                    )}
                    <select
                      className="srl-input"
                      value={selected.speed}
                      disabled={busy || selected.controlStatus === 'COMPLETED'}
                      onChange={(e) => run(() => adminApiClient.post('/iplsrl/matches/speed', { matchId: selected.matchId, speed: e.target.value }), `Speed ${e.target.value}`)}
                      style={{ height: 40 }}
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
                      {selected.bettingClosed ? 'Open betting' : 'Close betting'}
                    </button>
                  </div>

                  <div className="srl-winner">
                    <div className="srl-winner-label">Winner control · anytime</div>
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

                  <div className="srl-markets">
                    <div className="srl-winner-label">
                      All markets · declare or lock any odd
                      {marketsDesk ? ` · ${marketsDesk.openBets || 0} open bets · ${formatInr(marketsDesk.openStake)}` : ''}
                    </div>
                    <div className="srl-market-filters">
                      {[
                        { id: 'open', label: 'Open + staked' },
                        { id: 'staked', label: 'With stakes' },
                        { id: 'locked', label: 'Locked / settled' },
                        { id: 'all', label: 'All odds' },
                      ].map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          className={`srl-chip${marketFilter === f.id ? ' is-on' : ''}`}
                          onClick={() => setMarketFilter(f.id)}
                        >
                          {f.label}
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
                </>
              )}
            </Panel>

            <Panel title="Standings snapshot" hint="10 teams · W=2 pts">
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

      {tab === 'audit' && snap && (
        <Panel title="Operator audit log" hint={`${snap.audit?.length || 0} recent`}>
          <div className="srl-audit">
            {(snap.audit || []).map((a) => (
              <div key={a.id} className="srl-audit-row">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <strong style={{ fontSize: '0.84rem' }}>{a.action}</strong>
                  <span className="srl-hint">{a.time}</span>
                </div>
                <div className="srl-hint" style={{ marginTop: 4 }}>{a.detail}</div>
              </div>
            ))}
          </div>
        </Panel>
      )}

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
    </div>
  );
}

function actionFill(on) {
  return { background: on ? '#16a34a' : '#334155' };
}
