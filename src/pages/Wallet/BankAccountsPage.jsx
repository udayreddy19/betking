import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../utils/apiClient';
import './WalletPlatform.css';

export default function BankAccountsPage() {
  const { isLoggedIn, openLoginModal } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    accountHolderName: '',
    bankName: '',
    accountNumber: '',
    ifsc: '',
    accountType: 'SAVINGS',
    isDefault: false,
  });

  const load = useCallback(() => {
    if (!isLoggedIn) return;
    setLoading(true);
    apiFetch('/api/v1/bank-accounts')
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setAccounts(data.accounts || []);
        else setError(data.error || 'Unable to load bank accounts');
      })
      .catch((err) => setError(err.message || 'Unable to load bank accounts'))
      .finally(() => setLoading(false));
  }, [isLoggedIn]);

  useEffect(() => { load(); }, [load]);

  const onSubmit = (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    apiFetch('/api/v1/bank-accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
      .then((r) => r.json())
      .then((data) => {
        if (!data.success) throw new Error(data.error || 'Failed to save');
        setForm({
          accountHolderName: '',
          bankName: '',
          accountNumber: '',
          ifsc: '',
          accountType: 'SAVINGS',
          isDefault: false,
        });
        load();
      })
      .catch((err) => setError(err.message))
      .finally(() => setSaving(false));
  };

  const setDefault = (id) => {
    apiFetch(`/api/v1/bank-accounts/${id}/default`, { method: 'POST' })
      .then((r) => r.json())
      .then((data) => {
        if (!data.success) throw new Error(data.error || 'Failed');
        load();
      })
      .catch((err) => setError(err.message));
  };

  const remove = (id) => {
    if (!window.confirm('Remove this bank account?')) return;
    apiFetch(`/api/v1/bank-accounts/${id}`, { method: 'DELETE' })
      .then((r) => r.json())
      .then((data) => {
        if (!data.success) throw new Error(data.error || 'Failed');
        load();
      })
      .catch((err) => setError(err.message));
  };

  if (!isLoggedIn) {
    return (
      <div className="wp-page">
        <div className="wp-hero-card">
          <h1>Bank accounts</h1>
          <p>Log in to manage payout bank accounts.</p>
          <button type="button" className="wp-btn wp-btn--primary" onClick={openLoginModal}>Log in</button>
        </div>
      </div>
    );
  }

  return (
    <div className="wp-page">
      <header className="wp-page-header">
        <div>
          <h1>Bank accounts</h1>
          <p>Saved payout accounts — account numbers are masked.</p>
        </div>
        <Link className="wp-btn wp-btn--outline" to="/wallet">Back to wallet</Link>
      </header>

      {error && <p style={{ color: '#b91c1c', marginBottom: 12 }}>{error}</p>}

      <div className="wp-panel" style={{ marginBottom: 16 }}>
        <h3>Saved accounts</h3>
        {loading ? (
          <p className="lead">Loading…</p>
        ) : accounts.length === 0 ? (
          <p className="lead">No bank accounts saved yet.</p>
        ) : (
          <div className="wp-bank-list">
            {accounts.map((a) => (
              <div key={a.id} className="wp-bank-item">
                <div className="wp-bank-item__meta">
                  <strong>{a.accountHolderName}{a.isDefault ? ' · Default' : ''}</strong>
                  <span>{a.bankName || 'Bank'} · {a.maskedAccountNumber} · {a.ifsc}</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {!a.isDefault && (
                    <button type="button" className="wp-btn wp-btn--outline" onClick={() => setDefault(a.id)}>Set default</button>
                  )}
                  <button type="button" className="wp-btn wp-btn--danger" onClick={() => remove(a.id)}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="wp-panel">
        <h3>Add bank account</h3>
        <p className="lead">We store a masked account number and IFSC only — never full card data.</p>
        <form onSubmit={onSubmit}>
          <div className="wp-form-row">
            <label htmlFor="ba-name">Account holder name</label>
            <input id="ba-name" required value={form.accountHolderName} onChange={(e) => setForm({ ...form, accountHolderName: e.target.value })} />
          </div>
          <div className="wp-form-row">
            <label htmlFor="ba-bank">Bank name</label>
            <input id="ba-bank" value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} />
          </div>
          <div className="wp-form-row">
            <label htmlFor="ba-acct">Account number</label>
            <input id="ba-acct" required inputMode="numeric" autoComplete="off" value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} />
          </div>
          <div className="wp-form-row">
            <label htmlFor="ba-ifsc">IFSC</label>
            <input id="ba-ifsc" required value={form.ifsc} onChange={(e) => setForm({ ...form, ifsc: e.target.value.toUpperCase() })} />
          </div>
          <div className="wp-form-row">
            <label htmlFor="ba-type">Account type</label>
            <select id="ba-type" value={form.accountType} onChange={(e) => setForm({ ...form, accountType: e.target.value })}>
              <option value="SAVINGS">Savings</option>
              <option value="CURRENT">Current</option>
            </select>
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, fontSize: '0.9rem' }}>
            <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} />
            Set as default payout account
          </label>
          <button type="submit" className="wp-btn wp-btn--primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save bank account'}
          </button>
        </form>
      </div>
    </div>
  );
}
