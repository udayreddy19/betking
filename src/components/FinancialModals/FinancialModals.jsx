import { useState } from 'react';
import { motion } from 'motion/react';
import { IoClose, IoCheckmarkCircle, BiWallet, BiMoneyWithdraw, BiHistory, BiTransfer, BiGift } from '../../icons';
import { useAuth } from '../../context/AuthContext';
import { useBetSlip } from '../../context/BetSlipContext';
import { getWalletBreakdown, formatInr } from '../../utils/walletBalance';
import {
  BONUS_MIN_BET_ODDS,
} from '../../utils/wageringRules';
import { getBenefitsForTier, MIN_WITHDRAW_INR } from '../../utils/vipBenefits';
import './FinancialModals.css';

function statusColor(status) {
  if (status === 'won') return '#16a34a';
  if (status === 'lost') return '#dc2626';
  return '#2563eb';
}

export default function FinancialModals({ modalType, onClose }) {
  const { user, withdrawFunds, refundWithdrawal, showToast, transactions } = useAuth();
  const { placedBets } = useBetSlip();
  const wallet = getWalletBreakdown(user);

  const [withdrawMethod, setWithdrawMethod] = useState('UPI'); // 'UPI' | 'BANK_TRANSFER' | 'PAYTM'
  const [upiId, setUpiId] = useState('');
  const [paytmNumber, setPaytmNumber] = useState('');
  const [bankAccountName, setBankAccountName] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankIfsc, setBankIfsc] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('1000');
  const [withdrawStatus, setWithdrawStatus] = useState(null);
  const [pendingWithdrawals, setPendingWithdrawals] = useState([]);
  const [lastSubmittedDetails, setLastSubmittedDetails] = useState('');
  const [acceptBonusForfeit, setAcceptBonusForfeit] = useState(false);
  const [forfeitedBonusAmount, setForfeitedBonusAmount] = useState(0);

  if (!modalType || !user) return null;

  const notify = (msg) => showToast(msg);
  const vipLimits = getBenefitsForTier(user?.loyaltyTier);

  const handleRazorpayWithdraw = async (e) => {
    e.preventDefault();
    const amt = parseFloat(withdrawAmount);
    if (isNaN(amt) || amt < vipLimits.minWithdraw) {
      return notify(`Minimum withdrawal is ${formatInr(vipLimits.minWithdraw)}`);
    }
    if (amt > vipLimits.maxWithdraw) {
      return notify(`Your ${vipLimits.label} max withdrawal is ${formatInr(vipLimits.maxWithdraw)}`);
    }
    if (amt > wallet.withdrawable) {
      return notify(
        wallet.lockedDeposit > 0
          ? `Only ${formatInr(wallet.withdrawable)} available after holds. Deposits must be wagered first.`
          : `Only ${formatInr(wallet.withdrawable)} can be withdrawn.`,
      );
    }
    if (wallet.bonus > 0 && !acceptBonusForfeit) {
      return notify(`Withdrawing winnings will set your remaining bonus of ${formatInr(wallet.bonus)} to ₹0. Tick the confirmation below to continue.`);
    }

    let detailsString = '';
    let methodLabel = 'UPI';

    if (withdrawMethod === 'UPI') {
      if (!upiId.trim()) return notify('Please enter a valid UPI ID (e.g. name@upi)');
      detailsString = `UPI ID: ${upiId.trim()}`;
      methodLabel = 'UPI';
    } else if (withdrawMethod === 'BANK_TRANSFER') {
      if (!bankAccountName.trim()) return notify('Please enter the Account Holder Name');
      if (!bankName.trim()) return notify('Please enter the Bank Name');
      if (!bankAccountNumber.trim() || bankAccountNumber.trim().length < 6) {
        return notify('Please enter a valid Bank Account Number');
      }
      if (!bankIfsc.trim() || bankIfsc.trim().length < 4) {
        return notify('Please enter a valid Bank IFSC Code (e.g. HDFC0001234)');
      }
      detailsString = `Bank: ${bankName.trim()} | A/C: ${bankAccountNumber.trim()} | IFSC: ${bankIfsc.trim().toUpperCase()} | Name: ${bankAccountName.trim()}`;
      methodLabel = 'BANK_TRANSFER';
    } else if (withdrawMethod === 'PAYTM') {
      if (!paytmNumber.trim() || paytmNumber.trim().length < 10) {
        return notify('Please enter a valid 10-digit Paytm Mobile Number');
      }
      detailsString = `Paytm Wallet: ${paytmNumber.trim()}`;
      methodLabel = 'PAYTM';
    }

    setWithdrawStatus('processing');
    setLastSubmittedDetails(detailsString);

    const { success, withdrawalId, error, forfeitedBonus } = await withdrawFunds(amt, methodLabel, detailsString);
    if (!success) {
      setWithdrawStatus(null);
      notify(error || 'Withdrawal failed. Please check your available balance.');
      return;
    }
    setForfeitedBonusAmount(Number(forfeitedBonus || (acceptBonusForfeit ? wallet.bonus : 0)));
    setWithdrawStatus('success');
    setPendingWithdrawals(prev => [
      {
        id: withdrawalId || `WD-${Math.floor(10000 + Math.random() * 90000)}`,
        amount: amt,
        method: methodLabel,
        details: detailsString,
        date: 'Just now',
        status: 'PENDING_REVIEW',
        refunded: false,
      },
      ...prev,
    ]);
  };

  const handleCancelWithdrawal = (id, amount) => {
    const entry = pendingWithdrawals.find((w) => w.id === id);
    if (!entry || entry.refunded || entry.status === 'completed') {
      notify('This withdrawal can no longer be cancelled.');
      return;
    }
    notify('Pending withdrawals are reviewed by finance and cannot be cancelled here.');
  };

  return (
    <div className="fin-modal-overlay" onClick={onClose}>
      <div className="fin-modal-card" onClick={e => e.stopPropagation()}>
        <div className="fin-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800 }}>
            {modalType === 'withdraw' && <><BiMoneyWithdraw style={{ color: '#22c55e', fontSize: '1.4rem' }} /> Instant Withdrawal Request</>}
            {modalType === 'cancel-wd' && <><BiMoneyWithdraw style={{ color: '#ef4444', fontSize: '1.4rem' }} /> Cancel Pending Withdrawals</>}
            {modalType === 'transactions' && <><BiTransfer style={{ color: '#3b82f6', fontSize: '1.4rem' }} /> Transaction History</>}
            {modalType === 'bets-history' && <><BiHistory style={{ color: '#f59e0b', fontSize: '1.4rem' }} /> My Bets History</>}
            {modalType === 'bonuses' && <><BiGift style={{ color: '#a855f7', fontSize: '1.4rem' }} /> My Bonuses & Rules</>}
            {modalType === 'marketplace' && <><BiWallet style={{ color: '#eab308', fontSize: '1.4rem' }} /> Loyalty Rewards Marketplace</>}
          </div>
          <button className="fin-modal-close" onClick={onClose}>
            <IoClose />
          </button>
        </div>

        {modalType === 'withdraw' && (
          <div className="fin-modal-body">
            {withdrawStatus === 'success' ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <IoCheckmarkCircle style={{ color: '#22c55e', fontSize: '3.5rem', marginBottom: '10px' }} />
                <h3 style={{ margin: 0, fontWeight: 800 }}>Withdrawal Request Submitted!</h3>
                <p className="fin-muted" style={{ fontSize: '0.85rem', marginTop: '6px' }}>
                  ₹{withdrawAmount} requested via <strong>{withdrawMethod === 'BANK_TRANSFER' ? 'Direct Bank Transfer' : withdrawMethod === 'PAYTM' ? 'Paytm Wallet' : 'UPI'}</strong>.
                </p>
                {forfeitedBonusAmount > 0 && (
                  <div className="fin-bonus-forfeit-warn" style={{ marginTop: '12px', textAlign: 'left' }}>
                    Remaining bonus of <strong>{formatInr(forfeitedBonusAmount)}</strong> has been set to ₹0 because you withdrew winnings.
                  </div>
                )}
                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                  Details: <code>{lastSubmittedDetails}</code>
                </div>
                <div style={{
                  background: 'rgba(234, 179, 8, 0.12)',
                  border: '1px solid #eab308',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  color: '#ca8a04',
                  fontSize: '0.83rem',
                  fontWeight: 600,
                  marginTop: '12px',
                  lineHeight: '1.4',
                }}>
                  ⏳ Status: <strong>Pending Admin Approval</strong><br />
                  Once approved by Admin, funds will be transferred directly to your bank account / destination.
                </div>
                <button
                  className="fin-btn-primary"
                  onClick={() => { setWithdrawStatus(null); onClose(); }}
                  style={{ marginTop: '16px' }}
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleRazorpayWithdraw}>
                <div className="fin-balance-box">
                  <div className="fin-balance-label">Winnings (withdrawable)</div>
                  <div className="fin-balance-amount">{formatInr(wallet.winnings)}</div>
                  {wallet.lockedDeposit > 0 && (
                    <p className="fin-muted" style={{ fontSize: '0.8rem', marginTop: '6px' }}>
                      {formatInr(wallet.lockedDeposit)} deposited — wager before it can become winnings
                    </p>
                  )}
                  {wallet.bonus > 0 && (
                    <div className="fin-bonus-forfeit-warn">
                      <strong>Bonus in wallet: {formatInr(wallet.bonus)}</strong>
                      <p>
                        If you withdraw winnings now, this remaining bonus will be set to <strong>₹0</strong> and cannot be used again.
                        Finish 5× playthrough at {BONUS_MIN_BET_ODDS}+ odds first if you want to keep the bonus.
                      </p>
                      <label className="fin-bonus-forfeit-check">
                        <input
                          type="checkbox"
                          checked={acceptBonusForfeit}
                          onChange={(e) => setAcceptBonusForfeit(e.target.checked)}
                        />
                        I understand my remaining bonus of {formatInr(wallet.bonus)} will become ₹0
                      </label>
                    </div>
                  )}
                </div>

                {/* WITHDRAWAL METHOD SELECTOR */}
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px' }}>Select Withdrawal Method</label>
                  <div className="fin-method-tabs">
                    <button
                      type="button"
                      className={`fin-method-btn ${withdrawMethod === 'UPI' ? 'active' : ''}`}
                      onClick={() => setWithdrawMethod('UPI')}
                    >
                      ⚡ Instant UPI
                    </button>
                    <button
                      type="button"
                      className={`fin-method-btn ${withdrawMethod === 'BANK_TRANSFER' ? 'active' : ''}`}
                      onClick={() => setWithdrawMethod('BANK_TRANSFER')}
                    >
                      🏛️ Bank Transfer
                    </button>
                    <button
                      type="button"
                      className={`fin-method-btn ${withdrawMethod === 'PAYTM' ? 'active' : ''}`}
                      onClick={() => setWithdrawMethod('PAYTM')}
                    >
                      📱 Paytm Wallet
                    </button>
                  </div>
                </div>

                {/* METHOD SPECIFIC INPUT FIELDS */}
                {withdrawMethod === 'UPI' && (
                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px' }}>Enter UPI ID</label>
                    <input
                      type="text"
                      placeholder="e.g. name@upi or 9876543210@paytm"
                      value={upiId}
                      onChange={e => setUpiId(e.target.value)}
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '0.9rem' }}
                      required
                    />
                  </div>
                )}

                {withdrawMethod === 'BANK_TRANSFER' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '4px' }}>Account Holder Full Name</label>
                      <input
                        type="text"
                        placeholder="e.g. John Doe"
                        value={bankAccountName}
                        onChange={e => setBankAccountName(e.target.value)}
                        style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '0.85rem' }}
                        required
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '4px' }}>Bank Name</label>
                      <input
                        type="text"
                        placeholder="e.g. HDFC Bank / State Bank of India / ICICI"
                        value={bankName}
                        onChange={e => setBankName(e.target.value)}
                        style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '0.85rem' }}
                        required
                      />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '4px' }}>Account Number</label>
                        <input
                          type="text"
                          placeholder="e.g. 5010023456789"
                          value={bankAccountNumber}
                          onChange={e => setBankAccountNumber(e.target.value)}
                          style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '0.85rem' }}
                          required
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '4px' }}>IFSC Code</label>
                        <input
                          type="text"
                          placeholder="e.g. HDFC0001234"
                          value={bankIfsc}
                          onChange={e => setBankIfsc(e.target.value.toUpperCase())}
                          style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '0.85rem', textTransform: 'uppercase' }}
                          required
                        />
                      </div>
                    </div>
                  </div>
                )}

                {withdrawMethod === 'PAYTM' && (
                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px' }}>Enter Paytm Mobile Number</label>
                    <input
                      type="tel"
                      placeholder="e.g. 9876543210"
                      value={paytmNumber}
                      onChange={e => setPaytmNumber(e.target.value)}
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '0.9rem' }}
                      required
                    />
                  </div>
                )}

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px' }}>Withdrawal Amount (₹)</label>
                  <input
                    type="number"
                    min={vipLimits.minWithdraw || MIN_WITHDRAW_INR}
                    max={wallet.withdrawable}
                    value={withdrawAmount}
                    onChange={e => setWithdrawAmount(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '0.9rem' }}
                    required
                  />
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                    {['1000', '2500', '5000', '10000'].map(val => (
                      <button
                        type="button"
                        key={val}
                        onClick={() => setWithdrawAmount(val)}
                        className="fin-chip-btn"
                        disabled={Number(val) > wallet.withdrawable || Number(val) < vipLimits.minWithdraw}
                      >
                        ₹{val}
                      </button>
                    ))}
                    {wallet.withdrawable >= vipLimits.minWithdraw && (
                      <button
                        type="button"
                        onClick={() => setWithdrawAmount(String(Math.floor(wallet.withdrawable)))}
                        className="fin-chip-btn"
                      >
                        Max (₹{Math.floor(wallet.withdrawable)})
                      </button>
                    )}
                  </div>
                </div>

                <button
                  type="submit"
                  className="fin-btn-primary"
                  disabled={withdrawStatus === 'processing' || wallet.withdrawable < vipLimits.minWithdraw || (wallet.bonus > 0 && !acceptBonusForfeit)}
                >
                  {withdrawStatus === 'processing' ? 'Submitting Request...' : `Request ${withdrawMethod === 'BANK_TRANSFER' ? 'Bank Transfer' : withdrawMethod === 'PAYTM' ? 'Paytm' : 'UPI'} Withdrawal`}
                </button>
              </form>
            )}
          </div>
        )}

        {modalType === 'cancel-wd' && (
          <div className="fin-modal-body">
            {pendingWithdrawals.filter((w) => w.status === 'processing').length > 0 ? (
              pendingWithdrawals.filter((w) => w.status === 'processing').map(w => (
                <div key={w.id} className="fin-list-item">
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>{w.id} · {formatInr(w.amount)}</div>
                    <div className="fin-muted" style={{ fontSize: '0.75rem' }}>{w.upi} · {w.date}</div>
                    <div style={{ fontSize: '0.7rem', color: '#eab308', fontWeight: 700, marginTop: '2px' }}>Processing</div>
                  </div>
                  <button
                    onClick={() => handleCancelWithdrawal(w.id, w.amount)}
                    style={{ background: '#ef4444', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 800 }}
                  >
                    Cancel & Refund
                  </button>
                </div>
              ))
            ) : (
              <p className="fin-muted" style={{ textAlign: 'center', padding: '20px' }}>
                No cancellable withdrawals. Completed payouts appear under Transactions.
              </p>
            )}
          </div>
        )}

        {modalType === 'transactions' && (
          <div className="fin-modal-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(!transactions || transactions.length === 0) ? (
                <p className="fin-muted" style={{ textAlign: 'center', padding: '20px' }}>
                  No transactions yet. Deposits, withdrawals, and wins will show here.
                </p>
              ) : transactions.map((tx) => {
                const positive = (tx.amount || 0) >= 0;
                return (
                  <div
                    key={tx.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      background: positive ? '#f0fdf4' : '#fef2f2',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: `1px solid ${positive ? '#bbf7d0' : '#fecaca'}`,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 800, color: positive ? '#166534' : '#991b1b' }}>{tx.label || tx.type}</div>
                      <div style={{ fontSize: '0.7rem', color: positive ? '#15803d' : '#b91c1c' }}>
                        {tx.id} · {tx.createdAt ? new Date(tx.createdAt).toLocaleString('en-IN') : ''}
                      </div>
                    </div>
                    <span style={{ fontWeight: 900, color: positive ? '#16a34a' : '#dc2626' }}>
                      {positive ? '+' : ''}{formatInr(tx.amount)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {modalType === 'bets-history' && (
          <div className="fin-modal-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {placedBets.length === 0 ? (
                <p className="fin-muted" style={{ textAlign: 'center', padding: '20px' }}>No placed bets yet. Place a bet from the Sports page.</p>
              ) : placedBets.map(bet => {
                const status = bet.status || 'pending';
                return (
                  <div key={bet.id} style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748b' }}>
                      <span>
                        {bet.type?.toUpperCase()}
                        {bet.fundSource === 'bonus' ? ' · BONUS' : ' · CASH'}
                        {' · '}
                        {new Date(bet.placedAt).toLocaleString('en-IN')}
                      </span>
                      <span style={{ color: statusColor(status), fontWeight: 800 }}>{status.toUpperCase()}</span>
                    </div>
                    {bet.legs?.map(leg => (
                      <div key={leg.id} style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                        {leg.selectionName} @ {Number(leg.odds).toFixed(2)} — {leg.matchName}
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '0.8rem' }}>
                      <span>Stake: ₹{bet.stake?.toFixed(2)}</span>
                      <span style={{ fontWeight: 900, color: status === 'won' ? '#16a34a' : '#0f172a' }}>
                        {status === 'won' && bet.payout
                          ? `Payout: ₹${bet.payout.toFixed(2)}`
                          : `Return: ₹${bet.potentialReturn?.toFixed(2)}`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {modalType === 'bonuses' && (
          <div className="fin-modal-body">
            <div style={{ background: 'linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)', color: 'white', padding: '16px', borderRadius: '10px', marginBottom: '12px' }}>
              <div style={{ fontWeight: 800, fontSize: '1rem' }}>Active bonus balance</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, marginTop: '4px' }}>{formatInr(wallet.bonus)}</div>
              <div style={{ fontSize: '0.8rem', opacity: 0.9, marginTop: '8px' }}>
                Freebets: {formatInr(wallet.freebets)}
              </div>
            </div>
            <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.85rem', lineHeight: 1.5 }}>
              <strong>Bonus rules</strong>
              <ul style={{ margin: '8px 0 0', paddingLeft: '18px' }}>
                <li>Bonus can only be used on odds ≥ {BONUS_MIN_BET_ODDS.toFixed(2)}</li>
                <li>Bonus must rotate 5 times; then winnings can be withdrawn, not the bonus</li>
                <li>Free bets play like cash at any odds (profit only)</li>
                <li>Verify Aadhaar and PAN to withdraw. Promos are once per identity.</li>
              </ul>
            </div>
          </div>
        )}

        {modalType === 'marketplace' && (
          <div className="fin-modal-body">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fffbeb', padding: '12px', borderRadius: '8px', border: '1px solid #fde68a' }}>
              <div>
                <div style={{ fontWeight: 800, color: '#92400e' }}>Redeem loyalty points</div>
                <div style={{ fontSize: '0.75rem', color: '#b45309' }}>
                  You have {user.loyaltyPoints ?? user.coins ?? 0} pts · 1000 pts unlocks wallet credit
                </div>
              </div>
              <button
                onClick={() => notify('Use Redeem in the wallet menu when you reach 1000 points.')}
                style={{ background: '#f59e0b', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', fontWeight: 800, cursor: 'pointer' }}
              >
                Open wallet
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
