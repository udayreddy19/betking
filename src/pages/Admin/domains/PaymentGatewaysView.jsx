import React, { useState, useEffect, useCallback } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import { useAdminToast } from '../components/AdminToastContext';
import AdminCard from '../components/AdminCard';
import { StatusBadge } from '../components/AdminBadge';
import {
  WalletIcon,
  CircleCheckIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  ActivityIcon,
  InfoIcon,
  ZapIcon,
  SettingsIcon,
} from '../../../icons/animate/index';

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
        enabled: true, // Auto-enable if setting as primary
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
    <div className="space-y-6" style={{ maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header & Mode Banner */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.9) 100%)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '16px',
        padding: '24px',
        backdropFilter: 'blur(12px)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                background: 'rgba(59, 130, 246, 0.15)',
                padding: '8px',
                borderRadius: '10px',
                color: '#60a5fa',
              }}>
                <WalletIcon size={24} />
              </div>
              <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#f8fafc', margin: 0 }}>
                Payment Gateway Management
              </h2>
            </div>
            <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: '6px', margin: 0 }}>
              Manage runtime payment routing, gateway failover, health latency, and customer checkout behavior.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: '700' }}>
                Active Routing Mode
              </div>
              <div style={{ fontSize: '14px', fontWeight: '800', color: '#38bdf8', marginTop: '2px' }}>
                {operationalMode}
              </div>
            </div>

            <button
              onClick={fetchGateways}
              disabled={loading}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                padding: '8px 12px',
                color: '#cbd5e1',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '13px',
              }}
              title="Refresh gateway configs"
            >
              <RefreshCwIcon size={16} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {/* Global Configuration Banner */}
        <div style={{
          marginTop: '20px',
          padding: '12px 16px',
          background: 'rgba(168, 85, 247, 0.08)',
          border: '1px solid rgba(168, 85, 247, 0.2)',
          borderRadius: '10px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <SettingsIcon size={18} style={{ color: '#a855f7' }} />
            <span style={{ fontSize: '13px', color: '#cbd5e1' }}>
              Allow customers to select gateway during checkout (when both are enabled):
            </span>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={allowUserSelection}
              onChange={() => handleToggleUserSelection(allowUserSelection)}
              disabled={updatingProvider === 'GLOBAL'}
              style={{
                width: '18px',
                height: '18px',
                accentColor: '#a855f7',
                cursor: 'pointer',
              }}
            />
            <span style={{ fontSize: '13px', fontWeight: '600', color: allowUserSelection ? '#c084fc' : '#64748b' }}>
              {allowUserSelection ? 'Enabled (User Choice)' : 'Disabled (Primary Only)'}
            </span>
          </label>
        </div>
      </div>

      {/* Gateway Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: '24px' }}>
        {[
          {
            data: cashfree,
            name: 'CASHFREE',
            badgeColor: '#0ea5e9',
            description: 'Direct UPI, NetBanking, Cards, & QR via Cashfree PG SDK v3',
            webhookUrl: 'https://oddsyra.com/api/webhooks/cashfree',
          },
          {
            data: razorpay,
            name: 'RAZORPAY',
            badgeColor: '#3b82f6',
            description: 'Standard Razorpay Checkout modal & instant UPI auto-collection',
            webhookUrl: 'https://oddsyra.com/api/webhooks/razorpay',
          },
        ].map(({ data, name, badgeColor, description, webhookUrl }) => {
          const isUpdating = updatingProvider === name;
          const isTesting = testingProvider === name;
          const testRes = testResults[name];
          const isPrimary = data.isPrimary;
          const isEnabled = data.enabled;
          const stats = data.stats || {};

          return (
            <div
              key={name}
              style={{
                background: 'rgba(15, 23, 42, 0.7)',
                border: `1px solid ${isPrimary ? 'rgba(59, 130, 246, 0.4)' : 'rgba(255, 255, 255, 0.08)'}`,
                borderRadius: '16px',
                padding: '24px',
                position: 'relative',
                boxShadow: isPrimary ? '0 0 20px rgba(59, 130, 246, 0.15)' : 'none',
              }}
            >
              {/* Card Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#f8fafc', margin: 0, letterSpacing: '0.5px' }}>
                      {name}
                    </h3>
                    {isPrimary && (
                      <span style={{
                        background: 'linear-gradient(135deg, #2563eb, #3b82f6)',
                        color: '#fff',
                        fontSize: '10px',
                        fontWeight: '800',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        letterSpacing: '0.5px',
                        textTransform: 'uppercase',
                      }}>
                        Primary Gateway
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px', margin: 0 }}>
                    {description}
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{
                    background: isEnabled ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    color: isEnabled ? '#34d399' : '#f87171',
                    fontSize: '11px',
                    fontWeight: '700',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    border: `1px solid ${isEnabled ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                  }}>
                    {isEnabled ? '● ENABLED' : '○ DISABLED'}
                  </span>
                </div>
              </div>

              {/* Status & Health Metrics Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '12px',
                marginTop: '20px',
                padding: '14px',
                background: 'rgba(0, 0, 0, 0.25)',
                borderRadius: '10px',
                border: '1px solid rgba(255, 255, 255, 0.05)',
              }}>
                <div>
                  <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>Environment</div>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#cbd5e1', marginTop: '2px' }}>
                    {data.environment || 'production'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>API Health</div>
                  <div style={{
                    fontSize: '13px',
                    fontWeight: '700',
                    color: data.healthStatus === 'HEALTHY' ? '#34d399' : (data.healthStatus === 'UNCONFIGURED' ? '#f59e0b' : '#f87171'),
                    marginTop: '2px',
                  }}>
                    {data.healthStatus || 'HEALTHY'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>Response Latency</div>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#93c5fd', marginTop: '2px' }}>
                    {data.lastLatencyMs ? `${data.lastLatencyMs} ms` : '—'}
                  </div>
                </div>
              </div>

              {/* Live Statistics */}
              <div style={{ marginTop: '18px' }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#94a3b8', marginBottom: '8px' }}>
                  Transaction Volume & Status:
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', textAlign: 'center' }}>
                  <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '10px 6px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '10px', color: '#64748b' }}>TOTAL</div>
                    <div style={{ fontSize: '14px', fontWeight: '700', color: '#f8fafc', marginTop: '2px' }}>
                      {stats.totalCount || 0}
                    </div>
                  </div>
                  <div style={{ background: 'rgba(16, 185, 129, 0.05)', padding: '10px 6px', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.1)' }}>
                    <div style={{ fontSize: '10px', color: '#34d399' }}>PAID</div>
                    <div style={{ fontSize: '14px', fontWeight: '700', color: '#34d399', marginTop: '2px' }}>
                      {stats.successCount || 0}
                    </div>
                  </div>
                  <div style={{ background: 'rgba(245, 158, 11, 0.05)', padding: '10px 6px', borderRadius: '8px', border: '1px solid rgba(245, 158, 11, 0.1)' }}>
                    <div style={{ fontSize: '10px', color: '#fbbf24' }}>PENDING</div>
                    <div style={{ fontSize: '14px', fontWeight: '700', color: '#fbbf24', marginTop: '2px' }}>
                      {stats.pendingCount || 0}
                    </div>
                  </div>
                  <div style={{ background: 'rgba(239, 68, 68, 0.05)', padding: '10px 6px', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.1)' }}>
                    <div style={{ fontSize: '10px', color: '#f87171' }}>FAILED</div>
                    <div style={{ fontSize: '14px', fontWeight: '700', color: '#f87171', marginTop: '2px' }}>
                      {stats.failedCount || 0}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b', marginTop: '10px' }}>
                  <span>Settled Volume: <strong style={{ color: '#34d399' }}>₹{(stats.successVolumeInr || 0).toLocaleString('en-IN')}</strong></span>
                  <span>Last Payment: <strong>{stats.lastPaymentAt ? new Date(stats.lastPaymentAt).toLocaleString('en-IN') : 'None'}</strong></span>
                </div>
              </div>

              {/* Test Result Banner if triggered */}
              {testRes && (
                <div style={{
                  marginTop: '14px',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  background: testRes.healthy ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                  border: `1px solid ${testRes.healthy ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: testRes.healthy ? '#34d399' : '#f87171',
                }}>
                  {testRes.healthy ? <CircleCheckIcon size={16} /> : <InfoIcon size={16} />}
                  <span>
                    {testRes.healthy
                      ? `API Ping Succeeded · Response Time: ${testRes.latencyMs}ms (${testRes.environment})`
                      : `Ping Failed: ${testRes.message || testRes.error}`}
                  </span>
                </div>
              )}

              {/* Action Buttons */}
              <div style={{
                display: 'flex',
                gap: '10px',
                marginTop: '20px',
                paddingTop: '16px',
                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              }}>
                <button
                  onClick={() => handleToggle(name, isEnabled)}
                  disabled={isUpdating || (isPrimary && isEnabled && enabledCount === 1)}
                  style={{
                    flex: 1,
                    background: isEnabled ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                    border: `1px solid ${isEnabled ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
                    color: isEnabled ? '#f87171' : '#34d399',
                    padding: '10px',
                    borderRadius: '8px',
                    fontWeight: '700',
                    fontSize: '12px',
                    cursor: (isPrimary && isEnabled && enabledCount === 1) ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                  }}
                  title={isPrimary && isEnabled && enabledCount === 1 ? 'Cannot disable sole primary gateway' : ''}
                >
                  {isEnabled ? 'Disable Gateway' : 'Enable Gateway'}
                </button>

                <button
                  onClick={() => handleSetPrimary(name)}
                  disabled={isPrimary || isUpdating}
                  style={{
                    flex: 1,
                    background: isPrimary ? 'rgba(255, 255, 255, 0.05)' : 'rgba(59, 130, 246, 0.15)',
                    border: `1px solid ${isPrimary ? 'rgba(255, 255, 255, 0.1)' : 'rgba(59, 130, 246, 0.3)'}`,
                    color: isPrimary ? '#64748b' : '#60a5fa',
                    padding: '10px',
                    borderRadius: '8px',
                    fontWeight: '700',
                    fontSize: '12px',
                    cursor: isPrimary ? 'default' : 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  {isPrimary ? '✓ Current Primary' : 'Set as Primary'}
                </button>

                <button
                  onClick={() => handleTestConnection(name)}
                  disabled={isTesting}
                  style={{
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#e2e8f0',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    fontWeight: '600',
                    fontSize: '12px',
                    cursor: isTesting ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <ActivityIcon size={14} className={isTesting ? 'animate-spin' : ''} />
                  Test
                </button>
              </div>

              {/* Webhook Endpoint Info */}
              <div style={{ marginTop: '12px', fontSize: '11px', color: '#475569', wordBreak: 'break-all' }}>
                Webhook: <code style={{ color: '#94a3b8' }}>{webhookUrl}</code>
              </div>
            </div>
          );
        })}
      </div>

      {/* Safety & Architecture Reference Guide */}
      <div style={{
        background: 'rgba(15, 23, 42, 0.5)',
        border: '1px solid rgba(255, 255, 255, 0.05)',
        borderRadius: '12px',
        padding: '18px 24px',
        fontSize: '12px',
        color: '#94a3b8',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#cbd5e1', fontWeight: '700', marginBottom: '6px' }}>
          <ShieldCheckIcon size={16} style={{ color: '#10b981' }} />
          <span>Production Isolation & In-Flight Safety Rules</span>
        </div>
        <ul style={{ margin: 0, paddingLeft: '20px', lineHeight: '1.7' }}>
          <li><strong>Zero Interrupted Settle:</strong> Disabling a gateway only blocks new order creation; pending in-flight payments remain reconcilable via webhooks.</li>
          <li><strong>Cross-Provider Rejection:</strong> Cashfree webhooks strictly reject Razorpay orders, and Razorpay webhooks strictly reject Cashfree orders.</li>
          <li><strong>Failsafe Mode:</strong> If both gateways are disabled, the system refuses new orders cleanly without creating dummy or mock records.</li>
          <li><strong>Server-Authoritative:</strong> All credits execute under row locks in PostgreSQL double-entry ledgers upon cryptographic signature validation.</li>
        </ul>
      </div>
    </div>
  );
}
