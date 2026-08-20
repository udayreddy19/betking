/**
 * Auth Routes — OddsYra Authentication API
 *
 * Exposes REST endpoints for signup, login, logout, token refresh,
 * password reset, and email verification.
 *
 * All auth-sensitive routes are rate-limited.
 * Refresh tokens are set as httpOnly, Secure, SameSite=Strict cookies.
 */

import { Router } from 'express';
import crypto from 'crypto';
import { query, withTransaction } from '../../db/pg.js';
import {
  signup,
  login,
  logout,
  forgotPassword,
  resetPassword,
  verifyEmail,
  getMe,
  resendEmailVerification,
  changePassword,
  loginWithGoogle,
} from './authService.js';
import { buildGoogleAuthUrl, exchangeGoogleCode, getGoogleOAuthConfig } from './googleOAuthService.js';
import { rotateRefreshToken } from './tokenService.js';
import { requireAuth } from '../middleware/userAuth.js';
import {
  loginRateLimiter,
  registerRateLimiter,
  forgotPasswordRateLimiter,
  authGeneralRateLimiter,
} from '../middleware/rateLimiter.js';
import { issueCsrfCookie, clearCsrfCookie, requireCsrfWhenCookies } from '../middleware/csrf.js';

const router = Router();

const REFRESH_TOKEN_COOKIE = 'bk_refresh';
const GOOGLE_OAUTH_STATE_COOKIE = 'bk_google_oauth_state';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const inFlightGoogleCallbacks = new Map();

function setRefreshCookie(res, token) {
  res.cookie(REFRESH_TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: IS_PRODUCTION ? 'strict' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/api/auth',
  });
}

function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_TOKEN_COOKIE, {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: IS_PRODUCTION ? 'strict' : 'lax',
    path: '/api/auth',
  });
}

// ── GET /api/auth/providers ──
router.get('/providers', (req, res) => {
  res.json({
    google: getGoogleOAuthConfig().enabled,
  });
});

// ── GET /api/auth/google/start ──
router.get('/google/start', authGeneralRateLimiter, (req, res) => {
  const config = getGoogleOAuthConfig();
  if (!config.enabled) {
    return res.status(503).json({ error: 'Google sign-in is not configured.', code: 'GOOGLE_NOT_CONFIGURED' });
  }

  const state = crypto.randomBytes(24).toString('hex');
  res.cookie(GOOGLE_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: IS_PRODUCTION ? 'strict' : 'lax',
    maxAge: 10 * 60 * 1000,
    path: '/api/auth',
  });

  res.redirect(buildGoogleAuthUrl(state));
});

// ── POST /api/auth/google/callback ──
router.post('/google/callback', authGeneralRateLimiter, async (req, res) => {
  try {
    const config = getGoogleOAuthConfig();
    if (!config.enabled) {
      return res.status(503).json({ error: 'Google sign-in is not configured.', code: 'GOOGLE_NOT_CONFIGURED' });
    }

    const { code, state } = req.body || {};
    const expectedState = req.cookies?.[GOOGLE_OAUTH_STATE_COOKIE];
    const callbackKey = code && state ? `${code}:${state}` : '';

    if (!code || !state || !expectedState || state !== expectedState) {
      res.clearCookie(GOOGLE_OAUTH_STATE_COOKIE, { path: '/api/auth' });
      return res.status(400).json({ error: 'Invalid Google sign-in session.', code: 'GOOGLE_STATE_INVALID' });
    }

    if (callbackKey && inFlightGoogleCallbacks.has(callbackKey)) {
      const shared = await inFlightGoogleCallbacks.get(callbackKey);
      if (shared.error) {
        return res.status(shared.status || 400).json({ error: shared.error, code: shared.code });
      }
      setRefreshCookie(res, shared.refreshToken);
      const csrfToken = issueCsrfCookie(res);
      return res.json({
        success: true,
        accessToken: shared.accessToken,
        csrfToken,
        isNewUser: shared.isNewUser,
        user: shared.user,
      });
    }

    const work = (async () => {
      res.clearCookie(GOOGLE_OAUTH_STATE_COOKIE, { path: '/api/auth' });

      const profile = await exchangeGoogleCode(code);
      if (profile.error) {
        return profile;
      }

      const result = await loginWithGoogle(query, withTransaction, {
        ...profile,
        ip: req.ip || req.headers['x-forwarded-for'],
        userAgent: req.headers['user-agent'],
      });

      if (result.error) {
        return result;
      }

      return result;
    })();

    if (callbackKey) inFlightGoogleCallbacks.set(callbackKey, work);

    let result;
    try {
      result = await work;
    } finally {
      if (callbackKey) {
        setTimeout(() => inFlightGoogleCallbacks.delete(callbackKey), 60_000);
      }
    }

    if (result.error) {
      return res.status(result.status || 502).json({ error: result.error, code: result.code });
    }

    setRefreshCookie(res, result.refreshToken);
    const csrfToken = issueCsrfCookie(res);

    res.json({
      success: true,
      accessToken: result.accessToken,
      csrfToken,
      isNewUser: result.isNewUser,
      user: result.user,
    });
  } catch (err) {
    console.error('[Auth] Google callback error:', IS_PRODUCTION ? 'Internal error' : err.message);
    res.status(500).json({ error: 'An unexpected error occurred.', code: 'INTERNAL_ERROR' });
  }
});

