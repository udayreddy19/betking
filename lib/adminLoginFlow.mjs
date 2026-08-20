import {
  generateAdminToken,
  generateAdminMfaPendingToken,
  verifyAdminToken,
  ADMIN_ROLES,
} from '../server/middleware/adminAuth.js';
import { isAdminEligibleUser, adminJwtRoleForUser } from './adminAccess.mjs';
import {
  confirmAdminMfaEnrollment,
  getAdminMfaRow,
  isAdminMfaEnforced,
  startAdminMfaEnrollment,
  verifyAdminMfaCode,
} from './adminMfa.mjs';

export function isProductionRuntime() {
  return process.env.NODE_ENV === 'production';
}

/** Passwordless admin bootstrap is never allowed in production, even if ADMIN_DEV_LOGIN=1. */
export function isAdminDevBootstrapAllowed() {
  if (isProductionRuntime()) return false;
  return process.env.ADMIN_DEV_LOGIN === '1';
}

export function issueAdminSessionJson(adminId, role) {
  return {
    success: true,
    token: generateAdminToken(adminId, role, 'oddsyra_in'),
    role,
    adminId,
    expiresInHours: 8,
  };
}

async function mfaGate(account, role) {
  const userId = account.userId || account.user_id;
  const email = account.email;
  const row = await getAdminMfaRow(userId);
  const enforced = isAdminMfaEnforced();

  if (row?.enabled) {
    return {
      success: false,
      code: 'MFA_REQUIRED',
      error: 'Enter the authenticator code for this admin account.',
      mfaToken: generateAdminMfaPendingToken(userId, role),
    };
  }

  if (enforced) {
    const enroll = await startAdminMfaEnrollment(userId, email || userId);
    return {
      success: false,
      code: 'MFA_SETUP_REQUIRED',
      error: 'Set up authenticator app (TOTP) before opening admin.',
      mfaToken: generateAdminMfaPendingToken(userId, role),
      secret: enroll.secret,
      otpauthUrl: enroll.otpauthUrl,
    };
  }

  return issueAdminSessionJson(userId, role);
}

export async function completeAdminPasswordLogin(account) {
  if (!isAdminEligibleUser(account)) {
    const err = new Error('This account is not allowed to open the admin console.');
    err.code = 'ADMIN_NOT_ALLOWED';
    err.status = 403;
    throw err;
  }
  const role = adminJwtRoleForUser(account);
  return mfaGate(account, role);
}

export async function completeAdminBearerUpgrade(user) {
  const account = {
    userId: user.user_id || user.userId,
    email: user.email,
    role: user.role,
  };
  return completeAdminPasswordLogin(account);
}

export async function completeAdminMfa(mfaToken, code, { enroll = false } = {}) {
  const decoded = verifyAdminToken(mfaToken);
  if (!decoded || decoded.type !== 'admin_mfa_pending' || !decoded.sub) {
    const err = new Error('MFA session expired. Sign in again.');
    err.code = 'MFA_EXPIRED';
    err.status = 401;
    throw err;
  }
  const userId = decoded.sub;
  const role = Object.values(ADMIN_ROLES).includes(decoded.role)
    ? decoded.role
    : ADMIN_ROLES.SUPER_ADMIN;

  if (enroll) {
    await confirmAdminMfaEnrollment(userId, code);
  } else {
    await verifyAdminMfaCode(userId, code);
  }
  return issueAdminSessionJson(userId, role);
}
