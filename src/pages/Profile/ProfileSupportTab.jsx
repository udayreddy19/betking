import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../utils/apiClient';
import { extractTicketsFromResponse } from '../../utils/supportTickets';
import SupportAttachmentList from '../../components/Support/SupportAttachmentList';
import {
  SUPPORT_ATTACHMENT_ACCEPT,
  formatAttachmentSize,
  uploadSupportAttachment,
  validateSupportFile,
} from '../../utils/supportAttachments';
import { formatIstShort } from '../../utils/istTime';

function formatTime(value) {
  if (!value) return '';
  return formatIstShort(value, '');
}

export default function ProfileSupportTab({ onOpenChat }) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [reply, setReply] = useState('');
  const [replyFile, setReplyFile] = useState(null);
  const [sending, setSending] = useState(false);
  const fileRef = useRef(null);

  const loadTickets = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/api/v1/support/tickets');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load tickets.');
      setTickets(extractTicketsFromResponse(data));
    } catch (err) {
      setTickets([]);
      setError(err.message || 'Could not load tickets.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTickets();
    const refresh = () => loadTickets();
    window.addEventListener('oddsyra:support-ticket-created', refresh);
    const timer = setInterval(() => loadTickets({ silent: true }), 30000);
    return () => {
      window.removeEventListener('oddsyra:support-ticket-created', refresh);
      clearInterval(timer);
    };
  }, [loadTickets]);

  const selected = tickets.find((t) => (t.conversationId || t.id) === selectedId) || null;

  const handleReply = async (event) => {
    event.preventDefault();
    if (!selected || (!reply.trim() && !replyFile) || sending) return;
    setSending(true);
    try {
      const id = selected.conversationId || selected.id;
      let attachments = [];
      if (replyFile) {
        attachments = [await uploadSupportAttachment(replyFile, { conversationId: id })];
      }
      const res = await apiFetch(`/api/v1/support/tickets/${id}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          text: reply.trim() || (attachments.length ? 'Sent an attachment' : ''),
          attachments,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not send reply.');
      setReply('');
      setReplyFile(null);
      if (fileRef.current) fileRef.current.value = '';
      await loadTickets();
      setSelectedId(id);
    } catch (err) {
      setError(err.message || 'Could not send reply.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="profile-support">
      <div className="profile-support-head">
        <div>
          <h2>Support tickets</h2>
          <p>Open a ticket from chat, track replies here, and check your email for updates from OddsYra Support.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button type="button" className="profile-link-btn" onClick={onOpenChat}>
            Open assistant
          </button>
          <a className="profile-link-btn" href="mailto:support@oddsyra.com">
            Email support@
          </a>
        </div>
      </div>

      {error && <p className="profile-support-error">{error}</p>}
      {loading && <p className="history-empty">Loading tickets…</p>}

      {!loading && tickets.length === 0 && (
        <div className="history-empty">
          <p>No support tickets yet. Chat with the assistant to collect details, then create a ticket.</p>
          <button type="button" className="profile-link-btn" onClick={onOpenChat}>
            Start support chat
          </button>
        </div>
      )}

      {!loading && tickets.length > 0 && (
        <div className="profile-support-layout">
          <ul className="profile-support-list">
            {tickets.map((ticket) => {
              const id = ticket.conversationId || ticket.id;
              const number = ticket.ticketNumber || ticket.conversationNumber || id;
              return (
                <li key={id}>
                  <button
                    type="button"
                    className={`profile-support-item ${selectedId === id ? 'active' : ''}`}
                    onClick={() => setSelectedId(id)}
                  >
                    <span className="profile-support-item__id">{number}</span>
                    <span className="profile-support-item__subject">{ticket.subject || ticket.category || 'Support request'}</span>
                    <span className="profile-support-item__meta">
                      {ticket.category || 'Other'} · {ticket.status || 'OPEN'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="profile-support-thread">
            {!selected && <p className="history-empty">Select a ticket to read the conversation.</p>}
            {selected && (
              <>
                <div className="profile-support-thread__head">
                  <strong>{selected.ticketNumber || selected.conversationNumber}</strong>
                  <span>{selected.category} · {selected.status}</span>
                </div>
                <div className="profile-support-messages">
                  {(selected.messages || []).map((msg) => {
                    const sender = String(msg.senderType || msg.sender_type || msg.sender || 'user').toLowerCase();
                    const when = msg.createdAt || msg.created_at || msg.deliveredAt || msg.delivered_at;
                    const agentLabel = msg.agentName || msg.agent_name || 'OddsYra Support';
                    return (
                    <article
                      key={msg.messageId || msg.message_id || msg.id}
                      className={`profile-support-msg profile-support-msg--${sender === 'admin' ? 'admin' : sender === 'system' ? 'system' : 'user'}`}
                    >
                      <header>
                        {sender === 'admin' ? agentLabel : sender === 'system' ? 'System' : 'You'}
                        <time>{formatTime(when)}</time>
                      </header>
                      {msg.text ? <p>{msg.text}</p> : null}
                      <SupportAttachmentList attachments={msg.attachments} />
                    </article>
                    );
                  })}
                </div>
                <form className="profile-support-reply" onSubmit={handleReply}>
                  <textarea
                    rows={3}
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="Add more details for this ticket…"
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                    <input
                      ref={fileRef}
                      type="file"
                      accept={SUPPORT_ATTACHMENT_ACCEPT}
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const validationError = validateSupportFile(file);
                        if (validationError) {
                          setError(validationError);
                          e.target.value = '';
                          return;
                        }
                        setReplyFile(file);
                        setError('');
                      }}
                    />
                    <button type="button" className="profile-link-btn" onClick={() => fileRef.current?.click()} disabled={sending}>
                      Attach file
                    </button>
                    {replyFile && (
                      <span style={{ fontSize: '0.8rem', color: '#60a5fa' }}>
                        {replyFile.name} ({formatAttachmentSize(replyFile.size)})
                      </span>
                    )}
                    <button type="submit" className="profile-link-btn" disabled={sending || (!reply.trim() && !replyFile)}>
                      {sending ? 'Sending…' : 'Send reply'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
