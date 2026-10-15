import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { useComplianceDemo } from '../../hooks/useComplianceDemo';
import {
  COMPLIANCE_CAPABILITIES,
  COMPLIANCE_HOW_IT_WORKS,
  COMPLIANCE_PROGRAMS,
  formatPackagePrice,
} from '../../utils/complianceDemo';
import { pressScale, springUi } from '../../utils/motionPresets';

export default function FeeDeskHome() {
  const { copy } = useComplianceDemo();

  return (
    <div className="fd-page">
      <motion.section
        className="fd-hero"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springUi}
      >
        <p className="fd-kicker">{copy.productName}</p>
        <h1>{copy.homeHeadline}</h1>
        <p>{copy.homeSub}</p>
        <div className="fd-meta-row">
          <span>{copy.registeredIn}</span>
          <span aria-hidden>·</span>
          <span>{copy.supportHours}</span>
          <span aria-hidden>·</span>
          <a href={`mailto:${copy.salesEmail}`}>{copy.salesEmail}</a>
        </div>
        <ul className="fd-capabilities" aria-label="Capabilities">
          {COMPLIANCE_CAPABILITIES.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <div className="fd-trust">
          <span>Secure checkout</span>
          <span>Scoped deliverables</span>
          <span>Order references</span>
          <span>India Pvt Ltd</span>
        </div>
        <div className="fd-hero-cta">
          <Link className="oy-btn oy-btn-primary" to="/desk/enroll">Start a project order</Link>
          <Link className="oy-btn oy-btn-secondary" to="/company">Company details</Link>
          <Link className="oy-btn oy-btn-ghost" to="/documents">Sample quotation (PG)</Link>
        </div>
      </motion.section>

      <section className="fd-panel fd-about">
        <h2 className="fd-section-title" style={{ marginTop: 0 }}>About {copy.productName}</h2>
        <p className="fd-business-desc">{copy.businessDescription}</p>
        <p className="fd-detail" style={{ marginTop: '0.75rem' }}>{copy.hqNote}</p>
      </section>

      <h2 className="fd-section-title">How an order works</h2>
      <ol className="fd-steps">
        {COMPLIANCE_HOW_IT_WORKS.map((item) => (
          <li key={item.step} className="fd-step">
            <span className="fd-step-num">{item.step}</span>
            <div>
              <strong>{item.title}</strong>
              <p>{item.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <h2 className="fd-section-title">Engagement packages</h2>
      <p className="fd-lead" style={{ marginTop: '-0.35rem', marginBottom: '0.85rem' }}>
        Fixed-scope kickoff invoices for delivery capacity this quarter. These are project fees — not a prepaid wallet balance.
      </p>
      <div className="fd-grid">
        {COMPLIANCE_PROGRAMS.map((p, i) => (
          <motion.article
            key={p.id}
            className="fd-card"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springUi, delay: i * 0.04 }}
          >
            <span className={`fd-card-kind${p.kind === 'Payments' || p.kind === 'Support' ? ' travel' : ''}`}>
              {p.kind}
            </span>
            <h3>{p.title}</h3>
            <p className="fd-detail">{p.detail}</p>
            <ul className="fd-includes">
              {p.includes.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <div className="fd-card-meta">
              <span>{p.delivery}</span>
              <span>{p.billing}</span>
            </div>
            <div className="fd-card-foot">
              <div>
                <p className="fd-price">{formatPackagePrice(p.amountInr)}</p>
                <p className="fd-seats-label">Kickoff invoice</p>
              </div>
              <motion.div whileTap={{ scale: pressScale }}>
                <Link
                  className="oy-btn oy-btn-primary"
                  to={`/desk/enroll?program=${encodeURIComponent(p.id)}`}
                >
                  Start order
                </Link>
              </motion.div>
            </div>
          </motion.article>
        ))}
      </div>
    </div>
  );
}
