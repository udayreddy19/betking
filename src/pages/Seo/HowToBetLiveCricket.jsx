import { Link } from 'react-router-dom';
import './LiveCricketBetting.css';

export default function HowToBetLiveCricket() {
  return (
    <article className="lcb-page container">
      <header className="lcb-hero">
        <p className="lcb-eyebrow">How-to guide</p>
        <h1>How to bet live cricket on OddsYra</h1>
        <p className="lcb-lead">
          A simple walkthrough from signup to your first in-play cricket stake.
          Adults 18+ only. Play responsibly.
        </p>
        <div className="lcb-actions">
          <Link className="lcb-cta" to="/register">Create account</Link>
          <Link className="lcb-cta lcb-cta--ghost" to="/live-betting">Open live markets</Link>
        </div>
      </header>

      <section className="lcb-section">
        <h2>Step-by-step</h2>
        <ol>
          <li>Register with email or Google and confirm you are 18+.</li>
          <li>Deposit with UPI when you are ready to stake.</li>
          <li>Open Sports or Live Betting and pick a cricket match.</li>
          <li>Choose a market (e.g. Match Winner), set stake, confirm the bet slip.</li>
          <li>Track the bet in My Bets — settlements credit your wallet automatically.</li>
        </ol>
      </section>

      <section className="lcb-section">
        <h2>Tips for in-play</h2>
        <ul>
          <li>Prices move with wickets and overs — confirm the odds before you lock.</li>
          <li>Suspended markets reopen when the book is ready; do not force a stake.</li>
          <li>Set deposit limits before a long session from Responsible Gaming.</li>
        </ul>
        <p>
          Prefer simulated league cricket? See{' '}
          <Link to="/what-is-oddsyra-srl">What is OddsYra SRL</Link>.
        </p>
      </section>

      <footer className="lcb-foot">
        Gambling involves risk. See <Link to="/responsible-gaming">Responsible Gaming</Link> and{' '}
        <Link to="/terms">Terms</Link>.
      </footer>
    </article>
  );
}
