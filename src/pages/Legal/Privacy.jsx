import { Link } from 'react-router-dom';
import './LegalPage.css';

export default function Privacy() {
  return (
    <div className="legal-page container">
      <h1>Privacy Policy</h1>
      <p className="legal-demo-notice">Demo application — no personal data is sold or shared.</p>
      <section>
        <h2>Data we store (demo)</h2>
        <p>Session state (balance, bets) may be held in memory during your visit. No production database is used.</p>
      </section>
      <section>
        <h2>Cookies</h2>
        <p>Standard browser storage may be used for UI preferences only.</p>
      </section>
      <p><Link to="/">← Back to home</Link></p>
    </div>
  );
}
