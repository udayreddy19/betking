import React, { useCallback, useEffect, useRef, useState } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import AdminDataTable from '../components/AdminDataTable';
import { useAdminToast } from '../components/AdminToastContext';
import { StatusBadge } from '../components/AdminBadge';
import AdminDrawer from '../components/AdminDrawer';
import AdminCard from '../components/AdminCard';
import SupportAttachmentList from '../../../components/Support/SupportAttachmentList';
import {
  SUPPORT_ATTACHMENT_ACCEPT,
  formatAttachmentSize,
  uploadSupportAttachment,
  validateSupportFile,
} from '../../../utils/supportAttachments';
import { formatIstShort } from '../../../utils/istTime';

function formatMsgTime(value) {
  if (!value) return '';
  return formatIstShort(value, '');
}

export default function SupportDomainView({
  subModule = 'ticket-queue',
  focusEntityId = null,
  focusEntityType = null,
  onFocusConsumed = null,
}) {
  const [activeTab, setActiveTab] = useState('tickets'); // 'tickets' | 'live-chat'
  const [tickets, setTickets] = useState([]);
  const [liveChats, setLiveChats] = useState([]);
  const [metrics, setMetrics] = useState({
    totalOpen: 0,
    inProgress: 0,
    waitingForUser: 0,
    resolvedToday: 0,
    closed: 0,
    unassigned: 0,
    highPriority: 0,
    activeLiveChats: 0,
    waitingLiveChats: 0,
  });

  // Ticket detail state
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [threadMessages, setThreadMessages] = useState([]);
  const [internalNotes, setInternalNotes] = useState([]);
  const [drawerTab, setDrawerTab] = useState('messages'); // 'messages' | 'internal_notes' | 'financial_review'
  const [loadingThread, setLoadingThread] = useState(false);
  const [macros, setMacros] = useState([]);
  const [internalNoteText, setInternalNoteText] = useState('');
  const [finReviewReason, setFinReviewReason] = useState('');
  const [assignAgentName, setAssignAgentName] = useState('');
  const [replyMessage, setReplyMessage] = useState('');
  const [replyAttachment, setReplyAttachment] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  // Live chat state
  const [selectedChat, setSelectedChat] = useState(null);
  const [chatFilter, setChatFilter] = useState('ALL');
  const [chatReply, setChatReply] = useState('');
  const [escalating, setEscalating] = useState(false);
  const [escalateCategory, setEscalateCategory] = useState('TECHNICAL');
  const [escalatePriority, setEscalatePriority] = useState('HIGH');

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const { showToast } = useAdminToast();
  const replyRef = useRef(null);
  const replyFileRef = useRef(null);
  const threadEndRef = useRef(null);
  const focusHandledRef = useRef(null);

  const loadData = useCallback(() => {
    adminApiClient.get('/support/macros')
      .then((data) => setMacros(data.macros || []))
      .catch(() => setMacros([]));
    adminApiClient.get('/support/tickets')
      .then((data) => {
        setTickets(data.tickets || []);
        if (data.metrics) setMetrics(data.metrics);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load tickets');
      });

    // Load metrics
    adminApiClient.get('/support/tickets/metrics')
      .then((data) => {
        if (data.metrics) setMetrics(data.metrics);
      })
      .catch(() => {});

    // Load live chats
    adminApiClient.get(`/support/live-chats?filter=${chatFilter}`)
      .then((data) => {
        setLiveChats(data.chats || data.liveChats || []);
        if (data.metrics) setMetrics((prev) => ({ ...prev, ...data.metrics }));
      })
      .catch(() => {});
  }, [chatFilter]);

  const loadThread = useCallback((ticketId) => {
    if (!ticketId) return Promise.resolve();
    setLoadingThread(true);
    return adminApiClient.get(`/support/tickets/${ticketId}`)
      .then((data) => {
        const conv = data.conversation || data.ticket || {};
        setThreadMessages(Array.isArray(conv.messages) ? conv.messages : []);
        setInternalNotes(Array.isArray(conv.internalNotes) ? conv.internalNotes : []);
        setSelectedTicket((prev) => (prev ? {
          ...prev,
          ...conv,
          id: prev.id || conv.conversationId,
          ticketReference: conv.ticketReference || conv.ticketNumber || prev.ticketReference,
          subject: conv.subject || prev.subject,
          status: conv.status || prev.status,
          category: conv.category || prev.category,
          priority: conv.priority || prev.priority,
        } : prev));
      })
      .catch(() => {
        setThreadMessages([]);
        setInternalNotes([]);
      })
      .finally(() => setLoadingThread(false));
  }, []);

  useEffect(() => {
    loadData();
    const timer = setInterval(loadData, 10000);
    return () => clearInterval(timer);
  }, [loadData]);

  useEffect(() => {
    if (!selectedTicket?.id) return undefined;
    loadThread(selectedTicket.id);
    const timer = setInterval(() => loadThread(selectedTicket.id), 6000);
    return () => clearInterval(timer);
  }, [selectedTicket?.id, loadThread]);

  useEffect(() => {
    if (replyRef.current && document.activeElement === replyRef.current) return;
    threadEndRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [threadMessages.length]);

  const openTicket = (ticket) => {
    setSelectedTicket(ticket);
    setReplyMessage('');
    setReplyAttachment(null);
    if (replyFileRef.current) replyFileRef.current.value = '';
    setInternalNoteText('');
    setDrawerTab('messages');
  };

  const dismissTicket = useCallback(() => {
    setSelectedTicket(null);
    setReplyMessage('');
    setReplyAttachment(null);
    if (replyFileRef.current) replyFileRef.current.value = '';
    setInternalNoteText('');
    setThreadMessages([]);
  }, []);

  const isTicketClosed = (ticket) => {
    const s = String(ticket?.status || '').toUpperCase();
    return s === 'CLOSED' || s === 'RESOLVED';
  };

  const handleSendReply = async () => {
    if (!selectedTicket?.id || (!replyMessage.trim() && !replyAttachment) || sending) return;
    setSending(true);
    try {
      let attachments = [];
      if (replyAttachment) {
        attachments = [await uploadSupportAttachment(replyAttachment, {
          conversationId: selectedTicket.id,
          admin: true,
          adminPost: (path, body) => adminApiClient.post(path, body),
        })];
      }
      await adminApiClient.post(`/support/tickets/${selectedTicket.id}/reply`, {
        text: replyMessage.trim() || (attachments.length ? 'Sent an attachment' : ''),
        attachments,
      });
      setReplyMessage('');
      setReplyAttachment(null);
      if (replyFileRef.current) replyFileRef.current.value = '';
      showToast('Response dispatched.', 'success');
      await loadThread(selectedTicket.id);
      loadData();
    } catch (err) {
      showToast(err.message || 'Failed to send reply', 'error');
    } finally {
      setSending(false);
    }
  };

  const handleAddInternalNote = () => {
    if (!selectedTicket?.id || !internalNoteText.trim() || sending) return;
    setSending(true);
    adminApiClient.post(`/support/conversations/${selectedTicket.id}/internal-notes`, {
      text: internalNoteText.trim(),
    })
      .then(async () => {
        setInternalNoteText('');
        showToast('Internal note saved (hidden from customer).', 'success');
        await loadThread(selectedTicket.id);
      })
      .catch((err) => showToast(err.message || 'Failed to save note', 'error'))
      .finally(() => setSending(false));
  };

  const handleAssignAgent = () => {
    if (!selectedTicket?.id || !assignAgentName.trim()) return;
    adminApiClient.post(`/support/conversations/${selectedTicket.id}/assign`, {
      agentId: `agent_${assignAgentName.toLowerCase().replace(/\s+/g, '_')}`,
      agentName: assignAgentName.trim(),
      teamId: 'SUPPORT_AGENT',
    })
      .then(async () => {
        showToast(`Ticket assigned to ${assignAgentName}`, 'success');
        setAssignAgentName('');
        await loadThread(selectedTicket.id);
        loadData();
      })
      .catch((err) => showToast(err.message || 'Failed to assign', 'error'));
  };

  const handleCloseTicket = (ticket) => {
    if (!ticket?.id || sending) return;
    setSending(true);
    adminApiClient.post(`/support/tickets/${ticket.id}/close`, {
      resolutionSummary: 'Closed by OddsYra support agent.',
    })
      .then(async () => {
        showToast(`Ticket closed.`, 'success');
        if (selectedTicket?.id === ticket.id) {
          setSelectedTicket((prev) => (prev ? { ...prev, status: 'CLOSED' } : prev));
          await loadThread(ticket.id);
        }
        loadData();
      })
      .catch((err) => showToast(err.message || 'Failed to close ticket', 'error'))
      .finally(() => setSending(false));
  };

  const handleFinancialReviewRequest = () => {
    if (!selectedTicket?.userId || !finReviewReason.trim()) return;
    setSending(true);
    adminApiClient.post('/support/financial-review-request', {
      userId: selectedTicket.userId,
      ticketId: selectedTicket.id,
      reason: finReviewReason.trim(),
    })
      .then(() => {
        showToast('Financial review request queued for Finance Operations Maker-Checker.', 'success');
        setFinReviewReason('');
        setDrawerTab('messages');
      })
      .catch((err) => showToast(err.message || 'Failed to request review', 'error'))
      .finally(() => setSending(false));
  };

  // Live Chat actions
  const handleAcceptChat = (chat) => {
    adminApiClient.post(`/support/live-chats/${chat.conversationId}/accept`, {})
      .then(() => {
        showToast('Live chat accepted. Real-time session active.', 'success');
        setSelectedChat({ ...chat, status: 'ACTIVE' });
        loadData();
      })
      .catch((err) => showToast(err.message || 'Could not accept chat', 'error'));
  };

  const handleEndChat = (chat) => {
    adminApiClient.post(`/support/live-chats/${chat.conversationId}/end`, {})
      .then(() => {
        showToast('Live chat ended.', 'success');
        setSelectedChat(null);
        loadData();
      })
      .catch((err) => showToast(err.message || 'Could not end chat', 'error'));
  };

  const handleEscalateChat = () => {
    if (!selectedChat?.conversationId) return;
    setSending(true);
    adminApiClient.post(`/support/live-chats/${selectedChat.conversationId}/escalate`, {
      category: escalateCategory,
      priority: escalatePriority,
      subject: `Escalated Chat: ${selectedChat.subject || selectedChat.userId}`,
    })
      .then((res) => {
        showToast(`Escalated to ticket ${res.ticket?.ticketReference || 'successfully'}!`, 'success');
        setEscalating(false);
        setSelectedChat(null);
        loadData();
      })
      .catch((err) => showToast(err.message || 'Escalation failed', 'error'))
      .finally(() => setSending(false));
  };

  // Filtered Tickets
  const filteredTickets = tickets.filter((t) => {
    if (statusFilter && String(t.status).toUpperCase() !== statusFilter) return false;
    if (categoryFilter && String(t.category).toUpperCase() !== categoryFilter) return false;
    if (priorityFilter && String(t.priority).toUpperCase() !== priorityFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const ref = String(t.ticketReference || t.id || '').toLowerCase();
      const subj = String(t.subject || '').toLowerCase();
      const user = String(t.userName || t.userId || '').toLowerCase();
      if (!ref.includes(q) && !subj.includes(q) && !user.includes(q)) return false;
    }
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Metrics Bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px' }}>
        <AdminCard title="OPEN TICKETS" value={metrics.totalOpen || 0} variant="primary" />
        <AdminCard title="IN PROGRESS" value={metrics.inProgress || 0} variant="warning" />
        <AdminCard title="WAITING FOR USER" value={metrics.waitingForUser || 0} variant="neutral" />
        <AdminCard title="UNASSIGNED" value={metrics.unassigned || 0} variant="danger" />
        <AdminCard title="HIGH PRIORITY" value={metrics.highPriority || 0} variant="danger" />
        <AdminCard title="RESOLVED TODAY" value={metrics.resolvedToday || 0} variant="success" />
        <AdminCard title="ACTIVE LIVE CHATS" value={metrics.activeLiveChats || 0} variant="primary" />
        <AdminCard title="WAITING CHATS" value={metrics.waitingLiveChats || 0} variant="warning" />
      </div>

      {/* Primary Sub-Tabs */}
      <div style={{ display: 'flex', gap: '12px', borderBottom: '1px solid var(--admin-border)', paddingBottom: '8px' }}>
        <button
          type="button"
          className={`admin-btn ${activeTab === 'tickets' ? 'admin-btn--primary' : 'admin-btn--secondary'}`}
          onClick={() => setActiveTab('tickets')}
        >
          🎫 Ticket Queue ({filteredTickets.length})
        </button>
        <button
          type="button"
          className={`admin-btn ${activeTab === 'live-chat' ? 'admin-btn--primary' : 'admin-btn--secondary'}`}
          onClick={() => setActiveTab('live-chat')}
        >
          💬 Live Chat Control ({liveChats.length})
        </button>
      </div>

      {/* ── TAB 1: TICKET QUEUE ── */}
      {activeTab === 'tickets' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Filter Bar */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
            <input
              type="text"
              className="admin-input"
              style={{ flex: 1, minWidth: '200px' }}
              placeholder="Search by ticket ref, subject, customer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />

            <select className="admin-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All Statuses</option>
              <option value="OPEN">Open</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="WAITING_FOR_USER">Waiting for User</option>
              <option value="RESOLVED">Resolved</option>
              <option value="CLOSED">Closed</option>
            </select>

            <select className="admin-select" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="">All Categories</option>
              <option value="DEPOSIT">Deposit</option>
              <option value="WITHDRAWAL">Withdrawal</option>
              <option value="BET">Betting</option>
              <option value="BET_SETTLEMENT">Bet Settlement</option>
              <option value="KYC">KYC</option>
              <option value="TECHNICAL">Technical</option>
              <option value="OTHER">Other</option>
            </select>

            <select className="admin-select" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
              <option value="">All Priorities</option>
              <option value="URGENT">Urgent</option>
              <option value="HIGH">High</option>
              <option value="NORMAL">Normal</option>
              <option value="LOW">Low</option>
            </select>
          </div>

          <AdminDataTable
            data={filteredTickets}
            keyField="id"
            onRowClick={openTicket}
            emptyMessage="No support tickets match the selected filters."
            columns={[
              {
                header: 'Ticket Ref',
                key: 'ticketReference',
                render: (r) => <strong style={{ color: '#818cf8' }}>{r.ticketReference || r.ticketNumber || r.id}</strong>,
              },
              {
                header: 'Customer',
                key: 'userId',
                render: (r) => r.userName || r.userId || '—',
              },
              {
                header: 'Subject',
                key: 'subject',
                render: (r) => (
                  <span style={{ maxWidth: '240px', display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.subject || 'Support request'}
                  </span>
                ),
              },
              { header: 'Category', key: 'category', render: (r) => r.category || 'OTHER' },
              {
                header: 'Priority',
                key: 'priority',
                render: (r) => <StatusBadge status={r.priority || 'NORMAL'} />,
              },
              {
                header: 'Status',
                key: 'status',
                render: (r) => <StatusBadge status={r.status || 'OPEN'} />,
              },
              {
                header: 'Agent',
                key: 'agent',
                render: (r) => r.assignedAgentName || r.agent || <span style={{ color: '#f87171' }}>Unassigned</span>,
              },
              {
                header: 'Last Activity',
                key: 'updatedAt',
                render: (r) => formatMsgTime(r.updatedAt || r.createdAt),
              },
              {
                header: 'Actions',
                key: 'actions',
                render: (r) => (
                  <div style={{ display: 'flex', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="admin-btn admin-btn--secondary admin-btn--sm"
                      onClick={() => openTicket(r)}
                    >
                      Open
                    </button>
                    {!isTicketClosed(r) && (
                      <button
                        type="button"
                        className="admin-btn admin-btn--success admin-btn--sm"
                        onClick={() => handleCloseTicket(r)}
                      >
                        Resolve
                      </button>
                    )}
                  </div>
                ),
              },
            ]}
          />
        </div>
      )}

      {/* ── TAB 2: LIVE CHAT QUEUE ── */}
      {activeTab === 'live-chat' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            {['ALL', 'WAITING', 'ACTIVE', 'MY_CHATS', 'UNASSIGNED'].map((f) => (
              <button
                key={f}
                type="button"
                className={`admin-btn ${chatFilter === f ? 'admin-btn--primary' : 'admin-btn--secondary'} admin-btn--sm`}
                onClick={() => setChatFilter(f)}
              >
                {f.replace('_', ' ')}
              </button>
            ))}
          </div>

          <AdminDataTable
            data={liveChats}
            keyField="conversationId"
            onRowClick={(chat) => setSelectedChat(chat)}
            emptyMessage="No live chats in this view."
            columns={[
              {
                header: 'Session Ref',
                key: 'conversationId',
                render: (r) => <strong style={{ color: '#818cf8' }}>{r.conversationNumber || r.conversationId}</strong>,
              },
              { header: 'Customer', key: 'userId', render: (r) => r.userId || '—' },
              {
                header: 'Status',
                key: 'status',
                render: (r) => <StatusBadge status={r.status} />,
              },
              {
                header: 'Assigned Agent',
                key: 'assignedAgentName',
                render: (r) => r.assignedAgentName || <span style={{ color: '#f87171' }}>Waiting for Agent</span>,
              },
              {
                header: 'Started At',
                key: 'createdAt',
                render: (r) => formatMsgTime(r.createdAt),
              },
              {
                header: 'Actions',
                key: 'actions',
                render: (r) => (
                  <div style={{ display: 'flex', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
                    {r.status === 'WAITING' && (
                      <button
                        type="button"
                        className="admin-btn admin-btn--primary admin-btn--sm"
                        onClick={() => handleAcceptChat(r)}
                      >
                        Accept Chat
                      </button>
                    )}
                    {r.status === 'ACTIVE' && (
                      <button
                        type="button"
                        className="admin-btn admin-btn--secondary admin-btn--sm"
                        onClick={() => {
                          setSelectedChat(r);
                          setEscalating(true);
                        }}
                      >
                        Escalate
                      </button>
                    )}
                    {r.status === 'ACTIVE' && (
                      <button
                        type="button"
                        className="admin-btn admin-btn--danger admin-btn--sm"
                        onClick={() => handleEndChat(r)}
                      >
                        End Chat
                      </button>
                    )}
                  </div>
                ),
              },
            ]}
          />
        </div>
      )}

      {/* ── TICKET DETAIL DRAWER ── */}
      <AdminDrawer
        isOpen={!!selectedTicket}
        onClose={dismissTicket}
        title={selectedTicket?.subject || 'Support Ticket'}
        subtitle={selectedTicket ? `${selectedTicket.ticketReference || selectedTicket.id} · ${selectedTicket.userName || selectedTicket.userId || ''}` : ''}
        width="560px"
        actions={
          !isTicketClosed(selectedTicket) && (
            <button
              type="button"
              className="admin-btn admin-btn--success admin-btn--sm"
              onClick={() => handleCloseTicket(selectedTicket)}
              disabled={sending}
            >
              Resolve / Close
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
              <div><span style={{ color: 'var(--admin-text-muted)' }}>Priority:</span> <StatusBadge status={selectedTicket.priority || 'NORMAL'} /></div>
              <div><span style={{ color: 'var(--admin-text-muted)' }}>Agent:</span> <strong>{selectedTicket.agent || selectedTicket.assignedAgentName || 'Unassigned'}</strong></div>
              {selectedTicket.relatedEntityId && (
                <div><span style={{ color: 'var(--admin-text-muted)' }}>Linked Record:</span> <strong>{selectedTicket.relatedEntityType}: {selectedTicket.relatedEntityId}</strong></div>
              )}
            </div>

            {/* Quick Agent Assignment */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="text"
                className="admin-input admin-input--sm"
                placeholder="Assign to Agent Name..."
                value={assignAgentName}
                onChange={(e) => setAssignAgentName(e.target.value)}
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="admin-btn admin-btn--secondary admin-btn--sm"
                onClick={handleAssignAgent}
                disabled={!assignAgentName.trim()}
              >
                Assign
              </button>
            </div>

            {/* Drawer Sub-Navigation */}
            <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--admin-border)', paddingBottom: '6px' }}>
              <button
                type="button"
                className={`admin-btn ${drawerTab === 'messages' ? 'admin-btn--primary' : 'admin-btn--secondary'} admin-btn--sm`}
                onClick={() => setDrawerTab('messages')}
              >
                Messages ({threadMessages.length})
              </button>
              <button
                type="button"
                className={`admin-btn ${drawerTab === 'internal_notes' ? 'admin-btn--primary' : 'admin-btn--secondary'} admin-btn--sm`}
                onClick={() => setDrawerTab('internal_notes')}
              >
                🔒 Internal Notes ({internalNotes.length})
              </button>
              <button
                type="button"
                className={`admin-btn ${drawerTab === 'financial_review' ? 'admin-btn--primary' : 'admin-btn--secondary'} admin-btn--sm`}
                onClick={() => setDrawerTab('financial_review')}
              >
                💰 Financial Review
              </button>
            </div>

            {/* Messages Feed Tab */}
            {drawerTab === 'messages' && (
              <>
                <div style={{
                  flex: 1,
                  minHeight: '220px',
                  maxHeight: '340px',
                  overflowY: 'auto',
                  padding: '12px',
                  borderRadius: 'var(--admin-radius-sm)',
                  background: 'var(--admin-bg)',
                  border: '1px solid var(--admin-border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}>
                  {threadMessages.map((msg) => {
                    const sender = String(msg.senderType || msg.sender_type || msg.sender || 'user').toLowerCase();
                    const isAdmin = sender === 'admin';
                    const isSystem = sender === 'system';
                    return (
                      <div
                        key={msg.messageId || msg.message_id || msg.id}
                        style={{
                          alignSelf: isSystem ? 'center' : isAdmin ? 'flex-end' : 'flex-start',
                          maxWidth: '85%',
                          padding: '8px 12px',
                          borderRadius: 'var(--admin-radius-md)',
                          background: isSystem ? 'rgba(100, 116, 139, 0.15)' : isAdmin ? 'rgba(99, 102, 241, 0.15)' : 'var(--admin-surface)',
                          border: `1px solid ${isAdmin ? 'rgba(99, 102, 241, 0.35)' : 'var(--admin-border)'}`,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 3, fontSize: '0.68rem', color: 'var(--admin-text-muted)', fontWeight: 700 }}>
                          <span style={{ color: isAdmin ? '#818cf8' : 'var(--admin-text)' }}>
                            {isAdmin ? (msg.agentName || 'OddsYra Support') : isSystem ? 'System' : 'Customer'}
                          </span>
                          <span>{formatMsgTime(msg.createdAt || msg.created_at || msg.deliveredAt)}</span>
                        </div>
                        <div style={{ fontSize: '0.84rem', lineHeight: 1.45, whiteSpace: 'pre-wrap', color: 'var(--admin-text)' }}>
                          {msg.text}
                        </div>
                        <SupportAttachmentList attachments={msg.attachments} admin />
                      </div>
                    );
                  })}
                  <div ref={threadEndRef} />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {macros.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {macros.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          className="admin-btn admin-btn--sm admin-btn--secondary"
                          onClick={() => setReplyMessage(m.text)}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  )}
                  <textarea
                    ref={replyRef}
                    value={replyMessage}
                    onChange={(e) => setReplyMessage(e.target.value)}
                    rows={3}
                    placeholder={isTicketClosed(selectedTicket) ? 'Ticket is closed.' : 'Type your support response to customer…'}
                    disabled={isTicketClosed(selectedTicket)}
                    className="admin-input"
                    style={{ width: '100%', resize: 'vertical', fontSize: '0.84rem' }}
                  />
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <input
                        ref={replyFileRef}
                        type="file"
                        accept={SUPPORT_ATTACHMENT_ACCEPT}
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const validationError = validateSupportFile(file);
                          if (validationError) {
                            showToast(validationError, 'error');
                            e.target.value = '';
                            return;
                          }
                          setReplyAttachment(file);
                        }}
                      />
                      <button
                        type="button"
                        className="admin-btn admin-btn--secondary admin-btn--sm"
                        onClick={() => replyFileRef.current?.click()}
                        disabled={sending || isTicketClosed(selectedTicket)}
                      >
                        Attach file
                      </button>
                      {replyAttachment && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)' }}>
                          {replyAttachment.name} ({formatAttachmentSize(replyAttachment.size)})
                          {' '}
                          <button
                            type="button"
                            className="admin-btn admin-btn--sm admin-btn--secondary"
                            onClick={() => {
                              setReplyAttachment(null);
                              if (replyFileRef.current) replyFileRef.current.value = '';
                            }}
                          >
                            Remove
                          </button>
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="admin-btn admin-btn--primary"
                      onClick={handleSendReply}
                      disabled={sending || (!replyMessage.trim() && !replyAttachment) || isTicketClosed(selectedTicket)}
                    >
                      {sending ? 'Sending…' : 'Send Customer Reply'}
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Internal Notes Tab */}
            {drawerTab === 'internal_notes' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ fontSize: '0.78rem', color: '#fbbf24' }}>
                  ⚠️ Internal notes are confidential and NEVER visible to customers or included in customer APIs.
                </div>
                <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {internalNotes.map((n, i) => (
                    <div key={i} style={{ padding: '8px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '6px', fontSize: '0.82rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#fbbf24', fontSize: '0.72rem', marginBottom: '3px' }}>
                        <span>{n.agentId || 'Support Agent'}</span>
                        <span>{formatMsgTime(n.createdAt)}</span>
                      </div>
                      <p style={{ margin: 0 }}>{n.text}</p>
                    </div>
                  ))}
                  {internalNotes.length === 0 && <p style={{ color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>No internal notes yet.</p>}
                </div>
                <textarea
                  rows={3}
                  className="admin-input"
                  placeholder="Add confidential agent note (e.g. Payment gateway ticket UTR pending)..."
                  value={internalNoteText}
                  onChange={(e) => setInternalNoteText(e.target.value)}
                />
                <button type="button" className="admin-btn admin-btn--secondary" onClick={handleAddInternalNote} disabled={sending || !internalNoteText.trim()}>
                  Save Internal Note
                </button>
              </div>
            )}

            {/* Financial Safety / Review Request Tab */}
            {drawerTab === 'financial_review' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ fontSize: '0.78rem', color: '#60a5fa' }}>
                  🛡️ Financial Safety Guardrail: Support agents cannot alter wallets directly. Submit a formal Financial Review Request for Finance Maker-Checker verification.
                </div>
                <textarea
                  rows={3}
                  className="admin-input"
                  placeholder="Reason for financial review (e.g. UPI transaction debited at bank but pending in gateway)..."
                  value={finReviewReason}
                  onChange={(e) => setFinReviewReason(e.target.value)}
                />
                <button type="button" className="admin-btn admin-btn--primary" onClick={handleFinancialReviewRequest} disabled={sending || !finReviewReason.trim()}>
                  Submit Financial Review Request
                </button>
              </div>
            )}
          </div>
        )}
      </AdminDrawer>

      {/* ── ESCALATE LIVE CHAT MODAL ── */}
      {escalating && selectedChat && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
        }}>
          <div style={{ background: 'var(--admin-surface, #1e293b)', padding: '24px', borderRadius: '12px', width: '420px', border: '1px solid var(--admin-border)' }}>
            <h3 style={{ margin: '0 0 12px 0' }}>Escalate Chat to Support Ticket</h3>
            <p style={{ fontSize: '0.84rem', color: 'var(--admin-text-muted)', margin: '0 0 16px 0' }}>
              This will create an authoritative ticket, copy the chat history, and notify the user.
            </p>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '4px' }}>Category</label>
              <select className="admin-select" value={escalateCategory} onChange={(e) => setEscalateCategory(e.target.value)} style={{ width: '100%' }}>
                <option value="DEPOSIT">Deposit</option>
                <option value="WITHDRAWAL">Withdrawal</option>
                <option value="BET">Betting</option>
                <option value="BET_SETTLEMENT">Bet Settlement</option>
                <option value="KYC">KYC</option>
                <option value="TECHNICAL">Technical</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '4px' }}>Priority</label>
              <select className="admin-select" value={escalatePriority} onChange={(e) => setEscalatePriority(e.target.value)} style={{ width: '100%' }}>
                <option value="URGENT">Urgent</option>
                <option value="HIGH">High</option>
                <option value="NORMAL">Normal</option>
                <option value="LOW">Low</option>
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" className="admin-btn admin-btn--secondary" onClick={() => setEscalating(false)}>
                Cancel
              </button>
              <button type="button" className="admin-btn admin-btn--primary" onClick={handleEscalateChat} disabled={sending}>
                {sending ? 'Escalating…' : 'Confirm Escalation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
