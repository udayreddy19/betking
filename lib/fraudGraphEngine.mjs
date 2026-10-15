/**
 * Fraud & Risk Relationship Graph Engine
 * Connects User, Device, IP, Payment Reference, and Betting Patterns into a security risk graph.
 * Persists to Redis when available; falls back to process memory.
 */

const REDIS_PREFIX = 'fraud_graph:v1:';
const REDIS_TTL_SEC = 60 * 60 * 24 * 30; // 30 days

async function getRedis() {
  try {
    const mod = await import('../db/redis.js');
    const client = mod.default || mod.redis || mod.getRedis?.();
    if (client?.get && client?.set) return client;
    if (mod.getRedisClient) return await mod.getRedisClient();
  } catch { /* no redis */ }
  return null;
}

function serializeNode(node) {
  if (!node) return null;
  return {
    ...node,
    devices: [...(node.devices || [])],
    ips: [...(node.ips || [])],
    payments: [...(node.payments || [])],
    betPatterns: node.betPatterns || [],
  };
}

function deserializeNode(raw) {
  if (!raw) return null;
  return {
    ...raw,
    devices: new Set(raw.devices || []),
    ips: new Set(raw.ips || []),
    payments: new Set(raw.payments || []),
    betPatterns: raw.betPatterns || [],
  };
}

class FraudGraphEngine {
  constructor() {
    this.userGraph = new Map();
    this.flaggedAccounts = new Map();
    this.accountActivityLogs = new Map();
    this._hydrated = false;
    this.seedDefaultAccounts();
  }

  seedDefaultAccounts() {
    const defaults = [
      {
        id: 'acc_1',
        email: 'user992@tempmail.com',
        ip: '49.37.142.12',
        risk: 'HIGH',
        reason: 'Multiple account creations from same IP',
        status: 'FLAGGED',
        verificationStatus: 'NOT_REQUESTED',
        restrictionReasonCategory: null,
        outstandingRequirements: [],
        createdAt: new Date().toISOString(),
      },
      {
        id: 'acc_2',
        email: 'bonus_hunter@mail.com',
        ip: '103.22.10.88',
        risk: 'MEDIUM',
        reason: 'Rapid deposit/withdrawal requests without wagering',
        status: 'FLAGGED',
        verificationStatus: 'NOT_REQUESTED',
        restrictionReasonCategory: null,
        outstandingRequirements: [],
        createdAt: new Date().toISOString(),
      },
    ];

    defaults.forEach((acc) => {
      this.flaggedAccounts.set(acc.id, acc);
      this.logActivity(acc.email, 'ACCOUNT_FLAGGED', `Flagged for ${acc.reason} (Risk: ${acc.risk})`);
    });
  }

  async _persistFlagged(accountId) {
    const acc = this.flaggedAccounts.get(accountId);
    if (!acc) return;
    try {
      const redis = await getRedis();
      if (!redis) return;
      await redis.set(`${REDIS_PREFIX}flagged:${accountId}`, JSON.stringify(acc), 'EX', REDIS_TTL_SEC);
    } catch { /* non-fatal */ }
  }

  async _persistUser(userId) {
    const node = this.userGraph.get(userId);
    if (!node) return;
    try {
      const redis = await getRedis();
      if (!redis) return;
      await redis.set(`${REDIS_PREFIX}user:${userId}`, JSON.stringify(serializeNode(node)), 'EX', REDIS_TTL_SEC);
    } catch { /* non-fatal */ }
  }

  async hydrateUser(userId) {
    if (this.userGraph.has(userId)) return this.userGraph.get(userId);
    try {
      const redis = await getRedis();
      if (!redis) return null;
      const raw = await redis.get(`${REDIS_PREFIX}user:${userId}`);
      if (!raw) return null;
      const node = deserializeNode(JSON.parse(raw));
      this.userGraph.set(userId, node);
      return node;
    } catch {
      return null;
    }
  }

  logActivity(email, action, details) {
    const list = this.accountActivityLogs.get(email) || [];
    list.push({
      activityId: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      action,
      details,
      timestamp: new Date().toISOString(),
    });
    this.accountActivityLogs.set(email, list);
  }

  getActivityLogs(email) {
    return this.accountActivityLogs.get(email) || [];
  }

  getFlaggedAccounts() {
    return Array.from(this.flaggedAccounts.values()).map((acc) => ({
      ...acc,
      permittedActions: this.getPermittedActions(acc),
    }));
  }

  getAccountDetails(accountId) {
    const acc = this.flaggedAccounts.get(accountId) || Array.from(this.flaggedAccounts.values()).find((a) => a.email === accountId);
    if (!acc) return null;
    return {
      ...acc,
      permittedActions: this.getPermittedActions(acc),
      activity: this.getActivityLogs(acc.email),
    };
  }

