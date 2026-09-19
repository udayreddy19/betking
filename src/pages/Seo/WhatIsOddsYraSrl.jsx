import { Link } from 'react-router-dom';
import './LiveCricketBetting.css';

export default function WhatIsOddsYraSrl() {
  return (
    <article className="lcb-page container">
      <header className="lcb-hero">
        <p className="lcb-eyebrow">OddsYra SRL</p>
        <h1>What is OddsYra SRL?</h1>
        <p className="lcb-lead">
          OddsYra SRL is our on-platform simulated cricket league — fixtures, points table,
          live boards, and in-play markets operated by the OddsYra desk. 18+ only.
        </p>
        <div className="lcb-actions">
          <Link className="lcb-cta" to="/srl">Open SRL</Link>
          <Link className="lcb-cta lcb-cta--ghost" to="/register">Create account</Link>
        </div>
      </header>

      <section className="lcb-section">
        <h2>How SRL differs from live sports</h2>
        <ul>
          <li>Match state is driven on-platform — no external score feed for the core board.</li>
          <li>Season schedule, playoffs, and a points table you can follow like a real league.</li>
          <li>Desk controls can lock toss and markets under liability rules.</li>
          <li>Settlements credit your OddsYra wallet like other sportsbook bets.</li>
        </ul>
      </section>

      <section className="lcb-section">
        <h2>Getting started</h2>
        <ol>
          <li>Register and deposit with UPI.</li>
          <li>Open SRL for the schedule and live boards.</li>
          <li>Pick Match Winner or related markets and place a stake.</li>
        </ol>
        <p>
          Still want real-world cricket? Use{' '}
          <Link to="/live-cricket-betting">Live Cricket Betting</Link> and{' '}
          <Link to="/sports">Sports</Link>.
        </p>
      </section>

      <footer className="lcb-foot">
        Gambling involves risk. See <Link to="/responsible-gaming">Responsible Gaming</Link>.
      </footer>
    </article>
  );
}
