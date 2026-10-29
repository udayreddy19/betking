#!/usr/bin/env python3
"""Add product-mode + email diagnostics routes to admin/operations.js."""
from pathlib import Path
import sys

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else "/opt/oddsyra")
p = ROOT / "server/routes/admin/operations.js"
text = p.read_text()
if "email-diagnostics" in text and "product-mode" in text:
    print("operations.js already has diagnostics")
    raise SystemExit(0)

needle = """router.get(
  '/production-health',
  requireRole(...OPS_ROLES),
  async (req, res) => {
    try {
      const { buildProductionHealth } = await import('../../../lib/opsProductionHealth.mjs');
      res.json(await buildProductionHealth());
    } catch (err) {
      handle(err, res);
    }
  },
);
"""

insert = needle + """
/** GET /operations/product-mode — explicit PUBLIC_PRODUCT_MODE diagnostics */
router.get(
  '/product-mode',
  requireRole(...OPS_ROLES),
  async (req, res) => {
    try {
      const { getProductConfiguration } = await import('../../../lib/productConfig.mjs');
      const config = await getProductConfiguration();
      const software = config.softwarePlatformEnabled === true;
      res.json({
        publicProductMode: software ? 'SOFTWARE_PLATFORM' : 'ODDSYRA_SPORTSBOOK',
        frontendMode: software ? 'SOFTWARE_PLATFORM' : 'ODDSYRA_SPORTSBOOK',
        backendMode: software ? 'SOFTWARE_PLATFORM' : 'ODDSYRA_SPORTSBOOK',
        environment: process.env.NODE_ENV || 'unknown',
        buildVersion: process.env.APP_VERSION || process.env.npm_package_version || null,
        gitCommit: process.env.GIT_COMMIT || process.env.COMMIT_SHA || null,
        featureFlagSource: 'product_configuration',
        configLoaded: true,
        cacheStatus: 'short-ttl-in-process',
        walletEnabled: config.walletEnabled === true,
        bettingEnabled: config.bettingEnabled === true,
        pgReviewMode: config.pgReviewMode === true,
        softwarePlatformEnabled: software,
        updatedAt: config.updatedAt,
        updatedBy: config.updatedBy,
      });
    } catch (err) {
      handle(err, res);
    }
  },
);

/** GET /operations/email-diagnostics — mailbox health (no secrets) */
router.get(
  '/email-diagnostics',
  requireRole(...OPS_ROLES),
  async (req, res) => {
    try {
      const { getEmailHealthReport } = await import('../../auth/emailService.js');
      res.json(await getEmailHealthReport());
    } catch (err) {
      handle(err, res);
    }
  },
);

/**
 * POST /operations/email-diagnostics/test
 * Safe admin-only test mail to the caller's admin email (or allowlisted ADMIN_EMAILS).
 * body: { kind: 'welcome'|'security'|'promotion'|'support'|'alert' }
 */
router.post(
  '/email-diagnostics/test',
  requireRole('SUPER_ADMIN', 'OPERATIONS_ADMIN'),
  async (req, res) => {
    try {
      const kind = String(req.body?.kind || 'welcome').toLowerCase();
      const adminEmail = String(req.admin?.email || '').trim().toLowerCase();
      const allow = String(process.env.ADMIN_EMAILS || '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      const to = adminEmail || allow[0];
      if (!to) {
        return res.status(400).json({ error: 'No admin email available for safe test send', code: 'NO_ADMIN_EMAIL' });
      }
      if (adminEmail && allow.length && !allow.includes(adminEmail) && req.admin?.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Test recipient must be an allowlisted admin email', code: 'TEST_EMAIL_FORBIDDEN' });
      }

      const stamp = new Date().toISOString();
      const mail = await import('../../auth/emailService.js');
      let result;
      if (kind === 'welcome') {
        result = await mail.sendWelcomeEmail({ email: to, name: 'OddsYra Admin Probe' });
      } else if (kind === 'security') {
        result = await mail.sendPasswordChangedNotificationEmail({
          email: to,
          name: 'OddsYra Admin Probe',
          changedAt: stamp,
        });
      } else if (kind === 'promotion') {
        result = await mail.sendEmail({
          to,
          subject: `[OddsYra] Promotional SMTP probe ${stamp}`,
          html: `<p>Promotional mailbox probe at ${stamp}</p>`,
          from: mail.PROMOS_FROM,
          forceFrom: true,
        });
      } else if (kind === 'support') {
        result = await mail.sendEmail({
          to,
          subject: `[OddsYra] Support SMTP probe ${stamp}`,
          html: `<p>Support mailbox probe at ${stamp}</p>`,
          from: mail.SUPPORT_FROM,
          forceFrom: true,
        });
      } else if (kind === 'alert') {
        result = await mail.sendEmail({
          to,
          subject: `[OddsYra] Alerts SMTP probe ${stamp}`,
          html: `<p>Alerts mailbox probe at ${stamp}</p>`,
          from: mail.ALERTS_FROM,
          forceFrom: true,
        });
      } else {
        return res.status(400).json({ error: 'Unknown kind', code: 'INVALID_KIND' });
      }

      res.json({
        ok: result?.success !== false,
        kind,
        to,
        provider: result?.provider || null,
        messageId: result?.messageId || null,
        health: mail.getEmailHealthReport(),
      });
    } catch (err) {
      res.status(err.code === 'PROMOTIONS_EMAIL_CONFIGURATION_REQUIRED' ? 503 : 500).json({
        ok: false,
        error: err.message,
        code: err.code || 'EMAIL_TEST_FAILED',
      });
    }
  },
);
"""

if needle not in text:
    raise SystemExit("production-health block not found in operations.js")
p.write_text(text.replace(needle, insert, 1))
print("patched operations.js")
