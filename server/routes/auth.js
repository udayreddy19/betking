import { Router } from 'express';
import { loginRateLimiter, registerRateLimiter } from '../middleware/rateLimiter.js';
import { requireAuth } from '../middleware/userAuth.js';

const router = Router();

async function attachAdminSessionTelemetry(req, payload, { adminIdHint = null, mfaUsed = false, failureReason = null } = {}) {
  try {
    const {
      recordAdminLoginAttempt,
      createAdminSessionRecord,
      assessAdminSessionRisk,
    } = await import('../../lib/adminSessionEngine.mjs');
    const ip = req.ip || req.headers['x-forwarded-for'] || null;
    const userAgent = req.headers['user-agent'] || null;
    const adminId = payload?.adminId || adminIdHint || 'unknown';

    await recordAdminLoginAttempt({
      adminId,
      ip,
      userAgent,
      success: Boolean(payload?.success),
      failureReason: payload?.success ? null : (failureReason || payload?.code || payload?.error || null),
      mfaUsed,
    });

    if (!payload?.success) return payload;

    const risk = await assessAdminSessionRisk({ adminId, ip, userAgent });
    const sess = await createAdminSessionRecord({
      adminId,
      ip,
      userAgent,
      mfaVerified: mfaUsed || Boolean(payload?.mfaVerified),
    });
    return {
      ...payload,
      sessionId: sess.sessionId,
      sessionRisk: risk,
    };
  } catch {
    return payload;
  }
}

router.post('/api/auth/admin-login', loginRateLimiter, async (req, res) => {
  try {
    const { ADMIN_ROLES } = await import('../middleware/adminAuth.js');
    const {
      completeAdminBearerUpgrade,
      completeAdminPasswordLogin,
      isAdminDevBootstrapAllowed,
      isProductionRuntime,
      issueAdminSessionJson,
    } = await import('../../lib/adminLoginFlow.mjs');
    const requestedRole = String(req.body?.role || 'SUPER_ADMIN');
    const fallbackRole = Object.values(ADMIN_ROLES).includes(requestedRole)
      ? requestedRole
      : ADMIN_ROLES.SUPER_ADMIN;

    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = req.body?.password;

    if (email && password) {
      const { query } = await import('../../db/pg.js');
      const { login } = await import('../auth/authService.js');
      const result = await login(query, {
        email,
        password,
        ip: req.ip || req.headers['x-forwarded-for'],
        userAgent: req.headers['user-agent'],
      });
      if (result.error) {
        await attachAdminSessionTelemetry(req, { success: false, error: result.error, code: result.code }, {
          adminIdHint: email,
          failureReason: result.code || result.error,
        });
        return res.status(result.status || 401).json({ error: result.error, code: result.code });
      }
      try {
        const payload = await completeAdminPasswordLogin(result.user);
        const enriched = await attachAdminSessionTelemetry(req, payload, {
          adminIdHint: result.user?.userId || result.user?.user_id,
        });
        const status = enriched.success ? 200 : (enriched.code === 'MFA_REQUIRED' || enriched.code === 'MFA_SETUP_REQUIRED' ? 401 : 200);
        return res.status(status).json(enriched);
      } catch (err) {
        await attachAdminSessionTelemetry(req, { success: false, error: err.message, code: err.code }, {
          adminIdHint: result.user?.userId || result.user?.user_id,
          failureReason: err.code || err.message,
        });
        return res.status(err.status || 403).json({ error: err.message, code: err.code || 'ADMIN_NOT_ALLOWED' });
      }
    }

    const authHeader = req.headers.authorization;
    const userToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (userToken) {
      const { verifyAccessToken } = await import('../auth/tokenService.js');
      const decoded = verifyAccessToken(userToken);
      if (decoded?.sub) {
        const { query } = await import('../../db/pg.js');
        const userRes = await query(
          'SELECT user_id, email, role, status FROM users WHERE user_id = $1',
          [decoded.sub],
        );
        const user = userRes.rows[0];
        if (user && user.status !== 'BANNED' && user.status !== 'SUSPENDED') {
          try {
            const payload = await completeAdminBearerUpgrade(user);
            const enriched = await attachAdminSessionTelemetry(req, payload, {
              adminIdHint: user.user_id,
            });
            const status = enriched.success ? 200 : (enriched.code === 'MFA_REQUIRED' || enriched.code === 'MFA_SETUP_REQUIRED' ? 401 : 200);
            return res.status(status).json(enriched);
          } catch (err) {
            return res.status(err.status || 403).json({ error: err.message, code: err.code || 'ADMIN_NOT_ALLOWED' });
          }
        }
      }
    }

    if (isProductionRuntime()) {
      return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
    }

    if (!isAdminDevBootstrapAllowed()) {
      return res.status(403).json({
        error: 'Sign in with an admin account to open the console.',
        code: 'ADMIN_LOGIN_REQUIRED',
      });
    }

    const adminId = String(req.body?.adminId || 'admin_local');
    const payload = await attachAdminSessionTelemetry(req, issueAdminSessionJson(adminId, fallbackRole), {
      adminIdHint: adminId,
    });
    return res.json(payload);
  } catch (err) {
    res.status(500).json({ error: 'Admin login failed', message: err.message });
  }
});

