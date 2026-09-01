import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useUserNotifications } from '../../hooks/useUserNotifications';
import './NotificationCenter.css';

const CATEGORIES = [
  { id: 'ALL', label: 'All' },
  { id: 'BET', label: 'Bets' },
  { id: 'WALLET', label: 'Wallet' },
  { id: 'SETTLEMENT', label: 'Settlement' },
  { id: 'KYC', label: 'KYC' },
  { id: 'SECURITY', label: 'Security' },
  { id: 'PROMOTION', label: 'Promo' },
  { id: 'REFERRAL', label: 'Referral' },
  { id: 'WITHDRAWAL', label: 'Withdrawal' },
  { id: 'SYSTEM', label: 'System' },
];

function normalizeCategory(n) {
  const raw = String(n.category || n.eventType || n.type || 'SYSTEM').toUpperCase();
  if (CATEGORIES.some((c) => c.id === raw)) return raw;
  if (/BET|ODDS/.test(raw)) return 'BET';
  if (/WALLET|DEPOSIT|BALANCE/.test(raw)) return 'WALLET';
  if (/SETTLE|PAYOUT|WON|LOST|VOID/.test(raw)) return 'SETTLEMENT';
  if (/KYC/.test(raw)) return 'KYC';
  if (/SECURITY|LOGIN|MFA/.test(raw)) return 'SECURITY';
  if (/PROMO|BONUS|SPIN/.test(raw)) return 'PROMOTION';
  if (/REFERRAL/.test(raw)) return 'REFERRAL';
  if (/WITHDRAW/.test(raw)) return 'WITHDRAWAL';
  return 'SYSTEM';
}

function deepLinkFor(n) {
  const cat = normalizeCategory(n);
  if (cat === 'BET' || cat === 'SETTLEMENT') return '/bets';
  if (cat === 'WALLET' || cat === 'WITHDRAWAL') return '/profile';
  if (cat === 'KYC') return '/profile';
  if (cat === 'PROMOTION' || cat === 'REFERRAL') return '/promotions';
  if (n.link) return n.link;
  return null;
}

export default function NotificationCenter() {
  const navigate = useNavigate();
  const { isLoggedIn, user } = useAuth();
  const {
    notifications,
    unreadCount,
    loading,
    refresh,
    markRead,
    markAllRead,
    clearNotification,
  } = useUserNotifications(isLoggedIn, user?.id || user?.userId);
  const [category, setCategory] = useState('ALL');

  const filtered = useMemo(() => {
    if (category === 'ALL') return notifications;
    return notifications.filter((n) => normalizeCategory(n) === category);
  }, [notifications, category]);

  if (!isLoggedIn) {
    return (
      <div className="notif-center">
        <h1>Notifications</h1>
        <p className="notif-center__meta">Sign in to view your notification history.</p>
        <button type="button" className="notif-center__btn" onClick={() => navigate('/register')}>
          Sign in
        </button>
      </div>
    );
  }

  return (
    <div className="notif-center">
      <header className="notif-center__head">
        <div>
          <h1>Notifications</h1>
          <p className="notif-center__meta">
            {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
            {loading ? ' · refreshing…' : ''}
          </p>
        </div>
        <div className="notif-center__actions">
          <button type="button" className="notif-center__btn outline" onClick={refresh}>
            Refresh
          </button>
          <button type="button" className="notif-center__btn" onClick={markAllRead} disabled={!unreadCount}>
            Mark all read
          </button>
        </div>
      </header>

      <div className="notif-center__tabs" role="tablist" aria-label="Notification categories">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={category === c.id}
            className={`notif-center__tab${category === c.id ? ' is-active' : ''}`}
            onClick={() => setCategory(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="notif-center__empty">No notifications in this category.</p>
      ) : (
        <ul className="notif-center__list">
          {filtered.map((n) => {
            const cat = normalizeCategory(n);
            const link = deepLinkFor(n);
            return (
              <li key={n.id} className={`notif-center__item${!n.is_read ? ' is-unread' : ''}`}>
                <button
                  type="button"
                  className="notif-center__item-main"
                  onClick={async () => {
                    if (!n.is_read) await markRead(n.id);
                    if (link) navigate(link);
                  }}
                >
                  <span className="notif-center__cat">{cat}</span>
                  <strong>{n.subject || n.title || n.eventType || 'Update'}</strong>
                  <span className="notif-center__body">{n.body || n.message || ''}</span>
                  <time dateTime={n.createdAt || n.created_at}>
                    {n.createdAt || n.created_at
                      ? new Date(n.createdAt || n.created_at).toLocaleString()
                      : ''}
                  </time>
                </button>
                <button
                  type="button"
                  className="notif-center__clear"
                  aria-label="Clear notification"
                  onClick={() => clearNotification(n.id)}
                >
                  Clear
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
