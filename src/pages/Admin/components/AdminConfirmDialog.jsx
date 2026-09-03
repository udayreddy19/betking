import React, { useState, useEffect, useRef } from 'react';
import AdminModal from './AdminModal';

/**
 * Confirmation dialog replacing window.confirm() and window.prompt().
 * Shows action summary, consequence, details, optional reason input, and RBAC/audit notice.
 *
 * Usage:
 *   <AdminConfirmDialog
 *     isOpen={showConfirm}
 *     variant="danger"       // "danger" | "success" | "warning"
 *     icon="⚠️"
 *     title="Reject Withdrawal"
 *     description="This action cannot be undone. Funds will be released back to the user's wallet."
 *     details={[
 *       { label: 'User', value: 'John Doe' },
 *       { label: 'Amount', value: '₹15,000' },
 *     ]}
 *     requireReason           // shows reason textarea
 *     reasonPlaceholder="Enter rejection reason..."
 *     requirePayoutProof      // shows amount + UTR fields for manual Paid
 *     payoutAmountDefault="1500.00"
 *     confirmLabel="Reject Withdrawal"
 *     cancelLabel="Cancel"
 *     onConfirm={(reason) => handleReject(reason)}
 *     onCancel={() => setShowConfirm(false)}
 *     loading={isProcessing}
 *   />
 */
