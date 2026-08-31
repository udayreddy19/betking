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

export default function PaymentGatewaysView() {
  const [gateways, setGateways] = useState([]);
  const [loading, setLoading] = useState(true);
  const [testingProvider, setTestingProvider] = useState(null);
  const [updatingProvider, setUpdatingProvider] = useState(null);
  const [testResults, setTestResults] = useState({});
  const { showToast } = useAdminToast();

  const fetchGateways = useCallback(async () => {
    try {
      setLoading(true);
      const res = await adminApiClient.get('/payment-gateways');
      setGateways(res.gateways || []);
    } catch (err) {
      showToast(err.message || 'Failed to load payment gateways', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

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
                    <span>Last Payment: <strong>{stats.lastPaymentAt ? new Date(stats.lastPaymentAt).toLocaleString('en-IN') : 'None'}</strong></span>
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
