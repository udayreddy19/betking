import React, { useState, useEffect, useCallback } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import AdminDataTable from '../components/AdminDataTable';
import { useAdminToast } from '../components/AdminToastContext';

function money(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `₹${Number(n).toLocaleString()}`;
}

const REWARD_LABELS = {
  bonus: 'Bonus',
  freebet: 'Free bet',
  cash: 'Real money',
};

const emptyForm = {
  code: '',
  name: '',
  rewardType: 'bonus',
  amount: '',
  maxRedemptions: '',
  maxPerUser: '1',
  isActive: false,
};

function PromotionsPanel() {
  const [promos, setPromos] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    adminApiClient.get('/growth/promotions')
      .then((data) => {
        if (cancelled) return;
        setPromos(data.promotions || []);
        setError(data.note || null);
      })
      .catch((err) => {
        if (cancelled) return;
        setPromos([]);
        setError(err.message || 'Failed to load promotions');
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>08 · Growth, Campaigns & VIP Loyalty Systems</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
          Promotions from PostgreSQL. Empty list means no campaigns configured yet.
        </p>
        {error && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.82rem' }}>{error}</p>}
      </div>

      <AdminDataTable
        title="Sportsbook Campaigns & Bonus Rules"
        emptyMessage="No promotions configured"
        data={promos}
        columns={[
          { header: 'Promo ID', key: 'id' },
          { header: 'Campaign Name', key: 'name' },
          { header: 'Promo Code', key: 'code' },
          { header: 'Type', key: 'type', render: (r) => r.type || '—' },
          { header: 'Bonus %', key: 'bonusPct', render: (r) => (r.bonusPct != null ? `${r.bonusPct}%` : '—') },
          { header: 'Max Bonus', key: 'maxBonus', render: (r) => money(r.maxBonus) },
          { header: 'Claims', key: 'claims' },
          {
            header: 'Status',
            key: 'status',
            render: (r) => (
              <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700, background: 'rgba(16, 185, 129, 0.2)', color: '#10b981' }}>
                {r.status}
              </span>
            ),
          },
        ]}
      />
    </div>
  );
}