// ── POST /api/auth/signup ──
router.post('/signup', registerRateLimiter, async (req, res) => {
  try {
    const result = await signup(query, withTransaction, {
      ...req.body,
      ipAddress: req.ip || req.headers['x-forwarded-for'],
      deviceInfo: { userAgent: req.headers['user-agent'] },
    });

    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error, code: result.code });
    }

    setRefreshCookie(res, result.refreshToken);
    const csrfToken = issueCsrfCookie(res);

    res.status(201).json({
      success: true,
      accessToken: result.accessToken,
      csrfToken,
      user: {
        userId: result.userId,
        email: result.email,
        displayName: result.displayName,
      },
      promoReward: result.promoReward || null,
      ...(result.emailVerificationToken && !IS_PRODUCTION
        ? { emailVerificationToken: result.emailVerificationToken }
        : {}),
    });
  } catch (err) {
    console.error('[Auth] Signup error:', IS_PRODUCTION ? 'Internal error' : err.message);
    res.status(500).json({ error: 'An unexpected error occurred.', code: 'INTERNAL_ERROR' });
  }
});

// ── POST /api/auth/login ──
router.post('/login', loginRateLimiter, async (req, res) => {
  try {
    const result = await login(query, {
      ...req.body,
      ip: req.ip || req.headers['x-forwarded-for'],
      userAgent: req.headers['user-agent'],
    });

    if (result.error) {
      return res.status(result.status || 401).json({ error: result.error, code: result.code });
    }

    setRefreshCookie(res, result.refreshToken);
    const csrfToken = issueCsrfCookie(res);

    res.json({
      success: true,
      accessToken: result.accessToken,
      csrfToken,
      user: result.user,
    });
  } catch (err) {
    console.error('[Auth] Login error:', IS_PRODUCTION ? 'Internal error' : err.message);
    res.status(500).json({ error: 'An unexpected error occurred.', code: 'INTERNAL_ERROR' });
  }
});

// ── POST /api/auth/logout ──
router.post('/logout', requireCsrfWhenCookies, async (req, res) => {
  try {
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
    // Try to get userId from authorization header
    let userId = null;
    const authHeader = req.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const { verifyAccessToken } = await import('./tokenService.js');
        const decoded = verifyAccessToken(authHeader.slice(7));
        userId = decoded?.sub;
      } catch {
        // Ignore — token might be expired, but we still revoke the refresh token
      }
    }

    await logout(query, refreshToken, userId);
    clearRefreshCookie(res);
    clearCsrfCookie(res);

    res.json({ success: true, message: 'Logged out successfully.' });
  } catch (err) {
    console.error('[Auth] Logout error:', IS_PRODUCTION ? 'Internal error' : err.message);
    clearRefreshCookie(res);
    clearCsrfCookie(res);
    res.json({ success: true, message: 'Logged out.' });
  }
});

