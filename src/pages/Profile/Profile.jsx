import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getWalletBreakdown, formatInr } from '../../utils/walletBalance';
import { getLoyaltySummary, LOYALTY_MIN_REDEEM_POINTS } from '../../utils/loyaltyPoints';
import {
  BONUS_MIN_BET_ODDS,
  BONUS_MIN_WITHDRAW_ODDS,
} from '../../utils/wageringRules';
import '../Legal/LegalPage.css';
import './Profile.css';

export default function Profile() {
  const { user, isLoggedIn, openDepositModal, openFinModal, redeemLoyaltyPoints } = useAuth();

  if (!isLoggedIn) {
    return <Navigate to="/" replace />;
  }

  const wallet = getWalletBreakdown(user);
  const loyalty = getLoyaltySummary(user);

  return (
    <div className="profile-page container" id="profile-page">
      <div className="profile-card">
        <div className="profile-avatar">👤</div>
        <h1>{user.displayName}</h1>
        <p className="profile-email">{user.email}</p>

        <div className="profile-wallet-grid">
          <div className="profile-stat">
            <span className="label">Total balance</span>
            <span className="value">{formatInr(wallet.total)}</span>
          </div>
          <div className="profile-stat">
            <span className="label">Winnings</span>
            <span className="value profile-stat__winnings">{formatInr(wallet.winnings)}</span>
          </div>
          <div className="profile-stat">
            <span className="label">Bonus / Freebets</span>
            <span className="value profile-stat__bonus">{formatInr(wallet.bonusAndFreebets)}</span>
          </div>
          <div className="profile-stat">
            <span className="label">Deposited (locked)</span>
            <span className="value profile-stat__locked">{formatInr(wallet.lockedDeposit)}</span>
          </div>
        </div>

        <div className="profile-loyalty-box">
          <div className="profile-loyalty-head">
            <span>Loyalty · {user.loyaltyRank} Lv.{user.loyaltyLevel}</span>
            <strong>{loyalty.points} pts</strong>
          </div>
          <div className="profile-loyalty-bar">
            <div style={{ width: `${loyalty.progress}%` }} />
          </div>
          <p className="profile-loyalty-meta">
            {loyalty.canRedeem
              ? `Ready to redeem for ${formatInr(loyalty.redeemValue)}`
              : `${loyalty.pointsToUnlock} pts to unlock (min ${LOYALTY_MIN_REDEEM_POINTS})`}
          </p>
          <button
            type="button"
            className="profile-link-btn"
            disabled={!loyalty.canRedeem}
            onClick={() => redeemLoyaltyPoints()}
          >
            Redeem points
          </button>
        </div>

        <p className="profile-rules">
          Deposits must be wagered before withdrawal. Bonus bets need odds ≥ {BONUS_MIN_BET_ODDS.toFixed(2)};
          bonus winnings withdraw at ≥ {BONUS_MIN_WITHDRAW_ODDS.toFixed(2)}. Only Winnings can be withdrawn.
        </p>

        <div className="profile-actions">
          <button type="button" className="profile-link-btn" onClick={openDepositModal}>Deposit</button>
          <button type="button" className="profile-link-btn outline" onClick={() => openFinModal('withdraw')}>Withdraw</button>
          <Link to="/sports" className="profile-link-btn outline">Sports</Link>
        </div>
      </div>
    </div>
  );
}