router.post('/api/auth/admin-mfa/verify', loginRateLimiter, async (req, res) => {
  try {
    const { completeAdminMfa } = await import('../../lib/adminLoginFlow.mjs');
    const payload = await completeAdminMfa(req.body?.mfaToken, req.body?.code, { enroll: false });
    const enriched = await attachAdminSessionTelemetry(req, payload, { mfaUsed: true });
    return res.json(enriched);
  } catch (err) {
    await attachAdminSessionTelemetry(req, { success: false, error: err.message, code: err.code }, {
      failureReason: err.code || err.message,
      mfaUsed: true,
    });
    return res.status(err.status || 401).json({ error: err.message, code: err.code || 'MFA_INVALID' });
  }
});

router.post('/api/auth/admin-mfa/confirm', loginRateLimiter, async (req, res) => {
  try {
    const { completeAdminMfa } = await import('../../lib/adminLoginFlow.mjs');
    const payload = await completeAdminMfa(req.body?.mfaToken, req.body?.code, { enroll: true });
    const enriched = await attachAdminSessionTelemetry(req, payload, { mfaUsed: true });
    return res.json(enriched);
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message, code: err.code || 'MFA_INVALID' });
  }
});


router.post('/api/v1/auth/register', registerRateLimiter, (req, res, next) => {
  req.url = '/api/auth/signup';
  req.app.handle(req, res, next);
});

router.post('/api/v1/auth/login', loginRateLimiter, (req, res, next) => {
  req.url = '/api/auth/login';
  req.app.handle(req, res, next);
});

router.get('/api/v1/user/kyc', requireAuth, async (req, res) => {
  try {
    const { kycEngine } = await import('../../lib/kycEngine.mjs');
    const status = await kycEngine.getUserKycStatus(req.user.userId);
    res.json({ success: true, ...status });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message, code: err.code });
  }
});

router.post('/api/v1/user/kyc', requireAuth, async (req, res) => {
  try {
    const { kycEngine } = await import('../../lib/kycEngine.mjs');
    if (req.body?.dateOfBirth && !req.body?.documentNumber) {
      const result = await kycEngine.saveDateOfBirth(req.user.userId, req.body.dateOfBirth);
      return res.json(result);
    }
    const result = await kycEngine.submitKycVerification({
      userId: req.user.userId,
      documentType: req.body?.documentType,
      documentNumber: req.body?.documentNumber,
      dateOfBirth: req.body?.dateOfBirth,
    });
    res.json(result);
  } catch (err) {
    res.status(err.status || 400).json({ success: false, error: err.message, code: err.code });
  }
});