export default function AdminConfirmDialog({
  isOpen,
  variant = 'danger',
  icon,
  title,
  description,
  details = [],
  requireReason = false,
  reasonPlaceholder = 'Enter reason...',
  reasonDefault = '',
  requirePayoutProof = false,
  payoutAmountDefault = '',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  loading = false,
  auditNotice = true,
  children,
}) {
  const [reason, setReason] = useState(reasonDefault);
  const [paidAmount, setPaidAmount] = useState(payoutAmountDefault);
  const [payoutRef, setPayoutRef] = useState('');
  const reasonRef = useRef(null);
  const payoutRefInput = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setReason(reasonDefault);
      setPaidAmount(payoutAmountDefault || '');
      setPayoutRef('');
      if (requirePayoutProof) {
        setTimeout(() => payoutRefInput.current?.focus(), 120);
      } else if (requireReason) {
        setTimeout(() => reasonRef.current?.focus(), 120);
      }
    }
  }, [isOpen, reasonDefault, requireReason, requirePayoutProof, payoutAmountDefault]);

  const payoutReady = !requirePayoutProof
    || (String(paidAmount || '').trim() && String(payoutRef || '').trim().length >= 8);
  const reasonReady = !requireReason || Boolean(reason.trim());

  const handleConfirm = () => {
    if (!reasonReady || !payoutReady) return;
    onConfirm(reason.trim(), {
      paidAmount: String(paidAmount || '').trim(),
      payoutRef: String(payoutRef || '').trim(),
    });
  };

  const iconVariant = {
    danger: { bg: 'rgba(244, 63, 94, 0.12)', border: 'rgba(244, 63, 94, 0.25)' },
    success: { bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.25)' },
    warning: { bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.25)' },
  }[variant] || { bg: 'rgba(99, 102, 241, 0.12)', border: 'rgba(99, 102, 241, 0.25)' };

  const confirmBtnClass = {
    danger: 'admin-btn--danger',
    success: 'admin-btn--success',
    warning: 'admin-btn--primary',
  }[variant] || 'admin-btn--primary';

  return (
    <AdminModal isOpen={isOpen} onClose={onCancel} maxWidth="440px">
      <div className="admin-confirm-dialog" style={{ border: 'none', boxShadow: 'none', padding: 0 }}>
        {/* Icon */}
        {icon && (
          <div
            className="admin-confirm-dialog__icon"
            style={{ background: iconVariant.bg, border: `1px solid ${iconVariant.border}` }}
          >
            {icon}
          </div>
        )}

        {/* Title & Description */}
        {title && (
          <h3 style={{
            fontSize: '1.05rem',
            fontWeight: 800,
            color: 'var(--admin-text)',
            margin: '0 0 4px',
          }}>
            {title}
          </h3>
        )}
        {description && (
          <p style={{
            fontSize: '0.82rem',
            color: 'var(--admin-text-muted)',
            lineHeight: 1.5,
            margin: '0 0 14px',
          }}>
            {description}
          </p>
        )}

        {/* Details Grid */}
        {details.length > 0 && (
          <div className="admin-confirm-dialog__details">
            {details.map((d, i) => (
              <div key={i} className="admin-confirm-dialog__detail-row">
                <span className="admin-confirm-dialog__detail-label">{d.label}</span>
                <span className="admin-confirm-dialog__detail-value">{d.value}</span>
              </div>
            ))}
          </div>
        )}

        {requirePayoutProof && (
          <div style={{ margin: '12px 0', display: 'grid', gap: 10 }}>
            <div>
              <label style={{
                display: 'block',
                fontSize: '0.76rem',
                fontWeight: 700,
                color: 'var(--admin-text-muted)',
                marginBottom: '6px',
                textTransform: 'uppercase',
                letterSpacing: '0.4px',
              }}>
                Amount sent (₹) <span style={{ color: 'var(--admin-danger)' }}>*</span>
              </label>
              <input
                className="admin-input"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
                placeholder="Amount as shown in UPI / bank app"
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{
                display: 'block',
                fontSize: '0.76rem',
                fontWeight: 700,
                color: 'var(--admin-text-muted)',
                marginBottom: '6px',
                textTransform: 'uppercase',
                letterSpacing: '0.4px',
              }}>
                UTR / reference number <span style={{ color: 'var(--admin-danger)' }}>*</span>
              </label>
              <input
                ref={payoutRefInput}
                className="admin-input"
                type="text"
                autoComplete="off"
                value={payoutRef}
                onChange={(e) => setPayoutRef(e.target.value)}
                placeholder="From your UPI or bank app"
                style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
              />
            </div>
          </div>
        )}

        {/* Optional Reason Input */}
        {requireReason && (
          <div style={{ margin: '12px 0' }}>
            <label style={{
              display: 'block',
              fontSize: '0.76rem',
              fontWeight: 700,
              color: 'var(--admin-text-muted)',
              marginBottom: '6px',
              textTransform: 'uppercase',
              letterSpacing: '0.4px',
            }}>
              Reason {requireReason && <span style={{ color: 'var(--admin-danger)' }}>*</span>}
            </label>
            <textarea
              ref={reasonRef}
              className="admin-input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={reasonPlaceholder}
              rows={3}
              style={{
                width: '100%',
                resize: 'vertical',
                minHeight: '64px',
                boxSizing: 'border-box',
              }}
            />
          </div>
        )}

        {/* Custom content slot */}
        {children}

        {/* Audit Notice */}
        {auditNotice && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            margin: '12px 0 0',
            padding: '8px 10px',
            borderRadius: 'var(--admin-radius)',
            background: 'rgba(99, 102, 241, 0.08)',
            border: '1px solid rgba(99, 102, 241, 0.15)',
            fontSize: '0.72rem',
            color: 'var(--admin-text-muted)',
            fontWeight: 600,
          }}>
            <span style={{ fontSize: '0.85rem' }}>🔒</span>
            This action is logged in the audit trail with your admin identity.
          </div>
        )}

        {/* Actions */}
        <div className="admin-modal__actions" style={{ marginTop: '16px' }}>
          <button
            type="button"
            className="admin-btn admin-btn--secondary"
            onClick={onCancel}
            disabled={loading}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`admin-btn ${confirmBtnClass}`}
            onClick={handleConfirm}
            disabled={loading || !reasonReady || !payoutReady}
          >
            {loading ? 'Processing…' : confirmLabel}
          </button>
        </div>
      </div>
    </AdminModal>
  );
}
