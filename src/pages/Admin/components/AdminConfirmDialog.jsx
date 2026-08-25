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
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  loading = false,
  auditNotice = true,
  children,
}) {
  const [reason, setReason] = useState(reasonDefault);
  const reasonRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setReason(reasonDefault);
      if (requireReason) {
        setTimeout(() => reasonRef.current?.focus(), 120);
      }
    }
  }, [isOpen, reasonDefault, requireReason]);

  const handleConfirm = () => {
    if (requireReason && !reason.trim()) return;
    onConfirm(reason.trim());
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
            disabled={loading || (requireReason && !reason.trim())}
          >
            {loading ? 'Processing…' : confirmLabel}
          </button>
        </div>
      </div>
    </AdminModal>
  );
}
