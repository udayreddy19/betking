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
  const [otherSportsEngineStatus, setOtherSportsEngineStatus] = useState(null);
  const [otherSportsEngineSaving, setOtherSportsEngineSaving] = useState(false);
  const [platformReady, setPlatformReady] = useState(null);

  // Dynamic Margin & Trading Control State
  const [marginConfig, setMarginConfig] = useState({
    defaultOverround: 0.055,
    liabilitySensitivity: 0.06,
    activeTier: 'cricket_marquee',
    sportMargins: { cricket: 0.045, football: 0.050, tennis: 0.040, basketball: 0.050, esports: 0.070 },
  });
  const [savingMargin, setSavingMargin] = useState(false);
  const [fastFreezes, setFastFreezes] = useState([]);
  const [freezeDuration, setFreezeDuration] = useState(30);
  const [freezingFast, setFreezingFast] = useState(false);
  const [simulatedShading, setSimulatedShading] = useState(null);
  const [liveCockpitMatches, setLiveCockpitMatches] = useState([]);
  const [cockpitLoading, setCockpitLoading] = useState(false);

  const loadTraderCockpit = useCallback(async () => {
    try {
      setCockpitLoading(true);
      const res = await adminApiClient.get('/trading/cockpit/live-matches');
      setLiveCockpitMatches(res.matches || []);
    } catch {
      setLiveCockpitMatches([]);
    } finally {
      setCockpitLoading(false);
    }
  }, []);

  const handleToggleMarketSuspension = async (matchId, currentlySuspended) => {
    try {
      const res = await adminApiClient.post('/trading/cockpit/suspend-market', {
        matchId,
        suspended: !currentlySuspended,
        reason: currentlySuspended ? 'Trader manual resume' : 'Trader emergency suspension',
      });
      showToast(res.message || 'Updated match market status', 'success');
      loadTraderCockpit();
    } catch (err) {
      showToast(err.message || 'Failed to update suspension', 'error');
    }
  };

  const handleNudgeOdds = async (matchId, delta) => {
    try {
      const res = await adminApiClient.post('/trading/cockpit/nudge-odds', {
        matchId,
        nudgeDelta: delta,
      });
      showToast(res.message || `Odds nudged by ${delta}`, 'success');
    } catch (err) {
      showToast(err.message || 'Failed to nudge odds', 'error');
    }
  };

  const loadMarginConfig = useCallback(() => {
    adminApiClient.get('/trading/margin-config')
      .then((res) => { if (res.config) setMarginConfig(res.config); })
      .catch(() => {});
  }, []);

  const loadFastFreezes = useCallback(() => {
    adminApiClient.get('/trading/fast-freeze')
      .then((res) => { setFastFreezes(res.freezes || []); })
      .catch(() => setFastFreezes([]));
  }, []);

  const handleSaveMargin = async (newConfig) => {
    setSavingMargin(true);
    try {
      const res = await adminApiClient.post('/trading/margin-config', newConfig || marginConfig);
      if (res.config) setMarginConfig(res.config);
      showToast('Trading margin & sensitivity updated', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to save margin config', 'error');
    } finally {
      setSavingMargin(false);
    }
  };

  const handleTriggerFastFreeze = async (targetId, duration = freezeDuration) => {
    setFreezingFast(true);
    try {
      await adminApiClient.post('/trading/fast-freeze', {
        targetId: targetId || selectedMatchId || 'LIVE_BOOK',
        durationSeconds: duration,
        reason: 'IN_PLAY_ADMIN_FAST_FREEZE',
      });
      showToast(`Fast freeze activated for ${duration}s (${targetId || 'LIVE_BOOK'})`, 'warning');
      loadFastFreezes();
      loadSuspensions();
    } catch (err) {
      showToast(err.message || 'Fast freeze failed', 'error');
    } finally {
      setFreezingFast(false);
    }
  };

  const handleClearFastFreeze = async (targetId) => {
    try {
      await adminApiClient.delete(`/trading/fast-freeze/${encodeURIComponent(targetId)}`);
      showToast(`Fast freeze cleared for ${targetId}`, 'success');
      loadFastFreezes();
      loadSuspensions();
    } catch (err) {
      showToast(err.message || 'Clear fast freeze failed', 'error');
    }
  };

  const handleSimulateShading = async (team1Liab = 75000, team2Liab = 15000) => {
    try {
      const res = await adminApiClient.post('/trading/simulate-shading', {
        selections: [
          { id: 'TEAM_1', name: 'Team 1 (Heavy Action)', trueProb: 0.55, liability: team1Liab },
          { id: 'TEAM_2', name: 'Team 2 (Low Action)', trueProb: 0.45, liability: team2Liab },
        ],
        baseOverround: marginConfig.defaultOverround,
        sensitivity: marginConfig.liabilitySensitivity,
      });
      setSimulatedShading(res.selections || null);
    } catch (_) {}
  };

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

  const loadOtherSportsEngineStatus = useCallback(() => {
    adminApiClient.get('/odds-model/other-sports/engine')
      .then((data) => setOtherSportsEngineStatus(data.data || data))
      .catch(() => setOtherSportsEngineStatus(null));
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
          ? 'Cricket V4 live — resource MW + V3 market catalog'
          : mode === 'shadow'
            ? 'Cricket shadow — V3 live, V4 compare only'
            : 'Cricket V3 live',
        'success',
      );
    } catch (err) {
      showToast(err.message || 'Engine switch failed', 'error');
    } finally {
      setEngineSaving(false);
    }
  };

  const setOtherSportsEngineMode = async (mode) => {
    setOtherSportsEngineSaving(true);
    try {
      const data = await adminApiClient.post('/odds-model/other-sports/engine', { mode });
      setOtherSportsEngineStatus(data.data || data);
      showToast(
        mode === 'v4'
          ? 'Other sports V4 live — house-hardened book'
          : mode === 'shadow'
            ? 'Other sports shadow — V3 live, V4 compare only'
            : 'Other sports V3 live',
        'success',
      );
    } catch (err) {
      showToast(err.message || 'Other sports engine switch failed', 'error');
    } finally {
      setOtherSportsEngineSaving(false);
    }
  };

  useEffect(() => {
    if (!showOddsHealth && !showOddsDesk) return undefined;
    loadEngineStatus();
    loadOtherSportsEngineStatus();
    loadPlatformReady();
    loadMarginConfig();
    loadFastFreezes();
    handleSimulateShading();
    return undefined;
  }, [showOddsHealth, showOddsDesk, loadEngineStatus, loadOtherSportsEngineStatus, loadPlatformReady, loadMarginConfig, loadFastFreezes]);

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
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Cricket odds engine</div>
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

      {(showOddsDesk || showOddsHealth) && (
        <AdminCard>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Other sports odds engine</div>
              <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.78rem' }}>
                Soccer / basketball / tennis / American football — V4 is house-hardened (thick book + Over/Yes caps).
                {' '}Active: <strong>{otherSportsEngineStatus?.resolved || otherSportsEngineStatus?.active || '…'}</strong>
                {otherSportsEngineStatus?.source ? ` (${otherSportsEngineStatus.source})` : ''}
                {otherSportsEngineStatus?.envDefault ? ` · env ${otherSportsEngineStatus.envDefault}` : ''}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[
                { mode: 'v3', label: 'V3 live' },
                { mode: 'v4', label: 'V4 live' },
                { mode: 'shadow', label: 'Shadow' },
              ].map((btn) => {
                const active = (otherSportsEngineStatus?.resolved || otherSportsEngineStatus?.active) === btn.mode;
                return (
                  <button
                    key={btn.mode}
                    type="button"
                    disabled={otherSportsEngineSaving}
                    className={`admin-btn admin-btn--sm${active ? '' : ' admin-btn--ghost'}`}
                    onClick={() => setOtherSportsEngineMode(btn.mode)}
                  >
                    {btn.label}
                  </button>
                );
              })}
            </div>
          </div>
        </AdminCard>
      )}

      {(showOddsDesk || showOddsHealth) && (
        <AdminCard
          title="Dynamic Trading & Odds Margin Engine"
          subtitle="Real-time overround calibration, liability-driven odds shading, and in-play fast freeze protection."
          accent="#38bdf8"
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '16px' }}>
            {/* Overround Tuning */}
            <div style={{ padding: '14px', background: 'var(--admin-bg)', borderRadius: 'var(--admin-radius-sm)', border: '1px solid var(--admin-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.84rem', fontWeight: 700 }}>Base Market Overround</span>
                <span style={{ fontSize: '1rem', fontWeight: 800, color: '#38bdf8' }}>
                  {((marginConfig.defaultOverround || 0.05) * 100).toFixed(1)}%
                </span>
              </div>
              <input
                type="range"
                min="0.035"
                max="0.120"
                step="0.005"
                value={marginConfig.defaultOverround || 0.055}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setMarginConfig((prev) => ({ ...prev, defaultOverround: val }));
                  handleSimulateShading(75000, 15000);
                }}
                style={{ width: '100%', accentColor: '#38bdf8', cursor: 'pointer' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--admin-text-muted)', marginTop: '4px' }}>
                <span>3.5% (Thin book)</span>
                <span>12.0% (High hold)</span>
              </div>

              {/* Sport Presets */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '12px' }}>
                {[
                  { label: 'Cricket Marquee (3.5%)', val: 0.035, tier: 'cricket_marquee' },
                  { label: 'Football Tier 1 (4.0%)', val: 0.040, tier: 'football_tier1' },
                  { label: 'Tennis GS (4.5%)', val: 0.045, tier: 'tennis_grand_slam' },
                  { label: 'Cricket Death (7.5%)', val: 0.075, tier: 'cricket_inplay_death' },
                ].map((preset) => (
                  <button
                    key={preset.tier}
                    type="button"
                    className="admin-btn admin-btn--ghost admin-btn--sm"
                    style={{
                      fontSize: '0.72rem',
                      padding: '3px 8px',
                      background: marginConfig.activeTier === preset.tier ? 'rgba(56, 189, 248, 0.15)' : undefined,
                      borderColor: marginConfig.activeTier === preset.tier ? '#38bdf8' : undefined,
                    }}
                    onClick={() => {
                      const updated = {
                        ...marginConfig,
                        defaultOverround: preset.val,
                        activeTier: preset.tier,
                      };
                      setMarginConfig(updated);
                      handleSaveMargin(updated);
                      handleSimulateShading(75000, 15000);
                    }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Liability Sensitivity */}
            <div style={{ padding: '14px', background: 'var(--admin-bg)', borderRadius: 'var(--admin-radius-sm)', border: '1px solid var(--admin-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.84rem', fontWeight: 700 }}>Liability Shading Sensitivity</span>
                <span style={{ fontSize: '1rem', fontWeight: 800, color: '#a78bfa' }}>
                  {((marginConfig.liabilitySensitivity || 0.06) * 100).toFixed(1)}%
                </span>
              </div>
              <input
                type="range"
                min="0.00"
                max="0.12"
                step="0.01"
                value={marginConfig.liabilitySensitivity || 0.06}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setMarginConfig((prev) => ({ ...prev, liabilitySensitivity: val }));
                  handleSimulateShading(75000, 15000);
                }}
                style={{ width: '100%', accentColor: '#a78bfa', cursor: 'pointer' }}
              />
              <p style={{ fontSize: '0.74rem', color: 'var(--admin-text-muted)', margin: '8px 0 12px' }}>
                Higher sensitivity automatically shortens odds on heavily bet sides while lengthening opposing lines to attract balanced book volume.
              </p>
              <button
                type="button"
                className="admin-btn admin-btn--primary admin-btn--sm"
                disabled={savingMargin}
                onClick={() => handleSaveMargin()}
              >
                {savingMargin ? 'Saving Rules…' : 'Save Margin & Shading Rules'}
              </button>
            </div>
          </div>

          {/* Shaded Odds Simulation Preview */}
          <div style={{ padding: '14px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: 'var(--admin-radius-sm)', border: '1px solid var(--admin-border)', marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--admin-text-muted)' }}>
                ⚡ Real-Time Shading Preview (₹75k vs ₹15k Imbalance)
              </span>
              <button
                type="button"
                className="admin-btn admin-btn--ghost admin-btn--sm"
                style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                onClick={() => handleSimulateShading(75000, 15000)}
              >
                Simulate Shift
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
              {(simulatedShading || [
                { id: 'TEAM_1', name: 'Team 1 (Heavy Action)', unshadedOdds: 1.82, odds: 1.74, liability: 75000, liabilityShare: 83.3 },
                { id: 'TEAM_2', name: 'Team 2 (Low Action)', unshadedOdds: 2.05, odds: 2.16, liability: 15000, liabilityShare: 16.7 },
              ]).map((sel) => (
                <div key={sel.id} style={{ padding: '10px 12px', borderRadius: 'var(--admin-radius-sm)', background: 'var(--admin-bg)', border: '1px solid var(--admin-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 600 }}>
                    <span>{sel.name}</span>
                    <span style={{ color: sel.liabilityShare > 50 ? '#f87171' : '#34d399' }}>{sel.liabilityShare}% action</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '6px' }}>
                    <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#38bdf8' }}>{sel.odds?.toFixed(2)}</span>
                    <span style={{ fontSize: '0.75rem', textDecoration: 'line-through', color: 'var(--admin-text-muted)' }}>
                      {sel.unshadedOdds ? sel.unshadedOdds.toFixed(2) : '—'}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--admin-text-dim)' }}>
                      (₹{Number(sel.liability).toLocaleString()})
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* In-Play Fast Freeze Emergency Control */}
          <div style={{ padding: '14px', background: 'rgba(239, 68, 68, 0.05)', borderRadius: 'var(--admin-radius-sm)', border: '1px solid rgba(239, 68, 68, 0.25)' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#f87171' }}>
                  🚨 In-Play Fast Freeze (Wicket / VAR / Suspicious Action)
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)', marginTop: '2px' }}>
                  Temporarily freezes market intake across all live clients with automatic countdown unfreeze.
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {[30, 60, 120, 300].map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      className={`admin-btn admin-btn--sm${freezeDuration === sec ? ' admin-btn--secondary' : ' admin-btn--ghost'}`}
                      style={{ padding: '3px 8px', fontSize: '0.75rem' }}
                      onClick={() => setFreezeDuration(sec)}
                    >
                      {sec < 60 ? `${sec}s` : `${sec / 60}m`}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={freezingFast}
                  className="admin-btn admin-btn--danger admin-btn--sm"
                  onClick={() => handleTriggerFastFreeze(selectedMatchId, freezeDuration)}
                >
                  Freeze {selectedMatchId ? 'Selected Match' : 'Live Book'} ({freezeDuration}s)
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn--danger admin-btn--ghost admin-btn--sm"
                  onClick={() => setSuspendLiveBook(true)}
                >
                  Permanent Suspend
                </button>
              </div>
            </div>

            {/* Active Freezes List */}
            {fastFreezes.length > 0 && (
              <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {fastFreezes.map((f) => (
                  <div
                    key={f.targetId}
                    style={{
                      padding: '4px 10px',
                      background: 'rgba(239, 68, 68, 0.15)',
                      borderRadius: 'var(--admin-radius-sm)',
                      border: '1px solid rgba(239, 68, 68, 0.4)',
                      fontSize: '0.75rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <span style={{ fontWeight: 700, color: '#f87171' }}>⏱ {f.targetId}</span>
                    <span style={{ color: 'var(--admin-text-muted)' }}>{f.remainingSeconds}s left</span>
                    <button
                      type="button"
                      style={{ background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600, padding: 0 }}
                      onClick={() => handleClearFastFreeze(f.targetId)}
                    >
                      Unfreeze
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </AdminCard>
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

      {/* LIVE TRADER COCKPIT & EMERGENCY KILL-SWITCH */}
      <div style={{ marginBottom: 24, background: 'var(--admin-surface, #1e293b)', border: '1px solid var(--admin-border, #334155)', borderRadius: '16px', padding: '18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0, color: 'var(--admin-text)' }}>
              ⚡ Live Trader Cockpit & Emergency Market Kill-Switch
            </h3>
            <span style={{ fontSize: '0.76rem', color: 'var(--admin-text-muted)' }}>
              Real-time match book intervention: instant market suspension, +/- odds nudging, and dynamic liability caps.
            </span>
          </div>
          <button
            type="button"
            className="admin-btn admin-btn--secondary"
            onClick={loadTraderCockpit}
            disabled={cockpitLoading}
          >
            ↻ Refresh Cockpit
          </button>
        </div>

        <AdminDataTable
          title="In-Play & Upcoming Matches Switchboard"
          emptyMessage="No live or upcoming matches found"
          data={liveCockpitMatches}
          columns={[
            {
              header: 'Match',
              key: 'title',
              render: (r) => (
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--admin-text)' }}>{r.title}</div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--admin-text-muted)' }}>
                    {r.competition} ({r.sport}) · Score: {r.score}
                  </div>
                </div>
              ),
            },
            {
              header: 'Status',
              key: 'status',
              render: (r) => <StatusBadge status={r.isSuspended ? 'SUSPENDED' : r.status} />,
            },
            { header: 'Active Bets', key: 'activeBets', render: (r) => Number(r.activeBets || 0).toLocaleString() },
            {
              header: 'Turnover',
              key: 'totalStake',
              render: (r) => (
                <span style={{ fontWeight: 700, color: 'var(--admin-accent, #6366f1)' }}>
                  {moneyOrDash(r.totalStake)}
                </span>
              ),
            },
            {
              header: 'Market Kill-Switch',
              key: 'killSwitch',
              render: (r) => (
                <button
                  type="button"
                  className={r.isSuspended ? 'admin-btn admin-btn--success' : 'admin-btn admin-btn--danger'}
                  style={{ fontSize: '0.72rem', padding: '4px 10px', whiteSpace: 'nowrap' }}
                  onClick={() => handleToggleMarketSuspension(r.matchId, r.isSuspended)}
                >
                  {r.isSuspended ? '🟢 Resume Market' : '🔴 Suspend Market'}
                </button>
              ),
            },
            {
              header: 'Odds Nudge',
              key: 'oddsNudge',
              render: (r) => (
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    type="button"
                    className="admin-btn admin-btn--secondary"
                    style={{ fontSize: '0.7rem', padding: '2px 6px' }}
                    onClick={() => handleNudgeOdds(r.matchId, 0.05)}
                  >
                    +0.05
                  </button>
                  <button
                    type="button"
                    className="admin-btn admin-btn--secondary"
                    style={{ fontSize: '0.7rem', padding: '2px 6px' }}
                    onClick={() => handleNudgeOdds(r.matchId, -0.05)}
                  >
                    -0.05
                  </button>
                </div>
              ),
            },
          ]}
        />
      </div>

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
