import { Link } from 'react-router-dom';
import './LiveCricketBetting.css';

/**
 * Public SEO landing page for organic cricket-betting queries.
 * Keep copy factual, 18+, and conversion-focused without overclaiming.
 */
export default function LiveCricketBetting() {
  return (
    <article className="lcb-page container">
      <header className="lcb-hero">
        <p className="lcb-eyebrow">OddsYra sportsbook</p>
        <h1>Live cricket betting in India</h1>
        <p className="lcb-lead">
          Bet on live and upcoming cricket with real-time odds, fast UPI deposits,
          and responsible gaming tools. OddsYra is for adults 18+ only.
        </p>
        <div className="lcb-actions">
          <Link className="lcb-cta" to="/register">Create free account</Link>
          <Link className="lcb-cta lcb-cta--ghost" to="/live-betting">View live markets</Link>
        </div>
      </header>

      <section className="lcb-section">
        <h2>Why bet live cricket on OddsYra</h2>
        <ul>
          <li>In-play cricket markets with odds that update as the match unfolds</li>
          <li>UPI deposits and withdrawals through verified payment rails</li>
          <li>Welcome offers and an invite program — friends can earn when you play</li>
          <li>Deposit limits, cooling-off, and self-exclusion in Responsible Gaming</li>
        </ul>
      </section>

      <section className="lcb-section">
        <h2>How to start</h2>
        <ol>
          <li>Register with email or Google in under a minute</li>
          <li>Complete KYC when prompted so withdrawals stay smooth</li>
          <li>Deposit via UPI and open Sports or Live Betting</li>
          <li>Pick a market, set your stake, and place the bet</li>
        </ol>
        <p>
          Prefer simulated cricket? Try{' '}
          <Link to="/srl">OddsYra SRL</Link> for league-style fixtures with in-play markets.
        </p>
      </section>

      <section className="lcb-section">
        <h2>Invite friends</h2>
        <p>
          Share your invite link from Profile or Invite. Friends get a signup reward;
          you earn a share of their cash stakes when they play (subject to program rules).
        </p>
        <Link className="lcb-cta" to="/invite">Get your invite link</Link>
      </section>

      <footer className="lcb-foot">
        Gambling involves risk. Play only with money you can afford to lose.
        See <Link to="/responsible-gaming">Responsible Gaming</Link> and{' '}
        <Link to="/terms">Terms</Link>.
      </footer>
    </article>
  );
}
