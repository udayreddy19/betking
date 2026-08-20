import React, { useState, useEffect } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import AdminDataTable from '../components/AdminDataTable';
import { useAdminToast } from '../components/AdminToastContext';

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

  const handleMarketSuspend = (row) => {
    adminApiClient.post('/trading/suspend-market', {
      matchId: row.matchId,
      marketId: `${row.matchId}:match_winner`,
      marketKey: row.market,
      reason: 'MANUAL_ADMIN',
    })
      .then(() => showToast(`Market suspended for ${row.match}`, 'success'))
      .catch((err) => showToast(err.message || 'Suspend failed', 'error'));
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
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>{heading}</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
          {hint}
        </p>
        {error && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.82rem' }}>{error}</p>}
      </div>

      {showGgrDesk && deskMetrics && (
        <>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '12px',
            marginBottom: '20px',
          }}>
            {[
              { label: 'GGR', value: moneyOrDash(deskMetrics.ggr), hint: 'Handle − paid out' },
              { label: 'Hold %', value: pctOrDash(deskMetrics.holdPct), hint: 'GGR / handle' },
              { label: 'Handle', value: moneyOrDash(deskMetrics.handle), hint: 'BET_STAKE total' },
              { label: 'Paid out', value: moneyOrDash(deskMetrics.paidOut), hint: 'Wins + cashouts + voids' },
              { label: 'Open liability', value: moneyOrDash(deskMetrics.openLiability), hint: `${deskMetrics.openBets || 0} open bets` },
              { label: 'Stored liability', value: moneyOrDash(deskMetrics.storedMarketLiability), hint: 'market_selection_liability' },
              { label: 'Mem worst-case', value: moneyOrDash(deskMetrics.memoryWorstCaseLoss), hint: 'In-process exposure' },
              { label: 'Cashouts', value: `${deskMetrics.cashouts?.count || 0}`, hint: moneyOrDash(deskMetrics.cashouts?.stake) },
            ].map((card) => (
              <div
                key={card.label}
                style={{
                  padding: '14px',
                  borderRadius: '10px',
                  border: '1px solid var(--admin-border, #1f2937)',
                  background: 'var(--admin-surface, rgba(15, 23, 42, 0.85))',
                }}
              >
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>{card.label}</div>
                <div style={{ marginTop: '6px', fontSize: '1.15rem', fontWeight: 800 }}>{card.value}</div>
                <div style={{ marginTop: '4px', fontSize: '0.75rem', color: '#64748b' }}>{card.hint}</div>
              </div>
            ))}
          </div>

          <AdminDataTable
            title="Top selection liabilities (persisted)"
            emptyMessage="No persisted market liability yet — place bets to populate"
            data={deskMetrics.topLiabilities || []}
            columns={[
              { header: 'Market', key: 'marketId' },
              { header: 'Selection', key: 'selectionId' },
              { header: 'Net liability', key: 'netLiability', render: (r) => moneyOrDash(r.netLiability) },
              { header: 'Total stake', key: 'totalStake', render: (r) => moneyOrDash(r.totalStake) },
              { header: 'Updated', key: 'updatedAt' },
            ]}
          />
        </>
      )}

      {subModule === 'fraud-signals' && (
        <AdminDataTable
          title="Fraud / risk signals"
          emptyMessage="No risk signals recorded"
          data={fraudSignals}
          columns={[
            { header: 'ID', key: 'id' },
            { header: 'User', key: 'user_id' },
            { header: 'Type', key: 'signal_type' },
            { header: 'Severity', key: 'severity' },
            { header: 'Score', key: 'score' },
            { header: 'Status', key: 'status' },
            { header: 'Created', key: 'created_at' },
          ]}
        />
      )}

      {!showGgrDesk && (
        <AdminDataTable
          title="Live Matches · Pricing Risk Monitor"
          data={liveExposures}
          columns={[
            { header: 'Match ID', key: 'matchId' },
            { header: 'Match', key: 'match' },
            { header: 'Market', key: 'market' },
            { header: 'Odds 1', key: 'oddsTeam1', render: (r) => oddsOrDash(r.oddsTeam1) },
            { header: 'Odds 2', key: 'oddsTeam2', render: (r) => oddsOrDash(r.oddsTeam2) },
            { header: 'Source', key: 'oddsSource', render: (r) => r.oddsSource || r.source || '—' },
            { header: 'Exposure', key: 'exposure', render: (r) => moneyOrDash(r.exposure) },
            { header: 'Liability', key: 'liability', render: (r) => moneyOrDash(r.liability) },
            {
              header: 'Risk',
              key: 'riskScore',
              render: (r) => (
                <span style={{
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  background: r.riskScore === 'HIGH' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                  color: r.riskScore === 'HIGH' ? '#ef4444' : '#f59e0b',
                }}>
                  {r.riskScore}
                </span>
              ),
            },
            {
              header: 'Action',
              key: 'action',
              sortable: false,
              render: (r) => (
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => setSelectedMatchId(r.matchId)}
                    style={{ padding: '4px 10px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', cursor: 'pointer', fontSize: '0.78rem' }}
                  >
                    Debug Odds
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMarketSuspend(r)}
                    style={{ padding: '4px 10px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', cursor: 'pointer', fontSize: '0.78rem' }}
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
        <div style={{
          marginTop: '24px',
          padding: '18px',
          borderRadius: '12px',
          border: '1px solid var(--admin-border)',
          background: 'var(--admin-surface)',
          boxShadow: 'var(--admin-shadow)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--admin-text)' }}>Odds Desk · V3 Pricing Debug</h3>
              <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.8rem' }}>
                Inspect live canonical state, winner line, market count, and engine status — no invented prices.
              </p>
            </div>
            <select
              value={selectedMatchId || ''}
              onChange={(e) => setSelectedMatchId(e.target.value || null)}
              style={{
                minWidth: '280px',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid var(--admin-border)',
                background: 'var(--admin-input-bg)',
                color: 'var(--admin-text)',
              }}
            >
              <option value="">Select live match…</option>
              {oddsMatches.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.team1} vs {m.team2} ({m.id})
                </option>
              ))}
            </select>
          </div>

          {loadingDebug && <p style={{ color: '#94a3b8' }}>Loading authoritative odds snapshot…</p>}

          {!loadingDebug && oddsDebug && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
              <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid #1f2937' }}>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>Match</div>
                <div style={{ marginTop: '6px', fontWeight: 700 }}>
                  {oddsDebug.match?.team1} vs {oddsDebug.match?.team2}
                </div>
                <div style={{ marginTop: '4px', fontSize: '0.8rem', color: '#94a3b8' }}>
                  {oddsDebug.match?.source || 'n/a'} · {oddsDebug.match?.league || '—'}
                </div>
              </div>
              <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid #1f2937' }}>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>Winner Odds</div>
                <div style={{ marginTop: '6px', fontWeight: 800, fontSize: '1.1rem' }}>
                  {oddsOrDash(oddsDebug.winnerOdds?.team1)} / {oddsOrDash(oddsDebug.winnerOdds?.team2)}
                </div>
                <div style={{ marginTop: '4px', fontSize: '0.8rem', color: '#94a3b8' }}>
                  status {oddsDebug.winnerOdds?.status || oddsDebug.status} · v{oddsDebug.oddsVersion ?? '—'}
                </div>
              </div>
              <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid #1f2937' }}>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>Canonical</div>
                <div style={{ marginTop: '6px', fontSize: '0.85rem', lineHeight: 1.5 }}>
                  innings {oddsDebug.canonical?.currentInnings ?? '—'} · target {oddsDebug.canonical?.target ?? '—'}
                  <br />
                  need {oddsDebug.canonical?.runsRequired ?? '—'} off {oddsDebug.canonical?.ballsRemaining ?? '—'} balls
                </div>
              </div>
              <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid #1f2937' }}>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>Markets</div>
                <div style={{ marginTop: '6px', fontWeight: 800, fontSize: '1.1rem' }}>{oddsDebug.marketsCount ?? 0}</div>
                <div style={{ marginTop: '4px', fontSize: '0.8rem', color: '#94a3b8' }}>
                  {winnerMarket ? `${winnerMarket.selections?.length || 0} winner selections` : 'winner market unavailable'}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
