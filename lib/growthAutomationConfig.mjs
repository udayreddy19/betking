/**
 * Admin-tunable growth automation (activation nudge + KYC auto-reminders).
 * Env vars remain defaults; platform_config overrides when present.
 */

import { logger } from './logger.mjs';

export const GROWTH_AUTOMATION_CONFIG_KEY = 'growth_automation';

function envBool(name, fallback = true) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  return String(raw).toLowerCase() !== 'false';
}

function envInt(name, fallback, { min = 1, max = 168 } = {}) {
  const n = parseInt(process.env[name] || String(fallback), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function defaultsFromEnv() {
  return {
    activation: {
      enabled: envBool('ACTIVATION_NUDGE_ENABLED', true),
      cooldownHours: envInt('ACTIVATION_NUDGE_COOLDOWN_HOURS', 48, { min: 6, max: 168 }),
      lookbackHours: envInt('ACTIVATION_NUDGE_LOOKBACK_HOURS', 48, { min: 6, max: 168 }),
      batchLimit: envInt('ACTIVATION_NUDGE_BATCH_LIMIT', 25, { min: 1, max: 100 }),
      lastRunAt: null,
      lastResult: null,
    },
    kycReminder: {
      enabled: envBool('KYC_AUTO_REMINDER_ENABLED', true),
      lookbackDays: envInt('KYC_AUTO_REMINDER_LOOKBACK_DAYS', 14, { min: 1, max: 90 }),
      batchLimit: envInt('KYC_AUTO_REMINDER_BATCH_LIMIT', 20, { min: 1, max: 50 }),
      lastRunAt: null,
      lastResult: null,
    },
  };
}

function normalize(raw = {}) {
  const base = defaultsFromEnv();
  const act = raw.activation && typeof raw.activation === 'object' ? raw.activation : {};
  const kyc = raw.kycReminder && typeof raw.kycReminder === 'object' ? raw.kycReminder : {};
  return {
    activation: {
      enabled: act.enabled != null ? Boolean(act.enabled) : base.activation.enabled,
      cooldownHours: Math.min(168, Math.max(6, Number(act.cooldownHours) || base.activation.cooldownHours)),
      lookbackHours: Math.min(168, Math.max(6, Number(act.lookbackHours) || base.activation.lookbackHours)),
      batchLimit: Math.min(100, Math.max(1, Number(act.batchLimit) || base.activation.batchLimit)),
      lastRunAt: act.lastRunAt || null,
      lastResult: act.lastResult || null,
    },
    kycReminder: {
      enabled: kyc.enabled != null ? Boolean(kyc.enabled) : base.kycReminder.enabled,
      lookbackDays: Math.min(90, Math.max(1, Number(kyc.lookbackDays) || base.kycReminder.lookbackDays)),
      batchLimit: Math.min(50, Math.max(1, Number(kyc.batchLimit) || base.kycReminder.batchLimit)),
      lastRunAt: kyc.lastRunAt || null,
      lastResult: kyc.lastResult || null,
    },
  };
}

let _override = null;

export function getGrowthAutomationConfigSync() {
  return _override ? normalize(_override) : defaultsFromEnv();
}

export async function refreshGrowthAutomationConfig() {
  try {
    const { getConfig } = await import('./configEngine.mjs');
    const res = await getConfig(GROWTH_AUTOMATION_CONFIG_KEY);
    if (res?.success && res.value != null) {
      let value = res.value;
      if (typeof value === 'string') {
        try { value = JSON.parse(value); } catch { value = null; }
      }
      if (value && typeof value === 'object') {
        _override = normalize(value);
        return _override;
      }
    }
  } catch {
    /* keep env defaults */
  }
  _override = null;
  return defaultsFromEnv();
}

export async function getGrowthAutomationConfig() {
  return refreshGrowthAutomationConfig();
}

export async function updateGrowthAutomationConfig(partial = {}, {
  adminId = 'admin',
  reason = 'Admin growth automation update',
} = {}) {
  const current = await getGrowthAutomationConfig();
  const next = normalize({
    activation: { ...current.activation, ...(partial.activation || {}) },
    kycReminder: { ...current.kycReminder, ...(partial.kycReminder || {}) },
  });
  const { setConfig } = await import('./configEngine.mjs');
  await setConfig({
    configKey: GROWTH_AUTOMATION_CONFIG_KEY,
    configValue: next,
    category: 'NOTIFICATION',
    description: 'Activation nudge + KYC auto-reminder worker controls',
    changedBy: adminId,
    reason,
  });
  _override = next;
  logger.info('growth_automation_config_updated', {
    adminId,
    activationEnabled: next.activation.enabled,
    kycEnabled: next.kycReminder.enabled,
  });
  return next;
}

/** Persist last-run stats without changing operator toggles. */
export async function recordGrowthAutomationRun(kind, result) {
  try {
    const current = await getGrowthAutomationConfig();
    const stamp = new Date().toISOString();
    if (kind === 'activation') {
      current.activation.lastRunAt = stamp;
      current.activation.lastResult = result || null;
    } else if (kind === 'kycReminder') {
      current.kycReminder.lastRunAt = stamp;
      current.kycReminder.lastResult = result || null;
    } else {
      return current;
    }
    return updateGrowthAutomationConfig(current, {
      adminId: 'system_worker',
      reason: `Worker run ${kind}`,
    });
  } catch (err) {
    logger.warn('growth_automation_last_run_failed', { kind, error: err.message });
    return null;
  }
}
