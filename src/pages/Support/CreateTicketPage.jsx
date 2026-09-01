import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../utils/apiClient';
import './SupportPages.css';

const TICKET_CATEGORIES = [
  { value: 'DEPOSIT', label: 'Deposit Issue' },
  { value: 'WITHDRAWAL', label: 'Withdrawal Issue' },
  { value: 'BET', label: 'Bet Placement' },
  { value: 'BET_SETTLEMENT', label: 'Bet Settlement Dispute' },
  { value: 'ACCOUNT', label: 'Account & Login' },
  { value: 'KYC', label: 'KYC & Verification' },
  { value: 'BONUS', label: 'Bonus & Wagering' },
  { value: 'PROMOTION', label: 'Promotion Offer' },
  { value: 'REFERRAL', label: 'Referral Program' },
  { value: 'SECURITY', label: 'Security Concern' },
  { value: 'TECHNICAL', label: 'Technical / Bug' },
  { value: 'OTHER', label: 'Other Support Issue' },
];

export default function CreateTicketPage() {
  const navigate = useNavigate();
  const { isLoggedIn, openLoginModal } = useAuth();

  const [category, setCategory] = useState('DEPOSIT');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('NORMAL');
  const [relatedEntityType, setRelatedEntityType] = useState('');
  const [relatedEntityId, setRelatedEntityId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [attachment, setAttachment] = useState(null);

  if (!isLoggedIn) {
    return (
      <div className="support-container">
        <div className="support-empty-state">
          <div className="icon">🔒</div>
          <h2>Authentication Required</h2>
          <p>Please log in to your OddsYra account to create a support ticket.</p>
          <button type="button" className="support-btn" onClick={openLoginModal} style={{ marginTop: '16px' }}>
            Log In Now
          </button>
        </div>
      </div>
    );
  }

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setError('File size must be under 10MB.');
      return;
    }
    setAttachment({
      name: file.name,
      type: file.type,
      size: file.size,
    });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!subject.trim()) {
      setError('Please enter a subject.');
      return;
    }
    if (!description.trim()) {
      setError('Please provide a detailed description.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const payload = {
        category,
        subject: subject.trim(),
        description: description.trim(),
        priority,
        relatedEntityType: relatedEntityType || undefined,
        relatedEntityId: relatedEntityId?.trim() || undefined,
        attachments: attachment ? [{ fileName: attachment.name, fileType: attachment.type, fileSize: attachment.size }] : [],
      };

      const res = await apiFetch('/api/v1/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (res.status === 409 || data.isDuplicate) {
        const ref = data.ticketReference
          || data.activeTicket?.ticketReference
          || data.activeTicket?.ticketNumber
          || data.activeTicket?.conversationId;
        if (ref) {
          navigate(`/support/tickets/${encodeURIComponent(ref)}`);
          return;
        }
        throw new Error(data.error || 'You already have an active support request for this issue.');
      }
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit support ticket.');
      }

      const ref = data.ticketReference || data.ticket?.ticketReference || data.ticket?.conversationNumber;
      navigate(`/support/tickets/${ref || ''}`);
    } catch (err) {
      setError(err.message || 'An error occurred while creating your ticket.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="support-container">
      <div className="support-header">
        <div style={{ marginBottom: '8px' }}>
          <Link to="/support" style={{ color: '#94a3b8', fontSize: '0.85rem', textDecoration: 'none' }}>
            ← Back to Help & Support
          </Link>
        </div>
        <h1>Create Support Ticket</h1>
        <p>Provide complete details so our support specialists can assist you promptly.</p>
      </div>

      {error && (
        <div className="support-error-banner">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
            ✕
          </button>
        </div>
      )}

      <div className="support-form-card">
        <form onSubmit={handleSubmit}>
          {/* Category */}
          <div className="support-form-group">
            <label className="support-form-label" htmlFor="ticket-category">
              Category <span className="req">*</span>
            </label>
            <select
              id="ticket-category"
              className="support-select"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required
            >
              {TICKET_CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          {/* Subject */}
          <div className="support-form-group">
            <label className="support-form-label" htmlFor="ticket-subject">
              Subject <span className="req">*</span>
            </label>
            <input
              id="ticket-subject"
              type="text"
              className="support-input"
              placeholder="e.g. UPI Deposit not reflected in balance"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={120}
              required
            />
          </div>

          {/* Optional Related Record Link */}
          <div className="support-form-group" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
            <div>
              <label className="support-form-label" htmlFor="related-type">
                Related Record (Optional)
              </label>
              <select
                id="related-type"
                className="support-select"
                value={relatedEntityType}
                onChange={(e) => setRelatedEntityType(e.target.value)}
              >
                <option value="">None</option>
                <option value="BET">Bet ID</option>
                <option value="TRANSACTION">Transaction ID</option>
                <option value="DEPOSIT">Deposit ID</option>
                <option value="WITHDRAWAL">Withdrawal ID</option>
                <option value="KYC">KYC Case</option>
                <option value="REFERRAL">Referral ID</option>
              </select>
            </div>
            <div>
              <label className="support-form-label" htmlFor="related-id">
                Record Identifier
              </label>
              <input
                id="related-id"
                type="text"
                className="support-input"
                placeholder={relatedEntityType ? `Enter ${relatedEntityType} reference ID` : 'Select record type first'}
                value={relatedEntityId}
                onChange={(e) => setRelatedEntityId(e.target.value)}
                disabled={!relatedEntityType}
              />
              <div className="support-hint">Backend validates record ownership before linking.</div>
            </div>
          </div>

          {/* Description */}
          <div className="support-form-group">
            <label className="support-form-label" htmlFor="ticket-desc">
              Description <span className="req">*</span>
            </label>
            <textarea
              id="ticket-desc"
              rows={5}
              className="support-textarea"
              placeholder="Please provide complete context: timestamps, amounts, payment reference IDs, or match details..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>

          {/* Attachment */}
          <div className="support-form-group">
            <label className="support-form-label" htmlFor="ticket-attachment">
              Attachment (Optional screenshot or receipt)
            </label>
            <input
              id="ticket-attachment"
              type="file"
              className="support-input"
              accept=".jpg,.jpeg,.png,.webp,.pdf,.txt"
              onChange={handleFileChange}
            />
            {attachment && (
              <div className="support-hint" style={{ color: '#60a5fa', marginTop: '6px' }}>
                Selected: {attachment.name} ({(attachment.size / 1024).toFixed(1)} KB)
              </div>
            )}
          </div>

          {/* Submit Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '28px' }}>
            <Link to="/support" className="support-btn support-btn--outline">
              Cancel
            </Link>
            <button type="submit" className="support-btn" disabled={submitting}>
              {submitting ? 'Submitting Ticket…' : 'Submit Ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
