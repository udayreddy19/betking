import React, { useState, useEffect } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import AdminDataTable from './AdminDataTable';
import { StatusBadge } from './AdminBadge';
import { ADMIN_ROLES } from '../permissions/AdminRBACGate';
import { useAdminToast } from './AdminToastContext';

function fmtTs(v) {
  if (!v) return 'Never';
  try {
    return new Date(v).toLocaleString();
  } catch {
    return String(v);
  }
}

function generateRandomPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

export default function AdminAccountsPanel() {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editAdmin, setEditAdmin] = useState(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { showToast } = useAdminToast();

  // Create form state
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newRole, setNewRole] = useState(ADMIN_ROLES.SUPER_ADMIN);
  const [newStatus, setNewStatus] = useState('ACTIVE');

  // Edit form state
  const [editEmail, setEditEmail] = useState('');
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editRole, setEditRole] = useState(ADMIN_ROLES.SUPER_ADMIN);
  const [editStatus, setEditStatus] = useState('ACTIVE');
  const [editPassword, setEditPassword] = useState('');
  const [editResetMfa, setEditResetMfa] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const loadAdmins = () => {
    setLoading(true);
    adminApiClient.get('/security/admin-users')
      .then((res) => {
        setAdmins(res.admins || []);
        setError(null);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load admin users');
        setAdmins([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadAdmins();
  }, []);

  const openEditModal = (admin) => {
    setEditAdmin(admin);
    setEditEmail(admin.email || '');
    setEditFirstName(admin.first_name || '');
    setEditLastName(admin.last_name || '');
    setEditDisplayName(admin.display_name || '');
    setEditRole(admin.role || ADMIN_ROLES.SUPER_ADMIN);
    setEditStatus(admin.status || 'ACTIVE');
    setEditPassword('');
    setEditResetMfa(false);
    setShowPassword(false);
  };

  const handleCreateAdmin = async (e) => {
    e.preventDefault();
    if (!newEmail || !newPassword) {
      showToast('Email and password are required', 'error');
      return;
    }
    if (newPassword.length < 8) {
      showToast('Password must be at least 8 characters', 'error');
      return;
    }
    setBusy(true);
    try {
      await adminApiClient.post('/security/admin-users', {
        email: newEmail,
        password: newPassword,
        firstName: newFirstName,
        lastName: newLastName,
        role: newRole,
        status: newStatus,
      });
      showToast(`Admin account created for ${newEmail}`, 'success');
      setIsCreateOpen(false);
      setNewEmail('');
      setNewPassword('');
      setNewFirstName('');
      setNewLastName('');
      setNewRole(ADMIN_ROLES.SUPER_ADMIN);
      loadAdmins();
    } catch (err) {
      showToast(err.message || 'Failed to create admin', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateAdmin = async (e) => {
    e.preventDefault();
    if (!editAdmin) return;
    setBusy(true);
    try {
      const payload = {
        email: editEmail,
        firstName: editFirstName,
        lastName: editLastName,
        displayName: editDisplayName,
        role: editRole,
        status: editStatus,
        resetMfa: editResetMfa,
      };
      if (editPassword && editPassword.trim()) {
        if (editPassword.trim().length < 8) {
          showToast('Password must be at least 8 characters long', 'error');
          setBusy(false);
          return;
        }
        payload.password = editPassword.trim();
      }

      await adminApiClient.put(`/security/admin-users/${encodeURIComponent(editAdmin.user_id)}`, payload);
      showToast('Admin account details updated successfully', 'success');
      setEditAdmin(null);
      loadAdmins();
    } catch (err) {
      showToast(err.message || 'Failed to update admin account', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleQuickStatusToggle = async (admin) => {
    const nextStatus = admin.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    const confirm = window.confirm(`Are you sure you want to change status of ${admin.email} to ${nextStatus}?`);
    if (!confirm) return;
    try {
      await adminApiClient.put(`/security/admin-users/${encodeURIComponent(admin.user_id)}`, {
        status: nextStatus,
      });
      showToast(`Account status updated to ${nextStatus}`, 'success');
      loadAdmins();
    } catch (err) {
      showToast(err.message || 'Failed to update status', 'error');
    }
  };

  const handleQuickResetMfa = async (admin) => {
    const confirm = window.confirm(`Reset MFA for ${admin.email}? They will be prompted to re-scan the QR code on next login.`);
    if (!confirm) return;
    try {
      await adminApiClient.put(`/security/admin-users/${encodeURIComponent(admin.user_id)}`, {
        resetMfa: true,
      });
      showToast(`MFA reset for ${admin.email}. Authenticator re-enrollment required.`, 'success');
      loadAdmins();
    } catch (err) {
      showToast(err.message || 'Failed to reset MFA', 'error');
    }
  };

  const activeCount = admins.filter((a) => a.status === 'ACTIVE').length;
  const superCount = admins.filter((a) => ['SUPER_ADMIN', 'ADMIN', 'SUPERADMIN'].includes(String(a.role).toUpperCase())).length;
  const mfaCount = admins.filter((a) => a.mfa_enabled).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: 'var(--admin-text)' }}>
            Admin Accounts & Credentials
          </h2>
          <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.84rem' }}>
            Authoritative directory of operators, superusers, and desk admins. Super Admins can update credentials, assign RBAC roles, reset passwords, and re-enroll MFA.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setIsCreateOpen(true);
            setNewPassword(generateRandomPassword());
          }}
          className="admin-btn admin-btn--primary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}
        >
          <span>+</span> Create Admin Account
        </button>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', color: '#fbbf24', fontSize: '0.82rem' }}>
          {error}
        </div>
      )}

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
        <div style={{ padding: '14px', borderRadius: '10px', background: 'var(--admin-surface)', border: '1px solid var(--admin-border)' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--admin-text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Total Admins</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--admin-text)', marginTop: '4px' }}>{admins.length}</div>
        </div>
        <div style={{ padding: '14px', borderRadius: '10px', background: 'var(--admin-surface)', border: '1px solid var(--admin-border)' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--admin-text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Active Accounts</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#10b981', marginTop: '4px' }}>{activeCount}</div>
        </div>
        <div style={{ padding: '14px', borderRadius: '10px', background: 'var(--admin-surface)', border: '1px solid var(--admin-border)' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--admin-text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Super Admins</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#818cf8', marginTop: '4px' }}>{superCount}</div>
        </div>
        <div style={{ padding: '14px', borderRadius: '10px', background: 'var(--admin-surface)', border: '1px solid var(--admin-border)' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--admin-text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>MFA Enrolled</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: mfaCount === admins.length ? '#10b981' : '#f59e0b', marginTop: '4px' }}>
            {mfaCount} / {admins.length}
          </div>
        </div>
      </div>

      {/* Main Admin Table */}
      <AdminDataTable
        title="Admin Operators & Security Credentials"
        emptyMessage="No admin accounts found"
        data={admins}
        loading={loading}
        columns={[
          {
            header: 'Admin User',
            key: 'email',
            render: (r) => (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #6366f1 0%, #3b82f6 100%)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '0.75rem',
                  flexShrink: 0,
                }}>
                  {(r.first_name?.[0] || r.email?.[0] || 'A').toUpperCase()}
                  {(r.last_name?.[0] || '').toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: 750, color: 'var(--admin-text)', fontSize: '0.84rem' }}>
                    {r.display_name || `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'Admin Operator'}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--admin-text-muted)', fontFamily: 'monospace' }}>
                    {r.email}
                  </div>
                </div>
              </div>
            ),
          },
          {
            header: 'RBAC Role',
            key: 'role',
            render: (r) => {
              const role = String(r.role || 'SUPER_ADMIN').toUpperCase();
              const badgeClass = role.includes('SUPER')
                ? 'admin-badge--purple'
                : role.includes('FINANCE')
                  ? 'admin-badge--info'
                  : role.includes('TRADING')
                    ? 'admin-badge--warning'
                    : 'admin-badge--neutral';
              return (
                <span className={`admin-badge ${badgeClass}`}>
                  {role}
                </span>
              );
            },
          },
          {
            header: 'Status',
            key: 'status',
            render: (r) => (
              <StatusBadge status={r.status || 'ACTIVE'} />
            ),
          },
          {
            header: 'MFA Auth',
            key: 'mfa_enabled',
            render: (r) => (
              <span className={`admin-badge ${r.mfa_enabled ? 'admin-badge--success' : 'admin-badge--warning'}`}>
                {r.mfa_enabled ? '✓ TOTP ACTIVE' : '⚠ PENDING / NONE'}
              </span>
            ),
          },
          {
            header: 'Last Login',
            key: 'last_login_at',
            render: (r) => (
              <span style={{ fontSize: '0.76rem', color: 'var(--admin-text-muted)' }}>
                {fmtTs(r.last_login_at)}
              </span>
            ),
          },
          {
            header: 'Actions',
            key: 'actions',
            render: (r) => (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => openEditModal(r)}
                  className="admin-btn admin-btn--sm admin-btn--primary"
                  title="Edit details, email, or password"
                >
                  Edit / Password
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickResetMfa(r)}
                  className="admin-btn admin-btn--sm"
                  title="Force re-enrollment of authenticator app"
                >
                  Reset MFA
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickStatusToggle(r)}
                  className={`admin-btn admin-btn--sm ${r.status === 'ACTIVE' ? 'admin-btn--danger' : 'admin-btn--secondary'}`}
                  title={r.status === 'ACTIVE' ? 'Suspend admin access' : 'Activate admin account'}
                >
                  {r.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                </button>
              </div>
            ),
          },
        ]}
      />

      {/* CREATE ADMIN MODAL */}
      {isCreateOpen && (
        <div
          role="dialog"
          aria-label="Create Admin Account"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100001,
            padding: '16px',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsCreateOpen(false);
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '520px',
              background: 'var(--admin-panel, #0f172a)',
              border: '1px solid var(--admin-border-bright, rgba(255,255,255,0.15))',
              borderRadius: '14px',
              padding: '24px',
              color: 'var(--admin-text, #f8fafc)',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>Create New Admin Account</h3>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="admin-btn admin-btn--ghost admin-btn--sm"
                style={{ fontSize: '1.2rem', padding: '0 6px' }}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleCreateAdmin} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, marginBottom: '4px', color: 'var(--admin-text-muted)' }}>
                    First Name
                  </label>
                  <input
                    type="text"
                    required
                    value={newFirstName}
                    onChange={(e) => setNewFirstName(e.target.value)}
                    placeholder="e.g. John"
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
                    required
                    value={newLastName}
                    onChange={(e) => setNewLastName(e.target.value)}
                    placeholder="e.g. Doe"
                    className="admin-input"
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, marginBottom: '4px', color: 'var(--admin-text-muted)' }}>
                  Admin Email Address *
                </label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="admin@oddsyra.com"
                  className="admin-input"
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--admin-text-muted)' }}>
                    Initial Password *
                  </label>
                  <button
                    type="button"
                    onClick={() => setNewPassword(generateRandomPassword())}
                    style={{ background: 'none', border: 'none', color: '#818cf8', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer' }}
                  >
                    🎲 Generate Strong Password
                  </button>
                </div>
                <input
                  type="text"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="admin-input"
                  style={{ width: '100%', fontFamily: 'monospace' }}
                />
                <span style={{ fontSize: '0.68rem', color: 'var(--admin-text-dim)', marginTop: '2px', display: 'block' }}>
                  The operator will use this password + MFA code to sign in.
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, marginBottom: '4px', color: 'var(--admin-text-muted)' }}>
                    Admin Role
                  </label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="admin-select"
                    style={{ width: '100%' }}
                  >
                    {Object.values(ADMIN_ROLES).map((role) => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, marginBottom: '4px', color: 'var(--admin-text-muted)' }}>
                    Status
                  </label>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                    className="admin-select"
                    style={{ width: '100%' }}
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="SUSPENDED">SUSPENDED</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
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
                  {busy ? 'Creating...' : 'Create Admin User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT ADMIN / CHANGE PASSWORD MODAL */}
      {editAdmin && (
        <div
          role="dialog"
          aria-label="Edit Admin Account"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100001,
            padding: '16px',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditAdmin(null);
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '540px',
              background: 'var(--admin-panel, #0f172a)',
              border: '1px solid var(--admin-border-bright, rgba(255,255,255,0.15))',
              borderRadius: '14px',
              padding: '24px',
              color: 'var(--admin-text, #f8fafc)',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>Edit Admin Credentials</h3>
                <span style={{ fontSize: '0.72rem', color: 'var(--admin-text-muted)', fontFamily: 'monospace' }}>
                  ID: {editAdmin.user_id}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setEditAdmin(null)}
                className="admin-btn admin-btn--ghost admin-btn--sm"
                style={{ fontSize: '1.2rem', padding: '0 6px' }}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleUpdateAdmin} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, marginBottom: '4px', color: 'var(--admin-text-muted)' }}>
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="admin-input"
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, marginBottom: '4px', color: 'var(--admin-text-muted)' }}>
                    First Name
                  </label>
                  <input
                    type="text"
                    value={editFirstName}
                    onChange={(e) => setEditFirstName(e.target.value)}
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
                    value={editLastName}
                    onChange={(e) => setEditLastName(e.target.value)}
                    className="admin-input"
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, marginBottom: '4px', color: 'var(--admin-text-muted)' }}>
                  Display Name / Title
                </label>
                <input
                  type="text"
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  placeholder="e.g. Lead Risk Desk Manager"
                  className="admin-input"
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, marginBottom: '4px', color: 'var(--admin-text-muted)' }}>
                    RBAC Role
                  </label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value)}
                    className="admin-select"
                    style={{ width: '100%' }}
                  >
                    {Object.values(ADMIN_ROLES).map((role) => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, marginBottom: '4px', color: 'var(--admin-text-muted)' }}>
                    Account Status
                  </label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="admin-select"
                    style={{ width: '100%' }}
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="SUSPENDED">SUSPENDED</option>
                    <option value="LOCKED">LOCKED</option>
                  </select>
                </div>
              </div>

              {/* Password Section */}
              <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--admin-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--admin-text)' }}>
                    Change Password (Optional)
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setEditPassword(generateRandomPassword());
                      setShowPassword(true);
                    }}
                    style={{ background: 'none', border: 'none', color: '#818cf8', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer' }}
                  >
                    🎲 Generate Password
                  </button>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    placeholder="Leave blank to keep existing password"
                    className="admin-input"
                    style={{ flex: 1, fontFamily: 'monospace' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    className="admin-btn admin-btn--secondary admin-btn--sm"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <span style={{ fontSize: '0.68rem', color: 'var(--admin-text-dim)', marginTop: '4px', display: 'block' }}>
                  Updating password immediately unlocks any failed attempt counters.
                </span>
              </div>

              {/* MFA Reset Option */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0' }}>
                <input
                  type="checkbox"
                  id="resetMfaCheckbox"
                  checked={editResetMfa}
                  onChange={(e) => setEditResetMfa(e.target.checked)}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <label htmlFor="resetMfaCheckbox" style={{ fontSize: '0.78rem', color: 'var(--admin-text)', cursor: 'pointer' }}>
                  <strong>Reset Authenticator (MFA)</strong> — Force admin to re-scan TOTP QR code on next login
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setEditAdmin(null)}
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
                  {busy ? 'Saving...' : 'Save Admin Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
