/**
 * Platform emergency pauses — persisted in emergency_states, enforced on money paths.
 */

import { query } from '../db/pg.js';
import { isKillSwitchActive, setKillSwitch } from './incidentEngine.mjs';

export const EMERGENCY_CONTROLS = [
  {
    type: 'GLOBAL_BETTING_PAUSE',
    label: 'Pause all betting',
    blocks: 'New bets (live and pre-match)',
    kill: 'STOP_NEW_BETS',
  },
  {
    type: 'CASHOUT_PAUSE',
    label: 'Pause cashout',
    blocks: 'Early cashout',
    kill: 'STOP_CASHOUT',
  },
  {
    type: 'DEPOSITS_PAUSE',
    label: 'Pause deposits',
    blocks: 'New deposit orders',
    kill: null,
  },
  {
    type: 'WITHDRAWALS_PAUSE',
    label: 'Pause withdrawals',
    blocks: 'New withdrawal requests',
    kill: null,
  },
  {
    type: 'MAINTENANCE_MODE',
    label: 'Maintenance mode',
    blocks: 'Bets, cashout, deposits, and withdrawals',
    kill: 'STOP_NEW_BETS',
  },
];

const KIND_TO_TYPES = {
  bet: ['GLOBAL_BETTING_PAUSE', 'MAINTENANCE_MODE', 'MARKET_SUSPENSION', 'SPORT_PAUSE'],
  cashout: ['CASHOUT_PAUSE', 'MAINTENANCE_MODE', 'GLOBAL_BETTING_PAUSE'],
  deposit: ['DEPOSITS_PAUSE', 'MAINTENANCE_MODE'],
  withdrawal: ['WITHDRAWALS_PAUSE', 'MAINTENANCE_MODE'],
};

const KIND_KILL = {
  bet: ['STOP_NEW_BETS', 'STOP_LIVE_BETTING'],
  cashout: ['STOP_CASHOUT'],
  deposit: [],
  withdrawal: [],
};

const memoryActive = new Set();
let cache = { at: 0, types: new Set() };
const CACHE_MS = 4000;

export function invalidateEmergencyCache() {
  cache = { at: 0, types: new Set() };
}

export function setEmergencyForTests(type, active) {
  if (active) memoryActive.add(type);
  else memoryActive.delete(type);
  invalidateEmergencyCache();
}

export function clearEmergenciesForTests() {
  memoryActive.clear();
  invalidateEmergencyCache();
  syncKillSwitchesFromTypes(new Set());
}

async function loadDbActiveTypes() {
  try {
    const res = await query(
      `SELECT state_type FROM emergency_states WHERE is_active = TRUE`,
    );
    return new Set((res.rows || []).map((r) => String(r.state_type || '').toUpperCase()).filter(Boolean));
  } catch {
    return new Set();
  }
}

export async function getActiveEmergencyTypes() {
  const now = Date.now();
  if (now - cache.at < CACHE_MS && cache.types) {
    return new Set([...cache.types, ...memoryActive]);
  }
  const fromDb = await loadDbActiveTypes();
  cache = { at: now, types: fromDb };
  return new Set([...fromDb, ...memoryActive]);
}

export function syncKillSwitchesFromTypes(types) {
  const active = types instanceof Set ? types : new Set(types || []);
  const bettingOff = active.has('GLOBAL_BETTING_PAUSE')
    || active.has('MAINTENANCE_MODE')
    || active.has('MARKET_SUSPENSION')
    || active.has('SPORT_PAUSE');
  const cashoutOff = active.has('CASHOUT_PAUSE')
    || active.has('MAINTENANCE_MODE')
    || active.has('GLOBAL_BETTING_PAUSE');
  setKillSwitch('STOP_NEW_BETS', bettingOff, 'Emergency control plane');
  setKillSwitch('STOP_LIVE_BETTING', bettingOff, 'Emergency control plane');
  setKillSwitch('STOP_CASHOUT', cashoutOff, 'Emergency control plane');
}

export async function assertEmergencyAllows(kind) {
  const types = await getActiveEmergencyTypes();
  const blockedBy = (KIND_TO_TYPES[kind] || []).find((t) => types.has(t));
  const killHit = (KIND_KILL[kind] || []).find((k) => isKillSwitchActive(k));
  if (!blockedBy && !killHit) return;
  const code = kind === 'bet' ? 'MARKET_SUSPENDED' : 'SERVICE_PAUSED';
  const label = blockedBy || killHit;
  const err = new Error(`${code}: ${label} is active. New ${kind}s are paused.`);
  err.code = code;
  err.status = 403;
  throw err;
}
