import React, { useCallback, useEffect, useState } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import { useAdminToast } from './AdminToastContext';
import AdminPageHeader from './AdminPageHeader';
import { formatIstDateTime } from '../../../utils/istTime';

function BoolSelect({ value, onChange, id }) {
  return (
    <select
      id={id}
      className="admin-select"
      value={value ? 'true' : 'false'}
      onChange={(e) => onChange(e.target.value === 'true')}
    >
      <option value="true">On</option>
      <option value="false">Off</option>
    </select>
  );
}

function Field({ label, children }) {
  return (
    <label className="admin-growth-auto__field">
      <span className="admin-growth-auto__label">{label}</span>
      {children}
    </label>
  );
}

/**
 * Operator controls for activation nudge + KYC auto-reminder workers.
 */
export default function GrowthAutomationPanel() {
  const { showToast } = useAdminToast();
  const [config, setConfig] = useState(null);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(null);

  const load = useCallback(() => {
    adminApiClient.get('/growth/automation')
      .then((data) => {
        setConfig(data.config || null);
        setDraft(null);
        setError(null);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load growth automation');
      });
  }, []);

  useEffect(() => { load(); }, [load]);

  const edit = draft || config;
  if (!edit && !error) {
    return <p className="admin-growth-auto__muted">Loading growth automation…</p>;
  }

  const setAct = (patch) => {
    const base = draft || config;
    setDraft({
      ...base,
      activation: { ...base.activation, ...patch },
    });
  };
  const setKyc = (patch) => {
    const base = draft || config;
    setDraft({
      ...base,
      kycReminder: { ...base.kycReminder, ...patch },
    });
  };

  const save = async () => {
    if (!edit) return;
    setSaving(true);
    try {
      const res = await adminApiClient.put('/growth/automation', {
        activation: {
          enabled: edit.activation.enabled,
          cooldownHours: Number(edit.activation.cooldownHours),
          lookbackHours: Number(edit.activation.lookbackHours),
          batchLimit: Number(edit.activation.batchLimit),
        },
        kycReminder: {
          enabled: edit.kycReminder.enabled,
          lookbackDays: Number(edit.kycReminder.lookbackDays),
          batchLimit: Number(edit.kycReminder.batchLimit),
        },
        reason: 'Admin Ops growth automation',
      });
      setConfig(res.config);
      setDraft(null);
      showToast('Growth automation saved', 'success');
    } catch (err) {
      showToast(err.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const run = async (kind) => {
    setRunning(kind);
    try {
      const res = await adminApiClient.post('/growth/automation/run', { kind });
      if (res.config) setConfig(res.config);
      setDraft(null);
      const r = res.result || {};
      if (kind === 'activation') {
        showToast(
          r.disabled
            ? 'Activation worker is Off — enable and save first'
            : `Activation run: checked ${r.checked ?? 0}, sent ${r.sent ?? 0}, skipped ${r.skipped ?? 0}`,
          r.disabled ? 'warning' : 'success',
        );
      } else {
        showToast(
          r.disabled
            ? 'KYC reminder worker is Off — enable and save first'
            : `KYC run: queued ${r.queued ?? 0}, skipped ${r.skipped ?? 0}`,
          r.disabled ? 'warning' : 'success',
        );
      }
    } catch (err) {
      showToast(err.message || 'Run failed', 'error');
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="admin-growth-auto">
      <AdminPageHeader
        title="Growth automation"
        subtitle="Turn on/off first-bet nudges and KYC reminder queues. Settings persist in platform config (env is the default)."
        actions={(
          <div className="admin-tower-toolbar">
            <button type="button" className="admin-btn admin-btn--sm" onClick={load}>Refresh</button>
            <button
              type="button"
              className="admin-btn admin-btn--sm admin-btn--primary"
              disabled={saving || !draft}
              onClick={save}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
        banner={error ? <p className="admin-page-header__error">{error}</p> : null}
      />

      {edit && (
        <div className="admin-growth-auto__grid">
          <section className="admin-panel">
            <div className="admin-panel__head">
              <h3 className="admin-section-title" style={{ margin: 0 }}>Activation nudge</h3>
              <button
                type="button"
                className="admin-btn admin-btn--sm"
                disabled={running === 'activation'}
                onClick={() => run('activation')}
              >
                {running === 'activation' ? 'Running…' : 'Run now'}
              </button>
            </div>
            <p className="admin-growth-auto__hint">
              Emails depositors who have not placed a first bet (no-reply mailbox). Hourly scheduler.
            </p>
            <div className="admin-growth-auto__fields">
              <Field label="Enabled">
                <BoolSelect
                  id="act-enabled"
                  value={!!edit.activation.enabled}
                  onChange={(v) => setAct({ enabled: v })}
                />
              </Field>
              <Field label="Cooldownback (hours)">
                <input
                  className="admin-input"
                  type="number"
                  min={6}
                  max={168}
                  value={edit.activation.lookbackHours}
                  onChange={(e) => setAct({ lookbackHours: e.target.value })}
                />
              </Field>
              <Field label="Cooldownoldown (hours)">
                <input
                  className="admin-input"
                  type="number"
                  min={6}
                  max={168}
                  value={edit.activation.cooldownHours}
                  onChange={(e) => setAct({ cooldownHours: e.target.value })}
                />
              </Field>
              <Field label="Batch limit">
                <input
                  className="admin-input"
                  type="number"
                  min={1}
                  max={100}
                  value={edit.activation.batchLimit}
                  onChange={(e) => setAct({ batchLimit: e.target.value })}
                />
              </Field>
            </div>
            <p className="admin-growth-auto__meta">
              Last run:{' '}
              {edit.activation.lastRunAt
                ? formatIstDateTime(edit.activation.lastRunAt)
                : '—'}
              {edit.activation.lastResult
                ? ` · checked ${edit.activation.lastResult.checked ?? 0}, sent ${edit.activation.lastResult.sent ?? 0}`
                : ''}
            </p>
          </section>

          <section className="admin-panel">
            <div className="admin-panel__head">
              <h3 className="admin-section-title" style={{ margin: 0 }}>KYC auto-reminders</h3>
              <button
                type="button"
                className="admin-btn admin-btn--sm"
                disabled={running === 'kycReminder'}
                onClick={() => run('kycReminder')}
              >
                {running === 'kycReminder' ? 'Running…' : 'Run now'}
              </button>
            </div>
            <p className="admin-growth-auto__hint">
              Queues KYC reminder emails for depositors who are not verified. Runs every 6 hours.
            </p>
            <div className="admin-growth-auto__fields">
              <Field label="Enabled">
                <BoolSelect
                  id="kyc-enabled"
                  value={!!edit.kycReminder.enabled}
                  onChange={(v) => setKyc({ enabled: v })}
                />
              </Field>
              <Field label="Lookback (days)">
                <input
                  className="admin-input"
                  type="number"
                  min={1}
                  max={90}
                  value={edit.kycReminder.lookbackDays}
                  onChange={(e) => setKyc({ lookbackDays: e.target.value })}
                />
              </Field>
              <Field label="Batch limit">
                <input
                  className="admin-input"
                  type="number"
                  min={1}
                  max={50}
                  value={edit.kycReminder.batchLimit}
                  onChange={(e) => setKyc({ batchLimit: e.target.value })}
                />
              </Field>
            </div>
            <p className="admin-growth-auto__meta">
              Last run:{' '}
              {edit.kycReminder.lastRunAt
                ? formatIstDateTime(edit.kycReminder.lastRunAt)
                : '—'}
              {edit.kycReminder.lastResult
                ? ` · queued ${edit.kycReminder.lastResult.queued ?? 0}, skipped ${edit.kycReminder.lastResult.skipped ?? 0}`
                : ''}
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
