import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import AdminDataTable from '../components/AdminDataTable';
import { useAdminToast } from '../components/AdminToastContext';
import { StatusBadge } from '../components/AdminBadge';
import AdminCard from '../components/AdminCard';
import AdminTabs from '../components/AdminTabs';
import AdminKPI from '../components/AdminKPI';
import { AdminKpiDrillDrawer, useAdminKpiDrilldown } from '../hooks/useAdminKpiDrilldown';

function money(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `₹${Number(n).toLocaleString()}`;
}

function makeTargetedPromoCode() {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `TDFB${rand}`;
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
  inviteOnly: true,
};

function TargetedDepositFreeBetPanel() {
  const { showToast } = useAdminToast();
  const [campaigns, setCampaigns] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState(null);
  const [searchQ, setSearchQ] = useState('');
  const [searchHits, setSearchHits] = useState([]);
  const [searching, setSearching] = useState(false);
  const [addingAll, setAddingAll] = useState(false);
  const [picked, setPicked] = useState([]);
  const [saving, setSaving] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [form, setForm] = useState({
    name: '100% Deposit Free Bet',
    code: makeTargetedPromoCode(),
    description: 'Deposit ₹10,000 or more and receive a ₹10,000 free bet.',
    minDeposit: '10000',
    matchPercent: '100',
    maxFreeBet: '10000',
    freebetExpiryDays: '7',
    startsAt: '',
    endsAt: '',
    emailSubject: '100% Deposit Free Bet Offer Just for You',
    segmentId: '',
    excludeSegmentId: '',
    vipTiers: '',
  });
  const [segments, setSegments] = useState([]);
  const [audiencePreview, setAudiencePreview] = useState(null);

  const preview = useMemo(() => {
    const min = Number(form.minDeposit) || 0;
    const pct = Number(form.matchPercent) || 0;
    const max = Number(form.maxFreeBet) || 0;
    const example = Number(Math.min((pct / 100) * min, max).toFixed(2));
    return { min, pct, max, example };
  }, [form.minDeposit, form.matchPercent, form.maxFreeBet]);

  const loadCampaigns = useCallback(() => {
    return adminApiClient.get('/growth/deposit-freebet/targeted')
      .then((data) => setCampaigns(data.campaigns || []))
      .catch((err) => showToast(err.message || 'Failed to load campaigns', 'error'));
  }, [showToast]);

  useEffect(() => { loadCampaigns(); }, [loadCampaigns]);

  useEffect(() => {
    adminApiClient.get('/growth/segments')
      .then((data) => setSegments(data.segments || []))
      .catch(() => setSegments([]));
  }, []);

  const loadDetail = useCallback((id) => {
    if (!id) {
      setDetail(null);
      return;
    }
    adminApiClient.get(`/growth/deposit-freebet/targeted/${encodeURIComponent(id)}`)
      .then((data) => setDetail(data))
      .catch((err) => showToast(err.message || 'Failed to load campaign', 'error'));
  }, [showToast]);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  const searchUsers = async () => {
    setSearching(true);
    try {
      const data = await adminApiClient.get(`/customers?q=${encodeURIComponent(searchQ)}&limit=50`);
      setSearchHits(data.users || data.customers || []);
    } catch (err) {
      showToast(err.message || 'User search failed', 'error');
    } finally {
      setSearching(false);
    }
  };

  const togglePick = (user) => {
    const id = user.id || user.userId || user.user_id;
    if (!id) return;
    setPicked((prev) => {
      if (prev.some((p) => p.id === id)) return prev.filter((p) => p.id !== id);
      return [...prev, {
        id,
        label: user.email || user.name || id,
      }];
    });
  };

  const mergeUsersIntoPicked = (users) => {
    setPicked((prev) => {
      const map = new Map(prev.map((p) => [p.id, p]));
      for (const user of users || []) {
        const id = user.id || user.userId || user.user_id;
        if (!id || map.has(id)) continue;
        map.set(id, {
          id,
          label: user.email || user.name || id,
        });
      }
      return [...map.values()].slice(0, 5000);
    });
  };

  const addAllSearchHits = () => {
    if (!searchHits.length) {
      showToast('Search players first', 'error');
      return;
    }
    mergeUsersIntoPicked(searchHits);
    showToast(`Added ${searchHits.length} from search results`, 'success');
  };

  const addAllUsers = async () => {
    if (!window.confirm('Add every registered user to this campaign (up to 5,000)?')) {
      return;
    }
    setAddingAll(true);
    try {
      const data = await adminApiClient.get('/customers?limit=5000');
      const users = data.users || data.customers || [];
      if (!users.length) {
        showToast('No users found', 'error');
        return;
      }
      mergeUsersIntoPicked(users);
      setSearchHits(users.slice(0, 100));
      showToast(`Added ${Math.min(users.length, 5000)} users`, 'success');
    } catch (err) {
      showToast(err.message || 'Failed to load users', 'error');
    } finally {
      setAddingAll(false);
    }
  };

  const createCampaign = async (e) => {
    e.preventDefault();
    const vipList = String(form.vipTiers || '')
      .split(',')
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);
    if (picked.length === 0 && !form.segmentId && vipList.length === 0) {
      showToast('Select users, a segment, or VIP tiers', 'error');
      return;
    }
    setSaving(true);
    try {
      const data = await adminApiClient.post('/growth/deposit-freebet/targeted', {
        name: form.name,
        code: form.code,
        description: form.description,
        minDeposit: form.minDeposit,
        matchPercent: form.matchPercent,
        maxFreeBet: form.maxFreeBet,
        freebetExpiryDays: form.freebetExpiryDays,
        startsAt: form.startsAt || null,
        endsAt: form.endsAt || null,
        emailSubject: form.emailSubject,
        onePerUser: true,
        emailOnGrant: true,
        userIds: picked.map((p) => p.id),
        segmentId: form.segmentId || null,
        excludeSegmentIds: form.excludeSegmentId ? [form.excludeSegmentId] : [],
        vipTiers: vipList,
      });
      showToast(`Campaign created · ${data.campaign?.lifecycleStatus || data.campaign?.status || 'DRAFT'}`, 'success');
      setSelectedId(data.campaign?.id || '');
      setPicked([]);
      setSearchHits([]);
      setAudiencePreview(null);
      setForm((f) => ({ ...f, code: makeTargetedPromoCode(), segmentId: '', excludeSegmentId: '', vipTiers: '' }));
      await loadCampaigns();
    } catch (err) {
      showToast(err.message || 'Create failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const previewAudience = async () => {
    const vipList = String(form.vipTiers || '')
      .split(',')
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);
    try {
      const data = await adminApiClient.post('/growth/deposit-freebet/targeted/preview-audience', {
        userIds: picked.map((p) => p.id),
        segmentId: form.segmentId || null,
        excludeSegmentIds: form.excludeSegmentId ? [form.excludeSegmentId] : [],
        vipTiers: vipList,
        limit: 25,
      });
      setAudiencePreview(data);
      showToast(`${data.count || 0} eligible recipients (server-side)`, 'success');
    } catch (err) {
      showToast(err.message || 'Preview failed', 'error');
    }
  };

  const dispatch = async () => {
    if (!selectedId) return;
    const n = detail?.users?.length || 0;
    if (!window.confirm(`Send this promotion to ${n} users from promos@oddsyra.com and activate the campaign?`)) {
      return;
    }
    setDispatching(true);
    try {
      const data = await adminApiClient.post(
        `/growth/deposit-freebet/targeted/${encodeURIComponent(selectedId)}/dispatch`,
        { activate: true },
      );
      showToast(`Emails sent: ${data.sent || 0} · failed: ${data.failed || 0}`, 'success');
      await loadCampaigns();
      loadDetail(selectedId);
    } catch (err) {
      showToast(err.message || 'Dispatch failed', 'error');
    } finally {
      setDispatching(false);
    }
  };

  const setStatus = async (status) => {
    if (!selectedId) return;
    try {
      await adminApiClient.patch(
        `/growth/deposit-freebet/targeted/${encodeURIComponent(selectedId)}/status`,
        { status },
      );
      showToast(`Campaign → ${status}`, 'success');
      await loadCampaigns();
      loadDetail(selectedId);
    } catch (err) {
      showToast(err.message || 'Status update failed', 'error');
    }
  };

  const deleteCampaign = async (campaign) => {
    const id = campaign?.id || selectedId;
    const code = campaign?.code || detail?.campaign?.code || 'this campaign';
    if (!id) return;
    if (!window.confirm(
      `Delete campaign ${code}?\n\nUsers will no longer get free bets from this offer, and the promo code cannot be used again.`,
    )) {
      return;
    }
    try {
      await adminApiClient.delete(`/growth/deposit-freebet/targeted/${encodeURIComponent(id)}`);
      showToast(`Deleted ${code} — code retired`, 'success');
      if (selectedId === id) {
        setSelectedId('');
        setDetail(null);
      }
      await loadCampaigns();
    } catch (err) {
      showToast(err.message || 'Delete failed', 'error');
    }
  };

  const setField = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="tdfb">
      <header className="tdfb-hero">
        <div className="tdfb-hero__copy">
          <p className="tdfb-kicker">Private offers</p>
          <h2 className="tdfb-title">Targeted campaigns</h2>
          <p className="tdfb-lede">
            Select players, send from <code>promos@oddsyra.com</code>, credit free bet only after a CAPTURED qualifying deposit.
          </p>
        </div>
        <ol className="tdfb-steps" aria-label="Campaign workflow">
          <li><span>1</span> Compose offer</li>
          <li><span>2</span> Pick players</li>
          <li><span>3</span> Create paused</li>
          <li><span>4</span> Send &amp; activate</li>
        </ol>
      </header>

      <div className="tdfb-compose">
        <AdminCard
          title="Compose campaign"
          subtitle="Paused until you send — free bet credits only after a qualifying deposit"
          accent="var(--admin-accent-emerald)"
          className="tdfb-compose__form"
        >
          <form onSubmit={createCampaign} className="tdfb-form">
            <section className="tdfb-block">
              <div className="tdfb-block__head">
                <h4>Offer rules</h4>
                <p>What the player must deposit and what free bet they unlock</p>
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label">Campaign name</label>
                <input className="admin-input" value={form.name} onChange={setField('name')} required />
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label">Unique promo code</label>
                <div className="tdfb-code-row">
                  <input
                    className="admin-input admin-text-mono"
                    value={form.code}
                    onChange={(e) => setForm((f) => ({
                      ...f,
                      code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 32),
                    }))}
                    placeholder="TDFB10000"
                    required
                    minLength={3}
                    maxLength={32}
                  />
                  <button
                    type="button"
                    className="admin-btn"
                    onClick={() => setForm((f) => ({ ...f, code: makeTargetedPromoCode() }))}
                  >
                    Generate
                  </button>
                </div>
                <p className="tdfb-hint">Must be unique across all promotions · shown in the offer email</p>
              </div>
              <div className="tdfb-rules">
                <div className="admin-form-group">
                  <label className="admin-form-label">Min deposit</label>
                  <div className="tdfb-affix">
                    <span>₹</span>
                    <input className="admin-input" type="number" min="1" step="1" value={form.minDeposit} onChange={setField('minDeposit')} required />
                  </div>
                </div>
                <div className="admin-form-group">
                  <label className="admin-form-label">Match</label>
                  <div className="tdfb-affix tdfb-affix--suffix">
                    <input className="admin-input" type="number" min="1" max="500" step="1" value={form.matchPercent} onChange={setField('matchPercent')} required />
                    <span>%</span>
                  </div>
                </div>
                <div className="admin-form-group">
                  <label className="admin-form-label">Max free bet</label>
                  <div className="tdfb-affix">
                    <span>₹</span>
                    <input className="admin-input" type="number" min="1" step="1" value={form.maxFreeBet} onChange={setField('maxFreeBet')} required />
                  </div>
                </div>
                <div className="admin-form-group">
                  <label className="admin-form-label">Free bet lasts</label>
                  <div className="tdfb-affix tdfb-affix--suffix">
                    <input className="admin-input" type="number" min="1" step="1" value={form.freebetExpiryDays} onChange={setField('freebetExpiryDays')} />
                    <span>days</span>
                  </div>
                  <p className="tdfb-hint">Countdown starts when the free bet is credited</p>
                </div>
              </div>
            </section>

            <section className="tdfb-block">
              <div className="tdfb-block__head">
                <h4>Email copy</h4>
                <p>Sent from promos@oddsyra.com when you press Send promotion</p>
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label">Subject line</label>
                <input className="admin-input" value={form.emailSubject} onChange={setField('emailSubject')} />
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label">Internal note</label>
                <input className="admin-input" value={form.description} onChange={setField('description')} placeholder="Only visible in admin" />
              </div>
            </section>

            <details
              className="tdfb-schedule"
              open={showSchedule}
              onToggle={(e) => {
                const open = e.currentTarget.open;
                setShowSchedule(open);
                if (!open) setForm((f) => ({ ...f, startsAt: '', endsAt: '' }));
              }}
            >
              <summary>
                <span>Optional campaign window</span>
                <em>Leave closed to control with Pause / Activate only</em>
              </summary>
              <div className="tdfb-schedule__body">
                <p className="tdfb-hint">
                  Limits when deposits can unlock this offer. Separate from free-bet expiry days.
                </p>
                <div className="tdfb-schedule__grid">
                  <div className="admin-form-group">
                    <label className="admin-form-label">Accept deposits from</label>
                    <input className="admin-input" type="datetime-local" value={form.startsAt} onChange={setField('startsAt')} />
                  </div>
                  <div className="admin-form-group">
                    <label className="admin-form-label">Accept deposits until</label>
                    <input className="admin-input" type="datetime-local" value={form.endsAt} onChange={setField('endsAt')} />
                  </div>
                </div>
              </div>
            </details>

            <section className="tdfb-block tdfb-block--players">
              <div className="tdfb-users__head">
                <div className="tdfb-block__head" style={{ marginBottom: 0 }}>
                  <h4>Audience</h4>
                  <p>Segment, VIP filter, and/or manual players</p>
                </div>
                <span className="tdfb-users__count">{picked.length} selected</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 12 }}>
                <div className="admin-form-group">
                  <label className="admin-form-label">CRM segment</label>
                  <select
                    className="admin-input"
                    value={form.segmentId}
                    onChange={(e) => setForm((f) => ({ ...f, segmentId: e.target.value }))}
                  >
                    <option value="">None — manual / VIP only</option>
                    {segments.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({Number(s.member_count || 0)} members)
                      </option>
                    ))}
                  </select>
                </div>
                <div className="admin-form-group">
                  <label className="admin-form-label">VIP tiers (comma-separated)</label>
                  <input
                    className="admin-input"
                    value={form.vipTiers}
                    onChange={(e) => setForm((f) => ({ ...f, vipTiers: e.target.value.toUpperCase() }))}
                    placeholder="GOLD,PLATINUM,DIAMOND"
                  />
                </div>
                <div className="admin-form-group">
                  <label className="admin-form-label">Exclude segment</label>
                  <select
                    className="admin-input"
                    value={form.excludeSegmentId}
                    onChange={(e) => setForm((f) => ({ ...f, excludeSegmentId: e.target.value }))}
                  >
                    <option value="">None</option>
                    {segments.map((s) => (
                      <option key={`ex_${s.id}`} value={s.id} disabled={s.id === form.segmentId}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <button type="button" className="admin-btn admin-btn--secondary admin-btn--sm" onClick={previewAudience}>
                  Preview eligible recipients
                </button>
                {audiencePreview && (
                  <span style={{ fontSize: '0.78rem', color: 'var(--admin-text-muted)' }}>
                    Server-side count: <strong>{audiencePreview.count}</strong>
                    {audiencePreview.excludedApplied ? ' (exclusions applied)' : ''}
                  </span>
                )}
              </div>
              <div className="tdfb-users__search">
                <input
                  className="admin-input"
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); searchUsers(); } }}
                  placeholder="Search email, name, or user id"
                />
                <button type="button" className="admin-btn" onClick={searchUsers} disabled={searching}>
                  {searching ? 'Searching…' : 'Search'}
                </button>
              </div>
              <div className="tdfb-users__bulk">
                <button
                  type="button"
                  className="admin-btn admin-btn--sm"
                  onClick={addAllSearchHits}
                  disabled={!searchHits.length}
                >
                  Add search results
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn--sm admin-btn--primary"
                  onClick={addAllUsers}
                  disabled={addingAll}
                >
                  {addingAll ? 'Loading users…' : 'Add all users'}
                </button>
              </div>
              {picked.length > 0 && (
                <div className="tdfb-chips">
                  {picked.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="tdfb-chip"
                      onClick={() => setPicked((prev) => prev.filter((x) => x.id !== p.id))}
                      title="Remove"
                    >
                      {p.label}
                      <span aria-hidden>×</span>
                    </button>
                  ))}
                  <button type="button" className="admin-btn admin-btn--sm" onClick={() => setPicked([])}>
                    Clear all
                  </button>
                </div>
              )}
              <div className="tdfb-users__hits">
                {(searchHits || []).length === 0 ? (
                  <p className="tdfb-empty">Search to find players, or use a segment / VIP filter above.</p>
                ) : (
                  searchHits.map((u) => {
                    const id = u.id || u.userId || u.user_id;
                    const checked = picked.some((p) => p.id === id);
                    return (
                      <label key={id} className={`tdfb-hit${checked ? ' tdfb-hit--on' : ''}`}>
                        <input type="checkbox" checked={checked} onChange={() => togglePick(u)} />
                        <span className="tdfb-hit__main">{u.email || u.name || u.userName || id}</span>
                        <span className="admin-text-mono tdfb-hit__id">{id}</span>
                      </label>
                    );
                  })
                )}
              </div>
            </section>

            <div className="tdfb-form__actions">
              <p className="tdfb-form__note">Creates as DRAFT (or SCHEDULED) · grants only when ACTIVE</p>
              <button type="submit" className="admin-btn admin-btn--primary" disabled={saving}>
                {saving ? 'Creating…' : `Create campaign · ${picked.length || 0} manual + audience`}
              </button>
            </div>
          </form>
        </AdminCard>

        <aside className="tdfb-preview" aria-label="Offer preview">
          <div className="tdfb-preview__card">
            <p className="tdfb-preview__eyebrow">Player offer preview</p>
            <h3 className="tdfb-preview__name">{form.name || 'Untitled campaign'}</h3>
            <p className="tdfb-preview__code">{form.code || 'NO-CODE'}</p>
            <p className="tdfb-preview__subject">{form.emailSubject || 'No subject'}</p>
            <div className="tdfb-preview__math">
              <div>
                <span>Deposit</span>
                <strong>{money(preview.min)}</strong>
              </div>
              <div className="tdfb-preview__arrow" aria-hidden>→</div>
              <div>
                <span>Free bet</span>
                <strong>{money(preview.example)}</strong>
              </div>
            </div>
            <ul className="tdfb-preview__meta">
              <li><span>Match</span><strong>{preview.pct}%</strong></li>
              <li><span>Cap</span><strong>{money(preview.max)}</strong></li>
              <li><span>Expiry</span><strong>{form.freebetExpiryDays || '—'} days</strong></li>
              <li><span>Players</span><strong>{picked.length}</strong></li>
            </ul>
            <p className="tdfb-preview__from">
              From <code>promos@oddsyra.com</code> · credit on CAPTURED deposit
            </p>
          </div>
        </aside>
      </div>

      <section className="tdfb-list">
        <div className="tdfb-list__head">
          <h3>Campaigns</h3>
          <button type="button" className="admin-btn admin-btn--sm" onClick={loadCampaigns}>Refresh</button>
        </div>
        {campaigns.length === 0 ? (
          <div className="tdfb-empty-panel">No targeted campaigns yet. Compose one above.</div>
        ) : (
          <div className="tdfb-campaign-grid">
            {campaigns.map((c) => {
              const active = selectedId === c.id;
              return (
                <div
                  key={c.id}
                  className={`tdfb-campaign${active ? ' tdfb-campaign--active' : ''}`}
                >
                  <button
                    type="button"
                    className="tdfb-campaign__select"
                    onClick={() => setSelectedId(c.id)}
                  >
                    <div className="tdfb-campaign__top">
                      <strong>{c.name}</strong>
                      <StatusBadge status={c.lifecycleStatus || c.status} />
                    </div>
                    {c.code && <code className="tdfb-campaign__code">{c.code}</code>}
                    <div className="tdfb-campaign__stats">
                      <span>{money(c.minDeposit)} min</span>
                      <span>{c.matchPercent}%</span>
                      <span>{c.selectedUsers || 0} users</span>
                      <span>{c.emailsSent || 0} sent</span>
                      <span>{c.claims || 0} claims</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    className="admin-btn admin-btn--sm tdfb-campaign__delete"
                    onClick={() => deleteCampaign(c)}
                  >
                    Delete
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {detail?.campaign && (
        <section className="tdfb-detail">
          <AdminCard
            title={detail.campaign.name}
            subtitle={`${detail.campaign.code || '—'} · ID ${detail.campaign.id}`}
            accent="var(--admin-accent-cyan)"
            actions={(
              <>
                <button type="button" className="admin-btn admin-btn--primary" disabled={dispatching} onClick={dispatch}>
                  {dispatching ? 'Sending…' : 'Send promotion'}
                </button>
                <button type="button" className="admin-btn" onClick={() => setStatus('DRAFT')}>Draft</button>
                <button type="button" className="admin-btn" onClick={() => setStatus('SCHEDULED')}>Schedule</button>
                <button type="button" className="admin-btn" onClick={() => setStatus('PAUSED')}>Pause</button>
                <button type="button" className="admin-btn" onClick={() => setStatus('ACTIVE')}>Activate</button>
                <button type="button" className="admin-btn" onClick={() => setStatus('COMPLETED')}>Complete</button>
                <button type="button" className="admin-btn admin-btn--danger" onClick={() => deleteCampaign(detail.campaign)}>
                  Delete campaign
                </button>
              </>
            )}
          >
            <div className="tdfb-kpis">
              <div className="tdfb-kpi">
                <span>Status</span>
                <strong><StatusBadge status={detail.campaign.lifecycleStatus || detail.campaign.status} /></strong>
              </div>
              <div className="tdfb-kpi">
                <span>Players</span>
                <strong>{detail.users?.length || 0}</strong>
              </div>
              <div className="tdfb-kpi">
                <span>Emails sent</span>
                <strong>{(detail.users || []).filter((u) => u.offerEmailStatus === 'SENT').length}</strong>
              </div>
              <div className="tdfb-kpi">
                <span>Claims</span>
                <strong>{detail.claims?.length || 0}</strong>
              </div>
              <div className="tdfb-kpi">
                <span>Offer</span>
                <strong>{detail.campaign.matchPercent}% · max {money(detail.campaign.maxFreeBet)}</strong>
              </div>
            </div>

            <div className="tdfb-detail__tables">
              <AdminDataTable
                title="Assigned users"
                emptyMessage="No users"
                data={detail.users || []}
                columns={[
                  { header: 'User', key: 'userMask' },
                  { header: 'Email', key: 'email' },
                  {
                    header: 'Offer email',
                    key: 'offerEmailStatus',
                    render: (r) => <StatusBadge status={r.offerEmailStatus || 'NONE'} />,
                  },
                  {
                    header: 'User ID',
                    key: 'userId',
                    render: (r) => <span className="admin-text-mono" style={{ fontSize: '0.72rem' }}>{r.userId}</span>,
                  },
                ]}
              />
              <AdminDataTable
                title="Claims"
                emptyMessage="No claims yet — waiting for qualifying deposits"
                data={detail.claims || []}
                columns={[
                  { header: 'User', key: 'userMask' },
                  { header: 'Deposit', key: 'depositAmount', render: (r) => money(r.depositAmount) },
                  { header: 'Free bet', key: 'freebetAmount', render: (r) => money(r.freebetAmount) },
                  { header: 'Status', key: 'status', render: (r) => <StatusBadge status={r.status} /> },
                ]}
              />
            </div>
          </AdminCard>
        </section>
      )}
    </div>
  );
}

function DepositFreeBetPanel() {
  const { showToast } = useAdminToast();
  const drillFb = useAdminKpiDrilldown();
  const [campaign, setCampaign] = useState(null);
  const [stats, setStats] = useState(null);
  const [grants, setGrants] = useState([]);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [previewDeposit, setPreviewDeposit] = useState('10000');
  const [form, setForm] = useState({
    enabled: false,
    name: 'Deposit 100% Free Bet',
    minDeposit: '10000',
    matchPercent: '100',
    maxFreeBet: '10000',
    maxEligibleDeposit: '10000',
    eligibility: 'ALL',
    onePerUser: true,
    emailOnGrant: true,
    freebetExpiryDays: '7',
    startsAt: '',
    endsAt: '',
  });

  const load = useCallback(() => {
    return adminApiClient.get('/growth/deposit-freebet')
      .then((data) => {
        const c = data.campaign || {};
        setCampaign(c);
        setStats(data.stats || null);
        setGrants(data.grants || []);
        setForm({
          enabled: Boolean(c.enabled),
          name: c.name || 'Deposit 100% Free Bet',
          minDeposit: String(c.minDeposit ?? 10000),
          matchPercent: String(c.matchPercent ?? 100),
          maxFreeBet: String(c.maxFreeBet ?? 10000),
          maxEligibleDeposit: c.maxEligibleDeposit == null ? '' : String(c.maxEligibleDeposit),
          eligibility: c.eligibility || 'ALL',
          onePerUser: c.onePerUser !== false,
          emailOnGrant: c.emailOnGrant !== false,
          freebetExpiryDays: String(c.freebetExpiryDays ?? 7),
          startsAt: c.startsAt ? String(c.startsAt).slice(0, 16) : '',
          endsAt: c.endsAt ? String(c.endsAt).slice(0, 16) : '',
        });
        setError(null);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load deposit free bet campaign');
      });
  }, []);

  useEffect(() => { load(); }, [load]);

  const previewAmount = useMemo(() => {
    const deposit = Number(previewDeposit) || 0;
    const minDeposit = Number(form.minDeposit) || 0;
    const matchPercent = Number(form.matchPercent) || 0;
    const maxFreeBet = Number(form.maxFreeBet) || 0;
    const maxEligible = form.maxEligibleDeposit === '' ? null : Number(form.maxEligibleDeposit);
    if (deposit < minDeposit) return 0;
    const capped = maxEligible != null && Number.isFinite(maxEligible) ? Math.min(deposit, maxEligible) : deposit;
    return Number(Math.min(capped * (matchPercent / 100), maxFreeBet).toFixed(2));
  }, [previewDeposit, form]);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await adminApiClient.put('/growth/deposit-freebet', {
        enabled: form.enabled,
        name: form.name,
        minDeposit: form.minDeposit,
        matchPercent: form.matchPercent,
        maxFreeBet: form.maxFreeBet,
        maxEligibleDeposit: form.maxEligibleDeposit === '' ? null : form.maxEligibleDeposit,
        eligibility: form.eligibility,
        onePerUser: form.onePerUser,
        emailOnGrant: form.emailOnGrant,
        freebetExpiryDays: form.freebetExpiryDays,
        startsAt: form.startsAt || null,
        endsAt: form.endsAt || null,
      });
      showToast('Deposit Free Bet campaign saved', 'success');
      await load();
    } catch (err) {
      showToast(err.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const sendEmail = async (row, resend = false) => {
    try {
      await adminApiClient.post(
        `/growth/deposit-freebet/grants/${encodeURIComponent(row.id)}/send-email`,
        { resend },
      );
      showToast(resend ? 'Email resent' : 'Email sent', 'success');
      await load();
    } catch (err) {
      showToast(err.message || 'Email failed', 'error');
    }
  };

  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <p style={{ margin: 0, color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
          Sitewide campaign — auto-grants to <code>freebet_balance</code> after a CAPTURED deposit for eligible players.
        </p>
        {error && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.78rem' }}>{error}</p>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Eligible Users', metric: 'freebetGrants', value: stats?.eligibleUsers ?? 0 },
          { label: 'Rewards Granted', metric: 'freebetGrants', value: money(stats?.totalFreebetValue) },
          { label: 'Used', metric: 'freebetGrants', value: money(stats?.usedValue) },
          { label: 'Emails Sent', metric: 'freebetGrants', value: stats?.emailsSent ?? 0 },
          { label: 'Emails Failed', metric: 'freebetGrants', value: stats?.emailsFailed ?? 0 },
        ].map((card) => (
          <AdminKPI
            key={card.label}
            label={card.label}
            value={card.value}
            accent="#0ea5e9"
            source="Details"
            onClick={() => drillFb.openDrilldown(card.metric, card.label)}
          />
        ))}
      </div>
      <AdminKpiDrillDrawer drill={drillFb} />

      <AdminCard title="Campaign configuration" accent="#22c55e" style={{ marginBottom: 16 }}>
        <form onSubmit={save} style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <label className="admin-form-label" style={{ margin: 0 }}>Status</label>
            <button
              type="button"
              className={`admin-btn ${form.enabled ? 'admin-btn--primary' : ''}`}
              onClick={() => setForm((f) => ({ ...f, enabled: !f.enabled }))}
            >
              {form.enabled ? 'ON' : 'OFF'}
            </button>
            {campaign?.code && <span className="admin-badge admin-badge--neutral">{campaign.code}</span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div className="admin-form-group">
              <label className="admin-form-label">Promotion Name</label>
              <input className="admin-input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">Minimum Deposit (₹)</label>
              <input className="admin-input" type="number" min="0" step="1" value={form.minDeposit} onChange={(e) => setForm((f) => ({ ...f, minDeposit: e.target.value }))} required />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">Free Bet %</label>
              <input className="admin-input" type="number" min="0.01" max="500" step="0.01" value={form.matchPercent} onChange={(e) => setForm((f) => ({ ...f, matchPercent: e.target.value }))} required />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">Maximum Free Bet (₹)</label>
              <input className="admin-input" type="number" min="0.01" step="1" value={form.maxFreeBet} onChange={(e) => setForm((f) => ({ ...f, maxFreeBet: e.target.value }))} required />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">Max Eligible Deposit (₹)</label>
              <input className="admin-input" type="number" min="0" step="1" value={form.maxEligibleDeposit} onChange={(e) => setForm((f) => ({ ...f, maxEligibleDeposit: e.target.value }))} placeholder="Optional cap" />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">Eligibility</label>
              <select className="admin-input" value={form.eligibility} onChange={(e) => setForm((f) => ({ ...f, eligibility: e.target.value }))}>
                <option value="ALL">All users</option>
                <option value="NEW">New users (first deposit)</option>
                <option value="EXISTING">Existing users</option>
              </select>
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">Free Bet Expiry (days)</label>
              <input className="admin-input" type="number" min="1" max="365" value={form.freebetExpiryDays} onChange={(e) => setForm((f) => ({ ...f, freebetExpiryDays: e.target.value }))} />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">Start</label>
              <input className="admin-input" type="datetime-local" value={form.startsAt} onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))} />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">End</label>
              <input className="admin-input" type="datetime-local" value={form.endsAt} onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }}>
              <input type="checkbox" checked={form.onePerUser} onChange={(e) => setForm((f) => ({ ...f, onePerUser: e.target.checked }))} />
              One reward per user
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }}>
              <input type="checkbox" checked={form.emailOnGrant} onChange={(e) => setForm((f) => ({ ...f, emailOnGrant: e.target.checked }))} />
              Send email on grant
            </label>
          </div>
          <div>
            <button type="submit" className="admin-btn admin-btn--primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save Promotion'}
            </button>
          </div>
        </form>
      </AdminCard>

      <AdminCard title="Live preview" accent="#a855f7" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'end' }}>
          <div className="admin-form-group" style={{ margin: 0 }}>
            <label className="admin-form-label">User deposits ₹</label>
            <input className="admin-input" type="number" min="0" value={previewDeposit} onChange={(e) => setPreviewDeposit(e.target.value)} />
          </div>
          <div style={{ fontSize: '0.95rem' }}>
            <div style={{ color: 'var(--admin-text-muted)', fontSize: '0.75rem' }}>Eligible Free Bet</div>
            <strong style={{ fontSize: '1.4rem' }}>{money(previewAmount)}</strong>
          </div>
        </div>
      </AdminCard>

      <AdminDataTable
        title="Rewards"
        emptyMessage="No deposit free-bet grants yet"
        data={grants}
        columns={[
          { header: 'User', key: 'userMask' },
          { header: 'Deposit', key: 'depositAmount', render: (r) => money(r.depositAmount) },
          { header: 'Free Bet', key: 'freebetAmount', render: (r) => money(r.freebetAmount) },
          { header: 'Status', key: 'status', render: (r) => <StatusBadge status={r.status} /> },
          { header: 'Email', key: 'emailStatus', render: (r) => r.emailStatus || 'NONE' },
          {
            header: 'Action',
            key: 'id',
            render: (r) => (
              <button
                type="button"
                className="admin-btn"
                style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                onClick={() => sendEmail(r, r.emailStatus === 'SENT')}
              >
                {r.emailStatus === 'SENT' ? 'RESEND' : 'SEND'}
              </button>
            ),
          },
        ]}
      />
    </div>
  );
}

