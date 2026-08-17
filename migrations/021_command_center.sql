-- Migration 021: Admin Command Center — Search History & Quick Actions Audit
-- Supports the global ⌘+K Command Palette with RBAC-aware search

-- 1. ADMIN SEARCH HISTORY (analytics + recent searches)
CREATE TABLE IF NOT EXISTS admin_search_history (
  id SERIAL PRIMARY KEY,
  admin_id VARCHAR(64) NOT NULL,
  search_query VARCHAR(512) NOT NULL,
  result_count INT DEFAULT 0,
  entity_types_searched TEXT[] DEFAULT '{}',
  tenant_id VARCHAR(64) DEFAULT 'oddsyra_in',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_search_admin ON admin_search_history(admin_id, created_at DESC);

-- 2. ADMIN QUICK ACTIONS LOG (audit trail for command palette actions)
CREATE TABLE IF NOT EXISTS admin_quick_actions_log (
  id SERIAL PRIMARY KEY,
  admin_id VARCHAR(64) NOT NULL,
  action_type VARCHAR(128) NOT NULL,
  target_entity_type VARCHAR(64),
  target_entity_id VARCHAR(128),
  action_details JSONB DEFAULT '{}'::jsonb,
  requires_confirmation BOOLEAN DEFAULT FALSE,
  confirmation_reason TEXT,
  status VARCHAR(32) DEFAULT 'EXECUTED', -- EXECUTED | CONFIRMED | CANCELLED | DENIED
  correlation_id VARCHAR(128),
  tenant_id VARCHAR(64) DEFAULT 'oddsyra_in',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_actions_admin ON admin_quick_actions_log(admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_actions_target ON admin_quick_actions_log(target_entity_type, target_entity_id);
