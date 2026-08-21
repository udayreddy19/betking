import { useEffect, useState } from 'react';
import { apiFetch } from '../../utils/apiClient';
import { useAuth } from '../../context/AuthContext';

function statusLabel(status) {
  if (status === 'VERIFIED') return 'Verified';
  if (status === 'UNDER_REVIEW' || status === 'PENDING') return 'Under review';
  if (status === 'REJECTED') return 'Rejected — submit again';
  return 'Not started';
}

export default function ProfileKycCard() {
  const { showToast } = useAuth();
  const [kyc, setKyc] = useState(null);
  const [pan, setPan] = useState('');
  const [aadhaar, setAadhaar] = useState('');
  const [dob, setDob] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(null);

  const load = async () => {
    const res = await apiFetch('/api/v1/user/kyc');
    const data = await res.json().catch(() => ({}));
    if (res.ok) setKyc(data);
  };

  useEffect(() => {
    load();
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
      showToast('Date of birth saved.', 'success');
      await load();
    } finally {
      setSaving(null);
    }
  };

  const panLocked = Boolean(kyc?.panMasked) && kyc?.status === 'VERIFIED';
  const aadhaarLocked = Boolean(kyc?.aadhaarMasked) && kyc?.status === 'VERIFIED';

  return (
    <div className="profile-loyalty-box" id="kyc">
      <div className="profile-loyalty-head">
        <span>Identity (KYC)</span>
        <strong className={`profile-kyc-pill profile-kyc-pill--${(kyc?.status || 'NOT_STARTED').toLowerCase()}`}>
          {statusLabel(kyc?.status)}
        </strong>
      </div>
      <p className="profile-loyalty-meta">
        Each Aadhaar, PAN, email, and mobile number can be used on one account only.
        Withdrawals require verified KYC and a date of birth proving you are 18 or older. You can deposit and place bets without KYC.
      </p>

      <form
        className="profile-promo-row profile-kyc-row"
        onSubmit={(e) => {
          e.preventDefault();
          submitDob();
        }}
      >
        <input
          type="date"
          value={dob}
          onChange={(e) => setDob(e.target.value)}
          max={new Date().toISOString().slice(0, 10)}
          disabled={Boolean(kyc?.hasDateOfBirth && kyc?.ageEligible) || saving === 'DOB'}
        />
        <button
          type="submit"
          className="profile-link-btn"
          disabled={Boolean(kyc?.hasDateOfBirth && kyc?.ageEligible) || saving === 'DOB' || !dob}
        >
          {kyc?.hasDateOfBirth ? (kyc.ageEligible ? 'Age saved' : 'Update DOB') : saving === 'DOB' ? 'Saving…' : 'Save date of birth'}
        </button>
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
  );
}
