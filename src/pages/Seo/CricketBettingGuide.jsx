import { Link } from 'react-router-dom';
import './LiveCricketBetting.css';

export default function CricketBettingGuide() {
  return (
    <article className="lcb-page container">
      <header className="lcb-hero">
        <p className="lcb-eyebrow">Guides</p>
        <h1>Cricket betting guide for India</h1>
        <p className="lcb-lead">
          OddsYra basics for cricket markets, UPI funding, invites, and safer play.
          For adults 18+ only.
        </p>
        <div className="lcb-actions">
          <Link className="lcb-cta" to="/register">Join OddsYra</Link>
          <Link className="lcb-cta lcb-cta--ghost" to="/sports">View sports board</Link>
        </div>
      </header>

      <section className="lcb-section">
        <h2>What you can bet</h2>
        <p>
          Pre-match and in-play cricket markets on the Sports and Live Betting boards,
          plus OddsYra SRL for simulated league fixtures. Always confirm the price and
          market status before you confirm a stake.
        </p>
      </section>

      <section className="lcb-section">
        <h2>Money &amp; rewards</h2>
        <ul>
          <li><Link to="/upi-deposits">UPI deposits</Link> — fund quickly from your phone.</li>
          <li><Link to="/invite">Invite friends</Link> — rewards after they deposit under program rules.</li>
          <li><Link to="/promotions">Promotions</Link> — read terms before claiming.</li>
        </ul>
      </section>

      <section className="lcb-section">
        <h2>Stay in control</h2>
        <p>
          Use deposit, stake, and loss limits. Cooling-off and self-exclusion are available
          from your profile. Helplines are listed on{' '}
          <Link to="/responsible-gaming">Responsible Gaming</Link>.
        </p>
      </section>

      <footer className="lcb-foot">
        Next: <Link to="/how-to-bet-live-cricket">How to bet live cricket</Link>.
      </footer>
    </article>
  );
}
