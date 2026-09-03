import React, { useState, useEffect, useMemo } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import AdminDataTable from '../components/AdminDataTable';
import { useAdminToast } from '../components/AdminToastContext';
import { StatusBadge } from '../components/AdminBadge';
import { AdminHub } from '../components/AdminTabs';

const FAILED_STATUSES = new Set(['FAILED', 'ERROR', 'DEAD_LETTER', 'DLQ', 'BOUNCED', 'REJECTED']);

const FALLBACK_MAILBOXES = [
  { id: 'no-reply', email: 'no-reply@oddsyra.com', label: 'No-reply', description: 'Transactional / security notices' },
  { id: 'promos', email: 'promos@oddsyra.com', label: 'Promotions', description: 'Marketing and campaign emails' },
  { id: 'support', email: 'support@oddsyra.com', label: 'Support', description: 'Player support replies' },
  { id: 'alerts', email: 'alerts@oddsyra.com', label: 'Alerts', description: 'Ops / SLA notifications' },
];

const FALLBACK_TEMPLATES = [
  {
    id: 'blank',
    name: 'Blank',
    heading: 'Message from OddsYra',
    subject: '',
    body: '',
    ctaLabel: '',
    ctaPath: '',
    mailboxId: 'no-reply',
  },
  {
    id: 'support-update',
    name: 'Support update',
    heading: 'Update on your support request',
    subject: 'Update from OddsYra Support',
    body: 'Thanks for contacting OddsYra Support.\n\nWe have reviewed your request and wanted to share a quick update.\n\nIf you still need help, reply to this email or open your ticket in the app.',
    ctaLabel: 'Open support',
    ctaPath: '/profile?tab=support',
    mailboxId: 'support',
  },
  {
    id: 'account-notice',
    name: 'Account notice',
    heading: 'Account notice',
    subject: 'Important notice about your OddsYra account',
    body: 'We are writing with an important update about your OddsYra account.\n\nPlease review the details below and take any action required.\n\nIf this does not look right, contact support immediately.',
    ctaLabel: 'View account',
    ctaPath: '/profile',
    mailboxId: 'no-reply',
  },
  {
    id: 'promo-announce',
    name: 'Promo announcement',
    heading: 'A special offer for you',
    subject: 'Exclusive offer from OddsYra',
    body: 'We have a limited-time offer waiting for you on OddsYra.\n\nClaim it before it expires — terms apply.',
    ctaLabel: 'View promotions',
    ctaPath: '/promotions',
    mailboxId: 'promos',
  },
  {
    id: 'kyc-nudge',
    name: 'KYC reminder',
    heading: 'Complete your KYC',
    subject: 'Finish KYC to unlock full OddsYra access',
    body: 'Your OddsYra account is almost ready.\n\nComplete KYC verification to unlock higher limits and withdrawals.\n\nIt only takes a few minutes.',
    ctaLabel: 'Complete KYC',
    ctaPath: '/profile?tab=kyc',
    mailboxId: 'no-reply',
  },
  {
    id: 'welcome-back',
    name: 'Welcome back',
    heading: 'Welcome back to OddsYra',
    subject: 'We saved your spot at OddsYra',
    body: 'It has been a while — markets are live and fresh offers are waiting.\n\nLog in to pick up where you left off.',
    ctaLabel: 'Open OddsYra',
    ctaPath: '/sports',
    mailboxId: 'promos',
  },
];

