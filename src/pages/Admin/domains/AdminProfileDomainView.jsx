import React, { useCallback, useEffect, useState } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import AdminThemePicker from '../components/AdminThemePicker';
import ThemeToggle from '../../../components/ThemeToggle/ThemeToggle';
import { useAdminTheme } from '../context/AdminThemeContext';
import { useAdminUiMode } from '../context/AdminUiModeContext';
import { useAdminRole } from '../permissions/AdminRBACGate';
import { useAdminToast } from '../components/AdminToastContext';
import { StatusBadge } from '../components/AdminBadge';
import { formatIstDateTime } from '../../../utils/istTime';

function SectionCard({ title, description, children, actions }) {
  return (
    <section className="admin-profile-page__card">
      <div className="admin-profile-page__card-head">
        <div>
          <h3 className="admin-profile-page__card-title">{title}</h3>
          {description ? (
            <p className="admin-profile-page__card-desc">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="admin-profile-page__card-actions">{actions}</div> : null}
      </div>
      <div className="admin-profile-page__card-body">{children}</div>
    </section>
  );
}

function AccountPanel({ profile, onReload }) {
  const { showToast } = useAdminToast();
  const [form, setForm] = useState({
    displayName: '',
    firstName: '',
    lastName: '',
    email: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setForm({
      displayName: profile.display_name || '',
      firstName: profile.first_name || '',
      lastName: profile.last_name || '',
      email: profile.email || '',
    });
  }, [profile]);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await adminApiClient.put('/security/me', {
        displayName: form.displayName.trim(),
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
      });
      showToast('Profile saved', 'success');
      onReload?.();
    } catch (err) {
      showToast(err.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!profile) {
    return <p style={{ color: 'var(--admin-text-muted)' }}>Loading account…</p>;
  }

  return (
    <div className="admin-profile-page__stack">
      <SectionCard
        title="Identity"
        description="How you appear in admin audit trails and operator tools."
      >
        <div className="admin-profile-page__meta-grid">
          <div>
            <div className="admin-profile-page__meta-label">User ID</div>
            <div className="admin-profile-page__meta-value admin-text-mono">{profile.user_id || '—'}</div>
          </div>
          <div>
            <div className="admin-profile-page__meta-label">Role</div>
            <div className="admin-profile-page__meta-value"><StatusBadge status={profile.role || 'ADMIN'} /></div>
          </div>
          <div>
            <div className="admin-profile-page__meta-label">Status</div>
            <div className="admin-profile-page__meta-value"><StatusBadge status={profile.status || 'ACTIVE'} /></div>
          </div>
          <div>
            <div className="admin-profile-page__meta-label">Last login</div>
            <div className="admin-profile-page__meta-value">
              {profile.last_login_at ? formatIstDateTime(profile.last_login_at) : '—'}
            </div>
          </div>
          <div>
            <div className="admin-profile-page__meta-label">Joined</div>
            <div className="admin-profile-page__meta-value">
              {profile.created_at ? formatIstDateTime(profile.created_at) : '—'}
            </div>
          </div>
          <div>
            <div className="admin-profile-page__meta-label">MFA</div>
            <div className="admin-profile-page__meta-value">
              <StatusBadge status={profile.mfa_enabled ? 'ENABLED' : 'OFF'} />
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Account details"
        description="Update your name and email. Email changes apply to this admin login."
      >
        <form className="admin-profile-page__form" onSubmit={save}>
          <label className="admin-profile-page__field">
            <span>Display name</span>
            <input
              className="admin-input"
              value={form.displayName}
              onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
              placeholder="Admin Operator"
            />
          </label>
          <div className="admin-profile-page__row">
            <label className="admin-profile-page__field">
              <span>First name</span>
              <input
                className="admin-input"
                value={form.firstName}
                onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
              />
            </label>
            <label className="admin-profile-page__field">
              <span>Last name</span>
              <input
                className="admin-input"
                value={form.lastName}
                onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
              />
            </label>
          </div>
          <label className="admin-profile-page__field">
            <span>Email</span>
            <input
              className="admin-input"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              required
            />
          </label>
          <div className="admin-profile-page__form-actions">
            <button type="submit" className="admin-btn admin-btn--primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save account'}
            </button>
          </div>
        </form>
      </SectionCard>
    </div>
  );
}

function AppearancePanel() {
  const { theme, themeId } = useAdminTheme();
  const { revamp, setRevamp } = useAdminUiMode();

  return (
    <div className="admin-profile-page__stack">
      <SectionCard
        title="Admin themes"
        description="Palette for Admin chrome only. Sportsbook theme stays independent unless you choose Match site."
      >
        <p className="admin-profile-page__hint">
          Active: <strong>{theme.label}</strong> — {theme.description}
        </p>
        <AdminThemePicker variant="inline" />
      </SectionCard>

      <SectionCard
        title="Interface"
        description="Layout density and site light/dark when matching the sportsbook."
      >
        <div className="admin-profile-page__pref-row">
          <div>
            <div className="admin-profile-page__pref-title">New Admin UI</div>
            <div className="admin-profile-page__pref-desc">
              Softer controls and segmented domain tabs. Classic keeps the previous chrome.
            </div>
          </div>
          <button
            type="button"
            className={`admin-ui-mode-toggle${revamp ? ' is-on' : ''}`}
            onClick={() => setRevamp(!revamp)}
            aria-pressed={revamp}
          >
            <span className="admin-ui-mode-toggle__track" aria-hidden="true">
              <span className={`admin-ui-mode-toggle__thumb${revamp ? ' is-on' : ''}`} />
            </span>
            <span className="admin-ui-mode-toggle__label">{revamp ? 'New UI' : 'Classic'}</span>
          </button>
        </div>

        {themeId === 'match' ? (
          <div className="admin-profile-page__pref-row" style={{ marginTop: 14 }}>
            <div>
              <div className="admin-profile-page__pref-title">Site light / dark</div>
              <div className="admin-profile-page__pref-desc">
                Follows the sportsbook theme while Match site is selected.
              </div>
            </div>
            <ThemeToggle />
          </div>
        ) : (
          <p className="admin-profile-page__hint" style={{ marginTop: 14 }}>
            Site light/dark is hidden for fixed Admin palettes. Switch to Match site to control it.
          </p>
        )}
      </SectionCard>
    </div>
  );
}

function SecurityPanel({ profile, onReload }) {
  const { showToast } = useAdminToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const changePassword = async (e) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      showToast('New password must be at least 8 characters', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('New passwords do not match', 'error');
      return;
    }
    setSaving(true);
    try {
      await adminApiClient.put('/security/me', {
        currentPassword,
        newPassword,
      });
      showToast('Password updated', 'success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      onReload?.();
    } catch (err) {
      showToast(err.message || 'Password update failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-profile-page__stack">
      <SectionCard
        title="Authenticator (MFA)"
        description="TOTP protects admin sign-in. Enrollment runs at login when MFA is required for your account."
      >
        <div className="admin-profile-page__pref-row">
          <div>
            <div className="admin-profile-page__pref-title">MFA status</div>
            <div className="admin-profile-page__pref-desc">
              {profile?.mfa_enabled
                ? 'Authenticator is enabled for this admin account.'
                : 'Authenticator is not enabled yet. You will be prompted at the next login if MFA is enforced.'}
            </div>
          </div>
          <StatusBadge status={profile?.mfa_enabled ? 'ENABLED' : 'OFF'} />
        </div>
      </SectionCard>

      <SectionCard
        title="Change password"
        description="Requires your current password when one is already set on the account."
      >
        <form className="admin-profile-page__form" onSubmit={changePassword}>
          <label className="admin-profile-page__field">
            <span>Current password</span>
            <input
              className="admin-input"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </label>
          <label className="admin-profile-page__field">
            <span>New password</span>
            <input
              className="admin-input"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              required
            />
          </label>
          <label className="admin-profile-page__field">
            <span>Confirm new password</span>
            <input
              className="admin-input"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={8}
              required
            />
          </label>
          <div className="admin-profile-page__form-actions">
            <button type="submit" className="admin-btn admin-btn--primary" disabled={saving}>
              {saving ? 'Updating…' : 'Update password'}
            </button>
          </div>
        </form>
      </SectionCard>
    </div>
  );
}

function PreferencesPanel({ onLogout }) {
  const { activeRole } = useAdminRole();
  const { theme } = useAdminTheme();
  const { revamp } = useAdminUiMode();

  return (
    <div className="admin-profile-page__stack">
      <SectionCard
        title="Session"
        description="Sign out clears the admin JWT on this browser. Open tickets and drafts are not affected."
      >
        <div className="admin-profile-page__meta-grid">
          <div>
            <div className="admin-profile-page__meta-label">Active role</div>
            <div className="admin-profile-page__meta-value">{activeRole}</div>
          </div>
          <div>
            <div className="admin-profile-page__meta-label">Theme</div>
            <div className="admin-profile-page__meta-value">{theme.label}</div>
          </div>
          <div>
            <div className="admin-profile-page__meta-label">UI mode</div>
            <div className="admin-profile-page__meta-value">{revamp ? 'New UI' : 'Classic'}</div>
          </div>
        </div>
        <div className="admin-profile-page__form-actions" style={{ marginTop: 16 }}>
          <button type="button" className="admin-btn admin-btn--danger" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </SectionCard>
    </div>
  );
}

export default function AdminProfileDomainView({
  subModule = 'account',
  onLogout,
}) {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);
  const { activeRole } = useAdminRole();

  const load = useCallback(() => {
    adminApiClient.get('/security/me')
      .then((data) => {
        setProfile(data);
        setError(null);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load profile');
        setProfile({
          role: activeRole,
          display_name: 'Admin Operator',
          mfa_enabled: false,
        });
      });
  }, [activeRole]);

  useEffect(() => {
    load();
  }, [load]);

  const title = {
    account: 'Account',
    appearance: 'Appearance',
    security: 'Security',
    session: 'Session',
  }[subModule] || 'Profile';

  return (
    <div className="admin-profile-page">
      <div className="admin-page-header" style={{ marginBottom: 18 }}>
        <h2 className="admin-page-header__title">Admin profile</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.85rem' }}>
          {title} — manage your operator identity, Admin themes, and security settings.
        </p>
        {error ? (
          <p style={{ color: '#fbbf24', fontSize: '0.8rem', marginTop: 8 }}>{error}</p>
        ) : null}
      </div>

      {subModule === 'appearance' && <AppearancePanel />}
      {subModule === 'security' && <SecurityPanel profile={profile} onReload={load} />}
      {subModule === 'session' && <PreferencesPanel onLogout={onLogout} />}
      {(subModule === 'account' || !['appearance', 'security', 'session'].includes(subModule)) && (
        <AccountPanel profile={profile} onReload={load} />
      )}
    </div>
  );
}
