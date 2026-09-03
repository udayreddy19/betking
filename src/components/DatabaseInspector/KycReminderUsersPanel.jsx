import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { adminApiClient } from '../../pages/Admin/api/adminApiClient';
import { formatIst } from '../../utils/istTime';
import './KycReminderUsersPanel.css';

function formatWhen(value) {
  if (!value) return null;
  try {
    return formatIst(value, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return String(value);
  }
}

/**
 * Eligible Needs-KYC users only (server 24h cooldown).
 * Single action: Send to all — disabled until cooldown ends.
 */
export default function KycReminderUsersPanel({
  onSent,
  compact = false,
  title = 'Users needing KYC completion email',
} = {}) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [cooldownHours, setCooldownHours] = useState(24);
  const [nextEligibleAt, setNextEligibleAt] = useState(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    adminApiClient.get('/customers?kyc=NEEDS_KYC_ELIGIBLE&limit=200')
      .then((data) => {
        if (cancelled) return;
        setUsers(data.users || []);
        if (data.cooldownHours) setCooldownHours(Number(data.cooldownHours) || 24);
        setNextEligibleAt(data.nextEligibleAt || null);
      })
      .catch((err) => {
        if (cancelled) return;
        setUsers([]);
        setError(err.message || 'Failed to load users needing KYC');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => load(), [load]);

  // Refresh countdown while in cooldown
  useEffect(() => {
    if (!nextEligibleAt || users.length > 0) return undefined;
    const id = setInterval(() => {
      setNowTick(Date.now());
      if (new Date(nextEligibleAt).getTime() <= Date.now()) load();
    }, 30000);
    return () => clearInterval(id);
  }, [nextEligibleAt, users.length, load]);

  const canSend = users.length > 0 && !sending;
  const cooldownActive = users.length === 0 && nextEligibleAt && new Date(nextEligibleAt).getTime() > nowTick;

  const cooldownLabel = useMemo(() => {
    if (!cooldownActive) return null;
    const ms = new Date(nextEligibleAt).getTime() - nowTick;
    if (ms <= 0) return null;
    const hrs = Math.floor(ms / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
  }, [cooldownActive, nextEligibleAt, nowTick]);

  const sendAll = async () => {
    const ids = users.map((u) => u.id).filter(Boolean);
    if (!ids.length) return;
    setSending(true);
    setError('');
    setNotice('');
    try {
      const res = await adminApiClient.post(
        '/kyc/reminders',
        { userIds: ids },
        { headers: { 'X-Idempotency-Key': `kyc_all_${Date.now()}` } },
      );
      setNotice(
        `${res.sent || 0} reminder(s) queued/sent. Send to all is locked for ${cooldownHours} hours.`,
      );
      setConfirm(false);
      load();
      onSent?.(res);
    } catch (err) {
      setError(err.message || 'Send to all failed');
      setConfirm(false);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={`kyc-reminder-panel${compact ? ' kyc-reminder-panel--compact' : ''}`}>
      <div className="kyc-reminder-panel__header">
        <div>
          <div className="kyc-reminder-panel__title">{title}</div>
          <div className="kyc-reminder-panel__sub">
            Shows only users eligible for a KYC email (not reminded in the last {cooldownHours}h).
            After Send to all, the list clears and the button unlocks when the cooldown ends.
          </div>
        </div>
        <div className="kyc-reminder-panel__actions">
          <button type="button" className="kyc-reminder-btn kyc-reminder-btn--secondary" onClick={() => load()}>
            {loading ? 'Loading…' : 'Refresh list'}
          </button>
          <button
            type="button"
            className="kyc-reminder-btn kyc-reminder-btn--primary"
            disabled={!canSend}
            title={
              cooldownActive
                ? `Available again after ${formatWhen(nextEligibleAt)}`
                : users.length === 0
                  ? 'No eligible users'
                  : 'Send KYC reminder to everyone listed'
            }
            onClick={() => setConfirm(true)}
          >
            {sending
              ? 'Sending…'
              : cooldownActive
                ? `Send to all (unlocks in ${cooldownLabel})`
                : `Send to all (${users.length})`}
          </button>
        </div>
      </div>

      {error && <div className="kyc-reminder-panel__error" role="alert">{error}</div>}
      {notice && <div className="kyc-reminder-panel__notice" role="status">{notice}</div>}
      {cooldownActive && (
        <div className="kyc-reminder-panel__empty">
          Reminders were sent recently. Eligible users return after {formatWhen(nextEligibleAt)}
          {cooldownLabel ? ` (in ${cooldownLabel})` : ''}.
        </div>
      )}

      {loading && users.length === 0 && !cooldownActive ? (
        <div className="kyc-reminder-panel__empty">Loading users…</div>
      ) : users.length === 0 && !cooldownActive ? (
        <div className="kyc-reminder-panel__empty">
          No users currently need a KYC reminder (all verified or already reminded).
        </div>
      ) : users.length > 0 ? (
        <div className="kyc-reminder-panel__table-wrap">
          <table className="kyc-reminder-panel__table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>KYC status</th>
                <th>Last reminder</th>
                <th>Count</th>
                <th>Delivery</th>
                <th>Cooldown</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="kyc-reminder-panel__cell-strong">{u.name || u.id}</td>
                  <td className="kyc-reminder-panel__cell-strong">{u.email || '—'}</td>
                  <td>
                    <span className="kyc-reminder-panel__kyc">{u.kyc || 'NOT_STARTED'}</span>
                  </td>
                  <td>{u.lastReminderAt ? formatWhen(u.lastReminderAt) : '—'}</td>
                  <td>{u.reminderCount != null ? u.reminderCount : 0}</td>
                  <td>{u.lastReminderStatus || '—'}</td>
                  <td>
                    {u.reminderEligible === false
                      ? (u.nextEligibleAt ? `Until ${formatWhen(u.nextEligibleAt)}` : 'Active')
                      : 'Eligible'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {confirm && (
        <div className="kyc-reminder-modal-backdrop" role="dialog" aria-modal="true">
          <div className="kyc-reminder-modal">
            <h3>Send KYC reminders to all {users.length} users?</h3>
            <p>
              After sending, this list and Send to all stay locked for {cooldownHours} hours
              (per-user server cooldown).
            </p>
            <div className="kyc-reminder-modal__footer">
              <button type="button" className="kyc-reminder-btn kyc-reminder-btn--secondary" onClick={() => setConfirm(false)}>
                Cancel
              </button>
              <button type="button" className="kyc-reminder-btn kyc-reminder-btn--primary" onClick={sendAll}>
                Send to all
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
