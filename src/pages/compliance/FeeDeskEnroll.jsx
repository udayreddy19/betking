import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useComplianceDemo } from '../../hooks/useComplianceDemo';
import { COMPLIANCE_PROGRAMS, formatPackagePrice } from '../../utils/complianceDemo';

export default function FeeDeskEnroll() {
  const { copy } = useComplianceDemo();
  const [params, setParams] = useSearchParams();
  const programId = params.get('program') || COMPLIANCE_PROGRAMS[0]?.id || '';
  const program = useMemo(
    () => COMPLIANCE_PROGRAMS.find((p) => p.id === programId) || COMPLIANCE_PROGRAMS[0],
    [programId],
  );
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [notes, setNotes] = useState('');

  function selectProgram(id) {
    const next = new URLSearchParams(params);
    next.set('program', id);
    setParams(next, { replace: true });
  }

  const mailto = useMemo(() => {
    const subject = encodeURIComponent(
      `Project order: ${program?.title || 'engagement'} — ${copy.productName}`,
    );
    const body = encodeURIComponent(
      [
        `Hello ${copy.productName} team,`,
        '',
        `I would like to start a project order.`,
        '',
        `Package: ${program?.title || ''}`,
        `Kickoff amount: ${formatPackagePrice(program?.amountInr)}`,
        `Contact name: ${name || '—'}`,
        `Email: ${email || '—'}`,
        `Company: ${company || '—'}`,
        notes ? `Notes: ${notes}` : null,
        '',
        'Please reply with the next checkout / kickoff steps.',
      ].filter(Boolean).join('\n'),
    );
    return `mailto:${copy.salesEmail}?subject=${subject}&body=${body}`;
  }, [copy.productName, copy.salesEmail, program, name, email, company, notes]);

  return (
    <div className="fd-page">
      <div className="fd-panel">
        <h2>{copy.enrollTitle}</h2>
        <p className="fd-lead">{copy.enrollSub}</p>
      </div>

      <h2 className="fd-section-title">Choose a package</h2>
      <div className="fd-grid">
        {COMPLIANCE_PROGRAMS.map((p) => {
          const selected = p.id === program?.id;
          return (
            <button
              key={p.id}
              type="button"
              className={`fd-card fd-select-card${selected ? ' selected' : ''}`}
              onClick={() => selectProgram(p.id)}
            >
              <span className={`fd-card-kind${p.kind === 'Payments' || p.kind === 'Support' ? ' travel' : ''}`}>
                {p.kind}
              </span>
              <h3>{p.title}</h3>
              <p className="fd-detail">{p.detail}</p>
              <p className="fd-price">{formatPackagePrice(p.amountInr)}</p>
            </button>
          );
        })}
      </div>

      <div className="fd-panel" style={{ marginTop: '1.25rem' }}>
        <h2 style={{ fontSize: '1.05rem' }}>Client contact</h2>
        <p className="fd-lead">
          Checkout wiring ships next. For now, send the order request to {copy.salesEmail}.
        </p>
        <form
          className="fd-enroll-form"
          onSubmit={(e) => {
            e.preventDefault();
            window.location.href = mailto;
          }}
        >
          <label>
            Contact name
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            Work email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Company
            <input value={company} onChange={(e) => setCompany(e.target.value)} />
          </label>
          <label>
            Scope notes (optional)
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <div className="fd-hero-cta">
            <button type="submit" className="oy-btn oy-btn-primary">
              Email order request ({formatPackagePrice(program?.amountInr)})
            </button>
            <Link className="oy-btn oy-btn-ghost" to="/desk">Back to solutions</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
