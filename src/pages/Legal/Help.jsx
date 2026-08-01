import { Link } from 'react-router-dom';
import './LegalPage.css';

export default function Help() {
  return (
    <div className="legal-page container">
      <h1>Help Center</h1>
      <section>
        <h2>How to place a demo bet</h2>
        <ol>
          <li>Go to <Link to="/sports">Sports</Link> and pick a live match.</li>
          <li>Tap an odds button to add it to your betslip.</li>
          <li>Enter a stake and click Place Bet.</li>
        </ol>
      </section>
      <section>
        <h2>Demo login</h2>
        <p>Use username <strong>demo</strong> and password <strong>demo1234</strong> (or your configured env credentials).</p>
      </section>
      <section>
        <h2>Contact</h2>
        <p>Portfolio demo — no live support. See README in the project repo.</p>
      </section>
      <p><Link to="/">← Back to home</Link></p>
    </div>
  );
}
