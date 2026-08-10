/**
 * Enterprise Business Rule Engine — BetKing Sportsbook (lib/ruleEngine.mjs)
 * 
 * PG-backed configurable business rules with versioning, audit, and environment awareness.
 * Categories: BETTING, RISK, KYC, PROMOTIONS, RESPONSIBLE_GAMING, PAYMENT, WITHDRAWAL, SUPPORT_SLA, MARKET, GENERAL
 */

import { query } from '../db/pg.js';

const DYNAMIC_BUSINESS_RULES = new Map();

/**
 * Register a business rule in memory (for runtime evaluation).
 */
export function registerBusinessRule(ruleId, ruleDefinition = {}) {
  const rule = {
    ruleId,
    name: ruleDefinition.name || ruleId,
    category: ruleDefinition.category || 'GENERAL',
    conditionFn: ruleDefinition.conditionFn || (() => true),
    action: ruleDefinition.action || 'ALLOW',
    enabled: ruleDefinition.enabled !== false,
    version: ruleDefinition.version || 1,
    environment: ruleDefinition.environment || 'all',
  };

  DYNAMIC_BUSINESS_RULES.set(ruleId, rule);
  return rule;
}

/**
 * Evaluate all registered business rules against a context.
 */
export function evaluateBusinessRules(context = {}) {
  const violations = [];
  for (const rule of DYNAMIC_BUSINESS_RULES.values()) {
    if (!rule.enabled) continue;
    try {
      if (!rule.conditionFn(context)) {
        violations.push({ ruleId: rule.ruleId, name: rule.name, action: rule.action, category: rule.category });
      }
    } catch (ignored) {
    }
  }

  return {
    passed: violations.length === 0,
    violations,
    evaluatedCount: DYNAMIC_BUSINESS_RULES.size,
  };
}

/**
 * Save a business rule to PostgreSQL with versioning.
 */
export async function persistBusinessRule({
  ruleId = null,
  ruleName,
  category = 'GENERAL',
  condition = {},
  action = 'ALLOW',
  enabled = true,
  createdBy = 'admin',
}) {
  const id = ruleId || `rule_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  // Check if rule exists for versioning
  const existing = await query(`SELECT id, version FROM risk_rules WHERE id = $1;`, [id]);
  const version = existing.rows.length > 0 ? existing.rows[0].version + 1 : 1;

  if (existing.rows.length > 0) {
    await query(`
      UPDATE risk_rules
      SET rule_name = $2, condition = $3, action = $4, enabled = $5, version = $6
      WHERE id = $1;
    `, [id, ruleName, JSON.stringify(condition), action, enabled, version]);
  } else {
    await query(`
      INSERT INTO risk_rules (id, rule_name, condition, action, enabled, version)
      VALUES ($1, $2, $3, $4, $5, $6);
    `, [id, ruleName, JSON.stringify(condition), action, enabled, version]);
  }

  return { success: true, ruleId: id, ruleName, category, action, enabled, version };
}

/**
 * Load all business rules from PostgreSQL.
 */
export async function loadBusinessRules() {
  const res = await query(`
    SELECT id, rule_name, condition, action, enabled, version, created_at
    FROM risk_rules
    WHERE enabled = TRUE
    ORDER BY created_at DESC;
  `);
  return { success: true, count: res.rows.length, rules: res.rows };
}

/**
 * Get all registered in-memory rules for inspection.
 */
export function getRegisteredRules() {
  const rules = [];
  for (const rule of DYNAMIC_BUSINESS_RULES.values()) {
    rules.push({
      ruleId: rule.ruleId,
      name: rule.name,
      category: rule.category,
      action: rule.action,
      enabled: rule.enabled,
      version: rule.version,
    });
  }
  return { success: true, count: rules.length, rules };
}
