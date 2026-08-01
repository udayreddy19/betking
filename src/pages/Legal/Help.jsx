import { Link } from 'react-router-dom';
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
          <li>Enter a stake and click Place Bet.</li>
        </ol>
      </section>
      <section>
        <h2>Deposits & withdrawals</h2>
        <p>
          Use the Deposit button in the header to add funds via UPI or other supported methods.
          Withdrawals are processed to your registered UPI ID.
        </p>
      </section>
      <section>
        <h2>Contact</h2>
        <p>For account or payment issues, contact support at support@betking.com.</p>
      </section>
      <p><Link to="/">← Back to home</Link></p>
    </div>
  );
}
