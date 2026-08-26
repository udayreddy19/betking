import { useCallback, useEffect, useState } from 'react';
import { FiChevronDown } from '../../icons';
import { apiFetch } from '../../utils/apiClient';
import { useAuth } from '../../context/AuthContext';

function statusLabel(status) {
  if (status === 'VERIFIED') return 'Verified';
  if (status === 'UNDER_REVIEW' || status === 'PENDING') return 'Under review';
  if (status === 'REJECTED') return 'Rejected — submit again';
  return 'Not started';
}

function formatDob(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function kycSummary(kyc) {
  if (!kyc) return 'Loading…';
  const parts = [];
  if (kyc.hasDateOfBirth && kyc.ageEligible) parts.push('Age verified');
  else if (kyc.hasDateOfBirth) parts.push('DOB on file');
  if (kyc.panMasked) parts.push('PAN linked');
  if (kyc.aadhaarMasked) parts.push('Aadhaar linked');
  if (!parts.length) return 'Complete verification to withdraw';
  return parts.join(' · ');
}

export default function ProfileKycCard() {
  const { showToast } = useAuth();
  const [kyc, setKyc] = useState(null);
  const [pan, setPan] = useState('');
  const [aadhaar, setAadhaar] = useState('');
  const [dob, setDob] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(null);
  const [expanded, setExpanded] = useState(() => window.location.hash === '#kyc');

  const load = useCallback(async () => {
    const res = await apiFetch('/api/v1/user/kyc');
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setKyc(data);
      if (data.dateOfBirth) setDob(String(data.dateOfBirth).slice(0, 10));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (window.location.hash === '#kyc') setExpanded(true);
  }, []);

  const submit = async (documentType, documentNumber) => {
    setError('');
    setSaving(documentType);
    try {
      const res = await apiFetch('/api/v1/user/kyc', {
        method: 'POST',
        body: JSON.stringify({ documentType, documentNumber }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Could not save this document.');
        showToast(data.error || 'Could not save this document.', 'error');
        return;
      }
      if (documentType === 'PAN') setPan('');
      else setAadhaar('');
      showToast(`${documentType === 'PAN' ? 'PAN' : 'Aadhaar'} submitted.`, 'success');
      await load();
    } finally {
      setSaving(null);
    }
  };

  const submitDob = async () => {
    setError('');
    setSaving('DOB');
    try {
      const res = await apiFetch('/api/v1/user/kyc', {
        method: 'POST',
        body: JSON.stringify({ dateOfBirth: dob }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Could not save date of birth.');
        showToast(data.error || 'Could not save date of birth.', 'error');
        return;
      }
      if (data.dateOfBirth) setDob(String(data.dateOfBirth).slice(0, 10));
      showToast('Date of birth saved.', 'success');
      await load();
    } finally {
      setSaving(null);
    }
  };

  const panLocked = Boolean(kyc?.panMasked) && kyc?.status === 'VERIFIED';
  const aadhaarLocked = Boolean(kyc?.aadhaarMasked) && kyc?.status === 'VERIFIED';
  const dobSaved = Boolean(kyc?.hasDateOfBirth && kyc?.ageEligible);

  return (
    <div className={`profile-kyc-card profile-loyalty-box ${expanded ? 'is-expanded' : 'is-collapsed'}`} id="kyc">
      <button
        type="button"
        className="profile-kyc-toggle"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        aria-controls="kyc-panel"
      >
        <div className="profile-kyc-toggle__main">
          <span className="profile-kyc-toggle__title">Identity (KYC)</span>
          <p className="profile-kyc-toggle__summary">{kycSummary(kyc)}</p>
        </div>
        <div className="profile-kyc-toggle__meta">
          <strong className={`profile-kyc-pill profile-kyc-pill--${(kyc?.status || 'NOT_STARTED').toLowerCase()}`}>
            {statusLabel(kyc?.status)}
          </strong>
          <FiChevronDown className="profile-kyc-chevron" aria-hidden="true" />
        </div>
      </button>

      {expanded && (
        <div className="profile-kyc-panel" id="kyc-panel">
          <p className="profile-loyalty-meta">
            Each Aadhaar, PAN, email, and mobile number can be used on one account only.
            Withdrawals require verified KYC and a date of birth proving you are 18 or older. You can deposit and place bets without KYC.
          </p>

          <ol className="profile-kyc-progress" aria-label="KYC progress">
            {[
              { id: 'dob', label: 'Date of birth', done: dobSaved },
              { id: 'pan', label: 'PAN', done: Boolean(kyc?.panMasked) },
              { id: 'aadhaar', label: 'Aadhaar', done: Boolean(kyc?.aadhaarMasked) },
              { id: 'review', label: 'Verification', done: kyc?.status === 'VERIFIED' },
            ].map((step) => (
              <li
                key={step.id}
                className={`profile-kyc-progress__step${step.done ? ' is-done' : ''}`}
              >
                <span className="profile-kyc-progress__mark" aria-hidden="true">{step.done ? '✓' : '·'}</span>
                <span>{step.label}</span>
                <span className="profile-kyc-progress__state">{step.done ? 'Complete' : 'Needed'}</span>
              </li>
            ))}
          </ol>

          {kyc?.status === 'REJECTED' && kyc?.rejectionReason && (
            <div className="profile-kyc-error" role="alert">
              Rejected: {kyc.rejectionReason}. You can resubmit corrected documents below.
            </div>
          )}

          {kyc?.status !== 'VERIFIED' && (
            <p className="profile-loyalty-meta" role="note">
              Withdrawals stay locked until KYC is verified. Deposits and betting remain available.
            </p>
          )}

          <form
            className="profile-promo-row profile-kyc-row"
            onSubmit={(e) => {
              e.preventDefault();
              if (!dobSaved) submitDob();
            }}
          >
            {dobSaved ? (
              <div className="profile-kyc-saved-field profile-kyc-saved-field--full">
                <span className="profile-kyc-saved-field__label">Date of birth</span>
                <strong>{formatDob(kyc?.dateOfBirth || dob)}</strong>
                <span className="profile-kyc-saved-field__badge">Age verified</span>
              </div>
            ) : (
              <>
                <input
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  max={new Date().toISOString().slice(0, 10)}
                  disabled={saving === 'DOB'}
                  aria-label="Date of birth"
                />
                <button
                  type="submit"
                  className="profile-link-btn"
                  disabled={saving === 'DOB' || !dob}
                >
                  {saving === 'DOB' ? 'Saving…' : 'Save date of birth'}
                </button>
              </>
            )}
          </form>

          {error && <div className="profile-kyc-error" role="alert">{error}</div>}

          <form
            className="profile-promo-row profile-kyc-row"
            onSubmit={(e) => {
              e.preventDefault();
              submit('PAN', pan.trim().toUpperCase());
            }}
          >
            <input
              type="text"
              value={panLocked ? (kyc?.panMasked || '') : pan}
              onChange={(e) => setPan(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))}
              placeholder={kyc?.panMasked ? `Saved ${kyc.panMasked}` : 'PAN (ABCDE1234F)'}
              maxLength={10}
              autoComplete="off"
              disabled={panLocked || saving === 'PAN'}
            />
            <button type="submit" className="profile-link-btn" disabled={panLocked || saving === 'PAN' || pan.length !== 10}>
              {panLocked ? 'Linked' : saving === 'PAN' ? 'Saving…' : 'Add PAN'}
            </button>
          </form>

          <form
            className="profile-promo-row profile-kyc-row"
            onSubmit={(e) => {
              e.preventDefault();
              submit('AADHAAR', aadhaar.replace(/\D/g, ''));
            }}
          >
            <input
              type="text"
              inputMode="numeric"
              value={aadhaarLocked ? (kyc?.aadhaarMasked || '') : aadhaar}
              onChange={(e) => setAadhaar(e.target.value.replace(/\D/g, '').slice(0, 12))}
              placeholder={kyc?.aadhaarMasked ? `Saved ${kyc.aadhaarMasked}` : 'Aadhaar (12 digits)'}
              maxLength={12}
              autoComplete="off"
              disabled={aadhaarLocked || saving === 'AADHAAR'}
            />
            <button type="submit" className="profile-link-btn" disabled={aadhaarLocked || saving === 'AADHAAR' || aadhaar.length !== 12}>
              {aadhaarLocked ? 'Linked' : saving === 'AADHAAR' ? 'Saving…' : 'Add Aadhaar'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