function PromotionsPanel() {
  const [promos, setPromos] = useState([]);
  const [roiRows, setRoiRows] = useState([]);
  const [error, setError] = useState(null);
  const [roiNote, setRoiNote] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      adminApiClient.get('/growth/promotions'),
      adminApiClient.get('/growth/promo-roi'),
    ]).then(([promoRes, roiRes]) => {
      if (cancelled) return;
      if (promoRes.status === 'fulfilled') {
        setPromos(promoRes.value.promotions || []);
        setError(promoRes.value.note || null);
      } else {
        setPromos([]);
        setError(promoRes.reason?.message || 'Failed to load promotions');
      }
      if (roiRes.status === 'fulfilled') {
        setRoiRows(roiRes.value.rows || []);
        setRoiNote(roiRes.value.note || null);
      } else {
        setRoiRows([]);
        setRoiNote(roiRes.reason?.message || 'Promo ROI unavailable');
      }
    });
    return () => { cancelled = true; };
  }, []);

  const na = (v) => (v == null || v === 'N/A' ? 'N/A' : v);

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
          { header: 'Type', key: 'type', render: (r) => r.type || '—', hideOnMobile: true },
          { header: 'Bonus %', key: 'bonusPct', render: (r) => (r.bonusPct != null ? `${r.bonusPct}%` : '—'), hideOnMobile: true },
          { header: 'Max Bonus', key: 'maxBonus', render: (r) => money(r.maxBonus), hideOnMobile: true },
          { header: 'Claims', key: 'claims' },
          {
            header: 'Status',
            key: 'status',
            render: (r) => <StatusBadge status={r.status} />,
          },
        ]}
      />

      <AdminDataTable
        title="Promo ROI (attributable)"
        emptyMessage="No promo ROI rows"
        data={roiRows}
        columns={[
          { header: 'Campaign', key: 'name', render: (r) => <span style={{ fontWeight: 700 }}>{r.name}</span> },
          { header: 'Code', key: 'code', render: (r) => <span className="admin-badge admin-badge--neutral">{r.code}</span> },
          { header: 'Grants', key: 'grants', render: (r) => na(r.grants) },
          { header: 'Cost', key: 'cost', render: (r) => (r.cost == null ? 'N/A' : money(r.cost)) },
          { header: 'Attr. deposits', key: 'attributedDeposits', render: (r) => (r.attributedDeposits == null ? 'N/A' : money(r.attributedDeposits)) },
          { header: 'Attr. stake', key: 'attributedStake', render: (r) => (r.attributedStake == null ? 'N/A' : money(r.attributedStake)), hideOnMobile: true },
          {
            header: 'ROI',
            key: 'roi',
            render: (r) => (r.roi == null ? 'N/A' : `${(Number(r.roi) * 100).toFixed(1)}%`),
          },
          { header: 'Attribution', key: 'attribution', hideOnMobile: true, priority: 'low' },
        ]}
      />
      {roiNote && (
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.76rem' }}>{roiNote}</p>
      )}
    </div>
  );
}

