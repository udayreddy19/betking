import { Link } from 'react-router-dom';
import { useComplianceDemo } from '../../hooks/useComplianceDemo';
import { COMPLIANCE_CAPABILITIES } from '../../utils/complianceDemo';

export default function FeeDeskCompany() {
  const { copy } = useComplianceDemo();

  return (
    <div className="fd-page">
      <div className="fd-panel">
        <h2>{copy.businessTitle}</h2>
        <p className="fd-lead">
          Operating profile for {copy.legalBusinessName} ({copy.productName}). Used for project orders, delivery kickoffs, and client communications.
        </p>
        <dl className="fd-legal-dl" style={{ marginTop: '0.85rem' }}>
          <div>
            <dt>Registered as</dt>
            <dd>{copy.registeredIn}</dd>
          </div>
          <div>
            <dt>GSTIN</dt>
            <dd>{copy.gstin}</dd>
          </div>
          <div>
            <dt>CIN</dt>
            <dd>{copy.cin}</dd>
          </div>
          <div>
            <dt>Registered address</dt>
            <dd>{copy.registeredAddress}</dd>
          </div>
          <div>
            <dt>Support</dt>
            <dd>
              <a href={`mailto:${copy.supportEmail}`}>{copy.supportEmail}</a>
              {' · '}
              {copy.supportHours}
            </dd>
          </div>
          <div>
            <dt>Sales</dt>
            <dd>
              <a href={`mailto:${copy.salesEmail}`}>{copy.salesEmail}</a>
            </dd>
          </div>
        </dl>
      </div>

      <section className="fd-panel fd-about" style={{ marginTop: '1rem' }}>
        <h2 className="fd-section-title" style={{ marginTop: 0 }}>About {copy.productName}</h2>
        <p className="fd-business-desc">{copy.businessDescription}</p>
        <p className="fd-detail" style={{ marginTop: '0.75rem' }}>{copy.hqNote}</p>
        <ul className="fd-capabilities" aria-label="Capabilities">
          {COMPLIANCE_CAPABILITIES.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <div className="fd-hero-cta">
          <Link className="oy-btn oy-btn-primary" to="/desk/enroll">Start a project order</Link>
          <Link className="oy-btn oy-btn-ghost" to="/desk">Back to solutions</Link>
        </div>
      </section>
    </div>
  );
}
