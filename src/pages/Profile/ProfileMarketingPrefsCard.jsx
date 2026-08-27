import { useCallback, useEffect, useState } from 'react';
import { getAccessToken } from '../../utils/apiClient';

/**
 * Marketing email preferences — transactional/security mail is never toggled off here.
 */
export default function ProfileMarketingPrefsCard() {
  const [marketingEmail, setMarketingEmail] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = getAccessToken();
      const res = await fetch('/api/v1/user/notifications/preferences', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.preferences) {
        setMarketingEmail(data.preferences.marketing_email !== false);
      }
    } catch {
      /* keep default */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (next) => {
    setSaving(true);
    setMessage('');
    try {
      const token = getAccessToken();
      const res = await fetch('/api/v1/user/notifications/preferences', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          marketingEmail: next,
          source: 'profile',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setMarketingEmail(next);
      setMessage(next ? 'Promotional emails enabled.' : 'You have unsubscribed from promotional emails.');
    } catch (err) {
      setMessage(err.message || 'Could not update preferences');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="profile-card-section" style={{ marginTop: 16 }}>
      <h3 style={{ margin: '0 0 8px', fontSize: '1rem' }}>Email preferences</h3>
      <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: 'var(--text-muted, #64748b)' }}>
        Promotional offers are sent from promos@oddsyra.com. Account, payment, KYC, and security emails are always delivered.
      </p>
      {loading ? (
        <p style={{ fontSize: '0.85rem' }}>Loading…</p>
      ) : (
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.9rem' }}>
          <input
            type="checkbox"
            checked={marketingEmail}
            disabled={saving}
            onChange={(e) => save(e.target.checked)}
          />
          Receive promotional emails
        </label>
      )}
      {message && <p style={{ marginTop: 8, fontSize: '0.8rem' }}>{message}</p>}
    </div>
  );
}
