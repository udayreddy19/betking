import { Link } from 'react-router-dom';
import './LegalPage.css';

export default function Terms() {
  return (
    <div className="legal-page container">
      <h1>Terms & Conditions</h1>
      <section>
        <h2>1. Platform</h2>
        <p>
          BetKing provides sports betting and related gaming services. By using this site you agree to these terms.
        </p>
      </section>
      <section>
        <h2>2. Eligibility</h2>
        <p>You must be 18 years or older and legally permitted to gamble in your jurisdiction.</p>
      </section>
      <section>
        <h2>3. Account</h2>
        <p>
          You are responsible for keeping your login credentials secure. We may require identity verification for withdrawals and compliance.
        </p>
      </section>
      <section>
        <h2>4. Wagering & withdrawals</h2>
        <p>
          Deposited funds must be placed on bets before they can contribute to withdrawable balance.
          Only bet winnings (and eligible bonus/freebet profits meeting minimum odds) may be withdrawn.
          Bonus and freebet balances are not directly withdrawable.
        </p>
      </section>
      <p><Link to="/">← Back to home</Link></p>
    </div>
  );
}