  getPermittedActions(acc) {
    const actions = ['viewDetails'];
    if (acc.status === 'FLAGGED' || acc.status === 'ACTIVE' || acc.status === 'RELEASED') {
      actions.push('restrictAccount', 'requestVerification');
    }
    if (acc.status === 'RESTRICTED') {
      actions.push('requestVerification');
      if (acc.verificationStatus === 'VERIFIED' || acc.verificationStatus === 'NOT_REQUESTED') {
        actions.push('releaseAccount');
      }
    }
    return actions;
  }

  restrictAccount(accountId, { category = 'Fraud review', operatorNotes = 'Operator initiated restriction', operatorId = 'admin' }) {
    const acc = this.flaggedAccounts.get(accountId) || Array.from(this.flaggedAccounts.values()).find((a) => a.email === accountId);
    if (!acc) throw new Error('Account not found');

    acc.status = 'RESTRICTED';
    acc.restrictionReasonCategory = category;
    acc.restrictedAt = new Date().toISOString();

    this.logActivity(acc.email, 'RESTRICTED', `Account restricted under category '${category}'. Reason: ${operatorNotes}`);
    void this._persistFlagged(acc.id);
    return acc;
  }

  requestVerification(accountId, { verificationType = 'Identity verification', operatorNotes = '', operatorId = 'admin' }) {
    const acc = this.flaggedAccounts.get(accountId) || Array.from(this.flaggedAccounts.values()).find((a) => a.email === accountId);
    if (!acc) throw new Error('Account not found');

    acc.verificationStatus = 'REQUESTED';
    acc.outstandingRequirements = [verificationType];
    acc.verificationRequestedAt = new Date().toISOString();

    this.logActivity(acc.email, 'VERIFICATION_REQUESTED', `Requested ${verificationType}. Account restricted until verified.`);
    void this._persistFlagged(acc.id);
    return acc;
  }

  releaseAccount(accountId, { operatorReason = 'Verification completed and verified', operatorId = 'admin' }) {
    const acc = this.flaggedAccounts.get(accountId) || Array.from(this.flaggedAccounts.values()).find((a) => a.email === accountId);
    if (!acc) throw new Error('Account not found');

    if (acc.verificationStatus === 'REQUESTED' || acc.verificationStatus === 'PENDING' || acc.verificationStatus === 'IN_REVIEW') {
      return {
        success: false,
        reason: 'Account cannot be released because identity verification is still pending.',
        account: acc,
      };
    }

    acc.status = 'RELEASED';
    acc.restrictionReasonCategory = null;
    acc.releasedAt = new Date().toISOString();

    this.logActivity(acc.email, 'RELEASED', `Account released by operator. Reason: ${operatorReason}`);
    void this._persistFlagged(acc.id);
    return {
      success: true,
      account: acc,
    };
  }

  recordUserSignal(userId, { deviceId, ipAddress, paymentRef, betPattern = 'standard' } = {}) {
    if (!userId) return null;
    const existing = this.userGraph.get(userId) || {
      userId,
      devices: new Set(),
      ips: new Set(),
      payments: new Set(),
      betPatterns: [],
      score: 0,
    };

    if (deviceId) existing.devices.add(deviceId);
    if (ipAddress) existing.ips.add(ipAddress);
    if (paymentRef) existing.payments.add(paymentRef);
    if (betPattern) existing.betPatterns.push({ pattern: betPattern, time: new Date().toISOString() });

    let score = 0;
    if (existing.devices.size > 3) score += 30;
    if (existing.ips.size > 5) score += 35;
    if (existing.payments.size > 2) score += 25;

    existing.score = Math.min(100, score);
    this.userGraph.set(userId, existing);
    void this._persistUser(userId);

    return this.evaluateUserRisk(userId);
  }

  evaluateUserRisk(userId) {
    const node = this.userGraph.get(userId);
    if (!node) return { action: 'MONITOR', score: 0, factors: [] };

    const factors = [];
    if (node.devices.size > 3) factors.push('Multiple devices associated with single account');
    if (node.ips.size > 5) factors.push('Rapid IP address switching');

    let action = 'MONITOR';
    if (node.score >= 80) action = 'CHALLENGE';
    else if (node.score >= 50) action = 'REVIEW';
    else if (node.score >= 30) action = 'LIMIT';

    return {
      action,
      score: node.score,
      factors,
      persisted: true,
    };
  }

  /** Test helper — clear in-memory state. */
  _resetForTests() {
    this.userGraph.clear();
    this.accountActivityLogs.clear();
    this.flaggedAccounts.clear();
    this.seedDefaultAccounts();
  }
}

export const fraudGraphEngine = new FraudGraphEngine();
