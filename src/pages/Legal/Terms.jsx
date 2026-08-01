import { Link } from 'react-router-dom';
import './LegalPage.css';

export default function Terms() {
  return (
    <div className="legal-page container">
      <h1>Terms & Conditions</h1>
      <p className="legal-demo-notice">Demo application — no real-money wagering.</p>
      <section>
        <h2>1. Demo platform</h2>
        <p>
          BetKing (demo) is an educational portfolio project. Virtual balances and bets have no monetary value.
        </p>
      </section>
      <section>
        <h2>2. Eligibility</h2>
        <p>You must be 18 years or older to use this demo.</p>
      </section>
      <section>
        <h2>3. Account</h2>
        <p>Demo accounts use virtual funds only. No KYC or real payments are required for test play.</p>
      </section>
      <p><Link to="/">← Back to home</Link></p>
    </div>
  );
}
