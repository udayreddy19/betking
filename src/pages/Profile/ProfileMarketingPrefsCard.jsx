import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../utils/apiClient';
import {
  isPushSupported,
  getPushPermissionState,
  subscribeUserToPush,
  unsubscribeUserFromPush,
} from '../../utils/webPushClient';

/**
 * Enterprise Notification Settings Card
 * Browser Web Push, Promotional Opt-ins, and Transactional Safeguards.
 */
export default function ProfileMarketingPrefsCard() {
  const [marketingEmail, setMarketingEmail] = useState(true);
  const [marketingPush, setMarketingPush] = useState(true);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushPermission, setPushPermission] = useState('default');
  const [loading, setLoading] = useState(true);
  const [pushProcessing, setPushProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const loadPreferencesAndPush = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      setPushPermission(getPushPermissionState());

      const [prefRes, pushStatusRes] = await Promise.all([
        apiFetch('/api/v1/user/notifications/preferences').catch(() => null),
        apiFetch('/api/v1/user/push/status').catch(() => null),
      ]);

      if (prefRes && prefRes.ok) {
        const prefData = await prefRes.json().catch(() => ({}));
        if (prefData.preferences) {
          setMarketingEmail(prefData.preferences.marketingEmail !== false && prefData.preferences.marketing_email !== false);
          setMarketingPush(prefData.preferences.marketingPush !== false && prefData.preferences.marketing_push !== false);
        }
      }

      if (pushStatusRes && pushStatusRes.ok) {
        const pushData = await pushStatusRes.json().catch(() => ({}));
        setPushSubscribed(Boolean(pushData.subscribed));
      }
    } catch {
      /* keep defaults */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPreferencesAndPush();
  }, [loadPreferencesAndPush]);

  const togglePush = async () => {
    setPushProcessing(true);
    setMessage('');
    setErrorMessage('');

    try {
      if (pushSubscribed) {
        const res = await unsubscribeUserFromPush();
        if (res.success) {
          setPushSubscribed(false);
          setMessage('Browser notifications disabled.');
        } else {
          setErrorMessage(res.error || 'Failed to disable notifications.');
        }
      } else {
        const res = await subscribeUserToPush();
        if (res.success) {
          setPushSubscribed(true);
          setPushPermission('granted');
          setMessage('Browser notifications successfully enabled! You will now receive instant updates on your bets and rewards.');
        } else {
          setPushPermission(getPushPermissionState());
          if (res.blocked) {
            setErrorMessage('Notifications are blocked in your browser settings. Please allow notifications in your browser address bar to enable.');
          } else {
            setErrorMessage(res.error || 'Could not enable browser notifications.');
          }
        }
      }
    } catch (err) {
      setErrorMessage(err.message || 'Push operation failed.');
    } finally {
      setPushProcessing(false);
    }
  };

  const saveMarketing = async (emailNext, pushNext) => {
    setSaving(true);
    setMessage('');
    setErrorMessage('');
    try {
      const res = await apiFetch('/api/v1/user/notifications/preferences', {
        method: 'POST',
        body: JSON.stringify({
          marketingEmail: emailNext,
          marketingPush: pushNext,
          source: 'profile_settings',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setMarketingEmail(emailNext);
      setMarketingPush(pushNext);
      setMessage('Notification preferences updated successfully.');
    } catch (err) {
      setErrorMessage(err.message || 'Could not update preferences');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="profile-card-section" style={{ marginTop: 16 }}>
      <h3 style={{ margin: '0 0 12px', fontSize: '1.05rem', fontWeight: 700 }}>Notification Settings</h3>

      {loading ? (
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted, #64748b)' }}>Loading settings…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 🔔 Browser Notifications */}
          <div style={{ padding: '12px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>🔔 Browser Notifications</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted, #64748b)', marginTop: 2 }}>
                  Receive instant alerts about your bets, settled outcomes, free bets, and withdrawals.
                </div>
              </div>
              <div>
                {!isPushSupported() ? (
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted, #64748b)' }}>Not supported in this browser</span>
                ) : (
                  <button
                    type="button"
                    onClick={togglePush}
                    disabled={pushProcessing}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 6,
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      cursor: pushProcessing ? 'not-allowed' : 'pointer',
                      background: pushSubscribed ? '#dc2626' : '#10b981',
                      color: '#ffffff',
                      border: 'none',
                      transition: 'opacity 0.2s',
                    }}
                  >
                    {pushProcessing ? 'Processing…' : pushSubscribed ? 'Disable Push' : 'Enable Push'}
                  </button>
                )}
              </div>
            </div>
            {pushSubscribed && (
              <div style={{ marginTop: 8, fontSize: '0.8rem', color: '#10b981', fontWeight: 500 }}>
                ✓ Browser Push is Active on this device
              </div>
            )}
            {pushPermission === 'denied' && (
              <div style={{ marginTop: 8, fontSize: '0.8rem', color: '#ef4444' }}>
                ⚠️ Notifications are currently blocked in your browser settings.
              </div>
            )}
          </div>

          {/* 🎁 Promotional Offers */}
          <div style={{ padding: '12px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: 6 }}>🎁 Promotional Notifications</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.88rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={marketingEmail}
                  disabled={saving}
                  onChange={(e) => saveMarketing(e.target.checked, marketingPush)}
                />
                Receive promotional bonuses, VIP cashback, and offers via Email
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.88rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={marketingPush}
                  disabled={saving}
                  onChange={(e) => saveMarketing(marketingEmail, e.target.checked)}
                />
                Receive promotional notifications via Browser Push
              </label>
            </div>
          </div>

          {/* 🛡️ Transactional Alerts Guarantee */}
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted, #64748b)', paddingLeft: 4 }}>
            ℹ️ Critical security, password, KYC verification, bet settlements, and withdrawal notices are always delivered.
          </div>
        </div>
      )}

      {message && <p style={{ marginTop: 12, fontSize: '0.85rem', color: '#10b981' }}>{message}</p>}
      {errorMessage && <p style={{ marginTop: 12, fontSize: '0.85rem', color: '#ef4444' }}>{errorMessage}</p>}
    </div>
  );
}
