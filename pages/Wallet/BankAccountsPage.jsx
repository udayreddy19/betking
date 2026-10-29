import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../utils/apiClient';
import './WalletDashboard.css';

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
      <div className="wallet-dashboard-container">
        <div className="wallet-header">
          <div className="wallet-header__title-group">
            <h1>Bank accounts</h1>
            <p className="wallet-header__subtitle">Log in to manage payout bank accounts.</p>
          </div>
          <button type="button" className="wallet-btn wallet-btn--primary" onClick={openLoginModal}>
            Log in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="wallet-dashboard-container">
      <div className="wallet-header">
        <div className="wallet-header__title-group">
          <h1>Bank accounts</h1>
          <p className="wallet-header__subtitle">Saved payout accounts — account numbers are masked.</p>
        </div>
        <div className="wallet-header__actions">
          <Link className="wallet-btn wallet-btn--ghost" to="/wallet">Back to wallet</Link>
        </div>
      </div>

      {error && (
        <p style={{ color: '#b91c1c', marginBottom: 16, fontWeight: 600 }}>{error}</p>
      )}

      <div className="wallet-section" style={{ marginBottom: 20 }}>
        <div className="wallet-section__header">
          <h3>Saved accounts</h3>
        </div>
        {loading ? (
          <p className="wallet-header__subtitle">Loading…</p>
        ) : accounts.length === 0 ? (
          <div className="wallet-empty-state">
            <p>No bank accounts saved yet.</p>
          </div>
        ) : (
          <div className="wallet-tx-list">
            {accounts.map((a) => (
              <div key={a.id} className="wallet-tx-item" style={{ alignItems: 'center' }}>
                <div className="wallet-tx-item__info">
                  <strong>{a.accountHolderName}{a.isDefault ? ' · Default' : ''}</strong>
                  <span className="wallet-tx-item__meta">
                    {a.bankName || 'Bank'} · {a.maskedAccountNumber} · {a.ifsc}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {!a.isDefault && (
                    <button type="button" className="wallet-btn wallet-btn--ghost" onClick={() => setDefault(a.id)}>
                      Set default
                    </button>
                  )}
                  <button type="button" className="wallet-btn wallet-btn--secondary" onClick={() => remove(a.id)}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="wallet-section">
        <div className="wallet-section__header">
          <h3>Add bank account</h3>
        </div>
        <p className="wallet-header__subtitle" style={{ marginBottom: 16 }}>
          We store a masked account number and IFSC only — never full card data.
        </p>
        <form onSubmit={onSubmit} className="wallet-bank-form">
          <label className="wallet-bank-form__field">
            <span>Account holder name</span>
            <input required value={form.accountHolderName} onChange={(e) => setForm({ ...form, accountHolderName: e.target.value })} />
          </label>
          <label className="wallet-bank-form__field">
            <span>Bank name</span>
            <input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} />
          </label>
          <label className="wallet-bank-form__field">
            <span>Account number</span>
            <input required inputMode="numeric" autoComplete="off" value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} />
          </label>
          <label className="wallet-bank-form__field">
            <span>IFSC</span>
            <input required value={form.ifsc} onChange={(e) => setForm({ ...form, ifsc: e.target.value.toUpperCase() })} />
          </label>
          <label className="wallet-bank-form__field">
            <span>Account type</span>
            <select value={form.accountType} onChange={(e) => setForm({ ...form, accountType: e.target.value })}>
              <option value="SAVINGS">Savings</option>
              <option value="CURRENT">Current</option>
            </select>
          </label>
          <label className="wallet-bank-form__check">
            <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} />
            Set as default payout account
          </label>
          <button type="submit" className="wallet-btn wallet-btn--primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save bank account'}
          </button>
        </form>
      </div>
    </div>
  );
}