router.get('/api/v1/user/security/devices', requireAuth, async (req, res) => {
  const userId = req.user.userId;
  try {
    const { userSecurityCenter } = await import('../../lib/userSecurityCenter.mjs');
    const devices = userSecurityCenter.getUserDevices(userId);
    res.json({ success: true, devices });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/v1/user/security/devices/register', requireAuth, async (req, res) => {
  const { deviceId, deviceHash, deviceType, platform, browser, os, ipAddress, locationCity, locationCountry } = req.body;
  try {
    const { userSecurityCenter } = await import('../../lib/userSecurityCenter.mjs');
    const dev = await userSecurityCenter.registerDevice(req.user.userId, {
      deviceId, deviceHash, deviceType, platform, browser, os, ipAddress, locationCity, locationCountry
    });
    res.json({ success: true, device: dev });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/v1/user/security/devices/logout', requireAuth, async (req, res) => {
  const { deviceId } = req.body;
  try {
    const { userSecurityCenter } = await import('../../lib/userSecurityCenter.mjs');
    const result = await userSecurityCenter.logoutDevice(req.user.userId, deviceId);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/v1/user/security/devices/logout-all-others', requireAuth, async (req, res) => {
  const { currentDeviceId } = req.body;
  try {
    const { userSecurityCenter } = await import('../../lib/userSecurityCenter.mjs');
    const result = await userSecurityCenter.logoutAllOtherDevices(req.user.userId, currentDeviceId);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/v1/user/security/alerts', requireAuth, async (req, res) => {
  const userId = req.user.userId;
  try {
    const { userSecurityCenter } = await import('../../lib/userSecurityCenter.mjs');
    const alerts = userSecurityCenter.getUserSecurityAlerts(userId);
    res.json({ success: true, alerts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/v1/user/security/alerts/:id/read', requireAuth, async (req, res) => {
  try {
    const { userSecurityCenter } = await import('../../lib/userSecurityCenter.mjs');
    const result = userSecurityCenter.markAlertAsRead(req.user.userId, req.params.id);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/v1/user/security/control-status', requireAuth, async (req, res) => {
  const userId = req.user.userId;
  try {
    const { userSecurityCenter } = await import('../../lib/userSecurityCenter.mjs');
    const status = userSecurityCenter.getAccountControlStatus(userId);
    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/v1/rg/status', requireAuth, async (req, res) => {
  try {
    const { responsibleGamingEngine } = await import('../../lib/responsibleGaming.mjs');
    const status = await responsibleGamingEngine.getRealityCheckState(req.user.userId);
    const limits = await responsibleGamingEngine.getLimits(req.user.userId);
    res.json({ success: true, ...status, limits });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/v1/rg/reality-check/ack', requireAuth, async (req, res) => {
  try {
    const { responsibleGamingEngine } = await import('../../lib/responsibleGaming.mjs');
    const status = await responsibleGamingEngine.acknowledgeRealityCheck(req.user.userId);
    res.json({ success: true, ...status });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/api/v1/rg/limits', requireAuth, async (req, res) => {
  try {
    const { responsibleGamingEngine } = await import('../../lib/responsibleGaming.mjs');
    const patch = {};
    if (req.body?.depositLimitDaily != null) patch.depositLimitDaily = Number(req.body.depositLimitDaily);
    if (req.body?.lossLimitDaily != null) patch.lossLimitDaily = Number(req.body.lossLimitDaily);
    if (req.body?.lossLimitWeekly != null) patch.lossLimitWeekly = Number(req.body.lossLimitWeekly);
    if (req.body?.stakeLimitPerBet != null) patch.stakeLimitPerBet = Number(req.body.stakeLimitPerBet);
    if (req.body?.realityCheckIntervalMins != null) {
      patch.realityCheckIntervalMins = Math.max(15, Number(req.body.realityCheckIntervalMins));
    }
    const limits = await responsibleGamingEngine.setLimits(req.user.userId, patch, req.user.userId);
    res.json({ success: true, limits });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/api/v1/rg/self-exclude', requireAuth, async (req, res) => {
  try {
    const { responsibleGamingEngine } = await import('../../lib/responsibleGaming.mjs');
    const days = Math.max(1, Math.min(365, Number(req.body?.days) || 7));
    const result = await responsibleGamingEngine.setSelfExclusion(req.user.userId, {
      days,
      reason: 'User requested self-exclusion',
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/api/v1/rg/cooling-off', requireAuth, async (req, res) => {
  try {
    const { responsibleGamingEngine } = await import('../../lib/responsibleGaming.mjs');
    const hours = Math.max(1, Math.min(168, Number(req.body?.hours) || 24));
    const result = await responsibleGamingEngine.setCoolingOff(req.user.userId, {
      hours,
      reason: 'User requested cooling-off',
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
