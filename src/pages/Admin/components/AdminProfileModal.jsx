import React, { useState, useEffect } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import { useAdminToast } from './AdminToastContext';

export default function AdminProfileModal({ isOpen, onClose, onUpdated }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [profile, setProfile] = useState(null);
  const { showToast } = useAdminToast();

  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowPassword(false);
      adminApiClient.get('/security/me')
        .then((data) => {
          setProfile(data);
          setEmail(data.email || '');
          setFirstName(data.first_name || '');
          setLastName(data.last_name || '');
          setDisplayName(data.display_name || '');
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (newPassword) {
      if (newPassword.length < 8) {
        showToast('New password must be at least 8 characters long', 'error');
        return;
      }
      if (newPassword !== confirmPassword) {
        showToast('New password and confirmation do not match', 'error');
        return;
      }
    }

    setBusy(true);
    try {
      await adminApiClient.put('/security/me', {
        email,
        firstName,
        lastName,
        displayName,
        currentPassword: currentPassword || undefined,
        newPassword: newPassword || undefined,
      });
      showToast('Admin profile and credentials updated successfully', 'success');
      if (onUpdated) onUpdated();
      onClose();
    } catch (err) {
      showToast(err.message || 'Failed to update profile', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-label="My Admin Profile"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100002,
        padding: '16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '480px',
          background: 'var(--admin-panel, #0f172a)',
          border: '1px solid var(--admin-border-bright, rgba(255,255,255,0.15))',
          borderRadius: '14px',
          padding: '24px',
          color: 'var(--admin-text, #f8fafc)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)',
          maxHeight: '90vh',
          overflowY: 'auto',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>My Admin Profile & Password</h3>
            <span style={{ fontSize: '0.72rem', color: 'var(--admin-text-muted)' }}>
              Manage your personal admin credentials and display information
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="admin-btn admin-btn--ghost admin-btn--sm"
            style={{ fontSize: '1.2rem', padding: '0 6px' }}
          >
            ×
          </button>
        </div>

        {loading ? (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--admin-text-muted)', fontSize: '0.84rem' }}>
            Loading profile...
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, marginBottom: '4px', color: 'var(--admin-text-muted)' }}>
                  First Name
                </label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="admin-input"
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, marginBottom: '4px', color: 'var(--admin-text-muted)' }}>
                  Last Name
                </label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="admin-input"
                  style={{ width: '100%' }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, marginBottom: '4px', color: 'var(--admin-text-muted)' }}>
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="admin-input"
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, marginBottom: '4px', color: 'var(--admin-text-muted)' }}>
                Display Title
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Lead Administrator"
                className="admin-input"
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ padding: '14px', borderRadius: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--admin-border)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--admin-text)' }}>
                  Change Password
                </span>
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  style={{ background: 'none', border: 'none', color: '#818cf8', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}
                >
                  {showPassword ? 'Hide fields' : 'Show password fields'}
                </button>
              </div>

              {showPassword && (
                <>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, marginBottom: '4px', color: 'var(--admin-text-muted)' }}>
                      Current Password
                    </label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password"
                      className="admin-input"
                      style={{ width: '100%', fontFamily: 'monospace' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, marginBottom: '4px', color: 'var(--admin-text-muted)' }}>
                      New Password (min 8 characters)
                    </label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password"
                      className="admin-input"
                      style={{ width: '100%', fontFamily: 'monospace' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, marginBottom: '4px', color: 'var(--admin-text-muted)' }}>
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter new password"
                      className="admin-input"
                      style={{ width: '100%', fontFamily: 'monospace' }}
                    />
                  </div>
                </>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
              <button
                type="button"
                onClick={onClose}
                className="admin-btn admin-btn--secondary"
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="admin-btn admin-btn--primary"
                disabled={busy}
                style={{ fontWeight: 750 }}
              >
                {busy ? 'Saving...' : 'Update My Profile'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