function SignupPromoCodesPanel() {
  const { showToast } = useAdminToast();
  const [codes, setCodes] = useState([]);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [inviteCodeId, setInviteCodeId] = useState('');
  const [inviteEmails, setInviteEmails] = useState('');
  const [sendingInvites, setSendingInvites] = useState(false);

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
      inviteOnly: form.inviteOnly,
    })
      .then((data) => {
        setCodes((prev) => [data.code, ...prev]);
        if (data.code?.id) setInviteCodeId(data.code.id);
        setForm(emptyForm);
        showToast(
          data.code?.inviteOnly
            ? `Created private code ${data.code?.code}. Send it to invited emails below.`
            : `Created ${data.code?.code || 'promo code'}`,
          'success',
        );
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

  const sendInvites = async (e) => {
    e.preventDefault();
    if (!inviteCodeId) {
      showToast('Select a promo code first', 'error');
      return;
    }
    setSendingInvites(true);
    try {
      const data = await adminApiClient.post(
        `/growth/signup-codes/${encodeURIComponent(inviteCodeId)}/send-invites`,
        { emails: inviteEmails },
      );
      showToast(`Invites sent: ${data.sent || 0} · failed: ${data.failed || 0} (from promos@oddsyra.com)`, 'success');
      setInviteEmails('');
      await loadCodes();
    } catch (err) {
      showToast(err.message || 'Invite send failed', 'error');
    } finally {
      setSendingInvites(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>Signup Promo Codes</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
          Create freebet/bonus codes. Mark <strong>Invite only</strong> so the code stays off the public Promotions page —
          only emails you send from <code>promos@oddsyra.com</code> can redeem it.
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
              Start enabled
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', cursor: 'pointer', color: 'var(--admin-text)' }}>
              <input
                type="checkbox"
                checked={form.inviteOnly}
                onChange={(e) => updateField('inviteOnly', e.target.checked)}
                style={{ accentColor: '#0ea5e9' }}
              />
              Invite only (hidden from all users until you email them)
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

      <AdminCard title="Send promo code email" accent="#0ea5e9" style={{ marginBottom: '20px' }}>
        <form onSubmit={sendInvites} style={{ display: 'grid', gap: 12 }}>
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--admin-text-muted)' }}>
            Emails are sent from <strong>promos@oddsyra.com</strong>. For invite-only codes, only these recipients can claim.
          </p>
          <div className="admin-form-group">
            <label className="admin-form-label">Promo code</label>
            <select
              className="admin-select"
              value={inviteCodeId}
              onChange={(e) => setInviteCodeId(e.target.value)}
              required
            >
              <option value="">Select code…</option>
              {codes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} · {REWARD_LABELS[c.rewardType] || c.rewardType} ₹{c.amount}
                  {c.inviteOnly ? ' · INVITE ONLY' : ''}
                  {!c.isActive ? ' · DISABLED' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label">Recipient emails</label>
            <textarea
              className="admin-input"
              rows={4}
              value={inviteEmails}
              onChange={(e) => setInviteEmails(e.target.value)}
              placeholder={'friend1@email.com\nfriend2@email.com'}
              required
            />
          </div>
          <div>
            <button type="submit" className="admin-btn admin-btn--primary" disabled={sendingInvites}>
              {sendingInvites ? 'Sending…' : 'Send from promos@oddsyra.com'}
            </button>
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
            header: 'Visibility',
            key: 'inviteOnly',
            render: (r) => (r.inviteOnly ? 'Invite only' : 'Public'),
          },
          {
            header: 'Invites',
            key: 'inviteCount',
            render: (r) => (r.inviteCount != null ? r.inviteCount : '—'),
          },
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
  const drillVip = useAdminKpiDrilldown();
  const [tiers, setTiers] = useState([]);
  const [limits, setLimits] = useState({ minDeposit: null, minWithdraw: null });
  const [dash, setDash] = useState(null);
  const [error, setError] = useState(null);
  const [overrideUserId, setOverrideUserId] = useState('');
  const [overrideTier, setOverrideTier] = useState('GOLD');
  const [overrideReason, setOverrideReason] = useState('');
  const [busy, setBusy] = useState(false);
  const { showToast } = useAdminToast();

  const load = useCallback(() => {
    Promise.allSettled([
      adminApiClient.get('/growth/vip-tiers'),
      adminApiClient.get('/growth/vip-dashboard'),
    ]).then(([catalog, dashboard]) => {
      if (catalog.status === 'fulfilled') {
        setTiers(catalog.value.tiers || []);
        setLimits({ minDeposit: catalog.value.minDeposit, minWithdraw: catalog.value.minWithdraw });
        setError(null);
      } else {
        setTiers([]);
        setError(catalog.reason?.message || 'Failed to load VIP tier catalog');
      }
      setDash(dashboard.status === 'fulfilled' ? dashboard.value : null);
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  const submitOverride = async (e) => {
    e.preventDefault();
    if (!overrideUserId.trim()) {
      showToast('User ID required', 'error');
      return;
    }
    setBusy(true);
    try {
      const res = await adminApiClient.patch('/growth/vip-dashboard/override', {
        userId: overrideUserId.trim(),
        newTier: overrideTier,
        reason: overrideReason.trim(),
      });
      showToast(
        res.unchanged
          ? `Already on ${res.newTier}`
          : `Tier ${res.previousTier} → ${res.newTier}`,
        'success',
      );
      setOverrideReason('');
      load();
    } catch (err) {
      showToast(err.message || 'Override failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const dashTiers = dash?.tiers || [];

  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>08 · VIP Loyalty Tiers</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
          Authoritative VIP benefits catalog (min deposit ₹{limits.minDeposit?.toLocaleString() ?? '1,000'} · min withdraw ₹{limits.minWithdraw?.toLocaleString() ?? '1,000'}).
        </p>
        {error && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.78rem' }}>{error}</p>}
      </div>

      {dash && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
          {[
            { label: 'Loyalty users', metric: 'vipUsers', value: dash.totals?.loyaltyUsers },
            { label: 'VIP points', metric: 'vipUsers', value: dash.totals?.totalVipPoints },
            { label: 'Redeemable pts', metric: 'vipUsers', value: dash.totals?.totalRedeemablePoints },
            { label: 'Stake (tx)', metric: 'turnover', value: money(dash.totals?.attributedStake) },
            { label: 'Deposits (tx)', metric: 'Deposits', value: money(dash.totals?.attributedDeposits) },
          ].map((c) => (
            <AdminKPI
              key={c.label}
              label={c.label}
              value={typeof c.value === 'number' ? c.value.toLocaleString() : (c.value ?? '—')}
              accent="#64748b"
              source="Details"
              onClick={() => drillVip.openDrilldown(c.metric, c.label)}
            />
          ))}
        </div>
      )}
      <AdminKpiDrillDrawer drill={drillVip} />

      {dashTiers.length > 0 && (
        <AdminDataTable
          title="VIP Dashboard · Tier Counts"
          emptyMessage="No loyalty rows"
          data={dashTiers}
          columns={[
            { header: 'Tier', key: 'tier', render: (r) => <span className="admin-text-mono" style={{ fontWeight: 800 }}>{r.tier}</span> },
            { header: 'Label', key: 'label' },
            { header: 'Users', key: 'users' },
            { header: 'VIP points', key: 'vipPoints', render: (r) => Number(r.vipPoints || 0).toLocaleString() },
            { header: 'Redeemable', key: 'redeemablePoints', render: (r) => Number(r.redeemablePoints || 0).toLocaleString(), hideOnMobile: true },
            { header: 'Pts required', key: 'pointsRequired', hideOnMobile: true },
          ]}
        />
      )}

      <form
        onSubmit={submitOverride}
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          alignItems: 'flex-end',
          margin: '12px 0 20px',
          padding: 12,
          border: '1px solid var(--admin-border)',
          borderRadius: 10,
          background: 'var(--admin-surface)',
        }}
      >
        <label style={{ fontSize: '0.74rem', fontWeight: 700 }}>
          User ID
          <input
            className="admin-input"
            value={overrideUserId}
            onChange={(e) => setOverrideUserId(e.target.value)}
            placeholder="usr_…"
            style={{ display: 'block', marginTop: 4, minWidth: 160 }}
          />
        </label>
        <label style={{ fontSize: '0.74rem', fontWeight: 700 }}>
          New tier
          <select
            className="admin-input"
            value={overrideTier}
            onChange={(e) => setOverrideTier(e.target.value)}
            style={{ display: 'block', marginTop: 4 }}
          >
            {['BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND'].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: '0.74rem', fontWeight: 700, flex: '1 1 160px' }}>
          Reason
          <input
            className="admin-input"
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
            placeholder="Manual adjustment"
            style={{ display: 'block', marginTop: 4, width: '100%' }}
          />
        </label>
        <button type="submit" className="admin-btn admin-btn--primary" disabled={busy}>
          {busy ? 'Saving…' : 'Override tier'}
        </button>
      </form>

      {(dash?.recentOverrides || []).length > 0 && (
        <AdminDataTable
          title="Recent admin overrides"
          emptyMessage="No overrides"
          data={dash.recentOverrides}
          columns={[
            { header: 'User', key: 'userId', render: (r) => <span className="admin-text-mono">{r.userId}</span> },
            { header: 'From', key: 'previousTier' },
            { header: 'To', key: 'newTier' },
            { header: 'Reason', key: 'reason', hideOnMobile: true },
            {
              header: 'When',
              key: 'changedAt',
              render: (r) => (r.changedAt ? new Date(r.changedAt).toLocaleString() : '—'),
            },
          ]}
        />
      )}

      <AdminDataTable
        title="VIP Tier Benefits Matrix"
        emptyMessage="No VIP tiers configured"
        data={tiers}
        columns={[
          { header: 'Tier', key: 'tier', render: (r) => <span className="admin-text-mono" style={{ fontWeight: 800 }}>{r.tier}</span> },
          { header: 'Label', key: 'label', render: (r) => <span style={{ fontWeight: 700 }}>{r.label}</span> },
          { header: 'Points Required', key: 'pointsRequired', render: (r) => (r.pointsRequired != null ? r.pointsRequired.toLocaleString() : '—') },
          { header: 'Pts / ₹100', key: 'pointsPer100', hideOnMobile: true },
          { header: 'Cashback %', key: 'cashbackPct', render: (r) => (r.cashbackPct ? `${r.cashbackPct}%` : '—') },
          { header: 'Cashout %', key: 'cashoutPayoutPct', hideOnMobile: true },
          { header: 'Odds Boost %', key: 'oddsBoostPct', render: (r) => (r.oddsBoostPct ? `${r.oddsBoostPct}%` : '—'), hideOnMobile: true },
          { header: 'Spin Mult.', key: 'spinMultiplier', hideOnMobile: true },
          { header: 'Max Withdraw', key: 'maxWithdraw', render: (r) => money(r.maxWithdraw) },
          { header: 'Support SLA', key: 'supportSlaMinutes', render: (r) => `${r.supportSlaMinutes}m`, hideOnMobile: true },
          { header: 'Withdraw Review', key: 'withdrawReviewHours', render: (r) => `${r.withdrawReviewHours}h`, hideOnMobile: true },
          { header: 'Priority WD', key: 'priorityWithdraw', hideOnMobile: true },
          { header: 'Priority Support', key: 'prioritySupport', hideOnMobile: true },
          { header: 'Dedicated Mgr', key: 'dedicatedManager', hideOnMobile: true },
        ]}
      />
    </div>
  );
}

function DepositFreeBetHub({ initialTab = 'targeted' }) {
  const [tab, setTab] = useState(initialTab === 'global' ? 'global' : 'targeted');
  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800 }}>Deposit Free Bet</h2>
        <p style={{ margin: '6px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.84rem', maxWidth: '62ch' }}>
          One place for deposit-match free bets: sitewide rules, or private offers for selected players.
        </p>
      </div>
      <AdminTabs
        active={tab}
        onChange={setTab}
        style={{ marginBottom: 16 }}
        tabs={[
          { id: 'targeted', label: 'Targeted (selected users)' },
          { id: 'global', label: 'Global (all eligible)' },
        ]}
      />
      {tab === 'global' ? <DepositFreeBetPanel /> : <TargetedDepositFreeBetPanel />}
    </div>
  );
}


function CrmComposerPanel() {
  const { showToast } = useAdminToast();
  const [include, setInclude] = useState('');
  const [exclude, setExclude] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = async (mode) => {
    setBusy(true);
    try {
      const payload = {
        includeSegmentIds: include.split(/[,\s]+/).filter(Boolean),
        excludeSegmentIds: exclude.split(/[,\s]+/).filter(Boolean),
        subject,
        body,
        limit: 50,
      };
      const path = mode === 'dry' ? '/growth/crm-composer/dry-run' : '/growth/crm-composer/preview';
      const data = await adminApiClient.post(path, payload);
      setResult(data);
      showToast(mode === 'dry' ? 'Dry-run recorded (no send)' : 'Preview ready', 'success');
    } catch (err) {
      showToast(err.message || 'Composer failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>CRM Composer (dry-run)</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
          Server finalizes recipients and excludes marketing opt-outs. No frontend recipient bypass. Uses existing emailService / promos@oddsyra.com.
        </p>
      </div>
      <div style={{ display: 'grid', gap: 8, maxWidth: 520, marginBottom: 12 }}>
        <label style={{ fontSize: '0.78rem' }}>Include segment IDs (comma-separated)
          <input value={include} onChange={(e) => setInclude(e.target.value)} style={{ display: 'block', width: '100%', marginTop: 4 }} />
        </label>
        <label style={{ fontSize: '0.78rem' }}>Exclude segment IDs
          <input value={exclude} onChange={(e) => setExclude(e.target.value)} style={{ display: 'block', width: '100%', marginTop: 4 }} />
        </label>
        <label style={{ fontSize: '0.78rem' }}>Subject
          <input value={subject} onChange={(e) => setSubject(e.target.value)} style={{ display: 'block', width: '100%', marginTop: 4 }} />
        </label>
        <label style={{ fontSize: '0.78rem' }}>Body
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} style={{ display: 'block', width: '100%', marginTop: 4 }} />
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="admin-btn" disabled={busy} onClick={() => run('preview')}>Preview audience</button>
          <button type="button" className="admin-btn admin-btn--secondary" disabled={busy} onClick={() => run('dry')}>Dry-run (audit)</button>
        </div>
      </div>
      {result && (
        <pre style={{ fontSize: '0.72rem', whiteSpace: 'pre-wrap', maxHeight: 360, overflow: 'auto' }}>
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}

export default function GrowthDomainView({ subModule = 'overview' }) {
  if (subModule === 'overview' || subModule === 'growth-overview') {
    return <GrowthOverviewPanel />;
  }
  if (subModule === 'bonus-codes') {
    return <SignupPromoCodesPanel />;
  }
  if (subModule === 'deposit-freebet' || subModule === 'targeted-deposit-freebet') {
    return (
      <DepositFreeBetHub
        initialTab={subModule === 'targeted-deposit-freebet' ? 'targeted' : 'targeted'}
      />
    );
  }
  if (subModule === 'vip-tiers') {
    return <VipTiersPanel />;
  }
  if (subModule === 'referrals') {
    return <ReferralsAdminPanel />;
  }
  if (subModule === 'promo-abuse') {
    return <PromoAbuseAlertsPanel />;
  }
  if (subModule === 'crm-composer') {
    return <CrmComposerPanel />;
  }
  if (subModule === 'crm-segments') {
    return <CrmSegmentsPanel />;
  }
  if (subModule === 'promo-roi') {
    return <PromoRoiPanel />;
  }
  return <PromotionsPanel />;
}

function GrowthOverviewPanel() {
  const [kpis, setKpis] = useState(null);
  const [error, setError] = useState(null);
  const [notes, setNotes] = useState([]);
  const drill = useAdminKpiDrilldown();

  useEffect(() => {
    adminApiClient.get('/growth/dashboard')
      .then((data) => {
        setKpis(data.kpis || null);
        setNotes(data.notes || []);
        setError(null);
      })
      .catch((err) => {
        setKpis(null);
        setError(err.message || 'Dashboard unavailable');
      });
  }, []);

  const cards = [
    { label: 'Active campaigns', metric: 'activeCampaigns', value: kpis?.activeCampaigns },
    { label: 'Users targeted', metric: 'activeCampaigns', value: kpis?.usersTargeted },
    { label: 'Emails sent', metric: 'freebetGrants', value: kpis?.emailsSent },
    { label: 'Freebet grants', metric: 'freebetGrants', value: kpis?.freebetGrants },
    { label: 'Freebet issued', metric: 'freebetGrants', value: kpis ? money(kpis.freebetIssued) : null },
    { label: 'Freebet consumed', metric: 'freebetGrants', value: kpis ? money(kpis.freebetConsumed) : null },
    { label: 'Linked deposits', metric: 'Deposits', value: kpis ? money(kpis.depositsLinkedToFreebet) : null },
    { label: 'Claim conversion', metric: 'freebetGrants', value: kpis?.claimConversion != null ? `${(kpis.claimConversion * 100).toFixed(1)}%` : 'N/A' },
    { label: 'Referral conversion', metric: 'referralActivityToday', value: kpis?.referralConversion != null ? `${(kpis.referralConversion * 100).toFixed(1)}%` : 'N/A' },
    { label: 'VIP users', metric: 'vipUsers', value: kpis?.vipUsers },
    { label: 'Segments', metric: 'segments', value: kpis?.segments },
    { label: 'Abuse alerts open', metric: 'promoAbuseOpen', value: kpis?.promoAbuseOpen },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>08 · Growth Overview</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
          Live KPIs from campaigns, segments, referrals, VIP, and freebet grants. Click any tile for details.
        </p>
        {error && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.78rem' }}>{error}</p>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
        {cards.map((c) => (
          <AdminKPI
            key={c.label}
            label={c.label}
            value={c.value ?? '—'}
            accent="#64748b"
            source="Details"
            onClick={() => drill.openDrilldown(c.metric, c.label)}
          />
        ))}
      </div>
      <AdminKpiDrillDrawer drill={drill} />
      {notes.map((n) => (
        <p key={n} style={{ margin: '0 0 4px', fontSize: '0.74rem', color: 'var(--admin-text-muted)' }}>{n}</p>
      ))}
    </div>
  );
}

function PromoRoiPanel() {
  const [roiRows, setRoiRows] = useState([]);
  const [roiNote, setRoiNote] = useState(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const na = (v) => (v == null || v === 'N/A' ? 'N/A' : v);

  const load = useCallback(() => {
    const params = new URLSearchParams({ limit: '100' });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    adminApiClient.get(`/growth/promo-roi?${params}`)
      .then((data) => {
        setRoiRows(data.rows || []);
        setRoiNote(data.note || null);
      })
      .catch((err) => {
        setRoiRows([]);
        setRoiNote(err.message || 'Promo ROI unavailable');
      });
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>Promotion ROI</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
          Real attributable deposits/bets only. GGR/NGR = N/A (not fabricated).
        </p>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <input className="admin-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input className="admin-input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <button type="button" className="admin-btn admin-btn--primary" onClick={load}>Apply</button>
      </div>
      <AdminDataTable
        title="Campaign comparison"
        emptyMessage="No promo ROI rows"
        data={roiRows}
        columns={[
          { header: 'Campaign', key: 'name', render: (r) => <span style={{ fontWeight: 700 }}>{r.name}</span> },
          { header: 'Targeted', key: 'targeted', render: (r) => na(r.targeted) },
          { header: 'Emails', key: 'emailsSent', render: (r) => na(r.emailsSent) },
          { header: 'Claims', key: 'grants', render: (r) => na(r.grants) },
          { header: 'Cost', key: 'cost', render: (r) => (r.cost == null ? 'N/A' : money(r.cost)) },
          { header: 'Attr. deposits', key: 'attributedDeposits', render: (r) => (r.attributedDeposits == null ? 'N/A' : money(r.attributedDeposits)) },
          { header: 'Abuse blocks', key: 'abuseBlocks' },
          { header: 'GGR', key: 'grossGamingRevenue', render: () => 'N/A', hideOnMobile: true },
          {
            header: 'ROI',
            key: 'roi',
            render: (r) => (r.roi == null ? 'N/A' : `${(Number(r.roi) * 100).toFixed(1)}%`),
          },
          { header: 'Attribution', key: 'attribution', hideOnMobile: true, priority: 'low' },
        ]}
      />
      {roiNote && <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.76rem' }}>{roiNote}</p>}
    </div>
  );
}

const BUILTIN_SEGMENTS = [
  'NEW', 'ACTIVE', 'INACTIVE', 'HIGH_VALUE', 'VIP', 'REFERRAL', 'PROMO_USERS', 'HIGH_RISK',
  'RECENT_DEPOSIT', 'RECENT_WITHDRAWAL', 'NEVER_DEPOSITED', 'DEPOSITED_NEVER_BET',
  'STOPPED_BETTING', 'HIGH_DEPOSIT_INACTIVE', 'KYC_VERIFIED', 'KYC_PENDING',
];

function CrmSegmentsPanel() {
  const [segments, setSegments] = useState([]);
  const [error, setError] = useState(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [matchMode, setMatchMode] = useState('all');
  const [conditions, setConditions] = useState([
    { field: 'total_deposits', operator: '>=', value: '10000' },
  ]);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);
  const [members, setMembers] = useState(null);
  const [busyId, setBusyId] = useState('');
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

  const parseCondValue = (value) => {
    if (['true', 'false'].includes(String(value).toLowerCase())) {
      return String(value).toLowerCase() === 'true';
    }
    if (String(value).includes(',')) {
      return String(value).split(',').map((s) => s.trim()).filter(Boolean);
    }
    return Number.isFinite(Number(value)) && String(value).trim() !== '' ? Number(value) : value;
  };

  const buildRules = () => ({
    match: matchMode === 'any' ? 'any' : 'all',
    conditions: conditions
      .filter((c) => c.field && String(c.value).trim() !== '')
      .map((c) => ({
        field: c.field,
        operator: c.operator,
        value: parseCondValue(c.value),
      })),
  });

  const create = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    const rules = buildRules();
    if (!rules.conditions.length) {
      showToast('Add at least one condition', 'error');
      return;
    }
    setSaving(true);
    try {
      await adminApiClient.post('/growth/segments', {
        name: name.trim().toUpperCase().replace(/\s+/g, '_'),
        description: description.trim() || null,
        rules,
        autoEvaluate: true,
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
        autoEvaluate: true,
      });
      showToast(`${segName} created`, 'success');
      load();
    } catch (err) {
      showToast(err.message || 'Seed failed', 'error');
    }
  };

  const runPreview = async (segmentId = null) => {
    setBusyId(segmentId || 'adhoc');
    try {
      const data = await adminApiClient.post('/growth/segments/preview', segmentId
        ? { segmentId, limit: 25 }
        : { rules: buildRules(), limit: 25 });
      setPreview(data);
      showToast(`${data.matched || 0} users match`, 'success');
    } catch (err) {
      showToast(err.message || 'Preview failed', 'error');
    } finally {
      setBusyId('');
    }
  };

  const refresh = async (segmentId) => {
    setBusyId(segmentId);
    try {
      const data = await adminApiClient.post(`/growth/segments/${encodeURIComponent(segmentId)}/refresh`, {});
      showToast(`Synced ${data.assigned || 0} members`, 'success');
      load();
    } catch (err) {
      showToast(err.message || 'Refresh failed', 'error');
    } finally {
      setBusyId('');
    }
  };

  const viewMembers = async (segmentId) => {
    setBusyId(`m_${segmentId}`);
    try {
      const data = await adminApiClient.get(`/growth/segments/${encodeURIComponent(segmentId)}/members?limit=50`);
      setMembers(data);
    } catch (err) {
      showToast(err.message || 'Members load failed', 'error');
    } finally {
      setBusyId('');
    }
  };

  const known = new Set(segments.map((s) => String(s.name || '').toUpperCase()));

  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>08 · CRM Segments</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
          Multi-condition AND/OR segments with preview, membership sync, and campaign exclusions.
        </p>
        {error && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.78rem' }}>{error}</p>}
      </div>

      <AdminCard title="Create segment" accent="#6366f1" style={{ marginBottom: 16 }}>
        <form onSubmit={create}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 12 }}>
            <div className="admin-form-group">
              <label className="admin-form-label">Name</label>
              <input className="admin-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="HIGH_DEPOSIT_INACTIVE" required />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">Description</label>
              <input className="admin-input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">Match</label>
              <select className="admin-input" value={matchMode} onChange={(e) => setMatchMode(e.target.value)}>
                <option value="all">ALL conditions (AND)</option>
                <option value="any">ANY condition (OR)</option>
              </select>
            </div>
          </div>
          {conditions.map((c, idx) => (
            <div key={`cond_${idx}`} style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.8fr 1fr auto', gap: 8, marginBottom: 8 }}>
              <select className="admin-input" value={c.field} onChange={(e) => setConditions((prev) => prev.map((row, i) => (i === idx ? { ...row, field: e.target.value } : row)))}>
                {['total_deposits', 'total_bets', 'total_stake', 'kyc_status', 'vip_tier', 'days_since_login', 'days_since_deposit', 'is_referral', 'risk_tier', 'promo_claims'].map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
              <select className="admin-input" value={c.operator} onChange={(e) => setConditions((prev) => prev.map((row, i) => (i === idx ? { ...row, operator: e.target.value } : row)))}>
                {['>=', '<=', '>', '<', '=', '!=', 'in', 'not_in'].map((op) => (
                  <option key={op} value={op}>{op}</option>
                ))}
              </select>
              <input className="admin-input" value={c.value} onChange={(e) => setConditions((prev) => prev.map((row, i) => (i === idx ? { ...row, value: e.target.value } : row)))} placeholder="value" />
              <button type="button" className="admin-btn admin-btn--sm" disabled={conditions.length <= 1} onClick={() => setConditions((prev) => prev.filter((_, i) => i !== idx))}>
                Remove
              </button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <button type="button" className="admin-btn admin-btn--secondary admin-btn--sm" onClick={() => setConditions((prev) => [...prev, { field: 'total_bets', operator: '=', value: '0' }])}>
              + Condition
            </button>
            <button type="submit" className="admin-btn admin-btn--primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save segment'}
            </button>
            <button type="button" className="admin-btn admin-btn--secondary" disabled={busyId === 'adhoc'} onClick={() => runPreview(null)}>
              Preview rules
            </button>
          </div>
        </form>
        <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {BUILTIN_SEGMENTS.filter((s) => !known.has(s)).map((s) => (
            <button key={s} type="button" className="admin-btn admin-btn--secondary admin-btn--sm" onClick={() => seedBuiltin(s)}>
              + {s}
            </button>
          ))}
        </div>
      </AdminCard>

      {preview && (
        <AdminCard title={`Preview · ${preview.matched || 0} matched`} accent="#0ea5e9" style={{ marginBottom: 16 }}>
          <AdminDataTable
            title="Sample users"
            emptyMessage="No matches"
            data={(preview.sample || []).map((u) => ({
              id: u.id,
              email: u.email,
              name: u.name,
              kyc: u.kyc,
              vip: u.vipTier,
              deposits: u.totalDeposits,
            }))}
            columns={[
              { header: 'User', key: 'id', render: (r) => <span className="admin-text-mono" style={{ fontSize: '0.76rem' }}>{r.id}</span> },
              { header: 'Email', key: 'email' },
              { header: 'KYC', key: 'kyc' },
              { header: 'VIP', key: 'vip' },
              { header: 'Deposits', key: 'deposits', render: (r) => money(r.deposits) },
            ]}
          />
        </AdminCard>
      )}

      {members && (
        <AdminCard title={`Members · ${members.name || ''} · ${members.total || 0}`} accent="#14b8a6" style={{ marginBottom: 16 }}>
          <AdminDataTable
            title="Segment members"
            emptyMessage="No members"
            data={members.members || []}
            columns={[
              { header: 'User', key: 'userId', render: (r) => <span className="admin-text-mono" style={{ fontSize: '0.76rem' }}>{r.userId}</span> },
              { header: 'Email', key: 'emailMask' },
              { header: 'KYC', key: 'kycStatus' },
              { header: 'VIP', key: 'vipTier' },
            ]}
          />
        </AdminCard>
      )}

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
          {
            header: 'Actions',
            key: 'actions',
            render: (r) => (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button type="button" className="admin-btn admin-btn--sm" disabled={busyId === r.id} onClick={() => runPreview(r.id)}>
                  Preview
                </button>
                <button type="button" className="admin-btn admin-btn--sm" disabled={busyId === `m_${r.id}`} onClick={() => viewMembers(r.id)}>
                  Members
                </button>
                <button type="button" className="admin-btn admin-btn--sm admin-btn--primary" disabled={busyId === r.id} onClick={() => refresh(r.id)}>
                  Sync
                </button>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}

function ReferralsAdminPanel() {
  const drillRef = useAdminKpiDrilldown();
  const [rows, setRows] = useState([]);
  const [metrics, setMetrics] = useState({});
  const [analytics, setAnalytics] = useState(null);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
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

  const loadAnalytics = useCallback(() => {
    const params = new URLSearchParams();
    params.set('limit', '25');
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    return adminApiClient.get(`/growth/referrals/analytics?${params}`)
      .then((data) => setAnalytics(data))
      .catch(() => setAnalytics(null));
  }, [from, to]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadAnalytics(); }, [loadAnalytics]);

  const retry = (id) => {
    adminApiClient.post(`/growth/referrals/${encodeURIComponent(id)}/retry-reward`, { reason: 'Admin retry' })
      .then((res) => {
        showToast(res.success ? 'Reward retry completed' : (res.reason || 'Not rewarded'), res.success ? 'success' : 'warning');
        load();
        loadAnalytics();
      })
      .catch((err) => showToast(err.message || 'Retry failed', 'error'));
  };

  const disableCode = (code) => {
    if (!code) return;
    if (!window.confirm(`Disable referral code ${code}? New signups with this code will be rejected.`)) return;
    adminApiClient.post(`/growth/referral-codes/${encodeURIComponent(code)}/disable`, { reason: 'Admin disable from Growth' })
      .then(() => {
        showToast(`Code ${code} disabled`, 'success');
        loadAnalytics();
      })
      .catch((err) => showToast(err.message || 'Disable failed', 'error'));
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

  const funnel = analytics?.funnel || {};
  const kpiTotal = funnel.total ?? metrics.total ?? metrics.total_count ?? rowCounts.total;
  const kpiPending = funnel.registered ?? metrics.pending ?? metrics.pending_count ?? rowCounts.pending;
  const kpiQualified = funnel.qualified ?? metrics.qualified ?? metrics.qualified_count ?? rowCounts.qualified;
  const kpiRewarded = funnel.rewarded ?? metrics.rewarded ?? metrics.rewarded_count ?? rowCounts.rewarded;
  const kpiRewardValue = funnel.reward_value ?? metrics.reward_value ?? metrics.rewardValue;

  return (
    <div>
      <h2 style={{ margin: '0 0 8px', fontSize: '1.25rem', fontWeight: 800, color: 'var(--admin-text)' }}>Referral Program</h2>
      <p style={{ margin: '0 0 16px', color: 'var(--admin-text-muted)', fontSize: '0.85rem' }}>
        User-to-user referrals. Free bet rewards grant on signup attribution (not deposit-locked). Signup promos cannot combine with referral.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
        {[
          ['Total', 'referralActivityToday', kpiTotal],
          ['Registered', 'referralActivityToday', kpiPending],
          ['Qualified', 'referralActivityToday', kpiQualified],
          ['Rewarded', 'referralActivityToday', kpiRewarded],
          ['Reward value', 'referralActivityToday', money(kpiRewardValue)],
          ['Fraud review', 'promotionAbuse', funnel.fraud_review ?? analytics?.abuse?.fraud_review],
        ].map(([label, metric, val]) => (
          <AdminKPI
            key={label}
            label={label}
            value={val ?? '—'}
            accent="#64748b"
            source="Details"
            onClick={() => drillRef.openDrilldown(metric, label)}
          />
        ))}
      </div>
      <AdminKpiDrillDrawer drill={drillRef} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
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
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} title="Analytics from" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} title="Analytics to" />
        <button type="button" onClick={() => { load(); loadAnalytics(); }}>Refresh</button>
      </div>
      {error && <p style={{ color: '#b91c1c' }}>{error}</p>}

      <AdminCard title="Top referrers" accent="#10b981" style={{ marginBottom: 16 }}>
        <AdminDataTable
          title="By invite volume"
          emptyMessage="No referral analytics yet"
          data={analytics?.topReferrers || []}
          columns={[
            { header: 'Referrer', key: 'referrerName', render: (r) => r.referrerName || r.referrerUserId },
            { header: 'Code', key: 'referralCode', render: (r) => <span className="admin-text-mono">{r.referralCode || '—'}</span> },
            { header: 'Invites', key: 'invites' },
            { header: 'Qualified', key: 'qualified' },
            { header: 'Rewarded', key: 'rewarded' },
            { header: 'Reward earned', key: 'rewardEarned', render: (r) => money(r.rewardEarned) },
            { header: 'Referred deposits', key: 'referredDeposits', render: (r) => money(r.referredDeposits) },
            { header: 'Referred turnover', key: 'referredTurnover', render: (r) => money(r.referredTurnover) },
            {
              header: 'Actions',
              key: 'actions',
              render: (r) => (
                <button
                  type="button"
                  className="admin-btn admin-btn--sm admin-btn--danger"
                  disabled={!r.referralCode}
                  onClick={() => disableCode(r.referralCode)}
                >
                  Disable code
                </button>
              ),
            },
          ]}
        />
      </AdminCard>

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

function PromoAbuseAlertsPanel() {
  const [alerts, setAlerts] = useState([]);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const { showToast } = useAdminToast();

  const load = useCallback(() => {
    return adminApiClient.get('/growth/promo-abuse-alerts?limit=100')
      .then((data) => {
        setAlerts(data.alerts || []);
        setError(data.error || null);
      })
      .catch((err) => {
        setAlerts([]);
        setError(err.message || 'Failed to load promo abuse alerts');
      });
  }, []);

  useEffect(() => { load(); }, [load]);

  const resolve = async (row) => {
    if (!row?.alert_id && !row?.id) return;
    const id = row.alert_id || row.id;
    setBusyId(id);
    try {
      await adminApiClient.post(`/growth/promo-abuse-alerts/${encodeURIComponent(id)}/resolve`, {
        status: 'RESOLVED',
        notes: 'Resolved from Growth admin',
      });
      showToast(`Alert ${id} resolved`, 'success');
      load();
    } catch (err) {
      showToast(err.message || 'Resolve failed', 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>08 · Promo Abuse Alerts</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
          Open promotion abuse signals from eligibility checks. Resolve after review — does not reverse grants automatically.
        </p>
        {error && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.78rem' }}>{error}</p>}
      </div>

      <AdminDataTable
        title="Promo abuse alerts"
        emptyMessage="No promo abuse alerts"
        data={alerts}
        onRefresh={load}
        columns={[
          { header: 'Alert ID', key: 'alert_id', render: (r) => r.alert_id || r.id || '—' },
          { header: 'User', key: 'user_mask', render: (r) => r.user_mask || r.user_id || '—' },
          { header: 'Rule', key: 'rule_key' },
          { header: 'Code', key: 'promotion_code', render: (r) => r.promotion_code || '—' },
          {
            header: 'Risk',
            key: 'risk_level',
            render: (r) => (
              <span style={{ fontWeight: 700, fontSize: '0.72rem' }}>
                {r.risk_level || '—'}{r.risk_score != null ? ` (${r.risk_score})` : ''}
              </span>
            ),
          },
          { header: 'Status', key: 'status', render: (r) => <StatusBadge status={r.status || 'OPEN'} /> },
          {
            header: 'Created',
            key: 'created_at',
            render: (r) => (r.created_at ? new Date(r.created_at).toLocaleString('en-IN') : '—'),
          },
          {
            header: 'Action',
            key: 'action',
            sortable: false,
            render: (r) => {
              const id = r.alert_id || r.id;
              const closed = ['RESOLVED', 'DISMISSED', 'ACKNOWLEDGED'].includes(String(r.status || '').toUpperCase());
              if (closed) {
                return <span style={{ fontSize: '0.72rem', color: 'var(--admin-text-muted)' }}>Closed</span>;
              }
              return (
                <button
                  type="button"
                  className="admin-btn admin-btn--primary admin-btn--sm"
                  disabled={busyId === id}
                  onClick={() => resolve(r)}
                >
                  {busyId === id ? 'Resolving…' : 'Resolve'}
                </button>
              );
            },
          },
        ]}
      />
    </div>
  );
}
