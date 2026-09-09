import React, { useState, useEffect, useCallback } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import { useAdminToast } from '../components/AdminToastContext';
import {
  WalletIcon,
  CircleCheckIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  ActivityIcon,
  InfoIcon,
  SettingsIcon,
} from '../../../icons/animate/index';
import './PaymentGatewaysView.css';
import { formatIst, formatIstDateTime } from '../../../utils/istTime';

export default function PaymentGatewaysView() {
  const [gateways, setGateways] = useState([]);
  const [loading, setLoading] = useState(true);
  const [testingProvider, setTestingProvider] = useState(null);
  const [updatingProvider, setUpdatingProvider] = useState(null);
  const [testResults, setTestResults] = useState({});
  const { showToast } = useAdminToast();

  const [promoRules, setPromoRules] = useState({
    minimumDepositAmount: 1000,
    allowPartialFreeBet: false,
    allowPartialBonus: false,
    requireFullFreeBetAmount: true,
    requireFullBonusAmount: true,
  });
  const [savingRules, setSavingRules] = useState(false);

  const [routingConfig, setRoutingConfig] = useState({
    routingMode: 'WEIGHTED',
    weights: { RAZORPAY: 50, CASHFREE: 50, MANUAL_UPI: 0 },
    autoPayoutRules: {
      enabled: true,
      maxInstantAmount: 5000,
      requireKyc: true,
      blockIfFraudRisk: true,
      dailyCapPerUser: 25000,
    },
  });
  const [savingRouting, setSavingRouting] = useState(false);

  const fetchGateways = useCallback(async () => {
    try {
      setLoading(true);
      const [res, rulesRes, routeRes] = await Promise.allSettled([
        adminApiClient.get('/payment-gateways'),
        adminApiClient.get('/wallet-promo-rules'),
        adminApiClient.get('/payment-gateways/routing'),
      ]);
      if (res.status === 'fulfilled') {
        setGateways(res.value?.gateways || []);
      }
      if (rulesRes.status === 'fulfilled' && rulesRes.value?.rules) {
        setPromoRules(rulesRes.value.rules);
      }
      if (routeRes.status === 'fulfilled' && routeRes.value?.routing) {
        setRoutingConfig(routeRes.value.routing);
      }
    } catch (err) {
      showToast(err.message || 'Failed to load payment gateways', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const handleSaveRouting = async () => {
    setSavingRouting(true);
    try {
      const res = await adminApiClient.patch('/payment-gateways/routing', routingConfig);
      if (res.routing) setRoutingConfig(res.routing);
      showToast('Gateway auto-routing and payout rules saved!', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to save routing rules', 'error');
    } finally {
      setSavingRouting(false);
    }
  };

  const handleSavePromoRules = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setSavingRules(true);
    try {
      const res = await adminApiClient.patch('/wallet-promo-rules', promoRules);
      if (res.rules) setPromoRules(res.rules);
      showToast('Wallet & promotion rules saved successfully!', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to save wallet rules', 'error');
    } finally {
      setSavingRules(false);
    }
  };

  useEffect(() => {
    fetchGateways();
  }, [fetchGateways]);

  const handleToggle = async (provider, currentEnabled) => {
    setUpdatingProvider(provider);
    try {
      const res = await adminApiClient.patch(`/payment-gateways/${provider.toLowerCase()}`, {
        enabled: !currentEnabled,
      });
      setGateways(res.gateways || []);
      showToast(`${provider} ${!currentEnabled ? 'enabled' : 'disabled'} successfully`, 'success');
    } catch (err) {
      showToast(err.message || `Failed to update ${provider}`, 'error');
    } finally {
      setUpdatingProvider(null);
    }
  };

  const handleSetPrimary = async (provider) => {
    setUpdatingProvider(provider);
    try {
      const res = await adminApiClient.patch(`/payment-gateways/${provider.toLowerCase()}`, {
        isPrimary: true,
        enabled: true,
      });
      setGateways(res.gateways || []);
      showToast(`${provider} is now the PRIMARY payment gateway`, 'success');
    } catch (err) {
      showToast(err.message || `Failed to set ${provider} as primary`, 'error');
    } finally {
      setUpdatingProvider(null);
    }
  };

  const handleToggleUserSelection = async (currentVal) => {
    setUpdatingProvider('GLOBAL');
    try {
      const res = await adminApiClient.patch('/payment-gateways/cashfree', {
        allowUserSelection: !currentVal,
      });
      setGateways(res.gateways || []);
      showToast(`User gateway selection ${!currentVal ? 'enabled' : 'disabled'}`, 'success');
    } catch (err) {
      showToast(err.message || 'Failed to update gateway selection mode', 'error');
    } finally {
      setUpdatingProvider(null);
    }
  };

  const handleTestConnection = async (provider) => {
    setTestingProvider(provider);
    try {
      const res = await adminApiClient.post(`/payment-gateways/${provider.toLowerCase()}/test`, {});
      setTestResults((prev) => ({
        ...prev,
        [provider]: res,
      }));
      if (res.healthy) {
        showToast(`${provider} connection healthy (${res.latencyMs}ms)`, 'success');
      } else {
        showToast(`${provider} connection issue: ${res.message || res.error}`, 'warning');
      }
      fetchGateways();
    } catch (err) {
      showToast(err.message || `Failed to test ${provider} connection`, 'error');
      setTestResults((prev) => ({
        ...prev,
        [provider]: { healthy: false, latencyMs: 0, message: err.message },
      }));
    } finally {
      setTestingProvider(null);
    }
  };

  const cashfree = gateways.find((g) => g.provider === 'CASHFREE') || {};
  const razorpay = gateways.find((g) => g.provider === 'RAZORPAY') || {};

  const enabledCount = gateways.filter((g) => g.enabled).length;
  const primaryGateway = gateways.find((g) => g.isPrimary && g.enabled);
  const allowUserSelection = gateways.some((g) => g.allowUserSelection);

  let operationalMode = 'FAILSAFE (ALL DISABLED)';
  if (enabledCount === 2) {
    operationalMode = allowUserSelection ? 'DUAL GATEWAY (USER SELECTION)' : `PRIMARY ROUTING (${primaryGateway?.provider || 'CASHFREE'})`;
  } else if (cashfree.enabled) {
    operationalMode = 'CASHFREE ONLY';
  } else if (razorpay.enabled) {
    operationalMode = 'RAZORPAY ONLY';
  }

  return (
    <div className="pg-mgmt-container">
      {/* Header & Mode Banner */}
      <div className="pg-mgmt-header">
        <div className="pg-mgmt-header-top">
          <div className="pg-mgmt-title-group">
            <div className="pg-mgmt-title-icon">
              <WalletIcon size={24} />
            </div>
            <div>
              <h2 className="pg-mgmt-title">
                Payment Gateway Management
              </h2>
              <p className="pg-mgmt-subtitle">
                Manage runtime payment routing, gateway failover, health latency, and customer checkout behavior.
              </p>
            </div>
          </div>

          <div className="pg-mgmt-header-actions">
            <div>
              <div className="pg-mgmt-mode-label">
                Active Routing Mode
              </div>
              <div className="pg-mgmt-mode-value">
                {operationalMode}
              </div>
            </div>

            <button
              type="button"
              onClick={fetchGateways}
              disabled={loading}
              className="pg-mgmt-refresh-btn"
              title="Refresh gateway configs"
            >
              <RefreshCwIcon size={15} className={loading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Global Configuration Banner */}
        <div className="pg-mgmt-global-banner">
          <div className="pg-mgmt-global-banner-left">
            <SettingsIcon size={18} />
            <span>
              Allow customers to select gateway during checkout (when both are enabled):
            </span>
          </div>
          <label className="pg-mgmt-toggle-label">
            <input
              type="checkbox"
              checked={allowUserSelection}
              onChange={() => handleToggleUserSelection(allowUserSelection)}
              disabled={updatingProvider === 'GLOBAL'}
              className="pg-mgmt-checkbox"
            />
            <span className={`pg-mgmt-toggle-status ${allowUserSelection ? 'pg-mgmt-toggle-status--enabled' : 'pg-mgmt-toggle-status--disabled'}`}>
              {allowUserSelection ? 'Enabled (User Choice)' : 'Disabled (Primary Only)'}
            </span>
          </label>
        </div>
      </div>

      {/* Gateway Cards Grid */}
      <div className="pg-mgmt-grid">
        {[
          {
            data: cashfree,
            name: 'CASHFREE',
            description: 'Direct UPI, NetBanking, Cards, & QR via Cashfree PG SDK v3',
            webhookUrl: 'https://oddsyra.com/api/webhooks/cashfree',
          },
          {
            data: razorpay,
            name: 'RAZORPAY',
            description: 'Standard Razorpay Checkout modal & instant UPI auto-collection',
            webhookUrl: 'https://oddsyra.com/api/webhooks/razorpay',
          },
        ].map(({ data, name, description, webhookUrl }) => {
          const isUpdating = updatingProvider === name;
          const isTesting = testingProvider === name;
          const testRes = testResults[name];
          const isPrimary = data.isPrimary;
          const isEnabled = data.enabled;
          const stats = data.stats || {};

          return (
            <div
              key={name}
              className={`pg-card ${isPrimary ? 'pg-card--primary' : ''}`}
            >
              <div>
                {/* Card Header */}
                <div className="pg-card-header">
                  <div>
                    <div className="pg-card-title-row">
                      <h3 className="pg-card-title">
                        {name}
                      </h3>
                      {isPrimary && (
                        <span className="pg-primary-badge">
                          Primary Gateway
                        </span>
                      )}
                    </div>
                    <p className="pg-card-desc">
                      {description}
                    </p>
                  </div>

                  <div>
                    <span className={`pg-status-pill ${isEnabled ? 'pg-status-pill--enabled' : 'pg-status-pill--disabled'}`}>
                      {isEnabled ? '● ENABLED' : '○ DISABLED'}
                    </span>
                  </div>
                </div>

                {/* Status & Health Metrics Grid */}
                <div className="pg-metrics-grid">
                  <div>
                    <div className="pg-metric-label">Environment</div>
                    <div className="pg-metric-value">
                      {data.environment || 'production'}
                    </div>
                  </div>
                  <div>
                    <div className="pg-metric-label">API Health</div>
                    <div className={`pg-metric-value ${
                      data.healthStatus === 'HEALTHY'
                        ? 'pg-metric-value--healthy'
                        : (data.healthStatus === 'UNCONFIGURED' ? 'pg-metric-value--warning' : 'pg-metric-value--danger')
                    }`}>
                      {data.healthStatus || 'HEALTHY'}
                    </div>
                  </div>
                  <div>
                    <div className="pg-metric-label">Response Latency</div>
                    <div className="pg-metric-value pg-metric-value--latency">
                      {data.lastLatencyMs ? `${data.lastLatencyMs} ms` : '—'}
                    </div>
                  </div>
                </div>

                {/* Live Statistics */}
                <div className="pg-stats-section">
                  <div className="pg-stats-heading">
                    Transaction Volume & Status:
                  </div>
                  <div className="pg-stats-grid">
                    <div className="pg-stat-box">
                      <div className="pg-stat-box-label">TOTAL</div>
                      <div className="pg-stat-box-num">
                        {stats.totalCount || 0}
                      </div>
                    </div>
                    <div className="pg-stat-box pg-stat-box--paid">
                      <div className="pg-stat-box-label">PAID</div>
                      <div className="pg-stat-box-num">
                        {stats.successCount || 0}
                      </div>
                    </div>
                    <div className="pg-stat-box pg-stat-box--pending">
                      <div className="pg-stat-box-label">PENDING</div>
                      <div className="pg-stat-box-num">
                        {stats.pendingCount || 0}
                      </div>
                    </div>
                    <div className="pg-stat-box pg-stat-box--failed">
                      <div className="pg-stat-box-label">FAILED</div>
                      <div className="pg-stat-box-num">
                        {stats.failedCount || 0}
                      </div>
                    </div>
                  </div>

                  <div className="pg-volume-footer">
                    <span>Settled Volume: <strong className="pg-volume-highlight">₹{(stats.successVolumeInr || 0).toLocaleString('en-IN')}</strong></span>
                    <span>Last Payment: <strong>{stats.lastPaymentAt ? formatIstDateTime(stats.lastPaymentAt) : 'None'}</strong></span>
                  </div>
                </div>

                {/* Test Result Banner if triggered */}
                {testRes && (
                  <div className={`pg-test-banner ${testRes.healthy ? 'pg-test-banner--healthy' : 'pg-test-banner--error'}`}>
                    {testRes.healthy ? <CircleCheckIcon size={16} /> : <InfoIcon size={16} />}
                    <span>
                      {testRes.healthy
                        ? `API Ping Succeeded · Response Time: ${testRes.latencyMs}ms (${testRes.environment})`
                        : `Ping Failed: ${testRes.message || testRes.error}`}
                    </span>
                  </div>
                )}
              </div>

              <div>
                {/* Action Buttons */}
                <div className="pg-actions-row">
                  <button
                    type="button"
                    onClick={() => handleToggle(name, isEnabled)}
                    disabled={isUpdating || (isPrimary && isEnabled && enabledCount === 1)}
                    className={`pg-btn pg-btn-toggle ${isEnabled ? 'pg-btn-toggle--disable' : 'pg-btn-toggle--enable'}`}
                    title={isPrimary && isEnabled && enabledCount === 1 ? 'Cannot disable sole primary gateway' : ''}
                  >
                    {isEnabled ? 'Disable Gateway' : 'Enable Gateway'}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSetPrimary(name)}
                    disabled={isPrimary || isUpdating}
                    className={`pg-btn pg-btn-primary-switch ${isPrimary ? 'pg-btn-primary-switch--active' : 'pg-btn-primary-switch--inactive'}`}
                  >
                    {isPrimary ? '✓ Current Primary' : 'Set as Primary'}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTestConnection(name)}
                    disabled={isTesting}
                    className="pg-btn pg-btn-test"
                  >
                    <ActivityIcon size={14} className={isTesting ? 'animate-spin' : ''} />
                    <span>Test</span>
                  </button>
                </div>

                {/* Webhook Endpoint Info */}
                <div className="pg-webhook-info">
                  Webhook: <code className="pg-webhook-code">{webhookUrl}</code>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Smart Gateway Auto-Routing & Instant Auto-Payouts */}
      <div className="pg-card" style={{ marginTop: 24, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ActivityIcon size={20} />
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
                Smart Gateway Auto-Routing & Instant Auto-Payouts
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--admin-text-muted)' }}>
                Dynamically route deposit volume between providers and automate instant payouts under strict risk thresholds.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSaveRouting}
            disabled={savingRouting}
            className="pg-btn pg-btn-primary-switch--active"
            style={{ padding: '6px 18px' }}
          >
            {savingRouting ? 'Saving Routing…' : 'Save Routing & Payout Rules'}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 16 }}>
          {/* Routing Strategy */}
          <div style={{ background: 'var(--admin-card-bg-subtle, rgba(255,255,255,0.03))', padding: 14, borderRadius: 'var(--admin-radius)', border: '1px solid var(--admin-border, #333)' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 8 }}>
              Deposit Routing Strategy
            </label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              {[
                { id: 'WEIGHTED', label: 'Weighted Split' },
                { id: 'HEALTH_PRIORITY', label: 'Health Auto-Failover' },
                { id: 'PRIMARY', label: 'Primary Only' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`admin-btn admin-btn--sm${routingConfig.routingMode === m.id ? ' admin-btn--secondary' : ' admin-btn--ghost'}`}
                  style={{ fontSize: '0.75rem', padding: '3px 8px' }}
                  onClick={() => setRoutingConfig((p) => ({ ...p, routingMode: m.id }))}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* Split Sliders */}
            {routingConfig.routingMode === 'WEIGHTED' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: 4 }}>
                    <span style={{ fontWeight: 600 }}>Razorpay Weight</span>
                    <span style={{ fontWeight: 800, color: '#38bdf8' }}>{routingConfig.weights?.RAZORPAY ?? 50}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={routingConfig.weights?.RAZORPAY ?? 50}
                    onChange={(e) => {
                      const rz = Number(e.target.value);
                      setRoutingConfig((p) => ({
                        ...p,
                        weights: { ...p.weights, RAZORPAY: rz, CASHFREE: Math.max(0, 100 - rz - (p.weights?.MANUAL_UPI || 0)) },
                      }));
                    }}
                    style={{ width: '100%', accentColor: '#38bdf8' }}
                  />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: 4 }}>
                    <span style={{ fontWeight: 600 }}>Cashfree Weight</span>
                    <span style={{ fontWeight: 800, color: '#34d399' }}>{routingConfig.weights?.CASHFREE ?? 50}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={routingConfig.weights?.CASHFREE ?? 50}
                    onChange={(e) => {
                      const cf = Number(e.target.value);
                      setRoutingConfig((p) => ({
                        ...p,
                        weights: { ...p.weights, CASHFREE: cf, RAZORPAY: Math.max(0, 100 - cf - (p.weights?.MANUAL_UPI || 0)) },
                      }));
                    }}
                    style={{ width: '100%', accentColor: '#34d399' }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Instant Auto-Payout Thresholds */}
          <div style={{ background: 'var(--admin-card-bg-subtle, rgba(255,255,255,0.03))', padding: 14, borderRadius: 'var(--admin-radius)', border: '1px solid var(--admin-border, #333)' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 8 }}>
              ⚡ Instant Auto-Payout Guardrails
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={routingConfig.autoPayoutRules?.enabled ?? true}
                  onChange={(e) => setRoutingConfig((p) => ({
                    ...p,
                    autoPayoutRules: { ...p.autoPayoutRules, enabled: e.target.checked },
                  }))}
                  style={{ accentColor: '#10b981' }}
                />
                Enable Instant Auto-Payouts
              </label>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--admin-text-muted)' }}>Max Instant Amount:</span>
              <span style={{ fontWeight: 700 }}>₹</span>
              <input
                type="number"
                min="500"
                max="50000"
                step="500"
                value={routingConfig.autoPayoutRules?.maxInstantAmount ?? 5000}
                onChange={(e) => setRoutingConfig((p) => ({
                  ...p,
                  autoPayoutRules: { ...p.autoPayoutRules, maxInstantAmount: Number(e.target.value) || 5000 },
                }))}
                style={{
                  width: '120px',
                  padding: '4px 8px',
                  background: 'var(--admin-input-bg, #1e1e1e)',
                  color: 'inherit',
                  border: '1px solid var(--admin-border, #444)',
                  borderRadius: 4,
                  fontWeight: 700,
                  fontSize: '0.84rem',
                }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.76rem', color: 'var(--admin-text-muted)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={routingConfig.autoPayoutRules?.requireKyc ?? true}
                  onChange={(e) => setRoutingConfig((p) => ({
                    ...p,
                    autoPayoutRules: { ...p.autoPayoutRules, requireKyc: e.target.checked },
                  }))}
                  style={{ accentColor: '#10b981' }}
                />
                Require Verified KYC (blocks unverified users)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={routingConfig.autoPayoutRules?.blockIfFraudRisk ?? true}
                  onChange={(e) => setRoutingConfig((p) => ({
                    ...p,
                    autoPayoutRules: { ...p.autoPayoutRules, blockIfFraudRisk: e.target.checked },
                  }))}
                  style={{ accentColor: '#ef4444' }}
                />
                Auto-Hold on Risk / Syndicate Flagged Accounts
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Wallet & Promotion Balance Rules Configuration */}
      <div className="pg-card" style={{ marginTop: 24, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <WalletIcon size={20} />
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
              Wallet & Promotion Rules
            </h3>
          </div>
          <button
            type="button"
            onClick={handleSavePromoRules}
            disabled={savingRules}
            className="pg-btn pg-btn-primary-switch--active"
            style={{ padding: '6px 18px' }}
          >
            {savingRules ? 'Saving...' : 'Save Rules'}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          <div style={{ background: 'var(--admin-card-bg-subtle, rgba(255,255,255,0.03))', padding: 14, borderRadius: 'var(--admin-radius)', border: '1px solid var(--admin-border, #333)' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 6 }}>
              Minimum Deposit Amount (INR)
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 700, fontSize: '1rem' }}>₹</span>
              <input
                type="number"
                min="1"
                step="100"
                value={promoRules.minimumDepositAmount}
                onChange={(e) => setPromoRules((p) => ({ ...p, minimumDepositAmount: Number(e.target.value) || 1000 }))}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'var(--admin-input-bg, #1e1e1e)',
                  color: 'inherit',
                  border: '1px solid var(--admin-border, #444)',
                  borderRadius: 'var(--admin-radius)',
                  fontWeight: 700,
                }}
              />
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted, #888)', marginTop: 4 }}>
              Server-authoritative minimum threshold. Rejects requests below ₹{promoRules.minimumDepositAmount}.
            </p>
          </div>

          <div style={{ background: 'var(--admin-card-bg-subtle, rgba(255,255,255,0.03))', padding: 14, borderRadius: 'var(--admin-radius)', border: '1px solid var(--admin-border, #333)' }}>
            <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 6 }}>
              Free Bet Exact Stake Rule
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                padding: '4px 10px',
                borderRadius: 4,
                fontSize: '0.8rem',
                fontWeight: 700,
                background: !promoRules.allowPartialFreeBet ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                color: !promoRules.allowPartialFreeBet ? '#22c55e' : '#ef4444',
              }}>
                {!promoRules.allowPartialFreeBet ? '✓ FULL STAKE REQUIRED' : 'PARTIAL ALLOWED'}
              </span>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted, #888)', marginTop: 4 }}>
              Free bets must be used in a single qualifying bet. Splitting or partial deductions are blocked.
            </p>
          </div>

          <div style={{ background: 'var(--admin-card-bg-subtle, rgba(255,255,255,0.03))', padding: 14, borderRadius: 'var(--admin-radius)', border: '1px solid var(--admin-border, #333)' }}>
            <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 6 }}>
              Bonus Exact Stake Rule
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                padding: '4px 10px',
                borderRadius: 4,
                fontSize: '0.8rem',
                fontWeight: 700,
                background: !promoRules.allowPartialBonus ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                color: !promoRules.allowPartialBonus ? '#22c55e' : '#ef4444',
              }}>
                {!promoRules.allowPartialBonus ? '✓ FULL STAKE REQUIRED' : 'PARTIAL ALLOWED'}
              </span>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted, #888)', marginTop: 4 }}>
              Bonus funds must be placed as full qualifying bets according to turnover rules.
            </p>
          </div>
        </div>
      </div>

      {/* Safety & Architecture Reference Guide */}
      <div className="pg-safety-guide">
        <div className="pg-safety-guide-header">
          <ShieldCheckIcon size={16} />
          <span>Production Isolation & In-Flight Safety Rules</span>
        </div>
        <ul className="pg-safety-list">
          <li><strong>Zero Interrupted Settle:</strong> Disabling a gateway only blocks new order creation; pending in-flight payments remain reconcilable via webhooks.</li>
          <li><strong>Cross-Provider Rejection:</strong> Cashfree webhooks strictly reject Razorpay orders, and Razorpay webhooks strictly reject Cashfree orders.</li>
          <li><strong>Failsafe Mode:</strong> If both gateways are disabled, the system refuses new orders cleanly without creating dummy or mock records.</li>
          <li><strong>Server-Authoritative:</strong> All credits execute under row locks in PostgreSQL double-entry ledgers upon cryptographic signature validation.</li>
        </ul>
      </div>
    </div>
  );
}
