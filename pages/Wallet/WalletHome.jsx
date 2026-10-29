import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getWalletBreakdown, formatInr } from '../../utils/walletBalance';
import { apiFetch } from '../../utils/apiClient';
import './WalletPlatform.css';

function sumBy(list, predicate) {
  return (list || []).reduce((acc, tx) => {
    if (!predicate(tx)) return acc;
    return acc + Math.abs(Number(tx.amount) || 0);
  }, 0);
}

function countBy(list, predicate) {
  return (list || []).filter(predicate).length;
}

function statusOf(tx) {
  return String(tx.status || 'COMPLETED').toUpperCase();
}

export default function WalletHome() {
  const navigate = useNavigate();
  const { user, isLoggedIn, openDepositModal, openFinModal, openLoginModal, transactions, refreshWallet } = useAuth();
  const wallet = useMemo(() => getWalletBreakdown(user), [user]);
  const [bankCount, setBankCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!isLoggedIn) return undefined;
    let cancelled = false;
    apiFetch('/api/v1/bank-accounts')
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data?.success) setBankCount((data.accounts || []).length);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isLoggedIn]);

  const deposits = useMemo(() => (transactions || []).filter((t) => String(t.type).toLowerCase() === 'deposit'), [transactions]);
  const withdrawals = useMemo(
    () => (transactions || []).filter((t) => ['withdraw', 'withdraw_cancel'].includes(String(t.type).toLowerCase())),
    [transactions],
  );

  const payInsTotal = sumBy(deposits, () => true);
  const payInsSuccess = sumBy(deposits, (t) => ['COMPLETED', 'SUCCESS'].includes(statusOf(t)));
  const payInsFailed = sumBy(deposits, (t) => ['FAILED', 'REJECTED'].includes(statusOf(t)));

  const payoutsTotal = sumBy(withdrawals, (t) => String(t.type).toLowerCase() === 'withdraw');
  const payoutsProcessed = sumBy(withdrawals, (t) => String(t.type).toLowerCase() === 'withdraw' && ['COMPLETED', 'SUCCESS'].includes(statusOf(t)));
  const payoutsPending = sumBy(withdrawals, (t) => String(t.type).toLowerCase() === 'withdraw' && ['PENDING', 'PROCESSING', 'UNDER_REVIEW', 'RESERVED'].includes(statusOf(t)));
  const payoutsFailed = sumBy(withdrawals, (t) => String(t.type).toLowerCase() === 'withdraw' && ['FAILED', 'REJECTED'].includes(statusOf(t)));

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshWallet?.();
    } finally {
      setRefreshing(false);
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="wp-page">
        <div className="wp-hero-card">
          <h1>Wallet</h1>
          <p>Add money, withdraw, and manage bank accounts securely.</p>
          <div className="wp-actions">
            <button type="button" className="wp-btn wp-btn--primary" onClick={openLoginModal}>Log in</button>
            <Link className="wp-btn wp-btn--ghost" to="/register">Create account</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="wp-page" id="wallet-home">
      <header className="wp-page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Overview of your wallet transactions.</p>
        </div>
        <div className="wp-page-header__actions">
          <button type="button" className="wp-btn wp-btn--outline" onClick={() => openDepositModal()}>
            + Add funds
          </button>
          <button type="button" className="wp-btn wp-btn--outline" onClick={() => openFinModal('withdraw')}>
            Withdraw
          </button>
          <button type="button" className="wp-btn wp-btn--outline" onClick={() => navigate('/wallet/bank-accounts')}>
            Bank accounts
          </button>
        </div>
      </header>

      <section className="wp-balance-banner">
        <div>
          <span className="wp-balance-banner__label">Funds wallet</span>
          <strong className="wp-balance-banner__amount">{formatInr(wallet.availableBalance ?? wallet.total)}</strong>
          <div className="wp-balance-banner__meta">
            <span>Withdrawable {formatInr(wallet.withdrawable)}</span>
            <span>Bank accounts {bankCount}</span>
          </div>
        </div>
        <button type="button" className="wp-icon-btn" onClick={onRefresh} aria-label="Refresh balance" disabled={refreshing}>
          {refreshing ? '…' : '↻'}
        </button>
      </section>

      <section className="wp-summary-grid">
        <article className="wp-summary-card">
          <div className="wp-summary-card__head">
            <h2>Deposits</h2>
            <Link to="/wallet/transactions?type=deposits">View history</Link>
          </div>
          <div className="wp-summary-card__total">{formatInr(payInsTotal)}</div>
          <div className="wp-summary-card__count">{countBy(deposits, () => true)} transactions</div>
          <ul className="wp-summary-card__rows">
            <li><span className="dot success" /> Success <em>{countBy(deposits, (t) => ['COMPLETED', 'SUCCESS'].includes(statusOf(t)))}</em> <strong>{formatInr(payInsSuccess)}</strong></li>
            <li><span className="dot danger" /> Failed <em>{countBy(deposits, (t) => ['FAILED', 'REJECTED'].includes(statusOf(t)))}</em> <strong>{formatInr(payInsFailed)}</strong></li>
          </ul>
        </article>

        <article className="wp-summary-card">
          <div className="wp-summary-card__head">
            <h2>Withdrawals</h2>
            <Link to="/wallet/transactions?type=withdrawals">View history</Link>
          </div>
          <div className="wp-summary-card__total">{formatInr(payoutsTotal)}</div>
          <div className="wp-summary-card__count">{countBy(withdrawals, (t) => String(t.type).toLowerCase() === 'withdraw')} transactions</div>
          <ul className="wp-summary-card__rows">
            <li><span className="dot success" /> Processed <em>{countBy(withdrawals, (t) => String(t.type).toLowerCase() === 'withdraw' && ['COMPLETED', 'SUCCESS'].includes(statusOf(t)))}</em> <strong>{formatInr(payoutsProcessed)}</strong></li>
            <li><span className="dot warn" /> Pending <em>{countBy(withdrawals, (t) => String(t.type).toLowerCase() === 'withdraw' && ['PENDING', 'PROCESSING', 'UNDER_REVIEW', 'RESERVED'].includes(statusOf(t)))}</em> <strong>{formatInr(payoutsPending)}</strong></li>
            <li><span className="dot danger" /> Failed <em>{countBy(withdrawals, (t) => String(t.type).toLowerCase() === 'withdraw' && ['FAILED', 'REJECTED'].includes(statusOf(t)))}</em> <strong>{formatInr(payoutsFailed)}</strong></li>
          </ul>
        </article>

        <article className="wp-summary-card">
          <div className="wp-summary-card__head">
            <h2>Wallet</h2>
            <Link to="/wallet">Open wallet</Link>
          </div>
          <div className="wp-summary-card__total">{formatInr(wallet.availableBalance ?? wallet.total)}</div>
          <div className="wp-summary-card__count">Available balance</div>
          <ul className="wp-summary-card__rows">
            <li><span className="dot success" /> Cash <strong>{formatInr(wallet.cashBalance)}</strong></li>
            <li><span className="dot info" /> Withdrawable <strong>{formatInr(wallet.withdrawable)}</strong></li>
            <li><span className="dot warn" /> Pending / locked <strong>{formatInr(Number(wallet.lockedBonusWinnings || 0))}</strong></li>
          </ul>
        </article>
      </section>

      <section className="wp-quick-grid">
        <button type="button" className="wp-quick-tile" onClick={() => navigate('/wallet')}>
          <strong>Wallet</strong>
          <span>Add funds, withdraw, track balance</span>
        </button>
        <button type="button" className="wp-quick-tile" onClick={() => navigate('/wallet/transactions')}>
          <strong>Transactions</strong>
          <span>Full ledger and payout history</span>
        </button>
        <button type="button" className="wp-quick-tile" onClick={() => navigate('/wallet/bank-accounts')}>
          <strong>Bank accounts</strong>
          <span>Saved payout accounts</span>
        </button>
        <button type="button" className="wp-quick-tile" onClick={() => navigate('/profile')}>
          <strong>Profile & security</strong>
          <span>KYC, password, account settings</span>
        </button>
      </section>
    </div>
  );
}
