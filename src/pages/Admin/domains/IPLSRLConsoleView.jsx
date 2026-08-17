import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import { useAdminToast } from '../components/AdminToastContext';
import { startVisibleInterval } from '../utils/visibleInterval';

const TABS = [
  { id: 'desk', label: 'Match Desk' },
  { id: 'teams', label: 'Teams' },
  { id: 'players', label: 'Players' },
  { id: 'audit', label: 'Audit' },
];

function StatusPill({ value }) {
  const v = String(value || '').toUpperCase();
  const color = v === 'LIVE' || v === 'ARMED' || v === 'ACTIVE'
    ? '#34d399'
    : v === 'PAUSED' || v === 'READY'
      ? '#fbbf24'
      : v === 'COMPLETED'
        ? '#60a5fa'
        : '#94a3b8';
  return (
    <span style={{
      padding: '2px 8px',
      borderRadius: 999,
      fontSize: '0.68rem',
      fontWeight: 800,
      letterSpacing: '0.04em',
      background: `${color}22`,
      color,
      border: `1px solid ${color}55`,
    }}>
      {v || '—'}
    </span>
  );
}

function Panel({ title, hint, children, style }) {
  return (
    <section style={{
      background: 'var(--admin-surface)',
      border: '1px solid var(--admin-border)',
      borderRadius: 12,
      padding: 16,
      boxShadow: 'var(--admin-shadow)',
      ...style,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 14, alignItems: 'baseline' }}>
        <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800 }}>{title}</h3>
        {hint && <span style={{ fontSize: '0.72rem', color: 'var(--admin-text-muted)' }}>{hint}</span>}
      </div>
      {children}
    </section>
  );
}

