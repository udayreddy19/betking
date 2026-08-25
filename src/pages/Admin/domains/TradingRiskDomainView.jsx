import React, { useState, useEffect } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import AdminDataTable from '../components/AdminDataTable';
import { useAdminToast } from '../components/AdminToastContext';
import { StatusBadge } from '../components/AdminBadge';
import AdminKPI from '../components/AdminKPI';
import AdminCard from '../components/AdminCard';
import AdminConfirmDialog from '../components/AdminConfirmDialog';

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

export default function TradingRiskDomainView({ subModule }) {
  const [liveExposures, setLiveExposures] = useState([]);
  const [oddsMatches, setOddsMatches] = useState([]);
  const [selectedMatchId, setSelectedMatchId] = useState(null);
  const [oddsDebug, setOddsDebug] = useState(null);
  const [loadingDebug, setLoadingDebug] = useState(false);
  const [fraudSignals, setFraudSignals] = useState([]);
  const [deskMetrics, setDeskMetrics] = useState(null);
  const [error, setError] = useState(null);
  const [suspendTarget, setSuspendTarget] = useState(null);
  const [suspending, setSuspending] = useState(false);
  const { showToast } = useAdminToast();

  const showOddsDesk = !subModule || subModule === 'exposure' || subModule === 'suspension' || subModule === 'fraud-signals';
  const showGgrDesk = subModule === 'ggr-liability';

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
    if (subModule !== 'fraud-signals') return undefined;
    let cancelled = false;
    adminApiClient.get('/fraud/signals')
      .then((data) => {
        if (cancelled) return;
        setFraudSignals(data.signals || []);
      })
      .catch(() => {
        if (!cancelled) setFraudSignals([]);
      });
    return () => { cancelled = true; };
  }, [subModule]);

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
    } catch (err) {
      showToast(err.message || 'Suspend failed', 'error');
    } finally {
      setSuspending(false);
    }
  };

  const winnerMarket = (oddsDebug?.markets || []).find((m) => m.marketId === 'match_winner');

  const heading = showGgrDesk
    ? '04 · GGR / Hold % / Liability Desk'
    : '04 · Trading Desk & Live Risk Exposure Console';
  const hint = showGgrDesk
    ? 'Ledger GGR, hold percentage, and open/persisted market liability for traders.'
    : 'Live match pricing risk from OddsEngineV3. Stake liability shows once open bets are ledger-backed.';

  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>{heading}</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
          {hint}
        </p>
        {error && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.78rem' }}>{error}</p>}
      </div>

      {showGgrDesk && deskMetrics && (
        <>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '12px',
            marginBottom: '20px',
          }}>
            {[
              { label: 'GGR', value: moneyOrDash(deskMetrics.ggr), hint: 'Handle − paid out', accent: '#a78bfa' },
              { label: 'Hold %', value: pctOrDash(deskMetrics.holdPct), hint: 'GGR / handle', accent: '#34d399' },
              { label: 'Handle', value: moneyOrDash(deskMetrics.handle), hint: 'BET_STAKE total', accent: '#38bdf8' },
              { label: 'Paid out', value: moneyOrDash(deskMetrics.paidOut), hint: 'Wins + cashouts + voids', accent: '#fb923c' },
              { label: 'Open liability', value: moneyOrDash(deskMetrics.openLiability), hint: `${deskMetrics.openBets || 0} open bets`, accent: '#f87171' },
              { label: 'Stored liability', value: moneyOrDash(deskMetrics.storedMarketLiability), hint: 'market_selection_liability', accent: '#fbbf24' },
              { label: 'Mem worst-case', value: moneyOrDash(deskMetrics.memoryWorstCaseLoss), hint: 'In-process exposure', accent: '#f43f5e' },
              { label: 'Cashouts', value: `${deskMetrics.cashouts?.count || 0}`, hint: moneyOrDash(deskMetrics.cashouts?.stake), accent: '#818cf8' },
            ].map((card) => (
              <AdminKPI
                key={card.label}
                label={card.label}
                value={card.value}
                trendLabel={card.hint}
                accent={card.accent}
              />
            ))}
          </div>

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

      {subModule === 'fraud-signals' && (
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
      )}

      {!showGgrDesk && (
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

      {showOddsDesk && !showGgrDesk && (
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

      {/* Market Suspend Confirm */}
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
    </div>
  );
}
