import React, { useState, useEffect, useCallback } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import AdminDataTable from '../components/AdminDataTable';
import { useAdminToast } from '../components/AdminToastContext';
import { StatusBadge } from '../components/AdminBadge';
import AdminCard from '../components/AdminCard';

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
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>08 · Growth, Campaigns & VIP Loyalty Systems</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
          Promotions from PostgreSQL. Empty list means no campaigns configured yet.
        </p>
        {error && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.78rem' }}>{error}</p>}
      </div>

      <AdminDataTable
        title="Sportsbook Campaigns & Bonus Rules"
        emptyMessage="No promotions configured"
        data={promos}
        columns={[
          { header: 'Promo ID', key: 'id', render: (r) => <span className="admin-text-mono" style={{ fontSize: '0.76rem' }}>{r.id}</span> },
          { header: 'Campaign Name', key: 'name', render: (r) => <span style={{ fontWeight: 700 }}>{r.name}</span> },
          { header: 'Promo Code', key: 'code', render: (r) => <span className="admin-badge admin-badge--neutral">{r.code}</span> },
          { header: 'Type', key: 'type', render: (r) => r.type || '—' },
          { header: 'Bonus %', key: 'bonusPct', render: (r) => (r.bonusPct != null ? `${r.bonusPct}%` : '—') },
          { header: 'Max Bonus', key: 'maxBonus', render: (r) => money(r.maxBonus) },
          { header: 'Claims', key: 'claims' },
          {
            header: 'Status',
            key: 'status',
            render: (r) => <StatusBadge status={r.status} />,
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

  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>Signup Promo Codes</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
          Create a code, then enable it. Set how many times one account can claim it, and optionally a total cap across all users.
        </p>
        {error && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.78rem' }}>{error}</p>}
      </div>

      <AdminCard title="Create Promo Code" accent="#6366f1" style={{ marginBottom: '20px' }}>
        <form onSubmit={handleCreate}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
            <div className="admin-form-group">
              <label className="admin-form-label">Code</label>
              <input
                className="admin-input"
                style={{ textTransform: 'uppercase' }}
                value={form.code}
                onChange={(e) => updateField('code', e.target.value.toUpperCase())}
                placeholder="VIP1000"
                required
                minLength={3}
                maxLength={32}
              />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">Name</label>
              <input
                className="admin-input"
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder="Welcome offer"
              />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">Reward Type</label>
              <select
                className="admin-select"
                value={form.rewardType}
                onChange={(e) => updateField('rewardType', e.target.value)}
              >
                <option value="bonus">Bonus</option>
                <option value="freebet">Free bet</option>
                <option value="cash">Real money</option>
              </select>
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">Amount (₹)</label>
              <input
                className="admin-input"
                type="number"
                min="1"
                step="1"
                value={form.amount}
                onChange={(e) => updateField('amount', e.target.value)}
                placeholder="500"
                required
              />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">Max Total Claims</label>
              <input
                className="admin-input"
                type="number"
                min="1"
                step="1"
                value={form.maxRedemptions}
                onChange={(e) => updateField('maxRedemptions', e.target.value)}
                placeholder="Unlimited"
              />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">Max Per User</label>
              <input
                className="admin-input"
                type="number"
                min="1"
                step="1"
                value={form.maxPerUser}
                onChange={(e) => updateField('maxPerUser', e.target.value)}
                placeholder="1"
                required
              />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '16px', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', cursor: 'pointer', color: 'var(--admin-text)' }}>
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => updateField('isActive', e.target.checked)}
                style={{ accentColor: '#6366f1' }}
              />
              Start enabled (users can use it immediately)
            </label>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={loadCodes}
                className="admin-btn admin-btn--secondary"
              >
                ↻ Refresh
              </button>
              <button
                type="submit"
                disabled={saving}
                className="admin-btn admin-btn--primary"
              >
                {saving ? 'Saving…' : 'Add Code'}
              </button>
            </div>
          </div>
        </form>
      </AdminCard>

      <AdminDataTable
        title="Signup Codes"
        emptyMessage="No signup promo codes yet"
        data={codes}
        columns={[
          { header: 'Code', key: 'code', render: (r) => <span className="admin-text-mono" style={{ fontWeight: 800 }}>{r.code}</span> },
          { header: 'Name', key: 'name' },
          {
            header: 'Reward',
            key: 'rewardType',
            render: (r) => REWARD_LABELS[r.rewardType] || r.rewardType,
          },
          { header: 'Amount', key: 'amount', render: (r) => <span style={{ fontWeight: 700 }}>{money(r.amount)}</span> },
          {
            header: 'Claims',
            key: 'redemptionCount',
            render: (r) => `${r.redemptionCount || 0}${r.maxRedemptions != null ? ` / ${r.maxRedemptions}` : ''}`,
          },
          {
            header: 'Per User',
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
                className={`admin-btn admin-btn--sm ${r.isActive ? 'admin-btn--success' : 'admin-btn--secondary'}`}
              >
                {r.isActive ? '● ENABLED' : '○ DISABLED'}
              </button>
            ),
          },
        ]}
      />
    </div>
  );
}

function VipTiersPanel() {
  const [tiers, setTiers] = useState([]);
  const [limits, setLimits] = useState({ minDeposit: null, minWithdraw: null });
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    adminApiClient.get('/growth/vip-tiers')
      .then((data) => {
        if (cancelled) return;
        setTiers(data.tiers || []);
        setLimits({ minDeposit: data.minDeposit, minWithdraw: data.minWithdraw });
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setTiers([]);
        setError(err.message || 'Failed to load VIP tier catalog');
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>08 · VIP Loyalty Tiers</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
          Authoritative VIP benefits catalog (min deposit ₹{limits.minDeposit?.toLocaleString() ?? '1,000'} · min withdraw ₹{limits.minWithdraw?.toLocaleString() ?? '1,000'}).
        </p>
        {error && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.78rem' }}>{error}</p>}
      </div>

      <AdminDataTable
        title="VIP Tier Benefits Matrix"
        emptyMessage="No VIP tiers configured"
        data={tiers}
        columns={[
          { header: 'Tier', key: 'tier', render: (r) => <span className="admin-text-mono" style={{ fontWeight: 800 }}>{r.tier}</span> },
          { header: 'Label', key: 'label', render: (r) => <span style={{ fontWeight: 700 }}>{r.label}</span> },
          { header: 'Points Required', key: 'pointsRequired', render: (r) => (r.pointsRequired != null ? r.pointsRequired.toLocaleString() : '—') },
          { header: 'Pts / ₹100', key: 'pointsPer100' },
          { header: 'Cashback %', key: 'cashbackPct', render: (r) => (r.cashbackPct ? `${r.cashbackPct}%` : '—') },
          { header: 'Cashout %', key: 'cashoutPayoutPct' },
          { header: 'Odds Boost %', key: 'oddsBoostPct', render: (r) => (r.oddsBoostPct ? `${r.oddsBoostPct}%` : '—') },
          { header: 'Spin Mult.', key: 'spinMultiplier' },
          { header: 'Max Withdraw', key: 'maxWithdraw', render: (r) => money(r.maxWithdraw) },
          { header: 'Support SLA', key: 'supportSlaMinutes', render: (r) => `${r.supportSlaMinutes}m` },
          { header: 'Withdraw Review', key: 'withdrawReviewHours', render: (r) => `${r.withdrawReviewHours}h` },
          { header: 'Priority WD', key: 'priorityWithdraw' },
          { header: 'Priority Support', key: 'prioritySupport' },
          { header: 'Dedicated Mgr', key: 'dedicatedManager' },
        ]}
      />
    </div>
  );
}

export default function GrowthDomainView({ subModule = 'promotions' }) {
  if (subModule === 'bonus-codes') {
    return <SignupPromoCodesPanel />;
  }
  if (subModule === 'vip-tiers') {
    return <VipTiersPanel />;
  }
  return <PromotionsPanel />;
}
