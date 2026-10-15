import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../../context/AuthContext';
import { getWalletBreakdown, formatInr, getWithdrawableHint } from '../../utils/walletBalance';
import {
  BiWallet,
  BiMoneyWithdraw,
  BiHistory,
  BiTransfer,
  BiGift,
  FiCheckCircle,
  FiClock,
  FiHelpCircle,
  ChevronDownIcon,
  ChevronUpIcon,
  SearchIcon,
  ShieldCheckIcon,
} from '../../icons';
import { apiFetch } from '../../utils/apiClient';
import './WalletDashboard.css';
import { formatIst, formatIstDateTime } from '../../utils/istTime';

function tabFromParams(params, pathname) {
  const tab = params.get('tab');
  if (tab === 'history' || pathname.includes('/wallet/transactions')) return 'history';
  if (tab === 'rewards') return 'rewards';
  if (params.get('type') === 'deposits' || params.get('type') === 'withdrawals') return 'history';
  return 'overview';
}

export default function WalletDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const { user, openDepositModal, openFinModal, transactions, refreshWallet, showToast } = useAuth();
  const [depositResyncLoading, setDepositResyncLoading] = useState(false);
  const deepLinkHandled = useRef(null);

  const [expandedBreakdown, setExpandedBreakdown] = useState(false);
  const [activeTab, setActiveTab] = useState(() => tabFromParams(params, location.pathname));
  const [txFilter, setTxFilter] = useState(params.get('type') || 'all');
  const [txStatusFilter, setTxStatusFilter] = useState('all');
  const [txSearch, setTxSearch] = useState('');
  const [selectedTx, setSelectedTx] = useState(null);
  const [bonuses, setBonuses] = useState([]);
  const [bonusesLoading, setBonusesLoading] = useState(false);

  const wallet = useMemo(() => getWalletBreakdown(user), [user]);
  const withdrawableHint = getWithdrawableHint(wallet);

  useEffect(() => {
    const nextTab = tabFromParams(params, location.pathname);
    setActiveTab(nextTab);
    const type = params.get('type');
    if (type) setTxFilter(type);
  }, [params, location.pathname]);

  useEffect(() => {
    if (!user) return;
    const tab = params.get('tab');
    const key = `${location.pathname}?${params.toString()}`;
    if (deepLinkHandled.current === key) return;
    if (tab === 'add') {
      deepLinkHandled.current = key;
      openDepositModal?.();
      const next = new URLSearchParams(params);
      next.delete('tab');
      setParams(next, { replace: true });
    } else if (tab === 'withdraw') {
      deepLinkHandled.current = key;
      openFinModal?.('withdraw');
      const next = new URLSearchParams(params);
      next.delete('tab');
      setParams(next, { replace: true });
    }
  }, [user, params, location.pathname, openDepositModal, openFinModal, setParams]);

  useEffect(() => {
    if (activeTab === 'rewards' && user) {
      setBonusesLoading(true);
      apiFetch('/api/v1/user/bonuses')
        .then((res) => res.json())
        .then((data) => {
          if (data.success && Array.isArray(data.bonuses)) {
            setBonuses(data.bonuses);
          }
        })
        .catch(() => {})
        .finally(() => setBonusesLoading(false));
    }
  }, [activeTab, user]);

  const filteredTransactions = useMemo(() => {
    return (transactions || []).filter((tx) => {
      // Category filter
      if (txFilter === 'deposits' && tx.type !== 'deposit') return false;
      if (txFilter === 'withdrawals' && !['withdraw', 'withdraw_cancel'].includes(tx.type)) return false;
      if (txFilter === 'betting' && !['bet_stake', 'bet_win', 'cashout', 'refund'].includes(tx.type)) return false;
      if (txFilter === 'rewards' && !['bonus', 'bonus_claim', 'freebet', 'loyalty_redeem', 'vip_cashback', 'vip_perk'].includes(String(tx.type || '').toLowerCase())) return false;

      // Status filter
      if (txStatusFilter !== 'all') {
        const s = String(tx.status || 'COMPLETED').toUpperCase();
        if (txStatusFilter === 'completed' && s !== 'COMPLETED' && s !== 'SUCCESS') return false;
        if (txStatusFilter === 'pending' && !['PENDING', 'PROCESSING', 'UNDER_REVIEW'].includes(s)) return false;
        if (txStatusFilter === 'failed' && !['FAILED', 'REJECTED', 'CANCELLED'].includes(s)) return false;
      }

      // Search query
      if (txSearch.trim()) {
        const q = txSearch.toLowerCase();
        const label = (tx.label || '').toLowerCase();
        const id = (tx.id || '').toLowerCase();
        const method = (tx.method || '').toLowerCase();
        const utr = (tx.utr || '').toLowerCase();
        return label.includes(q) || id.includes(q) || method.includes(q) || utr.includes(q) || String(tx.amount).includes(q);
      }

      return true;
    });
  }, [transactions, txFilter, txStatusFilter, txSearch]);

  const isPendingWithdraw = (tx) => {
    if (String(tx?.type || '').toLowerCase() !== 'withdraw') return false;
    const s = String(tx?.status || '').toUpperCase();
    return ['PENDING', 'PROCESSING', 'UNDER_REVIEW', 'PENDING_REVIEW'].includes(s);
  };

  const getStatusBadge = (status) => {
    const s = String(status || 'COMPLETED').toUpperCase();
    if (s === 'COMPLETED' || s === 'SUCCESS') {
      return <span className="wallet-badge wallet-badge--success"><FiCheckCircle /> Completed</span>;
    }
    if (s === 'PROCESSING' || s === 'PENDING' || s === 'UNDER_REVIEW' || s === 'PENDING_REVIEW') {
      return <span className="wallet-badge wallet-badge--pending"><FiClock /> Processing</span>;
    }
    if (s === 'FAILED' || s === 'REJECTED') {
      return <span className="wallet-badge wallet-badge--failed">Failed</span>;
    }
    if (s === 'CANCELLED') {
      return <span className="wallet-badge wallet-badge--neutral">Cancelled</span>;
    }
    return <span className="wallet-badge wallet-badge--neutral">{status}</span>;
  };

  const getFriendlyExplanation = (tx) => {
    const type = String(tx.type || '').toLowerCase();
    switch (type) {
      case 'deposit':
        return 'Deposit credited to your wallet balance.';
      case 'withdraw':
        return 'Withdrawal requested from your cash balance to your payout account.';
      case 'withdraw_cancel':
        return 'Cancelled withdrawal released back to your available cash balance.';
      case 'bet_stake':
        return 'Stake deducted for your placed bet slip.';
      case 'bet_win':
        return 'Winnings payout credited to your cash balance.';
      case 'cashout':
        return 'Early cashout credited to your wallet.';
      case 'refund':
        return 'Stake refunded due to match cancellation or void selection.';
      case 'bonus':
      case 'bonus_claim':
        return tx.method === 'DAILY_SPIN'
          ? 'Daily Spin promotional bonus credit added to your account.'
          : 'Promotional bonus credit added to your account.';
      case 'freebet':
        return 'Free bet voucher credit granted for promotional play.';
      case 'loyalty_redeem':
        return 'VIP Loyalty points redeemed directly for playable cash.';
      default:
        return tx.description || `${tx.label || 'Wallet transaction'}`;
    }
  };

  if (!user) {
    return (
      <div className="wallet-dashboard-container wallet-dashboard-container--loading">
        <p>Loading your wallet information…</p>
      </div>
    );
  }

  return (
    <div className="wallet-dashboard-container">
      {/* HEADER & QUICK ACTIONS */}
      <div className="wallet-header">
        <div className="wallet-header__title-group">
          <h1>My Wallet</h1>
          <p className="wallet-header__subtitle">Transparent balance oversight, instant deposits & seamless payouts</p>
        </div>
        <div className="wallet-header__actions">
          <button type="button" className="wallet-btn wallet-btn--primary" onClick={openDepositModal}>
            <BiWallet /> Deposit
          </button>
          <button type="button" className="wallet-btn wallet-btn--secondary" onClick={() => openFinModal('withdraw')}>
            <BiMoneyWithdraw /> Withdraw
          </button>
          <button type="button" className="wallet-btn wallet-btn--ghost" onClick={() => navigate('/wallet/bank-accounts')}>
            Bank accounts
          </button>
          <button type="button" className="wallet-btn wallet-btn--ghost" onClick={() => refreshWallet && refreshWallet()}>
            Refresh
          </button>
        </div>
      </div>

      {/* HERO BALANCE CARD */}
      <div className="wallet-hero-card">
        <div className="wallet-hero-card__main">
          <div className="wallet-hero-card__balance-item">
            <span className="wallet-hero-card__label">Total Wallet Balance</span>
            <span className="wallet-hero-card__amount">{formatInr(wallet.total)}</span>
            <span className="wallet-hero-card__subtext">Includes Cash + Bonus + Free Bet credits</span>
          </div>

          <div className="wallet-hero-card__divider" />

          <div className="wallet-hero-card__balance-item">
            <span className="wallet-hero-card__label">Available to Play</span>
            <span className="wallet-hero-card__amount wallet-hero-card__amount--highlight">{formatInr(wallet.availableBalance)}</span>
            <span className="wallet-hero-card__subtext">Funds currently available for eligible activity</span>
          </div>

          <div className="wallet-hero-card__divider" />

          <div className="wallet-hero-card__balance-item">
            <span className="wallet-hero-card__label">Withdrawable Cash</span>
            <span className="wallet-hero-card__amount wallet-hero-card__amount--withdrawable">{formatInr(wallet.withdrawable)}</span>
            <span className="wallet-hero-card__subtext">Unrestricted funds eligible for instant withdrawal</span>
          </div>
        </div>

        {/* EXPANDABLE BALANCE BREAKDOWN */}
        <div className="wallet-breakdown-toggle" onClick={() => setExpandedBreakdown(!expandedBreakdown)}>
          <span>{expandedBreakdown ? 'Hide Balance Details' : 'View Expandable Balance Details'}</span>
          {expandedBreakdown ? <ChevronUpIcon size={20} /> : <ChevronDownIcon size={20} />}
        </div>

        <AnimatePresence>
          {expandedBreakdown && (
            <motion.div
              className="wallet-breakdown-panel"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className="wallet-breakdown-grid">
                <div className="wallet-breakdown-cell">
                  <span className="wallet-breakdown-cell__title">Cash Balance</span>
                  <span className="wallet-breakdown-cell__value">{formatInr(wallet.cashBalance)}</span>
                  <span className="wallet-breakdown-cell__desc">Authoritative playable cash balance.</span>
                </div>

                <div className="wallet-breakdown-cell">
                  <span className="wallet-breakdown-cell__title">Locked Deposit Amount</span>
                  <span className="wallet-breakdown-cell__value wallet-breakdown-cell__value--warning">{formatInr(wallet.lockedDeposit)}</span>
                  <span className="wallet-breakdown-cell__desc">Deposits undergoing standard 1x AML turnover before withdrawal.</span>
                </div>

                <div className="wallet-breakdown-cell">
                  <span className="wallet-breakdown-cell__title">Reserved Withdrawal Amount</span>
                  <span className="wallet-breakdown-cell__value wallet-breakdown-cell__value--pending">{formatInr(wallet.pendingWithdrawal)}</span>
                  <span className="wallet-breakdown-cell__desc">Funds held for active pending withdrawal requests.</span>
                  {wallet.pendingWithdrawal > 0 && (
                    <div className="wallet-withdraw-pending-actions">
                      <span className="wallet-withdraw-pending-actions__eta">
                        Typical payout 15 min–24 hrs after approval
                      </span>
                      <button
                        type="button"
                        className="wallet-link-btn"
                        onClick={() => openFinModal?.('cancel-wd')}
                      >
                        Manage / cancel
                      </button>
                    </div>
                  )}
                </div>

                <div className="wallet-breakdown-cell">
                  <span className="wallet-breakdown-cell__title">Bonus Balance</span>
                  <span className="wallet-breakdown-cell__value wallet-breakdown-cell__value--bonus">{formatInr(wallet.bonus)}</span>
                  <span className="wallet-breakdown-cell__desc">Promotional bonus credit. Subject to 5x turnover requirement at min odds 1.75.</span>
                </div>

                {wallet.lockedBonusWinnings > 0 && (
                  <div className="wallet-breakdown-cell">
                    <span className="wallet-breakdown-cell__title">Locked Bonus Winnings</span>
                    <span className="wallet-breakdown-cell__value" style={{ color: '#a855f7' }}>{formatInr(wallet.lockedBonusWinnings)}</span>
                    <span className="wallet-breakdown-cell__desc">Bonus profits held in escrow until 5x turnover at min odds 1.75 is completed.</span>
                  </div>
                )}

                <div className="wallet-breakdown-cell">
                  <span className="wallet-breakdown-cell__title">Free Bet Value</span>
                  <span className="wallet-breakdown-cell__value wallet-breakdown-cell__value--freebet">{formatInr(wallet.freebets)}</span>
                  <span className="wallet-breakdown-cell__desc">Promotional free bet voucher. <strong>Must be used in full in one eligible bet.</strong></span>
                </div>
              </div>

              {withdrawableHint && (
                <div className="wallet-breakdown-hint">
                  <FiHelpCircle /> {withdrawableHint}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="wallet-deposit-recovery-card">
        <div>
          <strong>Payment done but balance not updated?</strong>
          <p>We can re-check your UPI payment with the gateway and credit your wallet if it was successful.</p>
        </div>
        <button
          type="button"
          className="wallet-btn wallet-btn--secondary"
          disabled={depositResyncLoading}
          onClick={async () => {
            setDepositResyncLoading(true);
            try {
              const res = await apiFetch('/api/v1/payments/resync-pending', { method: 'POST' });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) {
                showToast?.(data.error || 'Could not refresh pending deposits.', 'error');
                return;
              }
              const synced = data.synced ?? data.credited ?? data.updated;
              showToast?.(
                synced != null
                  ? `Checked pending deposits${Number(synced) ? ` · ${synced} updated` : ''}.`
                  : (data.message || 'Pending deposits re-checked.'),
                'success',
              );
              await refreshWallet?.();
            } catch {
              showToast?.('Network error — try again in a moment.', 'error');
            } finally {
              setDepositResyncLoading(false);
            }
          }}
        >
          {depositResyncLoading ? 'Checking…' : 'Refresh my deposit'}
        </button>
      </div>

      {/* NAVIGATION TABS */}
      <div className="wallet-tabs">
        <button
          type="button"
          className={`wallet-tab ${activeTab === 'overview' ? 'wallet-tab--active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <BiTransfer /> Recent Activity
        </button>
        <button
          type="button"
          className={`wallet-tab ${activeTab === 'history' ? 'wallet-tab--active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          <BiHistory /> Transaction History
        </button>
        <button
          type="button"
          className={`wallet-tab ${activeTab === 'rewards' ? 'wallet-tab--active' : ''}`}
          onClick={() => setActiveTab('rewards')}
        >
          <BiGift /> Rewards & Bonuses
        </button>
      </div>

      {/* TAB CONTENT 1: RECENT ACTIVITY */}
      {activeTab === 'overview' && (
        <div className="wallet-section">
          <div className="wallet-section__header">
            <h3>Recent Financial Activity</h3>
            <button type="button" className="wallet-link-btn" onClick={() => setActiveTab('history')}>
              View All Transactions →
            </button>
          </div>

          {(transactions || []).length === 0 ? (
            <div className="wallet-empty-state">
              <p>No financial activity recorded yet.</p>
            </div>
          ) : (
            <div className="wallet-tx-list">
              {(transactions || []).slice(0, 5).map((tx) => {
                const isPositive = ['deposit', 'bet_win', 'bonus', 'loyalty_redeem', 'cashout'].includes(tx.type);
                const pendingWd = isPendingWithdraw(tx);
                return (
                  <div key={tx.id} className="wallet-tx-row" onClick={() => setSelectedTx(tx)}>
                    <div className="wallet-tx-row__left">
                      <div className={`wallet-tx-icon wallet-tx-icon--${tx.type}`}>
                        {tx.type === 'deposit' && <BiWallet />}
                        {tx.type === 'withdraw' && <BiMoneyWithdraw />}
                        {tx.type === 'bet_win' && <BiGift />}
                        {!['deposit', 'withdraw', 'bet_win'].includes(tx.type) && <BiTransfer />}
                      </div>
                      <div className="wallet-tx-info">
                        <span className="wallet-tx-info__label">{tx.label}</span>
                        <span className="wallet-tx-info__time">
                          {tx.createdAt ? formatIst(tx.createdAt, { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
                        </span>
                        {pendingWd && (
                          <span className="wallet-tx-info__eta">ETA 15 min–24 hrs after approval</span>
                        )}
                      </div>
                    </div>

                    <div className="wallet-tx-row__right">
                      <span className={`wallet-tx-amount ${isPositive ? 'wallet-tx-amount--positive' : 'wallet-tx-amount--negative'}`}>
                        {isPositive ? '+' : ''}{formatInr(tx.amount)}
                      </span>
                      {getStatusBadge(tx.status)}
                      {pendingWd && (
                        <button
                          type="button"
                          className="wallet-link-btn wallet-tx-cancel-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            openFinModal?.('cancel-wd');
                          }}
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT 2: FULL TRANSACTION HISTORY */}
      {activeTab === 'history' && (
        <div className="wallet-section">
          <div className="wallet-filters-bar">
            <div className="wallet-filter-chips">
              {[
                { id: 'all', label: 'All' },
                { id: 'deposits', label: 'Deposits' },
                { id: 'withdrawals', label: 'Withdrawals' },
                { id: 'betting', label: 'Betting' },
                { id: 'rewards', label: 'Rewards' },
              ].map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  className={`wallet-filter-chip ${txFilter === chip.id ? 'wallet-filter-chip--active' : ''}`}
                  onClick={() => setTxFilter(chip.id)}
                >
                  {chip.label}
                </button>
              ))}
            </div>

            <div className="wallet-search-group">
              <div className="wallet-search-input-wrapper">
                <SearchIcon className="wallet-search-icon" />
                <input
                  type="search"
                  placeholder="Search by ID, amount or description…"
                  value={txSearch}
                  onChange={(e) => setTxSearch(e.target.value)}
                  className="wallet-search-input"
                />
              </div>

              <select
                value={txStatusFilter}
                onChange={(e) => setTxStatusFilter(e.target.value)}
                className="wallet-select"
              >
                <option value="all">All Statuses</option>
                <option value="completed">Completed</option>
                <option value="pending">Processing / Pending</option>
                <option value="failed">Failed / Cancelled</option>
              </select>
            </div>
          </div>

          {filteredTransactions.length === 0 ? (
            <div className="wallet-empty-state">
              <p>No transactions found matching your filter criteria.</p>
            </div>
          ) : (
            <div className="wallet-table-wrapper">
              <table className="wallet-table">
                <thead>
                  <tr>
                    <th>Type & Description</th>
                    <th>Reference</th>
                    <th>Date & Time</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.map((tx) => {
                    const isPositive = ['deposit', 'bet_win', 'bonus', 'loyalty_redeem', 'cashout'].includes(tx.type);
                    const pendingWd = isPendingWithdraw(tx);
                    return (
                      <tr key={tx.id} onClick={() => setSelectedTx(tx)} className="wallet-table__row-clickable">
                        <td>
                          <strong>{tx.label}</strong>
                          {tx.method ? <span className="wallet-table__subtext"> · {tx.method}</span> : null}
                          {pendingWd ? (
                            <span className="wallet-table__subtext wallet-table__eta"> · ETA 15 min–24 hrs</span>
                          ) : null}
                        </td>
                        <td>
                          <span className="wallet-table__mono">{tx.id}</span>
                          {tx.utr ? <span className="wallet-table__subtext"> · UTR {tx.utr}</span> : null}
                        </td>
                        <td>
                          {tx.createdAt ? formatIst(tx.createdAt, { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
                        </td>
                        <td>
                          {getStatusBadge(tx.status)}
                          {pendingWd && (
                            <button
                              type="button"
                              className="wallet-link-btn wallet-tx-cancel-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                openFinModal?.('cancel-wd');
                              }}
                            >
                              Cancel
                            </button>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <span className={`wallet-tx-amount ${isPositive ? 'wallet-tx-amount--positive' : 'wallet-tx-amount--negative'}`}>
                            {isPositive ? '+' : ''}{formatInr(tx.amount)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT 3: REWARDS & BONUSES */}
      {activeTab === 'rewards' && (
        <div className="wallet-section">
          <h3>Active Promotional Funds & Free Bets</h3>
          <div className="wallet-rewards-grid">
            <div className="wallet-reward-card">
              <div className="wallet-reward-card__header">
                <BiGift size={24} />
                <span className="wallet-reward-card__tag">FREE BET VOUCHER</span>
              </div>
              <div className="wallet-reward-card__amount">{formatInr(wallet.freebets)}</div>
              <p className="wallet-reward-card__desc">
                Usable for single or combo sports bets. Returns net profit upon winning.
              </p>
              <div className="wallet-reward-card__status">
                {wallet.freebets > 0 ? (
                  <span className="wallet-badge wallet-badge--success">Ready to Use</span>
                ) : (
                  <span className="wallet-badge wallet-badge--neutral">No Active Free Bets</span>
                )}
              </div>
            </div>

            <div className="wallet-reward-card">
              <div className="wallet-reward-card__header">
                <ShieldCheckIcon size={24} />
                <span className="wallet-reward-card__tag">PROMOTIONAL BONUS</span>
              </div>
              <div className="wallet-reward-card__amount">{formatInr(wallet.bonus)}</div>
              <p className="wallet-reward-card__desc">
                Casino & sportsbook bonus subject to wagering requirements before withdrawal.
              </p>
              <div className="wallet-reward-card__status">
                {wallet.bonus > 0 ? (
                  <span className="wallet-badge wallet-badge--bonus">Active Bonus</span>
                ) : (
                  <span className="wallet-badge wallet-badge--neutral">No Active Bonus</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TRANSACTION DETAILS MODAL */}
      <AnimatePresence>
        {selectedTx && (
          <div className="wallet-modal-backdrop" onClick={() => setSelectedTx(null)}>
            <motion.div
              className="wallet-modal-card"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="wallet-modal-card__header">
                <h3>Transaction Details</h3>
                <button type="button" className="wallet-modal-card__close" onClick={() => setSelectedTx(null)}>
                  ✕
                </button>
              </div>

              <div className="wallet-modal-card__body">
                <div className="wallet-detail-hero">
                  <span className="wallet-detail-hero__label">{selectedTx.label}</span>
                  <span className={`wallet-detail-hero__amount ${['deposit', 'bet_win', 'bonus', 'loyalty_redeem', 'cashout'].includes(selectedTx.type) ? 'positive' : 'negative'}`}>
                    {['deposit', 'bet_win', 'bonus', 'loyalty_redeem', 'cashout'].includes(selectedTx.type) ? '+' : ''}{formatInr(selectedTx.amount)}
                  </span>
                  <div className="wallet-detail-hero__status">{getStatusBadge(selectedTx.status)}</div>
                </div>

                <div className="wallet-detail-rows">
                  <div className="wallet-detail-row">
                    <span className="wallet-detail-row__key">Transaction ID</span>
                    <span className="wallet-detail-row__val mono">{selectedTx.id}</span>
                  </div>

                  <div className="wallet-detail-row">
                    <span className="wallet-detail-row__key">Date & Time</span>
                    <span className="wallet-detail-row__val">
                      {selectedTx.createdAt ? formatIst(selectedTx.createdAt, { dateStyle: 'full', timeStyle: 'medium' }) : '—'}
                    </span>
                  </div>

                  {selectedTx.method ? (
                    <div className="wallet-detail-row">
                      <span className="wallet-detail-row__key">Payment Method</span>
                      <span className="wallet-detail-row__val">{selectedTx.method}</span>
                    </div>
                  ) : null}

                  {selectedTx.utr ? (
                    <div className="wallet-detail-row">
                      <span className="wallet-detail-row__key">UTR Reference</span>
                      <span className="wallet-detail-row__val mono">{selectedTx.utr}</span>
                    </div>
                  ) : null}

                  {selectedTx.relatedBetId ? (
                    <div className="wallet-detail-row">
                      <span className="wallet-detail-row__key">Related Bet Slip</span>
                      <span className="wallet-detail-row__val mono">{selectedTx.relatedBetId}</span>
                    </div>
                  ) : null}

                  <div className="wallet-detail-row">
                    <span className="wallet-detail-row__key">Explanation</span>
                    <span className="wallet-detail-row__val">{getFriendlyExplanation(selectedTx)}</span>
                  </div>

                  {(['deposit', 'withdraw', 'withdraw_cancel'].includes(selectedTx.type)) && (
                    <div className="wallet-detail-row" style={{ display: 'block' }}>
                      <span className="wallet-detail-row__key">Status timeline</span>
                      <ol style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: '0.82rem', lineHeight: 1.55 }}>
                        {selectedTx.type === 'deposit' ? (
                          <>
                            <li>Order created{selectedTx.createdAt ? ` · ${formatIst(selectedTx.createdAt, { timeStyle: 'short' })}` : ''}</li>
                            <li>
                              {['PENDING', 'PROCESSING'].includes(String(selectedTx.status || '').toUpperCase())
                                ? 'Awaiting UPI confirmation (usually under 2 minutes)'
                                : 'Payment confirmed by gateway'}
                            </li>
                            <li>
                              {['COMPLETED', 'SUCCESS', 'CREDITED'].includes(String(selectedTx.status || '').toUpperCase())
                                ? 'Money arrived in wallet — ready to bet'
                                : 'Wallet credit pending webhook / resync'}
                            </li>
                          </>
                        ) : (
                          <>
                            <li>Withdrawal requested{selectedTx.createdAt ? ` · ${formatIst(selectedTx.createdAt, { timeStyle: 'short' })}` : ''}</li>
                            <li>
                              {['UNDER_REVIEW', 'PENDING', 'PROCESSING'].includes(String(selectedTx.status || '').toUpperCase())
                                ? 'Under review · typical payout 15 min–24 hrs after approval'
                                : 'Review complete'}
                            </li>
                            <li>
                              {['COMPLETED', 'PAID', 'SUCCESS'].includes(String(selectedTx.status || '').toUpperCase())
                                ? 'Paid to your bank / UPI'
                                : String(selectedTx.status || '').toUpperCase() === 'CANCELLED'
                                  ? 'Cancelled — funds released to available balance'
                                  : 'Awaiting bank credit'}
                            </li>
                          </>
                        )}
                      </ol>
                      {selectedTx.type === 'deposit' && ['PENDING', 'PROCESSING'].includes(String(selectedTx.status || '').toUpperCase()) && (
                        <p style={{ margin: '8px 0 0', fontSize: '0.78rem', opacity: 0.8 }}>
                          ETA: usually &lt; 2 minutes after you approve the UPI collect. You&apos;ll get an in-app / push alert when money arrives.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="wallet-modal-card__footer">
                  <button type="button" className="wallet-btn wallet-btn--primary" onClick={() => setSelectedTx(null)}>
                    Close Details
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
