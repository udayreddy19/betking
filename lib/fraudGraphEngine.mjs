/**
 * Fraud & Risk Relationship Graph Engine
 * Connects User, Device, IP, Payment Reference, and Betting Patterns into a security risk graph.
 */

class FraudGraphEngine {
  constructor() {
    this.userGraph = new Map(); // userId -> Node Details
    this.flaggedAccounts = new Map(); // accountId/email -> Account Details
    this.accountActivityLogs = new Map(); // email/id -> Array of activity logs

    // Initialize default flagged accounts with state management
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
      // Release is permitted if verification is NOT pending
      if (acc.verificationStatus === 'VERIFIED' || acc.verificationStatus === 'NOT_REQUESTED') {
        actions.push('releaseAccount');
      }
    }
    return actions;
  }

  /**
   * Restrict Account (Server-Side Enforced)
   */
  restrictAccount(accountId, { category = 'Fraud review', operatorNotes = 'Operator initiated restriction', operatorId = 'admin' }) {
    const acc = this.flaggedAccounts.get(accountId) || Array.from(this.flaggedAccounts.values()).find((a) => a.email === accountId);
    if (!acc) throw new Error('Account not found');

    const previousStatus = acc.status;
    acc.status = 'RESTRICTED';
    acc.restrictionReasonCategory = category;
    acc.restrictedAt = new Date().toISOString();

    this.logActivity(acc.email, 'RESTRICTED', `Account restricted under category '${category}'. Reason: ${operatorNotes}`);
    return acc;
  }

  /**
   * Request User Verification
   */
  requestVerification(accountId, { verificationType = 'Identity verification', operatorNotes = '', operatorId = 'admin' }) {
    const acc = this.flaggedAccounts.get(accountId) || Array.from(this.flaggedAccounts.values()).find((a) => a.email === accountId);
    if (!acc) throw new Error('Account not found');

    acc.verificationStatus = 'REQUESTED';
    acc.outstandingRequirements = [verificationType];
    acc.verificationRequestedAt = new Date().toISOString();

    this.logActivity(acc.email, 'VERIFICATION_REQUESTED', `Requested ${verificationType}. Account restricted until verified.`);
    return acc;
  }

  /**
   * Release Account with Server-Side Validation Guard
   */
  releaseAccount(accountId, { operatorReason = 'Verification completed and verified', operatorId = 'admin' }) {
    const acc = this.flaggedAccounts.get(accountId) || Array.from(this.flaggedAccounts.values()).find((a) => a.email === accountId);
    if (!acc) throw new Error('Account not found');

    // Server-Side Guard: Block release if verification is pending or requested
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
    return {
      success: true,
      account: acc,
    };
  }

  /** Register user security signals */
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
    this.userGraph.get(userId) || this.userGraph.set(userId, existing);

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
    };
  }
}

export const fraudGraphEngine = new FraudGraphEngine();
