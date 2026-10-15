import { Link } from 'react-router-dom';
import { useComplianceDemo } from '../../hooks/useComplianceDemo';

export default function FeeDeskRecords() {
  const { copy } = useComplianceDemo();

  return (
    <div className="fd-page">
      <div className="fd-panel">
        <h2>{copy.recordsTitle}</h2>
        <p className="fd-lead">
          Paid kickoff invoices and project orders for {copy.productName}. Share the order reference with your delivery lead at kickoff.
        </p>
      </div>

      <div className="fd-panel" style={{ marginTop: '1rem' }}>
        <p className="fd-business-desc" style={{ margin: 0 }}>
          Order history appears after checkout. No paid project orders yet.
        </p>
        <div className="fd-hero-cta" style={{ marginTop: '1rem' }}>
          <Link className="oy-btn oy-btn-primary" to="/desk/enroll">Start a project order</Link>
          <Link className="oy-btn oy-btn-ghost" to="/desk">Back to solutions</Link>
        </div>
      </div>
    </div>
  );
}
