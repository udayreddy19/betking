import React, { useState, useEffect, useMemo } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import AdminDataTable from '../components/AdminDataTable';
import { useAdminToast } from '../components/AdminToastContext';
import { StatusBadge } from '../components/AdminBadge';
import { AdminHub } from '../components/AdminTabs';

const FAILED_STATUSES = new Set(['FAILED', 'ERROR', 'DEAD_LETTER', 'DLQ', 'BOUNCED', 'REJECTED']);

function BroadcastPanel() {
  const [title, setTitle] = useState('Announcement');
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState('TRANSACTIONAL');
  const [limit, setLimit] = useState('500');
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const { showToast } = useAdminToast();

  const handleSend = async (e) => {
    e.preventDefault();
    if (!message.trim()) {
      showToast('Message is required', 'error');
      return;
    }
    setSending(true);
    try {
      const res = await adminApiClient.post('/communications/broadcast', {
        title: title.trim() || 'Announcement',
        message: message.trim(),
        category,
        limit: Number(limit) || 500,
      });
      setLastResult(res);
      showToast(`Broadcast sent to ${res.sent ?? 0} users`, 'success');
    } catch (err) {
      showToast(err.message || 'Broadcast failed', 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <h2 className="admin-page-header__title">Broadcast Notification</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
          Send an in-app notification to recent users (capped by limit).
        </p>
      </div>
      <form onSubmit={handleSend} style={{
        maxWidth: 520,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: 16,
        borderRadius: 12,
        border: '1px solid var(--admin-border)',
        background: 'var(--admin-surface)',
      }}
      >
        <label style={{ fontSize: '0.76rem', fontWeight: 700 }}>
          Title
          <input
            className="admin-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: 4 }}
          />
        </label>
        <label style={{ fontSize: '0.76rem', fontWeight: 700 }}>
          Message
          <textarea
            className="admin-input"
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
            style={{ display: 'block', width: '100%', marginTop: 4, resize: 'vertical' }}
          />
        </label>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <label style={{ fontSize: '0.76rem', fontWeight: 700, flex: '1 1 140px' }}>
            Category
            <select
              className="admin-input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={{ display: 'block', width: '100%', marginTop: 4 }}
            >
              <option value="TRANSACTIONAL">TRANSACTIONAL</option>
              <option value="PROMOTIONAL">PROMOTIONAL</option>
            </select>
          </label>
          <label style={{ fontSize: '0.76rem', fontWeight: 700, flex: '1 1 100px' }}>
            Limit
            <input
              className="admin-input"
              type="number"
              min="1"
              max="2000"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              style={{ display: 'block', width: '100%', marginTop: 4 }}
            />
          </label>
        </div>
        <button type="submit" className="admin-btn admin-btn--primary" disabled={sending}>
          {sending ? 'Sending…' : 'Send broadcast'}
        </button>
        {lastResult && (
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--admin-text-muted)' }}>
            Last run: {lastResult.sent ?? 0} sent · {lastResult.skipped ?? 0} skipped · {lastResult.failed ?? 0} failed
            (of {lastResult.total ?? '—'})
          </p>
        )}
      </form>
    </div>
  );
}

export default function CommunicationsDomainView({ subModule = 'dispatch-logs' }) {
  const inboxIds = ['mail-inbox', 'dispatch-logs', 'dlq-retry'];
  if (inboxIds.includes(subModule)) {
    const initial = subModule === 'mail-inbox' ? 'dispatch-logs' : subModule;
    return (
      <AdminHub
        initialTab={initial}
        tabs={[
          { id: 'dispatch-logs', label: 'Sent' },
          { id: 'dlq-retry', label: 'Failed' },
        ]}
      >
        {(tab) => <CommunicationsPanels subModule={tab} />}
      </AdminHub>
    );
  }
  return <CommunicationsPanels subModule={subModule} />;
}

function CommunicationsPanels({ subModule = 'dispatch-logs' }) {
  const [logs, setLogs] = useState([]);
  const [outboxEvents, setOutboxEvents] = useState([]);
  const [error, setError] = useState(null);
  const { showToast } = useAdminToast();

  useEffect(() => {
    if (subModule === 'broadcast') return undefined;
    let cancelled = false;
    const load = async () => {
      try {
        const data = await adminApiClient.get('/communications/logs');
        if (cancelled) return;
        setLogs(data.logs || []);
        setError(data.note || null);
      } catch (err) {
        if (cancelled) return;
        setLogs([]);
        setError(err.message || 'Failed to load communication logs');
      }
      if (subModule === 'dlq-retry') {
        try {
          const outbox = await adminApiClient.get('/outbox/events');
          if (cancelled) return;
          const failed = (outbox.events || []).filter((e) =>
            ['FAILED', 'DEAD_LETTER'].includes(String(e.status || '').toUpperCase()),
          );
          setOutboxEvents(failed);
        } catch {
          if (!cancelled) setOutboxEvents([]);
        }
      } else {
        setOutboxEvents([]);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [subModule]);

  // Hooks must run unconditionally (before any early return).
  const templates = useMemo(() => {
    const map = new Map();
    logs.forEach((log) => {
      const key = log.template || 'unknown';
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          template: key,
          channel: log.channel || '—',
          provider: log.provider || '—',
          deliveries: 0,
          lastSent: log.sentAt || '—',
        });
      }
      const row = map.get(key);
      row.deliveries += 1;
      if (log.sentAt && log.sentAt > row.lastSent) row.lastSent = log.sentAt;
    });
    return Array.from(map.values());
  }, [logs]);

  const failedLogs = useMemo(
    () => logs.filter((log) => FAILED_STATUSES.has(String(log.status || '').toUpperCase())),
    [logs],
  );

  const outboxRows = useMemo(
    () => outboxEvents.map((e) => ({
      id: e.id,
      channel: 'OUTBOX',
      recipient: e.aggregateId || '—',
      template: e.eventType || '—',
      provider: e.aggregateType || 'outbox',
      status: e.status,
      sentAt: e.createdAt || '—',
      source: 'outbox',
    })),
    [outboxEvents],
  );

  if (subModule === 'broadcast') {
    return <BroadcastPanel />;
  }

  const handleRetry = (log) => {
    if (log.source === 'outbox') {
      showToast('Outbox events are retried by the outbox worker — no manual webhook retry', 'info');
      return;
    }
    adminApiClient.post(`/communications/logs/${encodeURIComponent(log.id)}/retry`)
      .then(() => {
        showToast(`Retry queued for ${log.id}`, 'success');
        setLogs((prev) => prev.map((row) => (row.id === log.id ? { ...row, status: 'QUEUED' } : row)));
      })
      .catch((err) => showToast(err.message || 'Retry failed', 'error'));
  };

  const titles = {
    'dispatch-logs': ['Notification Delivery Logs', 'Webhook / notification delivery records from the database.', 'Notification Delivery Logs', logs],
    templates: ['Message Templates', 'Distinct templates inferred from recent delivery logs.', 'Active Message Templates', templates],
    'dlq-retry': ['Dead Letter Queue Retries', 'Webhook DLQ plus outbox FAILED / DEAD_LETTER events.', 'Failed Deliveries (DLQ)', failedLogs],
  };
  const [heading, hint, tableTitle, data] = titles[subModule] || titles['dispatch-logs'];

  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <h2 className="admin-page-header__title">{heading}</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
          {hint}
        </p>
        {error && <p style={{ margin: '8px 0 0', color: '#fbbf24', fontSize: '0.78rem' }}>{error}</p>}
      </div>

      {subModule === 'templates' ? (
        <AdminDataTable
          title={tableTitle}
          emptyMessage="No templates found in delivery logs yet"
          data={data}
          columns={[
            { header: 'Template ID', key: 'template', render: (r) => <span className="admin-text-mono" style={{ fontWeight: 700 }}>{r.template}</span> },
            { header: 'Channel', key: 'channel', render: (r) => <span className="admin-badge admin-badge--neutral">{r.channel}</span> },
            { header: 'Provider', key: 'provider' },
            { header: 'Deliveries', key: 'deliveries', render: (r) => <span style={{ fontWeight: 700 }}>{r.deliveries}</span> },
            { header: 'Last Sent', key: 'lastSent' },
          ]}
        />
      ) : (
        <>
          <AdminDataTable
            title={tableTitle}
            emptyMessage={subModule === 'dlq-retry' ? 'No failed webhook deliveries in DLQ' : 'No notification deliveries recorded yet'}
            data={data}
            columns={[
              { header: 'Message ID', key: 'id', render: (r) => <span className="admin-text-mono" style={{ fontSize: '0.76rem' }}>{r.id}</span> },
              { header: 'Channel', key: 'channel', render: (r) => <span className="admin-badge admin-badge--neutral">{r.channel}</span> },
              { header: 'Recipient', key: 'recipient', render: (r) => <span style={{ fontWeight: 600 }}>{r.recipient}</span> },
              { header: 'Template', key: 'template', hideOnMobile: true },
              { header: 'Provider', key: 'provider', hideOnMobile: true },
              {
                header: 'Status',
                key: 'status',
                render: (r) => <StatusBadge status={r.status} />,
              },
              { header: 'Sent At', key: 'sentAt' },
              ...(subModule === 'dlq-retry' ? [{
                header: 'Retry',
                key: 'retry',
                sortable: false,
                render: (r) => (
                  <button
                    type="button"
                    onClick={() => handleRetry(r)}
                    className="admin-btn admin-btn--primary admin-btn--sm"
                  >
                    Queue Retry
                  </button>
                ),
              }] : []),
            ]}
          />
          {subModule === 'dlq-retry' && (
            <AdminDataTable
              title="Outbox FAILED / DEAD_LETTER"
              emptyMessage="No failed outbox events"
              data={outboxRows}
              columns={[
                { header: 'Event ID', key: 'id', render: (r) => <span className="admin-text-mono" style={{ fontSize: '0.76rem' }}>{r.id}</span> },
                { header: 'Channel', key: 'channel', render: (r) => <span className="admin-badge admin-badge--neutral">{r.channel}</span> },
                { header: 'Aggregate', key: 'recipient' },
                { header: 'Event type', key: 'template' },
                { header: 'Type', key: 'provider', hideOnMobile: true },
                {
                  header: 'Status',
                  key: 'status',
                  render: (r) => <StatusBadge status={r.status} />,
                },
                { header: 'Created', key: 'sentAt' },
              ]}
            />
          )}
        </>
      )}
    </div>
  );
}
