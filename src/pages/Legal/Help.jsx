import { Link } from 'react-router-dom';
import {
  BONUS_MIN_BET_ODDS,
  MIN_STAKE_INR,
} from '../../utils/wageringRules';
import { MIN_DEPOSIT_INR, MIN_WITHDRAW_INR } from '../../utils/vipBenefits';
import { LOYALTY_MIN_REDEEM_POINTS, LOYALTY_POINTS_PER_100_STANDARD, LOYALTY_POINTS_PER_100_VIP, LOYALTY_POINTS_PER_RUPEE } from '../../utils/loyaltyPoints';
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
          <li><strong>Deposits</strong> are locked until you wager that amount on bets. Minimum deposit is ₹{MIN_DEPOSIT_INR.toLocaleString('en-IN')}.</li>
          <li><strong>Winnings</strong> from bets can be withdrawn after Aadhaar and PAN verification (UPI, min ₹{MIN_WITHDRAW_INR.toLocaleString('en-IN')}; max depends on VIP tier).</li>
          <li><strong>Bonus</strong> cannot be withdrawn. Withdrawing winnings while bonus is still in your wallet sets that bonus to ₹0.</li>
          <li><strong>Free bets</strong> play like cash at any odds; winnings are profit only.</li>
        </ul>
      </section>
      <section>
        <h2>Bonus & freebet rules</h2>
        <ul>
          <li>Bonus can only be used on selections with odds ≥ {BONUS_MIN_BET_ODDS.toFixed(2)} and must rotate 5 times.</li>
          <li>After 5× rotation, bonus winnings can be withdrawn. The bonus itself cannot.</li>
          <li>Free bets play like cash at any odds and pay profit only (stake is not returned).</li>
          <li>Each promo code can be used once per user, linked to Aadhaar and PAN.</li>
        </ul>
      </section>
      <section>
        <h2>Loyalty points</h2>
        <p>
          Standard players earn {LOYALTY_POINTS_PER_100_STANDARD} points per ₹100 staked.
          Silver VIP club and above earn {LOYALTY_POINTS_PER_100_VIP} points per ₹100.
          {LOYALTY_POINTS_PER_RUPEE} points = ₹1. Redeem from {LOYALTY_MIN_REDEEM_POINTS}+ points in the wallet menu — credit goes to cash winnings.
        </p>
      </section>
      <section>
        <h2>Cash out</h2>
        <p>
          Open My Bets and cash out eligible pending cash bets early. Standard players get 85% of potential
          payout; VIP club rates go up to 95% at Diamond. Bonus and freebet bets cannot be cashed out.
        </p>
      </section>
      <section>
        <h2>Contact</h2>
        <p>For account or payment issues, chat with the assistant, open a ticket, and follow it in Profile → Support, or email support@oddsyra.com.</p>
        <button
          type="button"
          className="legal-chat-btn"
          onClick={() => window.dispatchEvent(new CustomEvent('oddsyra:open-support-chat'))}
        >
          Open support chat
        </button>
      </section>
      <p><Link to="/">← Back to home</Link></p>
    </div>
  );
}
