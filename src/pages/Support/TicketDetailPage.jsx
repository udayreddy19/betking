import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../utils/apiClient';
import SupportAttachmentList from '../../components/Support/SupportAttachmentList';
import {
  SUPPORT_ATTACHMENT_ACCEPT,
  formatAttachmentSize,
  uploadSupportAttachment,
  validateSupportFile,
} from '../../utils/supportAttachments';
import './SupportPages.css';
import { formatIstShort } from '../../utils/istTime';

function formatTime(val) {
  if (!val) return '';
  return formatIstShort(val, '');
}

export default function TicketDetailPage() {
  const { ticketReference } = useParams();
  const { isLoggedIn, openLoginModal } = useAuth();

  const [ticket, setTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [replyText, setReplyText] = useState('');
  const [replyAttachment, setReplyAttachment] = useState(null);
  const [sending, setSending] = useState(false);
  const [reopening, setReopening] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const loadTicket = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError('');

    try {
      const res = await apiFetch(`/api/v1/support/tickets/${ticketReference}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load ticket details.');
      }
      const conv = data.ticket || data.conversation || {};
      setTicket(conv);
      setMessages(conv.messages || []);
    } catch (err) {
      setError(err.message || 'Unable to load support ticket.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [ticketReference]);

  useEffect(() => {
    if (isLoggedIn) {
      loadTicket();
      const timer = setInterval(() => loadTicket({ silent: true }), 10000);
      return () => clearInterval(timer);
    }
    setLoading(false);
  }, [isLoggedIn, loadTicket]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSendReply = async (e) => {
    e.preventDefault();
    if ((!replyText.trim() && !replyAttachment) || sending) return;

    setSending(true);
    setError('');

    try {
      let attachments = [];
      if (replyAttachment) {
        attachments = [await uploadSupportAttachment(replyAttachment, {
          conversationId: ticket?.conversationId || ticket?.id,
        })];
      }
      const res = await apiFetch(`/api/v1/support/tickets/${ticketReference}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: replyText.trim() || (attachments.length ? 'Sent an attachment' : ''),
          attachments,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to send message.');

      setReplyText('');
      setReplyAttachment(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadTicket({ silent: true });
    } catch (err) {
      setError(err.message || 'Could not send message.');
    } finally {
      setSending(false);
    }
  };

  const handleReopen = async () => {
    setReopening(true);
    try {
      const res = await apiFetch(`/api/v1/support/tickets/${ticketReference}/reopen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Reopened by user via web UI' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not reopen ticket.');
      await loadTicket();
    } catch (err) {
      setError(err.message || 'Failed to reopen ticket.');
    } finally {
      setReopening(false);
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="support-container">
        <div className="support-empty-state">
          <div className="icon">🔒</div>
          <h2>Authentication Required</h2>
          <p>Please log in to view and reply to this ticket.</p>
          <button type="button" className="support-btn" onClick={openLoginModal} style={{ marginTop: '16px' }}>
            Log In Now
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="support-container">
        <div className="support-empty-state">
          <p>Loading ticket {ticketReference}…</p>
        </div>
      </div>
    );
  }

  if (error && !ticket) {
    return (
      <div className="support-container">
        <div className="support-error-banner">
          <span>{error}</span>
          <Link to="/support/tickets" className="support-btn support-btn--secondary">
            Back to Tickets
          </Link>
        </div>
      </div>
    );
  }

  const isResolvedOrClosed = ticket?.status === 'RESOLVED' || ticket?.status === 'CLOSED';

  return (
    <div className="support-container">
      <div className="support-header" style={{ marginBottom: '16px' }}>
        <div style={{ marginBottom: '8px' }}>
          <Link to="/support/tickets" style={{ color: '#94a3b8', fontSize: '0.85rem', textDecoration: 'none' }}>
            ← Back to Tickets
          </Link>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 style={{ fontSize: '1.4rem', marginBottom: '4px' }}>
              {ticket?.ticketReference || ticketReference}
            </h1>
            <p>{ticket?.subject || 'Support Ticket Thread'}</p>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span className="support-badge support-badge--open">
              {ticket?.category || 'OTHER'}
            </span>
            <span className={`support-badge support-badge--${String(ticket?.status || 'OPEN').toLowerCase()}`}>
              {ticket?.status || 'OPEN'}
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div className="support-error-banner">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
            ✕
          </button>
        </div>
      )}

      {isResolvedOrClosed && (
        <div style={{ background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '12px 18px', borderRadius: '8px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <strong style={{ color: '#34d399' }}>This ticket is marked as {ticket?.status}.</strong>
            <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: '#94a3b8' }}>
              {ticket?.resolutionSummary || 'Need more help? You can send a reply or reopen this issue.'}
            </p>
          </div>
          <button type="button" className="support-btn support-btn--outline" onClick={handleReopen} disabled={reopening} style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
            {reopening ? 'Reopening…' : 'Reopen Ticket'}
          </button>
        </div>
      )}

      {/* Thread Container */}
      <div className="support-thread-card">
        <div className="support-thread-messages">
          {messages.length === 0 && (
            <p style={{ textAlign: 'center', color: '#94a3b8', margin: 'auto' }}>No messages in this ticket yet.</p>
          )}
          {messages.map((m) => {
            const sender = String(m.senderType || m.sender_type || m.sender || 'user').toLowerCase();
            const isAdmin = sender === 'admin';
            const isSystem = sender === 'system';
            const when = m.createdAt || m.created_at || m.deliveredAt;
            const senderName = isSystem ? 'System Notice' : isAdmin ? (m.agentName || 'OddsYra Support') : 'You';

            return (
              <div
                key={m.messageId || m.message_id || m.id}
                className={`support-msg support-msg--${isSystem ? 'system' : isAdmin ? 'admin' : 'user'}`}
              >
                <header>
                  <span>{senderName}</span>
                  <time>{formatTime(when)}</time>
                </header>
                <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{m.text}</p>
                <SupportAttachmentList attachments={m.attachments} />
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Reply Composer */}
        <div className="support-reply-box">
          <form onSubmit={handleSendReply}>
            <div className="support-form-group" style={{ marginBottom: '12px' }}>
              <textarea
                rows={3}
                className="support-textarea"
                placeholder="Type your reply here..."
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <input
                  ref={fileInputRef}
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
                    setReplyAttachment(file);
                    setError('');
                  }}
                />
                <button
                  type="button"
                  className="support-btn support-btn--outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sending}
                  style={{ fontSize: '0.8rem', padding: '6px 12px' }}
                >
                  Attach file
                </button>
                {replyAttachment && (
                  <span style={{ fontSize: '0.78rem', color: '#60a5fa' }}>
                    {replyAttachment.name} ({formatAttachmentSize(replyAttachment.size)})
                    {' '}
                    <button
                      type="button"
                      onClick={() => {
                        setReplyAttachment(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      Remove
                    </button>
                  </span>
                )}
              </div>
              <button type="submit" className="support-btn" disabled={sending || (!replyText.trim() && !replyAttachment)}>
                {sending ? 'Sending Reply…' : 'Send Reply'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
