/**
 * Enterprise Business Rule Engine — BetKing Sportsbook (lib/ruleEngine.mjs)
 * Ensures business rules are never hardcoded. Manages stake limits, odds limits,
 * country-specific regulations, VIP rules, provider rules, market visibility, and sport rules.
 */

const DYNAMIC_BUSINESS_RULES = new Map();

export function registerBusinessRule(ruleId, ruleDefinition = {}) {
  const rule = {
    ruleId,
    name: ruleDefinition.name || ruleId,
    category: ruleDefinition.category || 'GENERAL', // 'STAKE', 'ODDS', 'COUNTRY', 'VIP', 'MARKET'
    conditionFn: ruleDefinition.conditionFn || (() => true),
    action: ruleDefinition.action || 'ALLOW',
    enabled: ruleDefinition.enabled !== false,
  };

  DYNAMIC_BUSINESS_RULES.set(ruleId, rule);
  return rule;
}

export function evaluateBusinessRules(context = {}) {
  const violations = [];
  for (const rule of DYNAMIC_BUSINESS_RULES.values()) {
    if (!rule.enabled) continue;
    try {
      if (!rule.conditionFn(context)) {
        violations.push({ ruleId: rule.ruleId, name: rule.name, action: rule.action });
      }
    } catch (ignored) {
    }
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}
