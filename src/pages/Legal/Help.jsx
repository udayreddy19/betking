import { Link } from 'react-router-dom';
import {
  BONUS_MIN_BET_ODDS,
  BONUS_MIN_WITHDRAW_ODDS,
  MIN_STAKE_INR,
} from '../../utils/wageringRules';
import { LOYALTY_MIN_REDEEM_POINTS, LOYALTY_POINTS_PER_100, LOYALTY_POINTS_PER_RUPEE } from '../../utils/loyaltyPoints';
import './LegalPage.css';

export default function Help() {
  return (
    <div className="legal-page container">
      <h1>Help Center</h1>
      <section>
        <h2>How to place a bet</h2>
        <ol>
          <li>Log in or <Link to="/register">create an account</Link>.</li>
          <li>Go to <Link to="/sports">Sports</Link> and pick a live match.</li>
          <li>Tap an odds button to add it to your betslip.</li>
          <li>Choose Cash, Bonus, or Freebet, enter a stake (min ₹{MIN_STAKE_INR}), and place the bet.</li>
        </ol>
      </section>
      <section>
        <h2>Wallet & withdrawals</h2>
        <ul>
          <li><strong>Deposits</strong> are locked until you wager that amount on bets.</li>
          <li><strong>Winnings</strong> from bets can be withdrawn (UPI, min ₹500).</li>
          <li><strong>Bonus</strong> and <strong>Freebets</strong> cannot be withdrawn directly.</li>
        </ul>
      </section>
      <section>
        <h2>Bonus & freebet rules</h2>
        <ul>
          <li>Can only be used on selections with odds ≥ {BONUS_MIN_BET_ODDS.toFixed(2)}.</li>
          <li>Winnings become withdrawable only when odds ≥ {BONUS_MIN_WITHDRAW_ODDS.toFixed(2)}.</li>
          <li>Freebets pay profit only (stake is not returned).</li>
          <li>Lower-odds wins return funds to bonus/freebet — not to winnings.</li>
        </ul>
      </section>
      <section>
        <h2>Loyalty points</h2>
        <p>
          Earn {LOYALTY_POINTS_PER_100} points per ₹100 spent. {LOYALTY_POINTS_PER_RUPEE} points = ₹1.
          Redeem from {LOYALTY_MIN_REDEEM_POINTS}+ points in the wallet menu — credit goes to Winnings.
        </p>
      </section>
      <section>
        <h2>Cash out</h2>
        <p>
          Open My Bets and cash out eligible pending cash bets early for an offered amount
          (credited to Winnings). Bonus and freebet bets cannot be cashed out.
        </p>
      </section>
      <section>
        <h2>Contact</h2>
        <p>For account or payment issues, open live chat or email support@betking.com.</p>
        <button
          type="button"
          className="legal-chat-btn"
          onClick={() => window.dispatchEvent(new CustomEvent('betking:open-support-chat'))}
        >
          Open live chat
        </button>
      </section>
      <p><Link to="/">← Back to home</Link></p>
    </div>
  );
}
