#!/usr/bin/env python3
"""Apply OddsYra hardening patches to products.js + emailService.js (no secrets)."""
from pathlib import Path
import sys

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else "/opt/oddsyra")

# --- products.js ---
p = ROOT / "server/routes/products.js"
text = p.read_text()
if "publicProductMode" not in text:
    old = """    res.json({
      wallet: config.walletEnabled === true,
      betting: config.bettingEnabled === true,
      walletEnabled: config.walletEnabled === true,
      bettingEnabled: config.bettingEnabled === true,
      pgReviewMode: config.pgReviewMode === true,
      softwarePlatformEnabled: config.softwarePlatformEnabled === true,
      updatedAt: config.updatedAt,
    });"""
    new = """    const software = config.softwarePlatformEnabled === true;
    const publicProductMode = software ? "SOFTWARE_PLATFORM" : "ODDSYRA_SPORTSBOOK";
    res.json({
      wallet: config.walletEnabled === true,
      betting: config.bettingEnabled === true,
      walletEnabled: config.walletEnabled === true,
      bettingEnabled: config.bettingEnabled === true,
      pgReviewMode: config.pgReviewMode === true,
      softwarePlatformEnabled: software,
      publicProductMode,
      updatedAt: config.updatedAt,
    });"""
    if old not in text:
        raise SystemExit("products.js target block not found")
    text = text.replace(old, new, 1)
    old2 = """    res.json({
      enabled,
      softwarePlatformEnabled: enabled,
      cookie: 'sp_public',
      note: enabled
        ? 'Software Platform is the public product on this host'
        : 'Native product (OddsYra sportsbook) is the public product on this host',
    });"""
    new2 = """    res.json({
      enabled,
      softwarePlatformEnabled: enabled,
      publicProductMode: enabled ? 'SOFTWARE_PLATFORM' : 'ODDSYRA_SPORTSBOOK',
      cookie: 'sp_public',
      note: enabled
        ? 'Software Platform is the public product on this host'
        : 'Native product (OddsYra sportsbook) is the public product on this host',
    });"""
    if old2 not in text:
        raise SystemExit("software-mode block not found")
    text = text.replace(old2, new2, 1)
    p.write_text(text)
    print("patched products.js")
else:
    print("products.js already patched")

