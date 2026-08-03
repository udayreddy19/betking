import { useState } from 'react';
import { IoClose, IoCheckmarkCircle, BiWallet, BiMoneyWithdraw, BiHistory, BiTransfer, BiGift } from '../../icons';
import { useAuth } from '../../context/AuthContext';
import { useBetSlip } from '../../context/BetSlipContext';
import { getWalletBreakdown, formatInr } from '../../utils/walletBalance';
import './FinancialModals.css';

export default function FinancialModals({ modalType, onClose }) {
  const { user, withdrawFunds, updateUserBalance, showToast } = useAuth();
  const { placedBets } = useBetSlip();
  const wallet = getWalletBreakdown(user);

  // Withdraw state
  const [upiId, setUpiId] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('1000');
  const [withdrawStatus, setWithdrawStatus] = useState(null); // 'processing' | 'success'

  // Cancel W/D state
  const [pendingWithdrawals, setPendingWithdrawals] = useState([]);

  if (!modalType || !user) return null;

  const notify = (msg) => showToast(msg);

  const handleRazorpayWithdraw = (e) => {
    e.preventDefault();
    if (!upiId.trim()) return notify('Please enter a valid UPI ID');
    const amt = parseFloat(withdrawAmount);
    if (isNaN(amt) || amt < 500) return notify('Minimum withdrawal is ₹500');
    if (amt > wallet.withdrawable) {
      return notify(
        wallet.lockedDeposit > 0
          ? `Only ${formatInr(wallet.withdrawable)} is withdrawable. Wager deposited funds before withdrawing.`
          : 'Insufficient withdrawable balance',
      );
    }

    setWithdrawStatus('processing');

    setTimeout(() => {
      const { success } = withdrawFunds(amt);
      if (!success) {
        setWithdrawStatus(null);
        notify('Withdrawal failed. Please try again.');
        return;
      }
      setWithdrawStatus('success');
      setPendingWithdrawals(prev => [
        { id: `WD-${Math.floor(10000 + Math.random() * 90000)}`, amount: amt, upi: upiId, date: 'Just now', status: 'Razorpay Instant Payout Completed' },
        ...prev
      ]);
    }, 1800);
  };

  // Cancel Pending Withdrawal
  const handleCancelWithdrawal = (id, amount) => {
    setPendingWithdrawals(prev => prev.filter(w => w.id !== id));
    updateUserBalance(amount);
    notify(`Withdrawal ${id} cancelled. ₹${amount} refunded to your balance!`);
  };

  return (
    <div className="fin-modal-overlay" onClick={onClose}>
      <div className="fin-modal-card" onClick={e => e.stopPropagation()}>
        <div className="fin-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800 }}>
            {modalType === 'withdraw' && <><BiMoneyWithdraw style={{ color: '#22c55e', fontSize: '1.4rem' }} /> Razorpay Instant Withdrawal</>}
            {modalType === 'cancel-wd' && <><BiMoneyWithdraw style={{ color: '#ef4444', fontSize: '1.4rem' }} /> Cancel Pending Withdrawals</>}
            {modalType === 'transactions' && <><BiTransfer style={{ color: '#3b82f6', fontSize: '1.4rem' }} /> Razorpay Transaction History</>}
            {modalType === 'bets-history' && <><BiHistory style={{ color: '#f59e0b', fontSize: '1.4rem' }} /> My Bets History</>}
            {modalType === 'bonuses' && <><BiGift style={{ color: '#a855f7', fontSize: '1.4rem' }} /> My Bonuses & Free Spins</>}
            {modalType === 'marketplace' && <><BiWallet style={{ color: '#eab308', fontSize: '1.4rem' }} /> Loyalty Rewards Marketplace</>}
          </div>
          <button className="fin-modal-close" onClick={onClose}>
            <IoClose />
          </button>
        </div>

        {/* 1. RAZORPAY WITHDRAWAL MODAL */}
        {modalType === 'withdraw' && (
          <div className="fin-modal-body">
            {withdrawStatus === 'success' ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <IoCheckmarkCircle style={{ color: '#22c55e', fontSize: '3.5rem', marginBottom: '10px' }} />
                <h3 style={{ margin: 0, fontWeight: 800 }}>Payout Sent via Razorpay!</h3>
                <p className="fin-muted" style={{ fontSize: '0.85rem', marginTop: '6px' }}>
                  ₹{withdrawAmount} sent instantly to <strong>{upiId}</strong>. Ref ID: RZP_WD_{Math.floor(Math.random() * 900000 + 100000)}
                </p>
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
                  <div className="fin-balance-label">Withdrawable balance</div>
                  <div className="fin-balance-amount">{formatInr(wallet.withdrawable)}</div>
                  {wallet.lockedDeposit > 0 && (
                    <p className="fin-muted" style={{ fontSize: '0.8rem', marginTop: '6px' }}>
                      {formatInr(wallet.lockedDeposit)} locked until wagered (deposits must be bet first)
                    </p>
                  )}
                  {wallet.bonus > 0 && (
                    <p className="fin-muted" style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                      Bonus {formatInr(wallet.bonus)}: bet at 1.80+ odds; winnings withdrawable at 1.85+
                    </p>
                  )}
                </div>

                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px' }}>Enter UPI ID (GPay / PhonePe / Paytm / BHIM)</label>
                  <input
                    type="text"
                    placeholder="e.g. udayreddy@upi or 9876543210@ybl"
                    value={upiId}
                    onChange={e => setUpiId(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                    required
                  />
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px' }}>Withdrawal Amount (₹)</label>
                  <input
                    type="number"
                    min="500"
                    max={wallet.withdrawable}
                    value={withdrawAmount}
                    onChange={e => setWithdrawAmount(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                    required
                  />
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                    {['500', '1000', '2500', '5000'].map(val => (
                      <button
                        type="button"
                        key={val}
                        onClick={() => setWithdrawAmount(val)}
                        className="fin-chip-btn"
                      >
                        +₹{val}
                      </button>
                    ))}
                  </div>
                </div>

                <button type="submit" className="fin-btn-primary" disabled={withdrawStatus === 'processing'}>
                  {withdrawStatus === 'processing' ? 'Processing Razorpay Payout...' : 'Instant Razorpay UPI Payout'}
                </button>
              </form>
            )}
          </div>
        )}

        {/* 2. CANCEL WITHDRAWAL MODAL */}
        {modalType === 'cancel-wd' && (
          <div className="fin-modal-body">
            {pendingWithdrawals.length > 0 ? (
              pendingWithdrawals.map(w => (
                <div key={w.id} className="fin-list-item">
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>{w.id} · ₹{w.amount}</div>
                    <div className="fin-muted" style={{ fontSize: '0.75rem' }}>{w.upi} · {w.date}</div>
                    <div style={{ fontSize: '0.7rem', color: '#eab308', fontWeight: 700, marginTop: '2px' }}>{w.status}</div>
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
              <p className="fin-muted" style={{ textAlign: 'center', padding: '20px' }}>No pending withdrawal requests found.</p>
            )}
          </div>
        )}

        {/* 3. TRANSACTIONS HISTORY */}
        {modalType === 'transactions' && (
          <div className="fin-modal-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', background: '#f0fdf4', padding: '10px 12px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                <div>
                  <div style={{ fontWeight: 800, color: '#166534' }}>Deposit via Razorpay UPI</div>
                  <div style={{ fontSize: '0.7rem', color: '#15803d' }}>Ref: RZP_DEP_992184 · Today 13:45</div>
                </div>
                <span style={{ fontWeight: 900, color: '#16a34a' }}>+₹1,000.00</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', background: '#fef2f2', padding: '10px 12px', borderRadius: '8px', border: '1px solid #fecaca' }}>
                <div>
                  <div style={{ fontWeight: 800, color: '#991b1b' }}>Instant Razorpay Payout</div>
                  <div style={{ fontSize: '0.7rem', color: '#b91c1c' }}>Ref: RZP_WD_882910 · Today 11:20</div>
                </div>
                <span style={{ fontWeight: 900, color: '#dc2626' }}>-₹500.00</span>
              </div>
            </div>
          </div>
        )}

        {/* 4. MY BETS HISTORY */}
        {modalType === 'bets-history' && (
          <div className="fin-modal-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {placedBets.length === 0 ? (
                <p className="fin-muted" style={{ textAlign: 'center', padding: '20px' }}>No placed bets yet. Place a bet from the Sports page.</p>
              ) : placedBets.map(bet => (
                <div key={bet.id} style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748b' }}>
                    <span>{bet.type?.toUpperCase()} · {new Date(bet.placedAt).toLocaleString('en-IN')}</span>
                    <span style={{ color: '#2563eb', fontWeight: 800 }}>PENDING</span>
                  </div>
                  {bet.legs?.map(leg => (
                    <div key={leg.id} style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                      {leg.selectionName} @ {Number(leg.odds).toFixed(2)} — {leg.matchName}
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '0.8rem' }}>
                    <span>Stake: ₹{bet.stake?.toFixed(2)}</span>
                    <span style={{ fontWeight: 900, color: '#16a34a' }}>Return: ₹{bet.potentialReturn?.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 5. MY BONUSES */}
        {modalType === 'bonuses' && (
          <div className="fin-modal-body">
            <div style={{ background: 'linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)', color: 'white', padding: '16px', borderRadius: '10px', marginBottom: '12px' }}>
              <div style={{ fontWeight: 800, fontSize: '1rem' }}>150% Sports Welcome Bonus</div>
              <div style={{ fontSize: '0.8rem', opacity: 0.9 }}>Code: WELCOME150</div>
              <button onClick={() => notify('Bonus WELCOME150 activated!')} style={{ background: 'white', color: '#7e22ce', border: 'none', padding: '6px 14px', borderRadius: '6px', fontWeight: 800, marginTop: '10px', cursor: 'pointer' }}>
                Claim ₹30,000 Bonus
              </button>
            </div>
          </div>
        )}

        {/* 6. MARKETPLACE */}
        {modalType === 'marketplace' && (
          <div className="fin-modal-body">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fffbebf1', padding: '12px', borderRadius: '8px', border: '1px solid #fde68a' }}>
              <div>
                <div style={{ fontWeight: 800, color: '#92400e' }}>₹500 Free Bet Voucher</div>
                <div style={{ fontSize: '0.75rem', color: '#b45309' }}>Cost: 50 Loyalty Points (You have {user.loyaltyPoints ?? user.coins ?? 0})</div>
              </div>
              <button
                onClick={() => notify('Redeemed ₹500 Free Bet Voucher!')}
                style={{ background: '#f59e0b', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', fontWeight: 800, cursor: 'pointer' }}
              >
                Redeem
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
