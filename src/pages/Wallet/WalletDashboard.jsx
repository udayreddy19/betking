import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getWalletBreakdown, formatInr, getWithdrawableHint } from '../../utils/walletBalance';
import { formatIstDateTime } from '../../utils/istTime';
import './WalletPlatform.css';

function badgeFor(status) {
  const s = String(status || 'COMPLETED').toUpperCase();
  if (['COMPLETED', 'SUCCESS'].includes(s)) return <span className="wp-badge wp-badge--ok">Success</span>;
  if (['PENDING', 'PROCESSING', 'UNDER_REVIEW', 'RESERVED'].includes(s)) return <span className="wp-badge wp-badge--pending">Pending</span>;
  if (['FAILED', 'REJECTED', 'CANCELLED'].includes(s)) return <span className="wp-badge wp-badge--fail">{s === 'CANCELLED' ? 'Cancelled' : 'Failed'}</span>;
  return <span className="wp-badge wp-badge--pending">{s}</span>;
}

export default function WalletDashboard() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { user, openDepositModal, openFinModal, transactions, refreshWallet, isLoggedIn, openLoginModal } = useAuth();
  const wallet = useMemo(() => getWalletBreakdown(user), [user]);
  const withdrawableHint = getWithdrawableHint(wallet);

  const initialTab = params.get('tab') === 'withdraw' ? 'withdraw' : (params.get('tab') === 'history' ? 'history' : 'add');
  const [tab, setTab] = useState(initialTab);
  const [txFilter, setTxFilter] = useState(params.get('type') || 'all');
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const t = params.get('tab');
    if (t === 'withdraw' || t === 'history' || t === 'add') setTab(t);
    const type = params.get('type');
    if (type) setTxFilter(type);
  }, [params]);

  const setTabAndUrl = (next) => {
    setTab(next);
    const nextParams = new URLSearchParams(params);
    nextParams.set('tab', next);
    setParams(nextParams, { replace: true });
  };

  const filtered = useMemo(() => {
    return (transactions || []).filter((tx) => {
      const type = String(tx.type || '').toLowerCase();
      if (txFilter === 'deposits' && type !== 'deposit') return false;
      if (txFilter === 'withdrawals' && !['withdraw', 'withdraw_cancel'].includes(type)) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return [tx.label, tx.id, tx.method, tx.utr, String(tx.amount)].join(' ').toLowerCase().includes(q);
      }
      return true;
    });
  }, [transactions, txFilter, search]);

  const onRefresh = async () => {
    setRefreshing(true);
    try { await refreshWallet?.(); } finally { setRefreshing(false); }
  };

  if (!isLoggedIn || !user) {
    return (
      <div className="wp-page">
        <div className="wp-hero-card">
          <h1>Wallet</h1>
          <p>Log in to add funds, withdraw, and view transactions.</p>
          <button type="button" className="wp-btn wp-btn--primary" onClick={openLoginModal}>Log in</button>
        </div>
      </div>
    );
  }

  return (
    <div className="wp-page" id="wallet-dashboard">
      <header className="wp-page-header">
        <div>
          <h1>Wallet</h1>
          <p>Add funds, withdraw and track your money.</p>
        </div>
        <div className="wp-page-header__actions">
          <Link className="wp-btn wp-btn--outline" to="/wallet/bank-accounts">Bank accounts</Link>
          <Link className="wp-btn wp-btn--outline" to="/profile">Profile</Link>
        </div>
      </header>

      <section className="wp-balance-banner">
        <div>
          <span className="wp-balance-banner__label">Funds wallet</span>
          <strong className="wp-balance-banner__amount">{formatInr(wallet.availableBalance ?? wallet.total)}</strong>
          <div className="wp-balance-banner__meta">
            <span>Cash {formatInr(wallet.cashBalance)}</span>
            <span>Withdrawable {formatInr(wallet.withdrawable)}</span>
          </div>
        </div>
        <button type="button" className="wp-icon-btn" onClick={onRefresh} aria-label="Refresh" disabled={refreshing}>
          {refreshing ? '…' : '↻'}
        </button>
      </section>

      <div className="wp-tabs" role="tablist" aria-label="Wallet actions">
        <button type="button" role="tab" aria-selected={tab === 'add'} className={`wp-tab ${tab === 'add' ? 'is-active' : ''}`} onClick={() => setTabAndUrl('add')}>
          Add funds
        </button>
        <button type="button" role="tab" aria-selected={tab === 'withdraw'} className={`wp-tab ${tab === 'withdraw' ? 'is-active' : ''}`} onClick={() => setTabAndUrl('withdraw')}>
          Withdraw funds
        </button>
        <button type="button" role="tab" aria-selected={tab === 'history'} className={`wp-tab ${tab === 'history' ? 'is-active' : ''}`} onClick={() => setTabAndUrl('history')}>
          Transactions
        </button>
      </div>

      {tab === 'add' && (
        <div className="wp-panel">
          <h3>Add money to your wallet</h3>
          <p className="lead">Pay via UPI / cards through our hosted payment checkout. Card numbers and CVV are never stored on OddsYra.</p>
          <ul className="wp-summary-card__rows" style={{ borderTop: 'none', marginBottom: 16 }}>
            <li><span className="dot info" /> Minimum deposit follows admin wallet rules</li>
            <li><span className="dot success" /> Instant credit after verified payment webhook</li>
            <li><span className="dot warn" /> Amount range typically ₹100 – ₹2,00,000</li>
          </ul>
          <button type="button" className="wp-btn wp-btn--primary" onClick={() => openDepositModal()}>
            Continue to add funds
          </button>
          <button type="button" className="wp-btn wp-btn--outline" style={{ marginLeft: 8 }} onClick={() => navigate('/wallet/deposit')}>
            Open deposit page
          </button>
        </div>
      )}

      {tab === 'withdraw' && (
        <div className="wp-panel">
          <h3>Withdraw to bank / UPI</h3>
          <p className="lead">{withdrawableHint || 'Withdrawals use your verified payout details and KYC checks.'}</p>
          <div style={{ marginBottom: 14, fontSize: '0.95rem' }}>
            Available to withdraw: <strong>{formatInr(wallet.withdrawable)}</strong>
          </div>
          <button type="button" className="wp-btn wp-btn--primary" onClick={() => openFinModal('withdraw')}>
            Start withdrawal
          </button>
          <button type="button" className="wp-btn wp-btn--outline" style={{ marginLeft: 8 }} onClick={() => navigate('/wallet/bank-accounts')}>
            Manage bank accounts
          </button>
          <button type="button" className="wp-btn wp-btn--ghost" style={{ marginLeft: 8 }} onClick={() => openFinModal('cancel-wd')}>
            Cancel pending withdrawal
          </button>
        </div>
      )}

      {tab === 'history' && (
        <div className="wp-panel">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
            <input
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ flex: '1 1 180px', border: '1px solid #cbd5e1', borderRadius: 10, padding: '10px 12px' }}
            />
            <select value={txFilter} onChange={(e) => setTxFilter(e.target.value)} style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '10px 12px' }}>
              <option value="all">All</option>
              <option value="deposits">Deposits</option>
              <option value="withdrawals">Withdrawals</option>
            </select>
          </div>
          <div className="wp-table-wrap">
            <table className="wp-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Type</th>
                  <th>Date / Status</th>
                  <th>Amount</th>
                  <th>Ref</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={5} style={{ color: '#64748b' }}>No transactions yet.</td></tr>
                ) : filtered.slice(0, 100).map((tx, idx) => (
                  <tr key={tx.id || `${tx.type}-${idx}`}>
                    <td>{String(idx + 1).padStart(2, '0')}</td>
                    <td>{tx.label || tx.type}</td>
                    <td>
                      <div>{badgeFor(tx.status)}</div>
                      <div style={{ color: '#64748b', fontSize: '0.8rem', marginTop: 4 }}>
                        {formatIstDateTime(tx.createdAt || tx.created_at || tx.date)}
                      </div>
                    </td>
                    <td><strong>{formatInr(Math.abs(Number(tx.amount) || 0))}</strong></td>
                    <td style={{ fontSize: '0.8rem', color: '#64748b' }}>{tx.utr || tx.id || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