# --- emailService.js ---
ep = ROOT / "server/auth/emailService.js"
et = ep.read_text()
if "export function getEmailHealthReport" not in et:
    insert_after = """export function isEmailFailoverMonitored() {
  return Boolean(envAccount('SMTP_FALLBACK_'));
}
"""
    health_fn = r'''
function envFlagTrue(name) {
  const v = String(process.env[name] || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function envFlagFalse(name) {
  const v = String(process.env[name] || '').trim().toLowerCase();
  return v === '0' || v === 'false' || v === 'no' || v === 'off';
}

/** Promotions SMTP may use PROMOTIONS_* aliases or SMTP_PROMOS_*. */
export function resolvePromotionsSmtpConfig() {
  const user = process.env.PROMOTIONS_SMTP_USER
    || process.env.SMTP_PROMOS_USER
    || process.env.PROMOS_SMTP_USER
    || '';
  const pass = process.env.PROMOTIONS_SMTP_PASSWORD
    || process.env.SMTP_PROMOS_PASSWORD
    || process.env.PROMOS_SMTP_PASSWORD
    || process.env.SMTP_PROMOS_PASS
    || '';
  const host = process.env.PROMOTIONS_SMTP_HOST
    || process.env.SMTP_PROMOS_HOST
    || process.env.PROMOS_SMTP_HOST
    || process.env.SMTP_HOST
    || '';
  const port = parseInt(
    process.env.PROMOTIONS_SMTP_PORT
      || process.env.SMTP_PROMOS_PORT
      || process.env.PROMOS_SMTP_PORT
      || process.env.SMTP_PORT
      || '465',
    10,
  ) || 465;
  const fromEmail = process.env.PROMOTIONS_FROM_EMAIL
    || extractEmailAddress(process.env.PROMOS_FROM || PROMOS_FROM)
    || 'promos@oddsyra.com';
  const fromName = process.env.PROMOTIONS_FROM_NAME || 'OddsYra';
  return { host, port, user, passPresent: Boolean(pass), fromEmail, fromName };
}

export function isPromotionsEmailEnabled() {
  if (envFlagFalse('PROMOTIONS_EMAIL_ENABLED')) return false;
  if (envFlagTrue('PROMOTIONS_EMAIL_ENABLED')) return true;
  return Boolean(promosSmtpAccount());
}

export function promotionsAllowPrimaryFallback() {
  return envFlagTrue('PROMOTIONS_ALLOW_PRIMARY_FALLBACK');
}

/**
 * Explicit mailbox health for admin diagnostics.
 * States: PASS | CONFIGURATION_REQUIRED | AUTHENTICATION_FAILED | DELIVERY_FAILED | DISABLED
 * Never includes secrets.
 */
export function getEmailHealthReport() {
  const primary = envAccount('SMTP_');
  const promos = promosSmtpAccount();
  const support = supportSmtpAccount();
  const alerts = alertsSmtpAccount();
  const promoCfg = resolvePromotionsSmtpConfig();
  const promoEnabled = isPromotionsEmailEnabled();

  const channel = (name, account, { required = true, disabled = false } = {}) => {
    if (disabled) {
      return { channel: name, status: 'DISABLED', configured: false, user: null, host: null };
    }
    if (!account) {
      return {
        channel: name,
        status: required ? 'CONFIGURATION_REQUIRED' : 'DISABLED',
        configured: false,
        user: null,
        host: null,
      };
    }
    return {
      channel: name,
      status: 'PASS',
      configured: true,
      user: account.user || null,
      host: account.host || null,
      port: account.port || null,
    };
  };

  let promotions;
  if (!promoEnabled || envFlagFalse('PROMOTIONS_EMAIL_ENABLED')) {
    promotions = {
      channel: 'promotions',
      status: promoCfg.passPresent ? 'DISABLED' : 'CONFIGURATION_REQUIRED',
      configured: Boolean(promos),
      enabled: false,
      user: promoCfg.user || null,
      host: promoCfg.host || null,
      fromEmail: promoCfg.fromEmail,
      note: promoCfg.passPresent
        ? 'PROMOTIONS_EMAIL_ENABLED=false'
        : 'SMTP_PROMOS_PASSWORD / PROMOTIONS_SMTP_PASSWORD is empty',
    };
  } else if (!promos) {
    promotions = {
      channel: 'promotions',
      status: 'CONFIGURATION_REQUIRED',
      configured: false,
      enabled: true,
      user: promoCfg.user || null,
      host: promoCfg.host || null,
      fromEmail: promoCfg.fromEmail,
      note: 'Promotions enabled but dedicated SMTP credentials incomplete',
    };
  } else {
    promotions = {
      channel: 'promotions',
      status: 'PASS',
      configured: true,
      enabled: true,
      user: promos.user,
      host: promos.host,
      port: promos.port,
      fromEmail: promoCfg.fromEmail,
    };
  }

  return {
    transactional: channel('transactional', primary),
    promotions,
    support: channel('support', support),
    alerts: channel('alerts', alerts),
    smtpFallback: channel('smtpFallback', envAccount('SMTP_FALLBACK_'), { required: false }),
    metrics: getEmailDeliveryMetrics(),
    lastProvider: deliveryMetrics.lastProvider,
    lastError: deliveryMetrics.lastError,
    lastAt: deliveryMetrics.lastAt,
    checkedAt: new Date().toISOString(),
  };
}

'''
    if insert_after not in et:
        raise SystemExit("emailService insert point missing")
    et = et.replace(insert_after, insert_after + health_fn, 1)

    send_guard = """  if (!to) throw new Error('Recipient email is required');

  const resolvedFrom = isPromosFrom(from) ? formatPromosFrom(from) : from;
"""
    send_guard_new = """  if (!to) throw new Error('Recipient email is required');

  const resolvedFrom = isPromosFrom(from) ? formatPromosFrom(from) : from;
  if (isPromosFrom(resolvedFrom)) {
    const promoReady = Boolean(promosSmtpAccount()) && isPromotionsEmailEnabled();
    if (!promoReady && !promotionsAllowPrimaryFallback()) {
      const err = new Error(
        'Promotional email is CONFIGURATION_REQUIRED: set SMTP_PROMOS_PASSWORD (or PROMOTIONS_SMTP_PASSWORD) and PROMOTIONS_EMAIL_ENABLED=true, or set PROMOTIONS_ALLOW_PRIMARY_FALLBACK=true',
      );
      err.code = 'PROMOTIONS_EMAIL_CONFIGURATION_REQUIRED';
      logger.error('email_promotions_configuration_required', { to, subject });
      throw err;
    }
  }
"""
    if send_guard not in et:
        raise SystemExit("sendEmail guard insert missing")
    et = et.replace(send_guard, send_guard_new, 1)
    ep.write_text(et)
    print("patched emailService.js")
else:
    print("emailService already patched")

print("OK")
