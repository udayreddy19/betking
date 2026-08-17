/**
 * Enterprise Advanced User Security & Account Controls Engine — OddsYra Sportsbook (lib/userSecurityCenter.mjs)
 * Manages device fingerprinting, active session revocation, security alerts,
 * and account restriction state machines (Temporary Restriction, Freeze, Self-Exclusion, Suspension).
 */

import { recordDeviceFingerprint } from './deviceFingerprintEngine.mjs';
import { dispatchNotificationEvent } from './notificationEngine.mjs';

let pgQuery = null;
async function safePgQuery(text, params) {
  if (typeof window !== 'undefined') return { rows: [], rowCount: 0 };
  try {
    if (!pgQuery) {
      const mod = await import('../db/pg.js');
      pgQuery = mod.query;
    }
    return await pgQuery(text, params);
  } catch (err) {
    console.error('[UserSecurityCenter PG Warning]', err.message);
    return { rows: [], rowCount: 0 };
  }
}

class UserSecurityCenter {
  constructor() {
    this.devices = new Map(); // userId -> Map(deviceId -> deviceObj)
    this.securityAlerts = new Map(); // userId -> alertObj[]
    this.accountControls = new Map(); // userId -> controlObj
    this.auditLogs = [];
  }

  // ---------------------------------------------------------------------------
  // 1. DEVICE MANAGEMENT & ACTIVE SESSION REVOCATION
  // ---------------------------------------------------------------------------
  async registerDevice(userId, {
    deviceId = null,
    deviceHash = 'hash_default_dev',
    deviceType = 'Desktop',
    platform = 'Web',
    browser = 'Chrome',
    os = 'macOS',
    ipAddress = '127.0.0.1',
    locationCity = 'Mumbai',
    locationCountry = 'India',
  }) {
    if (!userId) throw new Error('registerDevice requires userId');

    const devId = deviceId || `dev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();

    const deviceObj = {
      deviceId: devId,
      userId,
      deviceHash,
      deviceType,
      platform,
      browser,
      os,
      ipAddress,
      locationCity,
      locationCountry,
      trustStatus: 'UNTRUSTED',
      isActiveSession: true,
      firstSeen: now,
      lastSeen: now,
    };

    let userDevMap = this.devices.get(userId);
    if (!userDevMap) {
      userDevMap = new Map();
      this.devices.set(userId, userDevMap);
    }

    const isNewDevice = !userDevMap.has(devId);
    userDevMap.set(devId, deviceObj);

    // Persist to PostgreSQL
    try {
      await safePgQuery(
        `INSERT INTO users (user_id, email) VALUES ($1, $1) ON CONFLICT (user_id) DO NOTHING`,
        [userId]
      );

      await safePgQuery(`
        INSERT INTO user_devices (device_id, user_id, device_hash, device_type, platform, browser, os, ip_address, location_city, location_country, trust_status, is_active_session, first_seen, last_seen)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (device_id) DO UPDATE
        SET last_seen = CURRENT_TIMESTAMP, ip_address = EXCLUDED.ip_address, is_active_session = TRUE;
      `, [devId, userId, deviceHash, deviceType, platform, browser, os, ipAddress, locationCity, locationCountry, 'UNTRUSTED', true, now, now]);

      // Check device risk signal
      await recordDeviceFingerprint({ userId, deviceHash, platform, browser, os, ipAddress });
    } catch (err) {
      console.error('[UserSecurityCenter Register Device Warning]', err.message);
    }

    // Generate NEW_DEVICE_LOGIN Security Alert if new device
    if (isNewDevice) {
      await this.createSecurityAlert(userId, {
        alertType: 'NEW_DEVICE_LOGIN',
        severity: 'MEDIUM',
        title: 'New Device Login Detected',
        description: `Your account was accessed from a new ${os} device running ${browser} (${ipAddress}, ${locationCity}).`,
        ipAddress,
        deviceInfo: `${os} · ${browser}`,
      });
    }

    return deviceObj;
  }

  getUserDevices(userId) {
    const userDevMap = this.devices.get(userId);
    if (!userDevMap) return [];
    return Array.from(userDevMap.values());
  }

  async logoutDevice(userId, deviceId) {
    const userDevMap = this.devices.get(userId);
    if (userDevMap && userDevMap.has(deviceId)) {
      const dev = userDevMap.get(deviceId);
      dev.isActiveSession = false;
    }

    try {
      await safePgQuery(
        `UPDATE user_devices SET is_active_session = FALSE WHERE user_id = $1 AND device_id = $2`,
        [userId, deviceId]
      );
    } catch (ignored) {}

    this.auditSecurityAction(userId, 'device_logout', { deviceId });
    return { success: true, deviceId };
  }

  async logoutAllOtherDevices(userId, currentDeviceId) {
    const userDevMap = this.devices.get(userId);
    let revokedCount = 0;

    if (userDevMap) {
      for (const [dId, dev] of userDevMap.entries()) {
        if (dId !== currentDeviceId) {
          dev.isActiveSession = false;
          revokedCount++;
        }
      }
    }

    try {
      await safePgQuery(
        `UPDATE user_devices SET is_active_session = FALSE WHERE user_id = $1 AND device_id != $2`,
        [userId, currentDeviceId || 'none']
      );
    } catch (ignored) {}

    await this.createSecurityAlert(userId, {
      alertType: 'LOGOUT_ALL_DEVICES',
      severity: 'HIGH',
      title: 'Logged Out All Other Devices',
      description: 'Active sessions across all other devices were terminated by your request.',
    });

    this.auditSecurityAction(userId, 'logout_all_other_devices', { currentDeviceId, revokedCount });
    return { success: true, revokedCount };
  }

  async trustDevice(userId, deviceId) {
    const userDevMap = this.devices.get(userId);
    if (userDevMap && userDevMap.has(deviceId)) {
      userDevMap.get(deviceId).trustStatus = 'TRUSTED';
    }

    try {
      await safePgQuery(
        `UPDATE user_devices SET trust_status = 'TRUSTED' WHERE user_id = $1 AND device_id = $2`,
        [userId, deviceId]
      );
    } catch (ignored) {}

    return { success: true, deviceId, trustStatus: 'TRUSTED' };
  }

  // ---------------------------------------------------------------------------
  // 2. SECURITY ALERTS SYSTEM
  // ---------------------------------------------------------------------------
  async createSecurityAlert(userId, {
    alertType,
    severity = 'MEDIUM',
    title,
    description,
    ipAddress = '127.0.0.1',
    deviceInfo = 'Web Session',
    metadata = {},
  }) {
    const alertId = `alt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();

    const alertObj = {
      alertId,
      userId,
      alertType,
      severity,
      title,
      description,
      ipAddress,
      deviceInfo,
      isRead: false,
      metadata,
      createdAt: now,
    };

    let alertsList = this.securityAlerts.get(userId) || [];
    alertsList.unshift(alertObj);
    this.securityAlerts.set(userId, alertsList);

    // Persist to PostgreSQL
    try {
      await safePgQuery(
        `INSERT INTO users (user_id, email) VALUES ($1, $1) ON CONFLICT (user_id) DO NOTHING`,
        [userId]
      );

      await safePgQuery(`
        INSERT INTO user_security_alerts (alert_id, user_id, alert_type, severity, title, description, ip_address, device_info, is_read, metadata, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [alertId, userId, alertType, severity, title, description, ipAddress, deviceInfo, false, JSON.stringify(metadata), now]);

      dispatchNotificationEvent({
        eventId: alertId,
        eventType: alertType,
        userId,
        category: 'SECURITY',
        channel: 'IN_APP',
        data: { title, description, severity },
      }).catch(() => {});
    } catch (err) {
      console.error('[UserSecurityCenter Security Alert Warning]', err.message);
    }

    return alertObj;
  }

  getUserSecurityAlerts(userId) {
    return this.securityAlerts.get(userId) || [];
  }

  markAlertAsRead(userId, alertId) {
    const alerts = this.securityAlerts.get(userId) || [];
    const target = alerts.find(a => a.alertId === alertId);
    if (target) target.isRead = true;

    try {
      safePgQuery(`UPDATE user_security_alerts SET is_read = TRUE WHERE alert_id = $1`, [alertId]).catch(() => {});
    } catch (ignored) {}

    return { success: true, alertId };
  }

  // ---------------------------------------------------------------------------
  // 3. ACCOUNT CONTROLS & STATE MACHINE
  // ---------------------------------------------------------------------------
  async setAccountControlState(userId, {
    accountState = 'ACTIVE', // ACTIVE | TEMPORARY_RESTRICTED | SUSPENDED | FROZEN | SELF_EXCLUDED | TIMEOUT | PERMANENT_CLOSED
    reason = '',
    category = 'GENERAL',
    operatorId = 'system',
    durationDays = null,
  }) {
    if (!userId) throw new Error('setAccountControlState requires userId');

    const now = new Date();
    let restrictedUntil = null;
    if (durationDays) {
      restrictedUntil = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000).toISOString();
    }

    const controlId = `ctrl_${userId}`;
    const controlObj = {
      controlId,
      userId,
      accountState,
      reason,
      category,
      operatorId,
      restrictedUntil,
      updatedAt: now.toISOString(),
    };

    this.accountControls.set(userId, controlObj);

    // Persist to PostgreSQL
    try {
      await safePgQuery(
        `INSERT INTO users (user_id, email) VALUES ($1, $1) ON CONFLICT (user_id) DO NOTHING`,
        [userId]
      );

      await safePgQuery(`
        INSERT INTO user_account_controls (control_id, user_id, account_state, reason, category, operator_id, restricted_until, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT (control_id) DO UPDATE
        SET account_state = EXCLUDED.account_state, reason = EXCLUDED.reason, category = EXCLUDED.category, operator_id = EXCLUDED.operator_id, restricted_until = EXCLUDED.restricted_until, updated_at = NOW();
      `, [controlId, userId, accountState, reason, category, operatorId, restrictedUntil]);
    } catch (err) {
      console.error('[UserSecurityCenter Account Controls Warning]', err.message);
    }

    this.auditSecurityAction(userId, `account_state_${accountState.toLowerCase()}`, { reason, category, operatorId, restrictedUntil });

    return controlObj;
  }

  getAccountControlStatus(userId) {
    const control = this.accountControls.get(userId);
    if (!control) return { userId, accountState: 'ACTIVE', isRestricted: false };

    // Check if restriction timer expired
    if (control.restrictedUntil && new Date(control.restrictedUntil) < new Date()) {
      control.accountState = 'ACTIVE';
      control.restrictedUntil = null;
    }

    const isRestricted = control.accountState !== 'ACTIVE';
    return { ...control, isRestricted };
  }

  restrictAccount(userId, options = {}) {
    return this.setAccountControlState(userId, { accountState: 'TEMPORARY_RESTRICTED', ...options });
  }

  suspendAccount(userId, options = {}) {
    return this.setAccountControlState(userId, { accountState: 'SUSPENDED', ...options });
  }

  freezeAccount(userId, options = {}) {
    return this.setAccountControlState(userId, { accountState: 'FROZEN', ...options });
  }

  selfExcludeAccount(userId, { durationDays = 7, reason = 'User Self-Exclusion' } = {}) {
    return this.setAccountControlState(userId, {
      accountState: 'SELF_EXCLUDED',
      category: 'RESPONSIBLE_GAMING',
      durationDays,
      reason,
      operatorId: userId,
    });
  }

  recoverAccount(userId, { operatorId = 'admin', verificationRef = '' } = {}) {
    return this.setAccountControlState(userId, {
      accountState: 'ACTIVE',
      reason: `Account restored via operator review (${verificationRef})`,
      operatorId,
    });
  }

  // ---------------------------------------------------------------------------
  // 4. SECURITY AUDIT LOGGING
  // ---------------------------------------------------------------------------
  auditSecurityAction(userId, action, details = {}, actorId = 'system') {
    const auditObj = {
      userId,
      actorId,
      action,
      details,
      createdAt: new Date().toISOString(),
    };
    this.auditLogs.push(auditObj);

    try {
      safePgQuery(`
        INSERT INTO user_security_audit_logs (user_id, actor_id, action, details)
        VALUES ($1, $2, $3, $4)
      `, [userId, actorId, action, JSON.stringify(details)]).catch(() => {});
    } catch (ignored) {}

    return auditObj;
  }
}

export const userSecurityCenter = new UserSecurityCenter();
