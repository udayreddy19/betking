import { describe, it, expect } from 'vitest';
import { generateAdminToken, generateAdminMfaPendingToken, ADMIN_ROLES } from '../../server/middleware/adminAuth.js';
import { generateAccessToken } from '../../server/auth/tokenService.js';
import { decodeJwtPayload, getAdminSessionState } from '../../src/utils/adminSession.js';

describe('admin session gate for /developer', () => {
  it('accepts a type=admin JWT with an admin role', () => {
    const token = generateAdminToken('admin_1', ADMIN_ROLES.SUPER_ADMIN);
    const payload = decodeJwtPayload(token);
    expect(payload.type).toBe('admin');
    expect(getAdminSessionState(token).valid).toBe(true);
  });

  it('rejects a normal user access JWT', () => {
    const token = generateAccessToken('usr_player', 'USER');
    expect(getAdminSessionState(token).valid).toBe(false);
    expect(getAdminSessionState(token).reason).toBe('user');
  });

  it('rejects a missing token', () => {
    expect(getAdminSessionState(null).reason).toBe('missing');
  });

  it('rejects MFA pending tokens as a full admin session', () => {
    const token = generateAdminMfaPendingToken('admin_1', ADMIN_ROLES.SUPER_ADMIN);
    expect(getAdminSessionState(token).valid).toBe(false);
    expect(getAdminSessionState(token).reason).toBe('forbidden');
  });
});
