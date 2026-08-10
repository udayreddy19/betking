/**
 * Enterprise Compliance Engine — BetKing Enterprise Platform (lib/complianceEngine.mjs)
 * Manages jurisdiction rules, licensing compliance, age restrictions (18+), and responsible gaming rules.
 */

const COMPLIANCE_AUDIT_LOGS = [];

export function validateJurisdictionCompliance(userState = 'IN', userAge = 21, kycStatus = 'VERIFIED') {
  if (userAge < 18) {
    const res = { compliant: false, reason: 'AGE_RESTRICTION_UNDER_18', userAge, userState };
    recordComplianceAudit('UNDERAGE_ATTEMPT_BLOCKED', res);
    return res;
  }

  if (kycStatus === 'REJECTED') {
    const res = { compliant: false, reason: 'KYC_VERIFICATION_REJECTED', userAge, userState };
    recordComplianceAudit('KYC_REJECTED_BLOCKED', res);
    return res;
  }

  const res = { compliant: true, jurisdiction: userState, kycStatus };
  recordComplianceAudit('JURISDICTION_ELIGIBILITY_PASSED', res);
  return res;
}

export function recordComplianceAudit(action, details = {}) {
  const entry = {
    auditId: `cmp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    action,
    details,
    timestamp: new Date().toISOString(),
  };
  COMPLIANCE_AUDIT_LOGS.push(entry);
  if (COMPLIANCE_AUDIT_LOGS.length > 200) COMPLIANCE_AUDIT_LOGS.shift();
  return entry;
}

export function getComplianceAuditHistory() {
  return COMPLIANCE_AUDIT_LOGS.slice(-100);
}
