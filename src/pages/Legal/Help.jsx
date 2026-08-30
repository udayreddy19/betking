import { Link } from 'react-router-dom';
import './LegalPage.css';

export default function Help() {
  return (
    <div className="legal-page container">
      <h1>Help & Support</h1>
      <section>
        <h2>Platform Inquiries & Support</h2>
        <p>
          If you have questions regarding the ODDSYRA platform, account access, system updates, or verification status, our support team is available to assist you.
        </p>
      </section>

      <section>
        <h2>Contact Information</h2>
        <p>
          You can reach our team directly by email:
        </p>
        <p style={{ margin: '1rem 0' }}>
          <strong>Email:</strong>{' '}
          <a href="mailto:support@oddsyra.com" style={{ color: '#3b82f6', textDecoration: 'none', fontWeight: 600 }}>
            support@oddsyra.com
          </a>
        </p>
      </section>

      <section>
        <h2>Access & Verification</h2>
        <p>
          During the platform verification and update period, access is limited to authorized accounts. If you are an authorized partner or tester requiring assistance with your credentials, please contact support with your assigned account details.
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
