/**
 * OddsYra SRL Match Control desk helpers:
 * roles, rate-limits, script presets, alerts.
 */

import {
  getSrlOperatorSession,
  getSrlInjectHistoryEntries,
  pushSrlInjectHistoryEntry,
  pushSrlDeskAlertEntry,
} from './iplSrlOperatorState.mjs';

export const SRL_REASON_CODES = ['script', 'fix', 'integrity', 'broadcast', 'other'];

export const SRL_SENIOR_ROLES = new Set(['SUPER_ADMIN', 'TRADING_ADMIN']);

export const SRL_DANGEROUS_ACTIONS = {
  declare: { cooldownMs: 5000, senior: true },
  clear_anchors: { cooldownMs: 4000, senior: true },
  kill_switch: { cooldownMs: 8000, senior: true },
  void_market: { cooldownMs: 4000, senior: true },
  settlement_wizard: { cooldownMs: 8000, senior: true },
  mass_suspend: { cooldownMs: 3000, senior: false },
  integrity_hold: { cooldownMs: 5000, senior: true },
};

const dangerCooldown = new Map();
const scriptPresets = new Map();

export function isSrlSeniorRole(role) {
  return !role || SRL_SENIOR_ROLES.has(String(role).toUpperCase());
}

export function getSrlDeskCapabilities(role = 'SUPER_ADMIN') {
  const senior = isSrlSeniorRole(role);
  return {
    role: String(role || 'SUPER_ADMIN').toUpperCase(),
    canInject: true,
    canPause: true,
    canQueue: true,
    canScript: true,
    canDeclare: senior,
    canClearAnchors: senior,
    canKillSwitch: senior,
    canVoidMarket: senior,
    canRunSettlementWizard: senior,
    canMassSuspend: true,
    canIntegrityHold: senior,
    senior,
  };
}

export function assertSrlCapability(role, capability) {
  const caps = getSrlDeskCapabilities(role);
  const map = {
    declare: caps.canDeclare,
    clear_anchors: caps.canClearAnchors,
    kill_switch: caps.canKillSwitch,
    void_market: caps.canVoidMarket,
    settlement_wizard: caps.canRunSettlementWizard,
    mass_suspend: caps.canMassSuspend,
    integrity_hold: caps.canIntegrityHold,
  };
  if (map[capability] === false) {
    throw new Error(`Role ${caps.role} cannot perform ${capability}. Senior desk (SUPER_ADMIN / TRADING_ADMIN) required.`);
  }
  return caps;
}

export function assertSrlDangerousAction(action, admin = 'admin', role = 'SUPER_ADMIN') {
  const cfg = SRL_DANGEROUS_ACTIONS[action];
  if (!cfg) return { ok: true };
  if (cfg.senior) assertSrlCapability(role, action);
  const key = `${admin || 'admin'}:${action}`;
  const last = dangerCooldown.get(key) || 0;
  const wait = cfg.cooldownMs - (Date.now() - last);
  if (wait > 0) {
    throw new Error(`Rate-limit: wait ${Math.ceil(wait / 1000)}s before repeating ${action}`);
  }
  dangerCooldown.set(key, Date.now());
  return { ok: true, cooldownMs: cfg.cooldownMs };
}

export function normalizeSrlReasonCode(code) {
  const c = String(code || 'script').toLowerCase();
  return SRL_REASON_CODES.includes(c) ? c : 'other';
}

export function pushSrlInjectHistory(matchId, entry) {
  return pushSrlInjectHistoryEntry(matchId, {
    ...entry,
    reasonCode: normalizeSrlReasonCode(entry?.reasonCode),
  });
}

export function getSrlInjectHistory(matchId, { limit = 40 } = {}) {
  return getSrlInjectHistoryEntries(matchId, limit);
}

export function pushSrlDeskAlert(matchId, alert) {
  return pushSrlDeskAlertEntry(matchId, alert);
}

