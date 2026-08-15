import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { adminApiClient } from '../api/adminApiClient';
import AdminDataTable from '../components/AdminDataTable';
import { useAdminToast } from '../components/AdminToastContext';

export default function SupportDomainView({ subModule = 'ticket-queue' }) {
  const [tickets, setTickets] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [replyMessage, setReplyMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const { showToast } = useAdminToast();
  const replyRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    adminApiClient.get('/support/tickets')
      .then((data) => {
        if (cancelled) return;
        setTickets(data.tickets || []);
        setError(data.note || null);
      })
      .catch((err) => {
        if (cancelled) return;
        setTickets([]);
        setError(err.message || 'Failed to load tickets');
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selectedTicket) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setSelectedTicket(null);
        setReplyMessage('');
      }
    };
    window.addEventListener('keydown', onKey);
    const t = setTimeout(() => replyRef.current?.focus(), 120);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(t);
    };
  }, [selectedTicket]);

  const openTicket = (ticket) => {
    setSelectedTicket(ticket);
    setReplyMessage('');
  };

  const closeTicket = () => {
    setSelectedTicket(null);
    setReplyMessage('');
  };

  const handleSendReply = () => {
    if (!replyMessage.trim() || !selectedTicket || sending) return;
    setSending(true);
    adminApiClient.post(`/support/tickets/${selectedTicket.id}/reply`, { text: replyMessage })
      .then(() => {
        showToast(`Reply sent on ${selectedTicket.id}.`, 'success');
        setReplyMessage('');
        closeTicket();
      })
      .catch((err) => showToast(err.message || 'Reply failed', 'error'))
      .finally(() => setSending(false));
  };

  const filteredTickets = (() => {
    if (subModule === 'sla-alerts') {
      return tickets.filter((t) => String(t.sla || '').toUpperCase().includes('BREACH'));
    }
    if (subModule === 'chat-console') {
      return tickets.filter((t) => {
        const s = String(t.status || '').toUpperCase();
        return s !== 'RESOLVED' && s !== 'CLOSED';
      });
    }
    return tickets;
  })();

  const titles = {
    'ticket-queue': ['07 · Support Ticket Queue', 'Support conversations from PostgreSQL. Open a ticket to reply without leaving the queue.', 'Active Support Ticket Queue'],
    'sla-alerts': ['07 · SLA Breach Monitoring', 'Tickets currently outside SLA windows.', 'SLA Breached Tickets'],
    'chat-console': ['07 · Real-time Agent Console', 'Open tickets still needing agent attention.', 'Open Agent Workload'],
  };
  const [heading, hint, tableTitle] = titles[subModule] || titles['ticket-queue'];

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>{heading}</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted, var(--color-text-muted))', fontSize: '0.85rem' }}>
          {hint}
        </p>
        {error && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.82rem' }}>{error}</p>}
      </div>

      <AdminDataTable
        title={tableTitle}
        emptyMessage="No support tickets in this view"
        data={filteredTickets}
        onRowClick={openTicket}
        columns={[
          { header: 'Ticket ID', key: 'id' },
          { header: 'Customer', key: 'userName', render: (r) => r.userName || r.userId },
          { header: 'Subject', key: 'subject' },
          { header: 'Category', key: 'category' },
          {
            header: 'Priority',
            key: 'priority',
            render: (r) => (
              <span style={{
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '0.75rem',
                fontWeight: 700,
                background: r.priority === 'HIGH' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                color: r.priority === 'HIGH' ? '#ef4444' : '#60a5fa',
              }}>
                {r.priority}
              </span>
            ),
          },
          { header: 'Status', key: 'status' },
          { header: 'Assigned Agent', key: 'agent' },
          {
            header: 'Actions',
            key: 'actions',
            sortable: false,
            render: (r) => (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openTicket(r);
                }}
                style={{
                  padding: '4px 10px',
                  borderRadius: '4px',
                  border: '1px solid var(--admin-border, var(--color-border))',
                  background: 'var(--admin-panel, var(--color-panel))',
                  color: '#60a5fa',
                  cursor: 'pointer',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                }}
              >
                Open Ticket
              </button>
            ),
          },
        ]}
      />

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {selectedTicket && (
            <>
              <motion.button
                type="button"
                aria-label="Close ticket drawer"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={closeTicket}
                style={{
                  position: 'fixed',
                  inset: 0,
                  border: 'none',
                  background: 'rgba(2, 6, 23, 0.55)',
                  backdropFilter: 'blur(3px)',
                  zIndex: 120000,
                  cursor: 'pointer',
                }}
              />
              <motion.aside
                role="dialog"
                aria-modal="true"
                aria-label={`Ticket ${selectedTicket.id}`}
                initial={{ x: '100%', opacity: 0.6 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: '100%', opacity: 0.6 }}
                transition={{ type: 'spring', stiffness: 380, damping: 34 }}
                style={{
                  position: 'fixed',
                  top: 0,
                  right: 0,
                  height: '100vh',
                  width: 'min(440px, 100vw)',
                  zIndex: 120001,
                  display: 'flex',
                  flexDirection: 'column',
                  background: 'var(--admin-panel)',
                  borderLeft: '1px solid var(--admin-border)',
                  boxShadow: 'var(--admin-shadow)',
                  color: 'var(--admin-text)',
                }}
              >
                <div style={{
                  padding: '18px 20px',
                  borderBottom: '1px solid var(--admin-border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '12px',
                  alignItems: 'flex-start',
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--admin-text-muted)' }}>
                      Support ticket
                    </div>
                    <h3 style={{ margin: '6px 0 0', fontSize: '1.05rem', fontWeight: 800, lineHeight: 1.3 }}>
                      {selectedTicket.subject}
                    </h3>
                    <div style={{ marginTop: '6px', fontSize: '0.75rem', color: 'var(--admin-text-muted)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                      {selectedTicket.id}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={closeTicket}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      border: '1px solid var(--admin-border)',
                      background: 'var(--admin-input-bg)',
                      color: 'var(--admin-text)',
                      cursor: 'pointer',
                      fontSize: '1rem',
                      flexShrink: 0,
                    }}
                  >
                    ✕
                  </button>
                </div>

                <div style={{ padding: '16px 20px', display: 'grid', gap: 10, borderBottom: '1px solid var(--admin-border)' }}>
                  {[
                    ['Customer', selectedTicket.userName || selectedTicket.userId || '—'],
                    ['Category', selectedTicket.category || '—'],
                    ['Priority', selectedTicket.priority || '—'],
                    ['Status', selectedTicket.status || '—'],
                    ['Agent', selectedTicket.agent || 'Unassigned'],
                    ['SLA', selectedTicket.sla || '—'],
                  ].map(([label, value]) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: '0.82rem' }}>
                      <span style={{ color: 'var(--admin-text-muted)', fontWeight: 600 }}>{label}</span>
                      <strong style={{ textAlign: 'right' }}>{value}</strong>
                    </div>
                  ))}
                </div>

                <div style={{ flex: 1, minHeight: 0, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--admin-text-muted)' }}>
                    Agent reply
                  </label>
                  <textarea
                    ref={replyRef}
                    value={replyMessage}
                    onChange={(e) => setReplyMessage(e.target.value)}
                    rows={8}
                    placeholder="Type your official support response…"
                    style={{
                      flex: 1,
                      minHeight: 160,
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: 10,
                      border: '1px solid var(--admin-border)',
                      background: 'var(--admin-input-bg)',
                      color: 'var(--admin-text)',
                      fontSize: '0.9rem',
                      lineHeight: 1.45,
                      resize: 'vertical',
                      outline: 'none',
                    }}
                  />
                </div>

                <div style={{
                  padding: '16px 20px',
                  borderTop: '1px solid var(--admin-border)',
                  display: 'flex',
                  gap: 10,
                }}>
                  <button
                    type="button"
                    onClick={closeTicket}
                    style={{
                      flex: 1,
                      padding: '11px 14px',
                      borderRadius: 10,
                      border: '1px solid var(--admin-border)',
                      background: 'transparent',
                      color: 'var(--admin-text)',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSendReply}
                    disabled={sending || !replyMessage.trim()}
                    style={{
                      flex: 1.4,
                      padding: '11px 14px',
                      borderRadius: 10,
                      border: 'none',
                      background: sending || !replyMessage.trim() ? '#475569' : '#2563eb',
                      color: '#fff',
                      fontWeight: 750,
                      cursor: sending || !replyMessage.trim() ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {sending ? 'Sending…' : 'Send Response'}
                  </button>
                </div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