function SignupPromoCodesPanel() {
  const { showToast } = useAdminToast();
  const [codes, setCodes] = useState([]);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const loadCodes = useCallback(() => {
    return adminApiClient.get('/growth/signup-codes')
      .then((data) => {
        setCodes(data.codes || []);
        setError(null);
      })
      .catch((err) => {
        setCodes([]);
        setError(err.message || 'Failed to load signup promo codes');
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    adminApiClient.get('/growth/signup-codes')
      .then((data) => {
        if (cancelled) return;
        setCodes(data.codes || []);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setCodes([]);
        setError(err.message || 'Failed to load signup promo codes');
      });
    return () => { cancelled = true; };
  }, []);

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleCreate = (e) => {
    e.preventDefault();
    setSaving(true);
    adminApiClient.post('/growth/signup-codes', {
      code: form.code,
      name: form.name,
      rewardType: form.rewardType,
      amount: form.amount,
      maxRedemptions: form.maxRedemptions === '' ? null : form.maxRedemptions,
      maxPerUser: form.maxPerUser === '' ? 1 : form.maxPerUser,
      isActive: form.isActive,
    })
      .then((data) => {
        setCodes((prev) => [data.code, ...prev]);
        setForm(emptyForm);
        showToast(`Created ${data.code?.code || 'promo code'}`, 'success');
      })
      .catch((err) => {
        showToast(err.message || 'Could not create promo code', 'error');
      })
      .finally(() => setSaving(false));
  };

  const toggleCode = (row) => {
    const nextActive = !row.isActive;
    setCodes((prev) => prev.map((c) => (c.id === row.id ? { ...c, isActive: nextActive } : c)));
    adminApiClient.patch(`/growth/signup-codes/${encodeURIComponent(row.id)}/toggle`, { isActive: nextActive })
      .then((data) => {
        if (data?.code) {
          setCodes((prev) => prev.map((c) => (c.id === data.code.id ? data.code : c)));
        }
        showToast(`${row.code} → ${nextActive ? 'ENABLED' : 'DISABLED'}`, 'success');
      })
      .catch((err) => {
        setCodes((prev) => prev.map((c) => (c.id === row.id ? { ...c, isActive: row.isActive } : c)));
        showToast(err.message || 'Toggle failed', 'error');
      });
  };

  const fieldStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    minWidth: 0,
  };
  const inputStyle = {
    padding: '8px 10px',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-panel)',
    color: 'var(--color-text)',
    fontSize: '0.85rem',
  };
  const labelStyle = {
    fontSize: '0.75rem',
    fontWeight: 700,
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  };

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>Signup Promo Codes</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
          Create a code, then enable it. Set how many times one account can claim it, and optionally a total cap across all users.
        </p>
        {error && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.82rem' }}>{error}</p>}
      </div>

      <form
        onSubmit={handleCreate}
        style={{
          marginBottom: '24px',
          padding: '20px',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: '12px',
        }}
      >
        <h3 style={{ margin: '0 0 16px', fontSize: '1.05rem' }}>Create promo code</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
          <label style={fieldStyle}>
            <span style={labelStyle}>Code</span>
            <input
              style={{ ...inputStyle, textTransform: 'uppercase' }}
              value={form.code}
              onChange={(e) => updateField('code', e.target.value.toUpperCase())}
              placeholder="WELCOME100"
              required
              minLength={3}
              maxLength={32}
            />
          </label>
          <label style={fieldStyle}>
            <span style={labelStyle}>Name</span>
            <input
              style={inputStyle}
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              placeholder="Welcome offer"
            />
          </label>
          <label style={fieldStyle}>
            <span style={labelStyle}>Reward type</span>
            <select
              style={inputStyle}
              value={form.rewardType}
              onChange={(e) => updateField('rewardType', e.target.value)}
            >
              <option value="bonus">Bonus</option>
              <option value="freebet">Free bet</option>
              <option value="cash">Real money</option>
            </select>
          </label>
          <label style={fieldStyle}>
            <span style={labelStyle}>Amount (₹)</span>
            <input
              style={inputStyle}
              type="number"
              min="1"
              step="1"
              value={form.amount}
              onChange={(e) => updateField('amount', e.target.value)}
              placeholder="500"
              required
            />
          </label>
          <label style={fieldStyle}>
            <span style={labelStyle}>Max total claims</span>
            <input
              style={inputStyle}
              type="number"
              min="1"
              step="1"
              value={form.maxRedemptions}
              onChange={(e) => updateField('maxRedemptions', e.target.value)}
              placeholder="Unlimited"
            />
          </label>
          <label style={fieldStyle}>
            <span style={labelStyle}>Max per user</span>
            <input
              style={inputStyle}
              type="number"
              min="1"
              step="1"
              value={form.maxPerUser}
              onChange={(e) => updateField('maxPerUser', e.target.value)}
              placeholder="1"
              required
            />
          </label>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '16px', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => updateField('isActive', e.target.checked)}
            />
            Start enabled (users can use it immediately)
          </label>
          <button
            type="submit"
            disabled={saving}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: '#d4a853',
              color: '#111',
              fontWeight: 800,
              cursor: saving ? 'wait' : 'pointer',
              fontSize: '0.85rem',
            }}
          >
            {saving ? 'Saving…' : 'Add code'}
          </button>
          <button
            type="button"
            onClick={loadCodes}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: '1px solid var(--color-border)',
              background: 'transparent',
              color: 'var(--color-text)',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            Refresh
          </button>
        </div>
      </form>

      <AdminDataTable
        title="Signup codes"
        emptyMessage="No signup promo codes yet"
        data={codes}
        columns={[
          { header: 'Code', key: 'code' },
          { header: 'Name', key: 'name' },
          {
            header: 'Reward',
            key: 'rewardType',
            render: (r) => REWARD_LABELS[r.rewardType] || r.rewardType,
          },
          { header: 'Amount', key: 'amount', render: (r) => money(r.amount) },
          {
            header: 'Claims',
            key: 'redemptionCount',
            render: (r) => `${r.redemptionCount || 0}${r.maxRedemptions != null ? ` / ${r.maxRedemptions}` : ''}`,
          },
          {
            header: 'Per user',
            key: 'maxPerUser',
            render: (r) => (r.maxPerUser != null ? `${r.maxPerUser}×` : 'Unlimited'),
          },
          {
            header: 'Status',
            key: 'isActive',
            render: (r) => (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleCode(r);
                }}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  border: 'none',
                  background: r.isActive ? '#10b981' : '#6b7280',
                  color: '#fff',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                }}
              >
                {r.isActive ? 'ENABLED' : 'DISABLED'}
              </button>
            ),
          },
        ]}
      />
    </div>
  );
}

export default function GrowthDomainView({ subModule = 'promotions' }) {
  if (subModule === 'bonus-codes') {
    return <SignupPromoCodesPanel />;
  }
  return <PromotionsPanel />;
}