export function listSrlScriptPresets() {
  return [...scriptPresets.values()].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export function saveSrlScriptPreset({ id, name, balls, admin } = {}) {
  const label = String(name || '').trim();
  if (!label) throw new Error('Preset name required');
  if (!Array.isArray(balls) || balls.length === 0) throw new Error('balls array required');
  const presetId = id || `preset_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
  const normalized = balls.map((b) => ({
    type: String(b.type || 'DOT').toUpperCase(),
    runs: Number.isFinite(Number(b.runs)) ? Number(b.runs) : null,
    subType: b.subType || null,
  }));
  const prev = scriptPresets.get(presetId);
  const next = {
    id: presetId,
    name: label,
    balls: normalized,
    createdAt: prev?.createdAt || Date.now(),
    updatedAt: Date.now(),
    admin: admin || prev?.admin || null,
  };
  scriptPresets.set(presetId, next);
  return next;
}

export function deleteSrlScriptPreset(id) {
  if (!id || !scriptPresets.has(id)) throw new Error('Preset not found');
  scriptPresets.delete(id);
  return { deleted: id };
}

export function resetSrlDeskOpsForTests() {
  dangerCooldown.clear();
  scriptPresets.clear();
  matchTemplates.clear();
}

const matchTemplates = new Map();

export function listSrlMatchTemplates() {
  return [...matchTemplates.values()].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export function saveSrlMatchTemplate({ id, name, config, admin } = {}) {
  const label = String(name || '').trim();
  if (!label) throw new Error('Template name required');
  if (!config || typeof config !== 'object') throw new Error('config required');
  const templateId = id || `tmpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
  const prev = matchTemplates.get(templateId);
  const next = {
    id: templateId,
    name: label,
    config: {
      directorMode: config.directorMode || 'REALISTIC',
      marginDefense: {
        marginBump: Number(config.marginDefense?.marginBump) || 0,
        spreadBias: Number(config.marginDefense?.spreadBias) || 0,
        autoFreezeThreshold: Number(config.marginDefense?.autoFreezeThreshold) || 50000,
        targetMargin: Number(config.marginDefense?.targetMargin) || 0.06,
        autoProfitMaximizer: !!config.marginDefense?.autoProfitMaximizer,
      },
      cashoutControl: {
        globalHaircut: Number(config.cashoutControl?.globalHaircut) || 0.10,
        cashoutHalted: !!config.cashoutControl?.cashoutHalted,
      },
      environment: config.environment || null,
      circuitBreaker: config.circuitBreaker
        ? { velocityLimit: Number(config.circuitBreaker.velocityLimit) || 100000 }
        : null,
    },
    createdAt: prev?.createdAt || Date.now(),
    updatedAt: Date.now(),
    admin: admin || prev?.admin || null,
  };
  matchTemplates.set(templateId, next);
  return next;
}

export function deleteSrlMatchTemplate(id) {
  if (!id || !matchTemplates.has(id)) throw new Error('Template not found');
  matchTemplates.delete(id);
  return { deleted: id };
}

export function getSrlMatchTemplate(id) {
  return matchTemplates.get(id) || null;
}

export function buildSrlMatchAlerts(match, session = null) {
  const alerts = [];
  const book = match?.book || {};
  const op = session || {};
  const threshold = Number(op.marginDefense?.autoFreezeThreshold || match?.marginDefense?.autoFreezeThreshold || 50000);
  const liability = Number(book.worstCaseLiability || 0);

  if (match?.rainDelay || op.rainDelay) {
    alerts.push({ level: 'warn', code: 'RAIN', message: 'Rain delay — betting closed' });
  }
  if (op.circuitBreaker?.emergencyKillSwitch || match?.circuitBreaker?.emergencyKillSwitch) {
    alerts.push({ level: 'danger', code: 'KILL', message: 'Kill switch active' });
  } else if (op.circuitBreaker?.isTripped || match?.circuitBreaker?.isTripped) {
    alerts.push({ level: 'warn', code: 'BREAKER', message: 'Circuit breaker tripped' });
  }
  if (op.integrityHold?.active) {
    alerts.push({
      level: 'danger',
      code: 'INTEGRITY',
      message: op.integrityHold.note ? `Integrity hold: ${op.integrityHold.note}` : 'Integrity hold active',
    });
  }
  if (liability >= threshold) {
    alerts.push({
      level: 'danger',
      code: 'LIABILITY',
      message: `Liability ₹${Math.round(liability).toLocaleString('en-IN')} ≥ freeze ₹${Math.round(threshold).toLocaleString('en-IN')}`,
    });
  } else if (book.riskFlag === 'WARNING') {
    alerts.push({ level: 'warn', code: 'EXPOSURE', message: 'Elevated house exposure' });
  }
  const whaleSide = Math.max(Number(book.home?.stake || 0), Number(book.away?.stake || 0));
  if (whaleSide >= 25000) {
    alerts.push({
      level: 'warn',
      code: 'WHALE',
      message: `Whale pressure ₹${Math.round(whaleSide).toLocaleString('en-IN')} on one side`,
    });
  }
  const qLen = Number(match?.incidentQueueLength || (op.incidentQueue || []).length || 0);
  if (qLen >= 6) {
    alerts.push({ level: 'warn', code: 'QUEUE', message: `${qLen} balls armed in queue` });
  } else if (qLen > 0) {
    alerts.push({ level: 'info', code: 'QUEUE', message: `Next queued: ${match?.nextQueuedIncident?.type || 'ball'}` });
  }
  const anchors = Number(match?.scoreAnchorsCount || (op.scoreAnchors || []).length || 0);
  if (anchors > 0) {
    alerts.push({ level: 'info', code: 'ANCHORS', message: `${anchors} score anchors active` });
  }
  const drift = Number(match?.scoreDrift?.runsDelta);
  if (Number.isFinite(drift) && Math.abs(drift) >= 6) {
    alerts.push({
      level: 'warn',
      code: 'DRIFT',
      message: `Board drift ${drift > 0 ? '+' : ''}${drift}r vs natural sim`,
    });
  }
  if (op.lastAutoPauseAt && Date.now() - op.lastAutoPauseAt < 120_000) {
    alerts.push({ level: 'warn', code: 'AUTO_PAUSE', message: 'Auto-paused on liability threshold' });
  }
  for (const a of (op.deskAlerts || []).slice(0, 3)) {
    if (!alerts.some((x) => x.code === a.code && x.message === a.message)) {
      alerts.push({ level: a.level || 'info', code: a.code, message: a.message });
    }
  }
  return alerts.slice(0, 10);
}
