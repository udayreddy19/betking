import React, { useCallback, useEffect, useRef, useState } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import AdminDataTable from '../components/AdminDataTable';
import { useAdminToast } from '../components/AdminToastContext';
import { StatusBadge } from '../components/AdminBadge';
import AdminDrawer from '../components/AdminDrawer';
import AdminCard from '../components/AdminCard';

function formatMsgTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function SupportDomainView({ subModule = 'ticket-queue' }) {
  const [tickets, setTickets] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [threadMessages, setThreadMessages] = useState([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [replyMessage, setReplyMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const { showToast } = useAdminToast();
  const replyRef = useRef(null);
  const threadEndRef = useRef(null);

  const loadTickets = useCallback(() => {
    adminApiClient.get('/support/tickets')
      .then((data) => {
        setTickets(data.tickets || []);
        setError(data.note || null);
      })
      .catch((err) => {
        setTickets([]);
        setError(err.message || 'Failed to load tickets');
      });
  }, []);

  const loadThread = useCallback((ticketId) => {
    if (!ticketId) return Promise.resolve();
    setLoadingThread(true);
    return adminApiClient.get(`/support/tickets/${ticketId}`)
      .then((data) => {
        const conv = data.conversation || data.ticket || {};
        setThreadMessages(Array.isArray(conv.messages) ? conv.messages : []);
        setSelectedTicket((prev) => (prev ? {
          ...prev,
          ...conv,
          id: prev.id || conv.conversationId,
          subject: conv.subject || prev.subject,
          status: conv.status || prev.status,
        } : prev));
      })
      .catch(() => setThreadMessages([]))
      .finally(() => setLoadingThread(false));
  }, []);

  useEffect(() => {
    loadTickets();
    const timer = setInterval(loadTickets, 15000);
    return () => clearInterval(timer);
  }, [loadTickets]);

  useEffect(() => {
    if (!selectedTicket?.id) return undefined;
    loadThread(selectedTicket.id);
    const timer = setInterval(() => loadThread(selectedTicket.id), 8000);
    return () => clearInterval(timer);
  }, [selectedTicket?.id, loadThread]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [threadMessages.length]);

  useEffect(() => {
    if (!selectedTicket) return undefined;
    const t = setTimeout(() => replyRef.current?.focus(), 150);
    return () => clearTimeout(t);
  }, [selectedTicket]);

  const openTicket = (ticket) => {
    setSelectedTicket(ticket);
    setReplyMessage('');
    setThreadMessages([]);
  };

  const dismissTicket = () => {
    setSelectedTicket(null);
    setReplyMessage('');
    setThreadMessages([]);
  };

  const isTicketClosed = (ticket) => {
    const s = String(ticket?.status || '').toUpperCase();
    return s === 'CLOSED' || s === 'RESOLVED';
  };

  const handleCloseTicket = (ticket) => {
    if (!ticket?.id || sending) return;
    setSending(true);
    adminApiClient.post(`/support/tickets/${ticket.id}/close`, {
      resolutionSummary: 'Closed by OddsYra support.',
    })
      .then(async () => {
        showToast(`Ticket ${ticket.id} closed.`, 'success');
        if (selectedTicket?.id === ticket.id) {
          setSelectedTicket((prev) => (prev ? { ...prev, status: 'CLOSED' } : prev));
          await loadThread(ticket.id);
        }
        loadTickets();
      })
      .catch((err) => showToast(err.message || 'Could not close ticket', 'error'))
      .finally(() => setSending(false));
  };

  const handleSendReply = () => {
    if (!replyMessage.trim() || !selectedTicket || sending) return;
    setSending(true);
    adminApiClient.post(`/support/tickets/${selectedTicket.id}/reply`, { text: replyMessage })
      .then(async () => {
        showToast(`Reply sent on ${selectedTicket.id}.`, 'success');
        setReplyMessage('');
        await loadThread(selectedTicket.id);
        loadTickets();
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
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>{heading}</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
          {hint}
        </p>
        {error && <p style={{ margin: '8px 0 0', color: '#f87171', fontSize: '0.78rem' }}>{error}</p>}
      </div>

      <AdminDataTable
        title={tableTitle}
        emptyMessage="No support tickets in this view"
        data={filteredTickets}
        onRowClick={openTicket}
        onRefresh={loadTickets}
        columns={[
          { header: 'Ticket ID', key: 'id', render: (r) => <span className="admin-text-mono" style={{ fontSize: '0.76rem' }}>{r.id}</span> },
          { header: 'Customer', key: 'userName', render: (r) => <span style={{ fontWeight: 700 }}>{r.userName || r.userId}</span> },
          { header: 'Subject', key: 'subject' },
          { header: 'Category', key: 'category', render: (r) => <span className="admin-badge admin-badge--neutral">{r.category}</span> },
          {
            header: 'Priority',
            key: 'priority',
            render: (r) => <StatusBadge status={r.priority} />,
          },
          { header: 'Status', key: 'status', render: (r) => <StatusBadge status={r.status} /> },
          { header: 'Assigned Agent', key: 'agent', render: (r) => r.agent || 'Unassigned' },
          {
            header: 'Actions',
            key: 'actions',
            sortable: false,
            render: (r) => (
              <div style={{ display: 'flex', gap: 5 }}>
                <button
                  type="button"
                  className="admin-btn admin-btn--secondary admin-btn--sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    openTicket(r);
                  }}
                  style={{ color: '#60a5fa' }}
                >
                  Open
                </button>
                {!isTicketClosed(r) && (
                  <button
                    type="button"
                    className="admin-btn admin-btn--success admin-btn--sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCloseTicket(r);
                    }}
                  >
                    Close
                  </button>
                )}
              </div>
            ),
          },
        ]}
      />

      {/* Support Thread Drawer */}
      <AdminDrawer
        isOpen={!!selectedTicket}
        onClose={dismissTicket}
        title={selectedTicket?.subject || 'Support Ticket'}
        subtitle={selectedTicket ? `${selectedTicket.id} · ${selectedTicket.userName || selectedTicket.userId || ''}` : ''}
        width="520px"
        actions={
          !isTicketClosed(selectedTicket) && (
            <button
              type="button"
              className="admin-btn admin-btn--success admin-btn--sm"
              onClick={() => handleCloseTicket(selectedTicket)}
              disabled={sending}
            >
              Close Ticket
            </button>
          )
        }
      >
        {selectedTicket && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '12px' }}>
            {/* Meta summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', padding: '10px', borderRadius: 'var(--admin-radius-sm)', background: 'var(--admin-bg)', border: '1px solid var(--admin-border)', fontSize: '0.78rem' }}>
              <div><span style={{ color: 'var(--admin-text-muted)' }}>Customer:</span> <strong>{selectedTicket.userName || selectedTicket.userId || '—'}</strong></div>
              <div><span style={{ color: 'var(--admin-text-muted)' }}>Category:</span> <strong>{selectedTicket.category || '—'}</strong></div>
              <div><span style={{ color: 'var(--admin-text-muted)' }}>Status:</span> <StatusBadge status={selectedTicket.status} /></div>
              <div><span style={{ color: 'var(--admin-text-muted)' }}>Agent:</span> <strong>{selectedTicket.agent || selectedTicket.assignedAgentName || 'Unassigned'}</strong></div>
            </div>

            {/* Messages feed */}
            <div style={{
              flex: 1,
              minHeight: '260px',
              maxHeight: '400px',
              overflowY: 'auto',
              padding: '12px',
              borderRadius: 'var(--admin-radius-sm)',
              background: 'var(--admin-bg)',
              border: '1px solid var(--admin-border)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}>
              {loadingThread && threadMessages.length === 0 && (
                <p style={{ color: 'var(--admin-text-muted)', fontSize: '0.82rem', margin: 'auto' }}>Loading conversation…</p>
              )}
              {!loadingThread && threadMessages.length === 0 && (
                <p style={{ color: 'var(--admin-text-muted)', fontSize: '0.82rem', margin: 'auto' }}>No messages yet.</p>
              )}
              {threadMessages.map((msg) => {
                const sender = String(msg.senderType || msg.sender_type || msg.sender || 'user').toLowerCase();
                const isAdmin = sender === 'admin';
                return (
                  <div
                    key={msg.messageId || msg.message_id || msg.id}
                    style={{
                      alignSelf: isAdmin ? 'flex-end' : 'flex-start',
                      maxWidth: '85%',
                      padding: '8px 12px',
                      borderRadius: 'var(--admin-radius-md)',
                      background: isAdmin ? 'rgba(99, 102, 241, 0.15)' : 'var(--admin-surface)',
                      border: `1px solid ${isAdmin ? 'rgba(99, 102, 241, 0.35)' : 'var(--admin-border)'}`,
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 8,
                      marginBottom: 3,
                      fontSize: '0.68rem',
                      color: 'var(--admin-text-muted)',
                      fontWeight: 700,
                    }}>
                      <span style={{ color: isAdmin ? '#818cf8' : 'var(--admin-text)' }}>
                        {isAdmin ? (msg.agentName || msg.agent_name || 'OddsYra Support') : 'Customer'}
                      </span>
                      <span>{formatMsgTime(msg.createdAt || msg.created_at || msg.deliveredAt)}</span>
                    </div>
                    <div style={{ fontSize: '0.84rem', lineHeight: 1.45, whiteSpace: 'pre-wrap', color: 'var(--admin-text)' }}>
                      {msg.text}
                    </div>
                  </div>
                );
              })}
              <div ref={threadEndRef} />
            </div>

            {/* Reply composer */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <textarea
                ref={replyRef}
                value={replyMessage}
                onChange={(e) => setReplyMessage(e.target.value)}
                rows={3}
                placeholder={isTicketClosed(selectedTicket) ? 'Ticket is closed.' : 'Type your support response…'}
                disabled={isTicketClosed(selectedTicket)}
                className="admin-input"
                style={{
                  width: '100%',
                  resize: 'vertical',
                  fontSize: '0.84rem',
                  lineHeight: 1.45,
                }}
              />
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="admin-btn admin-btn--secondary"
                  onClick={dismissTicket}
                >
                  Dismiss
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn--primary"
                  onClick={handleSendReply}
                  disabled={sending || !replyMessage.trim() || isTicketClosed(selectedTicket)}
                >
                  {sending ? 'Sending…' : 'Send Response'}
                </button>
              </div>
            </div>
          </div>
        )}
      </AdminDrawer>
    </div>
  );
}
