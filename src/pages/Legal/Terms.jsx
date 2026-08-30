import { Link } from 'react-router-dom';
import './LegalPage.css';

export default function Terms() {
  return (
    <div className="legal-page container">
      <h1>Terms & Conditions</h1>
      <section>
        <h2>1. Platform</h2>
        <p>
          ODDSYRA provides technology and platform services. By accessing or using this site, you agree to comply with these terms of service.
        </p>
      </section>
      <section>
        <h2>2. Eligibility & Access</h2>
        <p>
          Access to certain areas of the platform is restricted to authorized users. You are responsible for ensuring that all information provided during platform interactions is accurate.
        </p>
      </section>
      <section>
        <h2>3. Account Security</h2>
        <p>
          Authorized account holders are responsible for maintaining the confidentiality of their credentials. Any unauthorized access attempts should be reported to support immediately.
        </p>
      </section>
      <section>
        <h2>4. Modifications</h2>
        <p>
          We reserve the right to modify, suspend, or update platform services, features, and policies as necessary during maintenance and verification cycles.
        </p>
      </section>
      <p style={{ marginTop: '2.5rem' }}>
        <Link to="/" style={{ color: 'var(--text-secondary, #94a3b8)', textDecoration: 'none' }}>
          ← Back to home
        </Link>
      </p>
    </div>
  );
}
