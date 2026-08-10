/**
 * Security Event Correlation Engine
 * Detects suspicious sequence patterns (e.g., login -> password change -> withdrawal request).
 */

class SecurityEventCorrelationEngine {
  constructor() {
    this.userEventSequences = new Map(); // userId -> Array of security events
  }

  recordSecurityEvent(userId, eventType, details = {}) {
    if (!userId) return null;
    let sequence = this.userEventSequences.get(userId) || [];

    const item = {
      eventType,
      details,
      timestamp: Date.now(),
    };

    sequence.push(item);
    if (sequence.length > 50) sequence.shift();
    this.userEventSequences.set(userId, sequence);

    return this.correlateUserSequence(userId);
  }

  correlateUserSequence(userId) {
    const sequence = this.userEventSequences.get(userId) || [];
    const now = Date.now();
    const recent = sequence.filter((e) => (now - e.timestamp) < 3600000); // Past 1 hour

    const types = recent.map((r) => r.eventType);

    const isHighRiskSeq =
      types.includes('LOGIN') &&
      types.includes('PASSWORD_CHANGE') &&
      types.includes('LARGE_WITHDRAWAL_REQUEST');

    if (isHighRiskSeq) {
      return {
        flagged: true,
        riskLevel: 'CRITICAL',
        recommendation: 'TEMPORARILY_RESTRICT_WITHDRAWALS',
        matchedSequence: ['LOGIN', 'PASSWORD_CHANGE', 'LARGE_WITHDRAWAL_REQUEST'],
      };
    }

    return { flagged: false, riskLevel: 'LOW', recommendation: 'NONE' };
  }
}

export const securityEventCorrelation = new SecurityEventCorrelationEngine();
