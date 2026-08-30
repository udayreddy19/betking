import { Link } from 'react-router-dom';
import './LegalPage.css';

export default function ResponsibleGaming() {
  return (
    <div className="legal-page container">
      <h1>Platform Guidelines</h1>
      <section>
        <h2>Fair & Secure Usage</h2>
        <p>
          ODDSYRA is committed to providing a secure, compliant, and responsible platform environment for all users and partners.
        </p>
      </section>
      <section>
        <h2>Support Inquiries</h2>
        <p>
          For questions or assistance regarding platform access, compliance policies, or account controls, please contact{' '}
          <a href="mailto:support@oddsyra.com" style={{ color: '#3b82f6', textDecoration: 'none' }}>
            support@oddsyra.com
          </a>.
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
