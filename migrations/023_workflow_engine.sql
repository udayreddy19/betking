-- Migration 023: Workflow / Approval Engine
-- Reusable workflow engine for multi-step approvals with maker-checker enforcement

CREATE TABLE IF NOT EXISTS workflows (
  workflow_id VARCHAR(64) PRIMARY KEY,
  workflow_type VARCHAR(64) NOT NULL, -- WITHDRAWAL | LARGE_BET | SETTLEMENT_CORRECTION | CONFIG_CHANGE | RULE_CHANGE | ACCOUNT_RESTRICTION | EMERGENCY_ACTION
  version INT DEFAULT 1,
  trigger_type VARCHAR(64), -- MANUAL | AUTOMATIC | THRESHOLD
  trigger_details JSONB DEFAULT '{}'::jsonb,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING', -- PENDING | IN_REVIEW | APPROVED | REJECTED | ESCALATED | EXPIRED | CANCELLED | COMPLETED
  target_entity_type VARCHAR(64),
  target_entity_id VARCHAR(128),
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by VARCHAR(64) NOT NULL,
  current_step INT DEFAULT 1,
  total_steps INT DEFAULT 1,
  timeout_hours INT DEFAULT 24,
  escalation_role VARCHAR(64),
  tenant_id VARCHAR(64) DEFAULT 'betking_in',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_workflows_status ON workflows(status);
CREATE INDEX IF NOT EXISTS idx_workflows_type ON workflows(workflow_type, status);
CREATE INDEX IF NOT EXISTS idx_workflows_creator ON workflows(created_by, status);

CREATE TABLE IF NOT EXISTS workflow_steps (
  step_id VARCHAR(64) PRIMARY KEY,
  workflow_id VARCHAR(64) NOT NULL REFERENCES workflows(workflow_id) ON DELETE CASCADE,
  step_order INT NOT NULL,
  step_name VARCHAR(128) NOT NULL,
  step_type VARCHAR(64) NOT NULL, -- VALIDATION | REVIEW | APPROVAL | EXECUTION | RECONCILIATION
  approver_role VARCHAR(64), -- Required role to approve this step
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING', -- PENDING | IN_PROGRESS | APPROVED | REJECTED | SKIPPED
  actor_id VARCHAR(64),
  actor_reason TEXT,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_workflow_steps_workflow ON workflow_steps(workflow_id, step_order);
CREATE INDEX IF NOT EXISTS idx_workflow_steps_status ON workflow_steps(status, approver_role);
