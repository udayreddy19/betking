import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  if (subModule === 'referrals') {
    return <ReferralsAdminPanel />;
  }
  if (subModule === 'crm-segments') {
    return <CrmSegmentsPanel />;
  }
  return <PromotionsPanel />;
}

const BUILTIN_SEGMENTS = [
  'NEW', 'ACTIVE', 'INACTIVE', 'HIGH_VALUE', 'VIP', 'REFERRAL', 'PROMO_USERS', 'HIGH_RISK', 'RECENT_DEPOSIT', 'RECENT_WITHDRAWAL',
];

function CrmSegmentsPanel() {
  const [segments, setSegments] = useState([]);
  const [error, setError] = useState(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const { showToast } = useAdminToast();

  const load = useCallback(() => {
    adminApiClient.get('/growth/segments')
      .then((data) => {
        setSegments(data.segments || []);
        setError(null);
      })
      .catch((err) => {
        setSegments([]);
        setError(err.message || 'Data unavailable');
      });
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await adminApiClient.post('/growth/segments', {
        name: name.trim().toUpperCase().replace(/\s+/g, '_'),
        description: description.trim() || null,
        rules: { conditions: [{ type: 'MANUAL' }] },
      });
      showToast(`Segment ${name.trim()} saved`, 'success');
      setName('');
      setDescription('');
      load();
    } catch (err) {
      showToast(err.message || 'Create failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const seedBuiltin = async (segName) => {
    try {
      await adminApiClient.post('/growth/segments', {
        name: segName,
        description: `Built-in segment ${segName}`,
        rules: { conditions: [{ type: 'BUILTIN', key: segName }] },
      });
      showToast(`${segName} created`, 'success');
      load();
    } catch (err) {
      showToast(err.message || 'Seed failed', 'error');
    }
  };

  const known = new Set(segments.map((s) => String(s.name || '').toUpperCase()));

  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>08 · CRM Segments</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
          Customer segments from the existing CRM engine. Counts are live membership totals — not synthetic.
        </p>
        {error && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.78rem' }}>{error}</p>}
      </div>

      <AdminCard title="Create segment" accent="#6366f1" style={{ marginBottom: 16 }}>
        <form onSubmit={create} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <div className="admin-form-group">
            <label className="admin-form-label">Name</label>
            <input className="admin-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="HIGH_VALUE" required />
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label">Description</label>
            <input className="admin-input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button type="submit" className="admin-btn admin-btn--primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save segment'}
            </button>
          </div>
        </form>
        <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {BUILTIN_SEGMENTS.filter((s) => !known.has(s)).map((s) => (
            <button key={s} type="button" className="admin-btn admin-btn--secondary admin-btn--sm" onClick={() => seedBuiltin(s)}>
              + {s}
            </button>
          ))}
        </div>
      </AdminCard>

      <AdminDataTable
        title="Segments"
        emptyMessage="No segments yet — Data unavailable or none created"
        data={segments}
        onRefresh={load}
        columns={[
          { header: 'ID', key: 'id', render: (r) => <span className="admin-text-mono" style={{ fontSize: '0.76rem' }}>{r.id}</span> },
          { header: 'Name', key: 'name', render: (r) => <span style={{ fontWeight: 700 }}>{r.name}</span> },
          { header: 'Description', key: 'description', render: (r) => r.description || '—' },
          { header: 'Members', key: 'member_count', render: (r) => (r.member_count != null ? Number(r.member_count).toLocaleString() : '0') },
          { header: 'Auto-eval', key: 'auto_evaluate', render: (r) => (r.auto_evaluate ? 'Yes' : 'No') },
          { header: 'Updated', key: 'updated_at', render: (r) => (r.updated_at ? new Date(r.updated_at).toLocaleString('en-IN') : '—') },
        ]}
      />
    </div>
  );
}

function ReferralsAdminPanel() {
  const [rows, setRows] = useState([]);
  const [metrics, setMetrics] = useState({});
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const { showToast } = useAdminToast();

  const load = useCallback(() => {
    const params = new URLSearchParams();
    params.set('limit', '200');
    if (status) params.set('status', status);
    if (q.trim()) params.set('q', q.trim());
    return adminApiClient.get(`/growth/referrals?${params}`)
      .then((data) => {
        setRows(data.referrals || []);
        setMetrics(data.metrics || data.stats || {});
        setError(data.error || null);
      })
      .catch((err) => {
        setRows([]);
        setError(err.message || 'Failed to load referrals');
      });
  }, [status, q]);

  useEffect(() => { load(); }, [load]);

  const retry = (id) => {
    adminApiClient.post(`/growth/referrals/${encodeURIComponent(id)}/retry-reward`, { reason: 'Admin retry' })
      .then((res) => {
        showToast(res.success ? 'Reward retry completed' : (res.reason || 'Not rewarded'), res.success ? 'success' : 'warning');
        load();
      })
      .catch((err) => showToast(err.message || 'Retry failed', 'error'));
  };

  const rowCounts = useMemo(() => {
    const total = rows.length;
    let qualified = 0;
    let pending = 0;
    let rewarded = 0;
    rows.forEach((r) => {
      const s = String(r.status || '').toUpperCase();
      if (s === 'QUALIFIED' || s === 'COMPLETED') qualified += 1;
      else if (s === 'REGISTERED' || s === 'PENDING' || s === 'FRAUD_REVIEW') pending += 1;
      if (s === 'REWARDED') {
        rewarded += 1;
        qualified += 1;
      }
    });
    return { total, qualified, pending, rewarded };
  }, [rows]);

  const kpiTotal = metrics.total ?? metrics.total_count ?? rowCounts.total;
  const kpiPending = metrics.pending ?? metrics.pending_count ?? rowCounts.pending;
  const kpiQualified = metrics.qualified ?? metrics.qualified_count ?? rowCounts.qualified;
  const kpiRewarded = metrics.rewarded ?? metrics.rewarded_count ?? rowCounts.rewarded;
  const kpiRewardValue = metrics.reward_value ?? metrics.rewardValue;

  return (
    <div>
      <h2 style={{ margin: '0 0 8px', fontSize: '1.25rem', fontWeight: 800, color: 'var(--admin-text)' }}>Referral Program</h2>
      <p style={{ margin: '0 0 16px', color: 'var(--admin-text-muted)', fontSize: '0.85rem' }}>
        User-to-user referrals. Free bet rewards grant after qualification (first deposit). Signup promos cannot combine with referral.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
        {[
          ['Total', kpiTotal],
          ['Pending', kpiPending],
          ['Qualified', kpiQualified],
          ['Rewarded', kpiRewarded],
          ['Reward value', money(kpiRewardValue)],
        ].map(([label, val]) => (
          <div key={label} style={{ padding: 12, borderRadius: 10, border: '1px solid var(--admin-border)', background: 'var(--admin-surface)' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--admin-text-muted)', fontWeight: 700 }}>{label}</div>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--admin-text)' }}>{val ?? '—'}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6 }}>
          <option value="">All statuses</option>
          {['REGISTERED', 'FRAUD_REVIEW', 'QUALIFIED', 'REWARDED', 'REJECTED'].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search code, user, email…"
          style={{ padding: '6px 10px', borderRadius: 6, minWidth: 220 }}
        />
        <button type="button" onClick={() => load()}>Refresh</button>
      </div>
      {error && <p style={{ color: '#b91c1c' }}>{error}</p>}
      <AdminDataTable
        title="Referrals"
        emptyMessage="No referrals yet"
        data={rows.map((r) => ({
          id: r.id,
          referrer: r.referrer_name || r.referrer_user_id,
          referred: r.referred_name || r.referred_user_id,
          code: r.referral_code,
          status: r.status,
          kyc: r.referred_kyc,
          referrerReward: money(r.referrer_reward_amount),
          referredReward: money(r.referred_reward_amount),
          created: r.created_at ? String(r.created_at).slice(0, 19) : '—',
          rewarded: r.rewarded_at ? String(r.rewarded_at).slice(0, 19) : '—',
          _raw: r,
        }))}
        columns={[
          { header: 'ID', key: 'id' },
          { header: 'Referrer', key: 'referrer' },
          { header: 'Referred', key: 'referred' },
          { header: 'Code', key: 'code' },
          { header: 'Status', key: 'status' },
          { header: 'KYC', key: 'kyc' },
          { header: 'Referrer ₹', key: 'referrerReward' },
          { header: 'Referred ₹', key: 'referredReward' },
          { header: 'Created', key: 'created' },
          {
            header: 'Actions',
            key: 'actions',
            sortable: false,
            render: (row) => (
              <button type="button" onClick={() => retry(row.id)} style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                Retry reward
              </button>
            ),
          },
        ]}
      />
    </div>
  );
}