// ── POST /api/auth/refresh ──
router.post('/refresh', authGeneralRateLimiter, requireCsrfWhenCookies, async (req, res) => {
  try {
    const oldToken = req.cookies?.[REFRESH_TOKEN_COOKIE] || req.body?.refreshToken;
    if (!oldToken) {
      return res.status(401).json({ error: 'No refresh token provided.', code: 'NO_REFRESH_TOKEN' });
    }

    const result = await rotateRefreshToken(query, oldToken, {
      deviceInfo: { userAgent: req.headers['user-agent'] },
      ipAddress: req.ip || req.headers['x-forwarded-for'],
    });

    if (!result) {
      clearRefreshCookie(res);
      return res.status(401).json({ error: 'Invalid or expired refresh token.', code: 'INVALID_REFRESH_TOKEN' });
    }

    setRefreshCookie(res, result.refreshToken);
    const csrfToken = issueCsrfCookie(res);

    res.json({
      success: true,
      accessToken: result.accessToken,
      csrfToken,
    });
  } catch (err) {
    console.error('[Auth] Refresh error:', IS_PRODUCTION ? 'Internal error' : err.message);
    clearRefreshCookie(res);
    res.status(500).json({ error: 'An unexpected error occurred.', code: 'INTERNAL_ERROR' });
  }
});

// ── GET /api/auth/me ──
router.get('/me', requireAuth, async (req, res) => {
  try {
    const result = await getMe(query, req.user.userId);

    if (result.error) {
      return res.status(result.status || 404).json({ error: result.error, code: result.code });
    }

    res.json(result);
  } catch (err) {
    console.error('[Auth] GetMe error:', IS_PRODUCTION ? 'Internal error' : err.message);
    res.status(500).json({ error: 'An unexpected error occurred.', code: 'INTERNAL_ERROR' });
  }
});

// ── POST /api/auth/forgot-password ──
router.post('/forgot-password', forgotPasswordRateLimiter, async (req, res) => {
  try {
    const result = await forgotPassword(query, req.body.email, req.ip || req.headers['x-forwarded-for']);
    res.json(result);
  } catch (err) {
    console.error('[Auth] ForgotPassword error:', IS_PRODUCTION ? 'Internal error' : err.message);
    // Always return success to prevent enumeration
    res.json({ success: true, message: 'If an account with that email exists, a password reset link has been sent.' });
  }
});

// ── POST /api/auth/reset-password ──
router.post('/reset-password', authGeneralRateLimiter, async (req, res) => {
  try {
    const result = await resetPassword(query, withTransaction, {
      token: req.body.token,
      password: req.body.password,
      confirmPassword: req.body.confirmPassword,
      ip: req.ip || req.headers['x-forwarded-for'],
      userAgent: req.headers['user-agent'],
    });

    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error, code: result.code });
    }

    clearRefreshCookie(res);
    res.json(result);
  } catch (err) {
    console.error('[Auth] ResetPassword error:', IS_PRODUCTION ? 'Internal error' : err.message);
    res.status(500).json({ error: 'An unexpected error occurred.', code: 'INTERNAL_ERROR' });
  }
});

// ── POST /api/auth/verify-email ──
router.post('/verify-email', authGeneralRateLimiter, async (req, res) => {
  try {
    const result = await verifyEmail(query, req.body.token);

    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error, code: result.code });
    }

    res.json(result);
  } catch (err) {
    console.error('[Auth] VerifyEmail error:', IS_PRODUCTION ? 'Internal error' : err.message);
    res.status(500).json({ error: 'An unexpected error occurred.', code: 'INTERNAL_ERROR' });
  }
});

// ── POST /api/auth/resend-email-verification ──
router.post('/resend-email-verification', requireAuth, authGeneralRateLimiter, async (req, res) => {
  try {
    const result = await resendEmailVerification(query, req.user.userId);

    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error, code: result.code });
    }

    res.json(result);
  } catch (err) {
    console.error('[Auth] ResendVerification error:', IS_PRODUCTION ? 'Internal error' : err.message);
    res.status(500).json({ error: 'An unexpected error occurred.', code: 'INTERNAL_ERROR' });
  }
});

// ── POST /api/auth/change-password ──
router.post('/change-password', requireAuth, authGeneralRateLimiter, async (req, res) => {
  try {
    const result = await changePassword(
      query,
      req.user.userId,
      req.body.currentPassword,
      req.body.newPassword,
    );

    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error, code: result.code });
    }

    clearRefreshCookie(res);
    res.json(result);
  } catch (err) {
    console.error('[Auth] ChangePassword error:', IS_PRODUCTION ? 'Internal error' : err.message);
    res.status(500).json({ error: 'An unexpected error occurred.', code: 'INTERNAL_ERROR' });
  }
});

export default router;