function ComposeMailPanel() {
  const { showToast } = useAdminToast();
  const [mailboxes, setMailboxes] = useState(FALLBACK_MAILBOXES);
  const [templates, setTemplates] = useState(FALLBACK_TEMPLATES);
  const [mailboxId, setMailboxId] = useState('support');
  const [templateId, setTemplateId] = useState('blank');
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [heading, setHeading] = useState('Message from OddsYra');
  const [greetingName, setGreetingName] = useState('');
  const [body, setBody] = useState('');
  const [ctaLabel, setCtaLabel] = useState('');
  const [ctaPath, setCtaPath] = useState('');
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  useEffect(() => {
    let cancelled = false;
    adminApiClient.get('/communications/mailboxes')
      .then((data) => {
        if (cancelled) return;
        if (data.mailboxes?.length) setMailboxes(data.mailboxes);
        if (data.templates?.length) setTemplates(data.templates);
      })
      .catch(() => { /* keep fallbacks */ });
    return () => { cancelled = true; };
  }, []);

  const selectedMailbox = useMemo(
    () => mailboxes.find((m) => m.id === mailboxId) || mailboxes[0],
    [mailboxes, mailboxId],
  );

  const applyTemplate = (id) => {
    const tpl = templates.find((t) => t.id === id) || FALLBACK_TEMPLATES[0];
    setTemplateId(tpl.id);
    setMailboxId(tpl.mailboxId || mailboxId);
    setSubject(tpl.subject || '');
    setHeading(tpl.heading || 'Message from OddsYra');
    setBody(tpl.body || '');
    setCtaLabel(tpl.ctaLabel || '');
    setCtaPath(tpl.ctaPath || '');
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!to.trim() || !subject.trim() || !body.trim()) {
      showToast('To, subject, and body are required', 'error');
      return;
    }
    setSending(true);
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://oddsyra.com';
      const ctaHref = ctaPath.trim()
        ? (ctaPath.trim().startsWith('http') ? ctaPath.trim() : `${origin}${ctaPath.trim().startsWith('/') ? '' : '/'}${ctaPath.trim()}`)
        : undefined;
      const res = await adminApiClient.post('/communications/compose', {
        mailboxId,
        to: to.trim(),
        subject: subject.trim(),
        body: body.trim(),
        heading: heading.trim() || subject.trim(),
        greetingName: greetingName.trim() || undefined,
        ctaLabel: ctaLabel.trim() || undefined,
        ctaHref,
      });
      setLastResult(res);
      if (res.failed > 0) {
        showToast(`Sent ${res.sent || 0}, failed ${res.failed}`, 'error');
      } else {
        showToast(`Sent from ${res.mailbox?.email || selectedMailbox?.email} to ${res.sent || 0} recipient(s)`, 'success');
      }
    } catch (err) {
      showToast(err.message || 'Send failed', 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="admin-compose-mail">
      <div style={{ marginBottom: 16 }}>
        <h2 className="admin-page-header__title">Compose email</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
          Send branded OddsYra mail from any @oddsyra.com mailbox. Pick a template to fill subject and body instantly.
        </p>
      </div>

      <div className="admin-compose-mail__templates" role="list">
        {templates.map((tpl) => (
          <button
            key={tpl.id}
            type="button"
            role="listitem"
            className={`admin-compose-mail__tpl${templateId === tpl.id ? ' is-active' : ''}`}
            onClick={() => applyTemplate(tpl.id)}
          >
            {tpl.name}
          </button>
        ))}
      </div>

      <form onSubmit={handleSend} className="admin-compose-mail__form">
        <fieldset className="admin-compose-mail__from">
          <legend>Send from</legend>
          <div className="admin-compose-mail__mailboxes">
            {mailboxes.map((box) => (
              <label
                key={box.id}
                className={`admin-compose-mail__mailbox${mailboxId === box.id ? ' is-active' : ''}`}
              >
                <input
                  type="radio"
                  name="mailbox"
                  value={box.id}
                  checked={mailboxId === box.id}
                  onChange={() => setMailboxId(box.id)}
                />
                <span className="admin-compose-mail__mailbox-email">{box.email}</span>
                <span className="admin-compose-mail__mailbox-desc">{box.description || box.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="admin-compose-mail__label">
          To
          <input
            className="admin-input"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="player@email.com (comma-separate up to 25)"
            required
          />
        </label>

        <label className="admin-compose-mail__label">
          Subject
          <input
            className="admin-input"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Email subject"
            required
          />
        </label>

        <div className="admin-compose-mail__row">
          <label className="admin-compose-mail__label">
            Heading (in email)
            <input
              className="admin-input"
              value={heading}
              onChange={(e) => setHeading(e.target.value)}
              placeholder="Shown as the branded email title"
            />
          </label>
          <label className="admin-compose-mail__label">
            Greeting name (optional)
            <input
              className="admin-input"
              value={greetingName}
              onChange={(e) => setGreetingName(e.target.value)}
              placeholder="Hi {name},"
            />
          </label>
        </div>

        <label className="admin-compose-mail__label">
          Body
          <textarea
            className="admin-input"
            rows={8}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Plain text — blank lines become paragraphs"
            required
          />
        </label>

        <div className="admin-compose-mail__row">
          <label className="admin-compose-mail__label">
            CTA label (optional)
            <input
              className="admin-input"
              value={ctaLabel}
              onChange={(e) => setCtaLabel(e.target.value)}
              placeholder="e.g. Open support"
            />
          </label>
          <label className="admin-compose-mail__label">
            CTA path (optional)
            <input
              className="admin-input"
              value={ctaPath}
              onChange={(e) => setCtaPath(e.target.value)}
              placeholder="/profile or full URL"
            />
          </label>
        </div>

        <div className="admin-compose-mail__actions">
          <button type="submit" className="admin-btn admin-btn--primary" disabled={sending}>
            {sending ? 'Sending…' : `Send from ${selectedMailbox?.email || 'mailbox'}`}
          </button>
        </div>

        {lastResult && (
          <p className="admin-compose-mail__result">
            Last send: {lastResult.sent ?? 0} sent · {lastResult.failed ?? 0} failed
            {lastResult.mailbox?.email ? ` · from ${lastResult.mailbox.email}` : ''}
          </p>
        )}
      </form>
    </div>
  );
}

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
      <form
        onSubmit={handleSend}
        style={{
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
    if (subModule === 'broadcast' || subModule === 'compose') return undefined;
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

  if (subModule === 'compose') {
    return <ComposeMailPanel />;
  }

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
