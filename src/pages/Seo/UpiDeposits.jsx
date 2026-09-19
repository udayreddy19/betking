import { Link } from 'react-router-dom';
import './LiveCricketBetting.css';

export default function UpiDeposits() {
  return (
    <article className="lcb-page container">
      <header className="lcb-hero">
        <p className="lcb-eyebrow">Payments</p>
        <h1>UPI deposits on OddsYra</h1>
        <p className="lcb-lead">
          Fund your sportsbook wallet with Instant UPI — Google Pay, PhonePe, Paytm, BHIM and more.
          18+ only.
        </p>
        <div className="lcb-actions">
          <Link className="lcb-cta" to="/register">Create account</Link>
          <Link className="lcb-cta lcb-cta--ghost" to="/sports">Browse sports</Link>
        </div>
      </header>

      <section className="lcb-section">
        <h2>How UPI deposits work</h2>
        <ol>
          <li>Sign in and open Deposit from the header or wallet.</li>
          <li>Enter an amount and choose Instant UPI.</li>
          <li>Complete the payment in your UPI app.</li>
          <li>Return to OddsYra — credits usually appear within seconds after confirmation.</li>
        </ol>
        <p>
          Add your mobile number before depositing if you signed up with Google.
          KYC is required for withdrawals, not for placing your first funded bets.
        </p>
      </section>

      <section className="lcb-section">
        <h2>After you deposit</h2>
        <ul>
          <li>Open Live Cricket or Sports and place a careful first stake.</li>
          <li>Invite friends from Invite — rewards unlock after they deposit (program rules apply).</li>
          <li>Set limits anytime under Responsible Gaming.</li>
        </ul>
        <Link className="lcb-cta" to="/how-to-bet-live-cricket">How to place your first bet</Link>
      </section>

      <footer className="lcb-foot">
        Payment issues? See <Link to="/help">Help</Link>. Safer play:{' '}
        <Link to="/responsible-gaming">Responsible Gaming</Link>.
      </footer>
    </article>
  );
}