export default function IPLSRLConsoleView() {
  const { showToast } = useAdminToast();
  const [tab, setTab] = useState('desk');
  const [snap, setSnap] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedMatchId, setSelectedMatchId] = useState(null);
  const [busy, setBusy] = useState(false);

  const applySnap = useCallback((data) => {
    setSnap(data);
    setSelectedMatchId((prev) => {
      if (prev && data.matches?.some((m) => m.matchId === prev)) return prev;
      return data.matches?.[0]?.matchId || null;
    });
  }, []);

  const refresh = useCallback(() => {
    return adminApiClient.get('/iplsrl/control')
      .then((data) => {
        applySnap(data);
        setError(null);
      })
      .catch((err) => setError(err.message || 'Failed to load IPLSRL control desk'));
  }, [applySnap]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    refresh().finally(() => { if (!cancelled) setLoading(false); });
    const stop = startVisibleInterval(() => { refresh().catch(() => {}); }, 8000, { runImmediately: false });
    return () => {
      cancelled = true;
      stop();
    };
  }, [refresh]);

  const selected = useMemo(
    () => snap?.matches?.find((m) => m.matchId === selectedMatchId) || null,
    [snap, selectedMatchId],
  );

  const run = async (fn, okMsg) => {
    setBusy(true);
    try {
      const data = await fn();
      if (data?.matches || data?.settings) applySnap(data);
      else if (data?.snapshot) applySnap(data.snapshot);
      else await refresh();
      if (okMsg) showToast(okMsg, 'success');
    } catch (err) {
      showToast(err.message || 'Action failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (loading && !snap) {
    return <div style={{ padding: 40, color: 'var(--admin-text-muted)' }}>Loading IPLSRL control desk…</div>;
  }

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800 }}>BetKing SRL Console</h2>
        <p style={{ margin: '6px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.85rem', maxWidth: 720 }}>
          Matches stay upcoming for users until you press Start. You can script or declare the winning team at any time — including while the match is live.
        </p>
        {error && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.82rem' }}>{error}</p>}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            style={{
              padding: '8px 14px',
              borderRadius: 999,
              border: tab === t.id ? '1px solid rgba(245,158,11,0.5)' : '1px solid var(--admin-border)',
              background: tab === t.id ? 'rgba(245,158,11,0.16)' : 'var(--admin-panel)',
              color: tab === t.id ? '#fbbf24' : 'var(--admin-text-muted)',
              fontWeight: 750,
              fontSize: '0.8rem',
              cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'desk' && snap && (
        <div className="iplsrl-desk-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(280px, 0.85fr)', gap: 16, alignItems: 'start' }}>
          <div style={{ display: 'grid', gap: 16 }}>
            <Panel title="Global simulation settings" hint={`${snap.season?.name || 'Season'} · Ed ${snap.season?.edition || '—'}`}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
                <label style={{ display: 'grid', gap: 6, fontSize: '0.75rem', color: 'var(--admin-text-muted)', fontWeight: 700 }}>
                  Speed
                  <select
                    value={snap.settings.speed}
                    disabled={busy}
                    onChange={(e) => run(() => adminApiClient.post('/iplsrl/settings', { speed: e.target.value }), `Speed → ${e.target.value}`)}
                    style={fieldStyle}
                  >
                    {(snap.options?.speeds || []).map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <label style={{ display: 'grid', gap: 6, fontSize: '0.75rem', color: 'var(--admin-text-muted)', fontWeight: 700 }}>
                  Pitch
                  <select
                    value={snap.settings.pitch}
                    disabled={busy}
                    onChange={(e) => run(() => adminApiClient.post('/iplsrl/settings', { pitch: e.target.value }), 'Pitch updated')}
                    style={fieldStyle}
                  >
                    {(snap.options?.pitches || []).map((s) => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}
                  </select>
                </label>
                <label style={{ display: 'grid', gap: 6, fontSize: '0.75rem', color: 'var(--admin-text-muted)', fontWeight: 700 }}>
                  Weather
                  <select
                    value={snap.settings.weather}
                    disabled={busy}
                    onChange={(e) => run(() => adminApiClient.post('/iplsrl/settings', { weather: e.target.value }), 'Weather updated')}
                    style={fieldStyle}
                  >
                    {(snap.options?.weather || []).map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: '0.82rem' }}>
                <input
                  type="checkbox"
                  checked={!!snap.settings.autoPlay}
                  disabled={busy}
                  onChange={(e) => run(() => adminApiClient.post('/iplsrl/settings', { autoPlay: e.target.checked }), e.target.checked ? 'Auto-play on' : 'Auto-play off')}
                />
                Auto-play deliveries after start
              </label>
            </Panel>

            <Panel title="Fixture desk" hint={`${snap.matches?.length || 0} controlled fixtures`}>
              <div style={{ display: 'grid', gap: 8, maxHeight: 420, overflowY: 'auto' }}>
                {(snap.matches || []).slice(0, 20).map((m) => (
                  <button
                    key={m.matchId}
                    type="button"
                    onClick={() => setSelectedMatchId(m.matchId)}
                    style={{
                      textAlign: 'left',
                      padding: '12px 14px',
                      borderRadius: 10,
                      border: selectedMatchId === m.matchId ? '1px solid rgba(59,130,246,0.55)' : '1px solid var(--admin-border)',
                      background: selectedMatchId === m.matchId ? 'rgba(59,130,246,0.12)' : 'var(--admin-panel)',
                      color: 'inherit',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
                      <strong style={{ fontSize: '0.88rem' }}>{m.homeShort} vs {m.awayShort}</strong>
                      <StatusPill value={m.controlStatus} />
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)' }}>
                      {m.date} · {m.timeDisplay || '—'} · {m.venue}
                    </div>
                    <div style={{ fontSize: '0.74rem', marginTop: 6, color: m.forcedWinnerName ? '#34d399' : '#fbbf24' }}>
                      {m.forcedWinnerName ? `Scripted winner: ${m.forcedWinnerName}` : 'No winner scripted yet — start anytime'}
                    </div>
                  </button>
                ))}
              </div>
            </Panel>
          </div>

          <div style={{ display: 'grid', gap: 16 }}>
            <Panel title="Selected match control" hint={selected?.matchId || 'Pick a fixture'}>
              {!selected ? (
                <p style={{ margin: 0, color: 'var(--admin-text-muted)', fontSize: '0.85rem' }}>Select a fixture from the desk.</p>
              ) : (
                <>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: '1.05rem', fontWeight: 800 }}>{selected.homeTeam} vs {selected.awayTeam}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--admin-text-muted)', marginTop: 4 }}>{selected.venue}</div>
                  </div>

                  <div style={{
                    padding: 12,
                    borderRadius: 10,
                    border: '1px solid rgba(245,158,11,0.35)',
                    background: 'rgba(245,158,11,0.08)',
                    marginBottom: 14,
                  }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#fbbf24', marginBottom: 8 }}>
                      Winner · anytime
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <button
                        type="button"
                        disabled={busy || selected.controlStatus === 'COMPLETED'}
                        onClick={() => run(
                          () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/force-winner`, { teamId: selected.homeTeamId }),
                          `${selected.homeShort} set to win`,
                        )}
                        style={{
                          ...actionBtn(selected.forcedWinnerTeamId === selected.homeTeamId ? '#16a34a' : '#334155'),
                          opacity: selected.controlStatus === 'COMPLETED' ? 0.5 : 1,
                        }}
                      >
                        {selected.homeShort} wins
                      </button>
                      <button
                        type="button"
                        disabled={busy || selected.controlStatus === 'COMPLETED'}
                        onClick={() => run(
                          () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/force-winner`, { teamId: selected.awayTeamId }),
                          `${selected.awayShort} set to win`,
                        )}
                        style={{
                          ...actionBtn(selected.forcedWinnerTeamId === selected.awayTeamId ? '#16a34a' : '#334155'),
                          opacity: selected.controlStatus === 'COMPLETED' ? 0.5 : 1,
                        }}
                      >
                        {selected.awayShort} wins
                      </button>
                    </div>
                    {selected.forcedWinnerTeamId && selected.controlStatus !== 'COMPLETED' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => run(
                          () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/force-winner`, { teamId: null }),
                          'Winner cleared',
                        )}
                        style={{ ...actionBtn('#475569'), width: '100%', marginTop: 8 }}
                      >
                        Clear scripted winner
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy || selected.controlStatus === 'COMPLETED' || !selected.forcedWinnerTeamId}
                      onClick={() => run(
                        () => adminApiClient.post(`/iplsrl/matches/${selected.matchId}/declare`, { teamId: selected.forcedWinnerTeamId }),
                        'Winner declared — match complete',
                      )}
                      style={{ ...actionBtn('#b45309'), width: '100%', marginTop: 8 }}
                    >
                      Declare winner now
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                    <button
                      type="button"
                      disabled={busy || selected.controlStatus === 'LIVE' || selected.controlStatus === 'COMPLETED'}
                      onClick={() => run(() => adminApiClient.post('/iplsrl/matches/start', { matchId: selected.matchId }), 'Match started for users')}
                      style={actionBtn('#2563eb')}
                    >
                      Start match
                    </button>
                    {selected.canPause ? (
                      <button type="button" disabled={busy} onClick={() => run(() => adminApiClient.post('/iplsrl/matches/pause', { matchId: selected.matchId }), 'Paused')} style={actionBtn('#ea580c')}>
                        Pause
                      </button>
                    ) : (
                      <button type="button" disabled={busy || !selected.canResume} onClick={() => run(() => adminApiClient.post('/iplsrl/matches/resume', { matchId: selected.matchId }), 'Resumed')} style={actionBtn('#0d9488')}>
                        Resume
                      </button>
                    )}
                    <button
                      type="button"
                      disabled
                      title="User-facing SRL matches run on the live clock"
                      style={{ ...actionBtn('#7c3aed'), opacity: 0.45 }}
                    >
                      Clock-driven
                    </button>
                    <select
                      value={selected.speed}
                      disabled={busy}
                      onChange={(e) => run(() => adminApiClient.post('/iplsrl/matches/speed', { matchId: selected.matchId, speed: e.target.value }), `Speed ${e.target.value}`)}
                      style={{ ...fieldStyle, height: 40 }}
                    >
                      {(snap.options?.speeds || []).map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>

                  <div style={{ padding: 12, borderRadius: 10, background: 'var(--admin-panel)', border: '1px solid var(--admin-border)', fontSize: '0.82rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span>Innings 1</span>
                      <strong>{selected.score.innings1.runs}/{selected.score.innings1.wickets} ({selected.score.innings1.overs})</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span>Innings 2</span>
                      <strong>{selected.score.innings2.runs}/{selected.score.innings2.wickets} ({selected.score.innings2.overs})</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--admin-text-muted)' }}>
                      <span>Target / Result</span>
                      <strong style={{ color: 'var(--admin-text)' }}>{selected.score.result || selected.score.target || '—'}</strong>
                    </div>
                    {selected.lastDelivery && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--admin-border)', color: 'var(--admin-text-muted)' }}>
                        Last ball: <strong style={{ color: '#93c5fd' }}>{selected.lastDelivery.outcome}</strong>
                        {selected.lastDelivery.isWicket ? ' · WICKET' : ` · +${selected.lastDelivery.runs}`}
                      </div>
                    )}
                  </div>
                </>
              )}
            </Panel>

            <Panel title="Standings snapshot">
              <div style={{ display: 'grid', gap: 6 }}>
                {(snap.standings || []).map((row) => (
                  <div key={row.teamId} style={{ display: 'grid', gridTemplateColumns: '28px 1fr auto', gap: 8, fontSize: '0.8rem' }}>
                    <span style={{ color: 'var(--admin-text-muted)' }}>{row.rank}</span>
                    <strong>{row.shortName}</strong>
                    <span style={{ color: 'var(--admin-text-muted)' }}>{row.points} pts</span>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </div>
      )}

      {tab === 'teams' && snap && (
        <Panel title="Teams & strength ratings" hint={`${snap.teams?.length || 0} teams`}>
          <div style={{ overflowX: 'auto' }}>
            <table style={tableStyle}>
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
                        defaultValue={t.strengthRating}
                        style={{ width: 72, ...fieldStyle, padding: '6px 8px' }}
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
          <div style={{ overflowX: 'auto', maxHeight: 520 }}>
            <table style={tableStyle}>
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
          <div style={{ display: 'grid', gap: 8 }}>
            {(snap.audit || []).map((a) => (
              <div key={a.id} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--admin-border)', background: 'var(--admin-panel)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <strong style={{ fontSize: '0.84rem' }}>{a.action}</strong>
                  <span style={{ fontSize: '0.7rem', color: 'var(--admin-text-muted)' }}>{a.time}</span>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--admin-text-muted)', marginTop: 4 }}>{a.detail}</div>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

const fieldStyle = {
  width: '100%',
  padding: '9px 10px',
  borderRadius: 8,
  border: '1px solid var(--admin-border)',
  background: 'var(--admin-input-bg)',
  color: 'var(--admin-text)',
  font: 'inherit',
};

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '0.82rem',
};

function actionBtn(bg) {
  return {
    padding: '10px 12px',
    borderRadius: 8,
    border: 'none',
    background: bg,
    color: '#fff',
    fontWeight: 750,
    fontSize: '0.8rem',
    cursor: 'pointer',
  };
}

// style table cells via global-ish injection on first render is overkill; use CSS-in-JS on th/td via style tag once:
if (typeof document !== 'undefined' && !document.getElementById('iplsrl-console-table-css')) {
  const style = document.createElement('style');
  style.id = 'iplsrl-console-table-css';
  style.textContent = `
    .admin-shell table th, .admin-shell table td { padding: 10px 12px; border-bottom: 1px solid var(--admin-border); text-align: left; }
    .admin-shell table th { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--admin-text-muted); }
  `;
  document.head.appendChild(style);
}
