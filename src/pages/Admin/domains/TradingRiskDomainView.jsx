import React, { useState, useEffect, useCallback } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import AdminDataTable from '../components/AdminDataTable';
import { useAdminToast } from '../components/AdminToastContext';
import { StatusBadge } from '../components/AdminBadge';
import AdminKPI from '../components/AdminKPI';
import AdminCard from '../components/AdminCard';
import AdminConfirmDialog from '../components/AdminConfirmDialog';
import { AdminKpiDrillDrawer, useAdminKpiDrilldown } from '../hooks/useAdminKpiDrilldown';

function moneyOrDash(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return `₹${Number(value).toLocaleString()}`;
}

function oddsOrDash(value) {
  if (!(Number(value) > 1)) return '—';
  return Number(value).toFixed(2);
}

function pctOrDash(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return `${Number(value).toFixed(2)}%`;
}

const FRAUD_CASE_ACTIONS = [
  { status: 'INVESTIGATING', label: 'Review' },
  { status: 'ESCALATED', label: 'Escalate' },
  { status: 'CONFIRMED', label: 'Restrict' },
  { status: 'DISMISSED', label: 'Dismiss' },
];

export default function TradingRiskDomainView({ subModule }) {
  const [liveExposures, setLiveExposures] = useState([]);
  const [oddsMatches, setOddsMatches] = useState([]);
  const [selectedMatchId, setSelectedMatchId] = useState(null);
  const [oddsDebug, setOddsDebug] = useState(null);
  const [loadingDebug, setLoadingDebug] = useState(false);
  const [fraudSignals, setFraudSignals] = useState([]);
  const [fraudCases, setFraudCases] = useState([]);
  const [suspensions, setSuspensions] = useState([]);
  const [deskMetrics, setDeskMetrics] = useState(null);
  const [error, setError] = useState(null);
  const [suspendTarget, setSuspendTarget] = useState(null);
  const [resumeTarget, setResumeTarget] = useState(null);
  const [suspendLiveBook, setSuspendLiveBook] = useState(false);
  const [suspending, setSuspending] = useState(false);
  const [resuming, setResuming] = useState(false);
  const { showToast } = useAdminToast();
  const drill = useAdminKpiDrilldown();

  const showOddsDesk = !subModule || subModule === 'exposure' || subModule === 'suspension' || subModule === 'fraud-signals';
  const showGgrDesk = subModule === 'ggr-liability';
  const showSuspensionQueue = subModule === 'suspension';
  const showFraud = subModule === 'fraud-signals';
  const showOddsHealth = subModule === 'odds-health';
  const [oddsHealth, setOddsHealth] = useState(null);
  const [engineStatus, setEngineStatus] = useState(null);
  const [engineSaving, setEngineSaving] = useState(false);
  const [platformReady, setPlatformReady] = useState(null);

  const loadSuspensions = useCallback(() => {
    adminApiClient.get('/trading/suspended-markets')
      .then((data) => setSuspensions(data.suspensions || []))
      .catch(() => setSuspensions([]));
  }, []);

  const loadFraud = useCallback(() => {
    adminApiClient.get('/fraud/signals')
      .then((data) => setFraudSignals(data.signals || []))
      .catch(() => setFraudSignals([]));
    adminApiClient.get('/fraud/cases')
      .then((data) => setFraudCases(data.cases || []))
      .catch(() => setFraudCases([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    adminApiClient.get('/trading/exposure')
      .then((data) => {
        if (cancelled) return;
        setLiveExposures(data.exposures || []);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setLiveExposures([]);
        setError(err.message || 'Failed to load trading exposure');
      });
    return () => { cancelled = true; };
  }, []);

  const loadEngineStatus = useCallback(() => {
    adminApiClient.get('/odds-model/v4/engine')
      .then((data) => setEngineStatus(data.data || data))
      .catch(() => setEngineStatus(null));
  }, []);

  const loadPlatformReady = useCallback(() => {
    adminApiClient.get('/odds-model/platform-readiness')
      .then((data) => setPlatformReady(data.data || data))
      .catch(() => setPlatformReady(null));
  }, []);

  const setEngineMode = async (mode) => {
    setEngineSaving(true);
    try {
      const data = await adminApiClient.post('/odds-model/v4/engine', { mode });
      setEngineStatus(data.data || data);
      showToast(
        mode === 'v4'
          ? 'V4 live — resource MW + V3 market catalog'
          : mode === 'shadow'
            ? 'Shadow — V3 live, V4 compare only'
            : 'V3 live',
        'success',
      );
    } catch (err) {
      showToast(err.message || 'Engine switch failed', 'error');
    } finally {
      setEngineSaving(false);
    }
  };

  useEffect(() => {
    if (!showOddsHealth && !showOddsDesk) return undefined;
    loadEngineStatus();
    loadPlatformReady();
    return undefined;
  }, [showOddsHealth, showOddsDesk, loadEngineStatus, loadPlatformReady]);

  useEffect(() => {
    if (!showOddsHealth) return undefined;
    let cancelled = false;
    adminApiClient.get('/odds-model/health')
      .then((data) => { if (!cancelled) setOddsHealth(data.data || data); })
      .catch(() => { if (!cancelled) setOddsHealth(null); });
    return () => { cancelled = true; };
  }, [showOddsHealth]);

  useEffect(() => {
    if (!showGgrDesk) return undefined;
    let cancelled = false;
    adminApiClient.get('/trading/desk-metrics')
      .then((data) => {
        if (!cancelled) setDeskMetrics(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setDeskMetrics(null);
          showToast(err.message || 'Failed to load desk metrics', 'error');
        }
      });
    return () => { cancelled = true; };
  }, [showGgrDesk]);

  useEffect(() => {
    if (!showFraud) return undefined;
    loadFraud();
    return undefined;
  }, [showFraud, loadFraud]);

  useEffect(() => {
    if (!showSuspensionQueue) return undefined;
    loadSuspensions();
    return undefined;
  }, [showSuspensionQueue, loadSuspensions]);

  useEffect(() => {
    if (!showOddsDesk) return undefined;
    let cancelled = false;
    adminApiClient.get('/odds/live-matches')
      .then((data) => {
        if (cancelled) return;
        const matches = data.matches || [];
        setOddsMatches(matches);
        if (!selectedMatchId && matches[0]?.id) {
          setSelectedMatchId(matches[0].id);
        }
      })
      .catch(() => {
        if (!cancelled) setOddsMatches([]);
      });
    return () => { cancelled = true; };
  }, [showOddsDesk]);

  useEffect(() => {
    if (!selectedMatchId || showGgrDesk) {
      setOddsDebug(null);
      return undefined;
    }
    let cancelled = false;
    setLoadingDebug(true);
    const match = oddsMatches.find((m) => m.id === selectedMatchId);
    const params = new URLSearchParams();
    if (match?.team1) params.set('team1', match.team1);
    if (match?.team2) params.set('team2', match.team2);
    const q = params.toString();
    adminApiClient.get(`/odds/${encodeURIComponent(selectedMatchId)}/debug${q ? `?${q}` : ''}`)
      .then((data) => {
        if (!cancelled) setOddsDebug(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setOddsDebug(null);
          showToast(err.message || 'Odds debug failed', 'error');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingDebug(false);
      });
    return () => { cancelled = true; };
  }, [selectedMatchId, showGgrDesk]);

  const handleSuspendLiveBook = async (reason) => {
    setSuspending(true);
    try {
      const result = await adminApiClient.post('/trading/suspend-live-book', {
        reason: reason || 'MANUAL_ADMIN_LIVE_BOOK',
      });
      showToast(`Suspended ${result.count || 0} live match-winner markets`, 'success');
      setSuspendLiveBook(false);
      if (showSuspensionQueue) loadSuspensions();
    } catch (err) {
      showToast(err.message || 'Live book suspend failed', 'error');
    } finally {
      setSuspending(false);
    }
  };

  const handleMarketSuspend = async (reason) => {
    if (!suspendTarget) return;
    setSuspending(true);
    try {
      await adminApiClient.post('/trading/suspend-market', {
        matchId: suspendTarget.matchId,
        marketId: `${suspendTarget.matchId}:match_winner`,
        marketKey: suspendTarget.market,
        reason: reason || 'MANUAL_ADMIN',
      });
      showToast(`Market suspended for ${suspendTarget.match}`, 'success');
      setSuspendTarget(null);
      if (showSuspensionQueue) loadSuspensions();
    } catch (err) {
      showToast(err.message || 'Suspend failed', 'error');
    } finally {
      setSuspending(false);
    }
  };

  const handleMarketResume = async (reason) => {
    if (!resumeTarget) return;
    setResuming(true);
    try {
      const clearReason = reason || resumeTarget.reason || 'MANUAL_ADMIN';
      const result = await adminApiClient.post('/trading/resume-market', {
        marketId: resumeTarget.marketId,
        reason: clearReason,
      });
      const remaining = result?.activeCauses?.length || 0;
      showToast(
        remaining > 0
          ? `Cause cleared; market still suspended (${remaining} active cause${remaining === 1 ? '' : 's'})`
          : `Market resumed: ${resumeTarget.marketId}`,
        remaining > 0 ? 'info' : 'success',
      );
      setResumeTarget(null);
      loadSuspensions();
    } catch (err) {
      showToast(err.message || 'Resume failed', 'error');
    } finally {
      setResuming(false);
    }
  };

  const updateFraudCase = async (caseId, status) => {
    try {
      await adminApiClient.post(`/fraud/cases/${encodeURIComponent(caseId)}/update`, {
        status,
        notes: `Admin action: ${status}`,
      });
      showToast(`Case ${caseId} → ${status}`, 'success');
      loadFraud();
    } catch (err) {
      showToast(err.message || 'Case update failed', 'error');
    }
  };

  const winnerMarket = (oddsDebug?.markets || []).find((m) => m.marketId === 'match_winner');

  const heading = showGgrDesk
    ? 'GGR / Hold % / Liability Desk'
    : showSuspensionQueue
      ? 'Suspended Markets Queue'
      : showFraud
        ? 'Risk / Fraud Console'
        : showOddsHealth
          ? 'Odds model health'
          : 'Trading Desk & Live Risk Exposure Console';
  const hint = showGgrDesk
    ? 'Ledger GGR, hold percentage, and open/persisted market liability for traders.'
    : showSuspensionQueue
      ? 'Active suspension causes. Resume clears one cause; market reopens only when none remain. Requires confirmation and audit.'
      : showFraud
        ? 'Risk signals and fraud cases. Flag / review / restrict / escalate — no auto-ban from weak signals.'
        : showOddsHealth
          ? 'Daily ritual: inverted books, lock-price rate, and settlement ingest. Death-over / player-prop markets stay shadow until observations exist.'
          : 'Live match pricing risk from OddsEngineV3. Stake liability shows once open bets are ledger-backed.';

  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <h2 className="admin-page-header__title">{heading}</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
          {hint}
        </p>
        {error && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.78rem' }}>{error}</p>}
      </div>

      {showOddsHealth && (
        <AdminCard>
          <p style={{ fontSize: '0.85rem' }}>{oddsHealth?.ritual || 'Daily trading ritual: inverted books, lock prices, settlement ingest.'}</p>
          <pre style={{ fontSize: '0.72rem', whiteSpace: 'pre-wrap' }}>
            {JSON.stringify(oddsHealth?.settlementIngest || oddsHealth, null, 2)}
          </pre>
        </AdminCard>
      )}

      {(showOddsDesk || showOddsHealth) && platformReady && (
        <AdminCard>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Platform readiness</div>
              <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.78rem' }}>
                Product scorecard — feed quality, V4 trading, settlement, admin, security.
              </p>
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: platformReady.qualityScore >= 100 ? '#34d399' : '#fbbf24' }}>
              {platformReady.qualityScore}
              <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--admin-text-muted)' }}> / 100</span>
            </div>
          </div>
        </AdminCard>
      )}

      {(showOddsDesk || showOddsHealth) && (
        <AdminCard>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Odds engine</div>
              <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.78rem' }}>
                Exclusive — V4 uses resource Match Winner + the same V3 compact market catalog.
                {' '}Active: <strong>{engineStatus?.resolved || engineStatus?.active || '…'}</strong>
                {engineStatus?.source ? ` (${engineStatus.source})` : ''}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[
                { mode: 'v3', label: 'V3 live' },
                { mode: 'v4', label: 'V4 live' },
                { mode: 'shadow', label: 'Shadow' },
              ].map((btn) => {
                const active = (engineStatus?.resolved || engineStatus?.active) === btn.mode;
                return (
                  <button
                    key={btn.mode}
                    type="button"
                    disabled={engineSaving}
                    className={`admin-btn admin-btn--sm${active ? '' : ' admin-btn--ghost'}`}
                    onClick={() => setEngineMode(btn.mode)}
                  >
                    {btn.label}
                  </button>
                );
              })}
            </div>
          </div>
        </AdminCard>
      )}

      {showOddsDesk && !showFraud && (
        <div style={{ marginBottom: 16 }}>
          <button
            type="button"
            className="admin-btn admin-btn--danger admin-btn--sm"
            onClick={() => setSuspendLiveBook(true)}
          >
            Suspend all live match-winner markets
          </button>
        </div>
      )}

      {showGgrDesk && deskMetrics && (
        <>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '12px',
            marginBottom: '20px',
          }}>
            {[
              { label: 'GGR', metric: 'ggr', value: moneyOrDash(deskMetrics.ggr), hint: 'Handle − paid out', accent: '#a78bfa' },
              { label: 'Hold %', metric: 'Hold %', value: pctOrDash(deskMetrics.holdPct), hint: 'GGR / handle', accent: '#34d399' },
              { label: 'Handle', metric: 'handle', value: moneyOrDash(deskMetrics.handle), hint: 'BET_STAKE total', accent: '#38bdf8' },
              { label: 'Paid out', metric: 'paidOut', value: moneyOrDash(deskMetrics.paidOut), hint: 'Wins + cashouts + voids', accent: '#fb923c' },
              { label: 'Open liability', metric: 'openLiability', value: moneyOrDash(deskMetrics.openLiability), hint: `${deskMetrics.openBets || 0} open bets`, accent: '#f87171' },
              { label: 'Stored liability', metric: 'Stored liability', value: moneyOrDash(deskMetrics.storedMarketLiability), hint: 'market_selection_liability', accent: '#fbbf24' },
              { label: 'Mem worst-case', metric: 'Mem worst-case', value: moneyOrDash(deskMetrics.memoryWorstCaseLoss), hint: 'In-process exposure', accent: '#f43f5e' },
              { label: 'Cashouts', metric: 'cashouts', value: `${deskMetrics.cashouts?.count || 0}`, hint: moneyOrDash(deskMetrics.cashouts?.stake), accent: '#818cf8' },
            ].map((card) => (
              <AdminKPI
                key={card.label}
                label={card.label}
                value={card.value}
                trendLabel={card.hint}
                accent={card.accent}
                source="Details"
                onClick={() => drill.openDrilldown(card.metric, card.label)}
              />
            ))}
          </div>
          <AdminKpiDrillDrawer drill={drill} />

          <AdminDataTable
            title="Top Selection Liabilities (Persisted)"
            emptyMessage="No persisted market liability yet — place bets to populate"
            data={deskMetrics.topLiabilities || []}
            columns={[
              { header: 'Market', key: 'marketId' },
              { header: 'Selection', key: 'selectionId' },
              { header: 'Net Liability', key: 'netLiability', render: (r) => (
                <span style={{ fontWeight: 800, color: 'var(--admin-text)' }}>{moneyOrDash(r.netLiability)}</span>
              )},
              { header: 'Total Stake', key: 'totalStake', render: (r) => moneyOrDash(r.totalStake) },
              { header: 'Updated', key: 'updatedAt' },
            ]}
          />
        </>
      )}

      {showFraud && (
        <>
          <AdminDataTable
            title="Fraud / Risk Signals"
            emptyMessage="No risk signals recorded"
            data={fraudSignals}
            columns={[
              { header: 'ID', key: 'id', render: (r) => <span className="admin-text-mono" style={{ fontSize: '0.76rem' }}>{r.id}</span> },
              { header: 'User', key: 'user_id' },
              { header: 'Type', key: 'signal_type' },
              { header: 'Severity', key: 'severity', render: (r) => <StatusBadge status={r.severity} /> },
              { header: 'Score', key: 'score', render: (r) => <span style={{ fontWeight: 700 }}>{r.score}</span> },
              { header: 'Status', key: 'status', render: (r) => <StatusBadge status={r.status} /> },
              { header: 'Created', key: 'created_at' },
            ]}
          />
          <AdminDataTable
            title="Fraud Cases · Investigate"
            emptyMessage="No fraud cases — Data unavailable or none opened"
            data={fraudCases}
            columns={[
              { header: 'Case', key: 'id', render: (r) => <span className="admin-text-mono" style={{ fontSize: '0.76rem' }}>{r.id}</span> },
              { header: 'User', key: 'user_id' },
              { header: 'Risk score', key: 'risk_score', render: (r) => <span style={{ fontWeight: 700 }}>{r.risk_score ?? '—'}</span> },
              { header: 'Investigator', key: 'assigned_investigator', render: (r) => r.assigned_investigator || '—' },
              { header: 'Status', key: 'status', render: (r) => <StatusBadge status={r.status} /> },
              { header: 'Created', key: 'created_at' },
              {
                header: 'Action',
                key: 'action',
                sortable: false,
                render: (r) => (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {FRAUD_CASE_ACTIONS.map((a) => (
                      <button
                        key={a.status}
                        type="button"
                        className="admin-btn admin-btn--secondary admin-btn--sm"
                        onClick={() => updateFraudCase(r.id, a.status)}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                ),
              },
            ]}
          />
        </>
      )}

      {showSuspensionQueue && (
        <AdminDataTable
          title="Active Suspension Causes"
          emptyMessage="No active suspensions"
          data={suspensions}
          columns={[
            { header: 'Market', key: 'marketId', render: (r) => <span className="admin-text-mono" style={{ fontSize: '0.76rem' }}>{r.marketId}</span> },
            { header: 'Reason', key: 'reason', render: (r) => <StatusBadge status={r.reason} /> },
            { header: 'Source', key: 'source' },
            { header: 'Actor', key: 'actor', render: (r) => r.actor || '—' },
            { header: 'Market status', key: 'marketStatus', render: (r) => <StatusBadge status={r.marketStatus || 'UNKNOWN'} /> },
            { header: 'Since', key: 'createdAt' },
            {
              header: 'Action',
              key: 'action',
              sortable: false,
              render: (r) => (
                <button
                  type="button"
                  className="admin-btn admin-btn--success admin-btn--sm"
                  onClick={() => setResumeTarget(r)}
                >
                  Resume
                </button>
              ),
            },
          ]}
        />
      )}

      {!showGgrDesk && !showFraud && (
        <AdminDataTable
          title="Live Matches · Pricing Risk Monitor"
          data={liveExposures}
          columns={[
            { header: 'Match ID', key: 'matchId', render: (r) => <span className="admin-text-mono" style={{ fontSize: '0.76rem' }}>{r.matchId}</span> },
            { header: 'Match', key: 'match', render: (r) => <span style={{ fontWeight: 700 }}>{r.match}</span> },
            { header: 'Market', key: 'market' },
            { header: 'Odds 1', key: 'oddsTeam1', render: (r) => <span style={{ fontWeight: 800, color: '#38bdf8' }}>{oddsOrDash(r.oddsTeam1)}</span> },
            { header: 'Odds 2', key: 'oddsTeam2', render: (r) => <span style={{ fontWeight: 800, color: '#38bdf8' }}>{oddsOrDash(r.oddsTeam2)}</span> },
            { header: 'Source', key: 'oddsSource', render: (r) => <span className="admin-badge admin-badge--neutral">{r.oddsSource || r.source || '—'}</span> },
            { header: 'Exposure', key: 'exposure', render: (r) => moneyOrDash(r.exposure) },
            { header: 'Liability', key: 'liability', render: (r) => <span style={{ fontWeight: 700, color: '#fb7185' }}>{moneyOrDash(r.liability)}</span> },
            {
              header: 'Risk',
              key: 'riskScore',
              render: (r) => <StatusBadge status={r.riskScore} />,
            },
            {
              header: 'Action',
              key: 'action',
              sortable: false,
              render: (r) => (
                <div style={{ display: 'flex', gap: '5px' }}>
                  <button
                    type="button"
                    className="admin-btn admin-btn--secondary admin-btn--sm"
                    onClick={() => setSelectedMatchId(r.matchId)}
                    style={{ color: '#60a5fa' }}
                  >
                    Debug Odds
                  </button>
                  <button
                    type="button"
                    className="admin-btn admin-btn--danger admin-btn--sm"
                    onClick={() => setSuspendTarget(r)}
                  >
                    Suspend
                  </button>
                </div>
              ),
            },
          ]}
        />
      )}

      {showOddsDesk && !showGgrDesk && !showFraud && (
        <AdminCard
          title="Odds Desk · V3 Pricing Debug"
          subtitle="Inspect live canonical state, winner line, market count, and engine status — no invented prices."
          accent="#818cf8"
          style={{ marginTop: '20px' }}
          actions={
            <select
              value={selectedMatchId || ''}
              onChange={(e) => setSelectedMatchId(e.target.value || null)}
              className="admin-select"
              style={{ minWidth: '260px' }}
            >
              <option value="">Select live match…</option>
              {oddsMatches.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.team1} vs {m.team2} ({m.id})
                </option>
              ))}
            </select>
          }
        >
          {loadingDebug && <p style={{ color: 'var(--admin-text-muted)', margin: '8px 0' }}>Loading authoritative odds snapshot…</p>}

          {!loadingDebug && oddsDebug && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginTop: '12px' }}>
              <div style={{ padding: '12px', borderRadius: 'var(--admin-radius-sm)', background: 'var(--admin-bg)', border: '1px solid var(--admin-border)' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--admin-text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Match</div>
                <div style={{ marginTop: '6px', fontWeight: 700, color: 'var(--admin-text)' }}>
                  {oddsDebug.match?.team1} vs {oddsDebug.match?.team2}
                </div>
                <div style={{ marginTop: '4px', fontSize: '0.78rem', color: 'var(--admin-text-dim)' }}>
                  {oddsDebug.match?.source || 'n/a'} · {oddsDebug.match?.league || '—'}
                </div>
              </div>
              <div style={{ padding: '12px', borderRadius: 'var(--admin-radius-sm)', background: 'var(--admin-bg)', border: '1px solid var(--admin-border)' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--admin-text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Winner Odds</div>
                <div style={{ marginTop: '6px', fontWeight: 800, fontSize: '1.1rem', color: '#38bdf8' }}>
                  {oddsOrDash(oddsDebug.winnerOdds?.team1)} / {oddsOrDash(oddsDebug.winnerOdds?.team2)}
                </div>
                <div style={{ marginTop: '4px', fontSize: '0.78rem', color: 'var(--admin-text-dim)' }}>
                  status {oddsDebug.winnerOdds?.status || oddsDebug.status} · v{oddsDebug.oddsVersion ?? '—'}
                </div>
              </div>
              <div style={{ padding: '12px', borderRadius: 'var(--admin-radius-sm)', background: 'var(--admin-bg)', border: '1px solid var(--admin-border)' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--admin-text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Canonical</div>
                <div style={{ marginTop: '6px', fontSize: '0.82rem', lineHeight: 1.5, color: 'var(--admin-text)' }}>
                  innings {oddsDebug.canonical?.currentInnings ?? '—'} · target {oddsDebug.canonical?.target ?? '—'}
                  <br />
                  need {oddsDebug.canonical?.runsRequired ?? '—'} off {oddsDebug.canonical?.ballsRemaining ?? '—'} balls
                </div>
              </div>
              <div style={{ padding: '12px', borderRadius: 'var(--admin-radius-sm)', background: 'var(--admin-bg)', border: '1px solid var(--admin-border)' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--admin-text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Markets</div>
                <div style={{ marginTop: '6px', fontWeight: 800, fontSize: '1.1rem', color: 'var(--admin-text)' }}>{oddsDebug.marketsCount ?? 0}</div>
                <div style={{ marginTop: '4px', fontSize: '0.78rem', color: 'var(--admin-text-dim)' }}>
                  {winnerMarket ? `${winnerMarket.selections?.length || 0} winner selections` : 'winner market unavailable'}
                </div>
              </div>
            </div>
          )}
        </AdminCard>
      )}

      <AdminConfirmDialog
        isOpen={!!suspendTarget}
        variant="danger"
        icon="⛔"
        title={`Suspend Market for ${suspendTarget?.match}?`}
        description="This will immediately freeze betting and odds intake for this market across all active customers."
        requireReason
        reasonPlaceholder="Suspension reason (e.g. Unusual betting pattern, Feed anomaly)..."
        reasonDefault="MANUAL_ADMIN"
        details={suspendTarget ? [
          { label: 'Match', value: suspendTarget.match },
          { label: 'Market', value: suspendTarget.market },
          { label: 'Exposure', value: moneyOrDash(suspendTarget.exposure) },
          { label: 'Liability', value: moneyOrDash(suspendTarget.liability) },
        ] : []}
        confirmLabel="Suspend Market"
        onConfirm={handleMarketSuspend}
        onCancel={() => setSuspendTarget(null)}
        loading={suspending}
      />

      <AdminConfirmDialog
        isOpen={!!resumeTarget}
        variant="warning"
        icon="▶"
        title={`Resume ${resumeTarget?.marketId}?`}
        description="Clears this suspension cause. The market reopens only when no other active causes remain."
        requireReason
        reasonPlaceholder="Confirm cause to clear (must match active reason)…"
        reasonDefault={resumeTarget?.reason || 'MANUAL_ADMIN'}
        details={resumeTarget ? [
          { label: 'Market', value: resumeTarget.marketId },
          { label: 'Cause', value: resumeTarget.reason },
          { label: 'Source', value: resumeTarget.source || '—' },
          { label: 'Actor', value: resumeTarget.actor || '—' },
        ] : []}
        confirmLabel="Resume Market"
        onConfirm={handleMarketResume}
        onCancel={() => setResumeTarget(null)}
        loading={resuming}
      />

      <AdminConfirmDialog
        isOpen={suspendLiveBook}
        variant="danger"
        icon="⛔"
        title="Suspend all live match-winner markets?"
        description="Adds a MANUAL_ADMIN_LIVE_BOOK cause on every live match-winner market in the trading book and OddsYra SRL window. Individual markets can be resumed from the suspension queue."
        requireReason
        reasonPlaceholder="Reason for live-book freeze…"
        reasonDefault="MANUAL_ADMIN_LIVE_BOOK"
        confirmLabel="Suspend live book"
        onConfirm={handleSuspendLiveBook}
        onCancel={() => setSuspendLiveBook(false)}
        loading={suspending}
      />
    </div>
  );
}
