import { Link } from 'react-router-dom';
import './LegalPage.css';

export default function Privacy() {
  return (
    <div className="legal-page container">
      <h1>Privacy Policy</h1>
      <section>
        <h2>Data we collect</h2>
        <p>
          We collect account details you provide at registration, transaction history, and usage data needed to operate the platform.
        </p>
      </section>
      <section>
        <h2>How we use your data</h2>
        <p>
          Your information is used to manage your account, process payments, prevent fraud, and improve our services. We do not sell your personal data.
        </p>
      </section>
      <section>
        <h2>Cookies</h2>
        <p>Browser storage may be used for login sessions and UI preferences.</p>
      </section>
      <p><Link to="/">← Back to home</Link></p>
    </div>
  );
}
