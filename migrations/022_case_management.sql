-- Migration 022: Unified Case Management System
-- Central case management for FRAUD, KYC, WITHDRAWAL, PAYMENT, SETTLEMENT, SUPPORT_ESCALATION, RESPONSIBLE_GAMING, SECURITY, OPERATIONAL

-- 1. CASES TABLE
CREATE TABLE IF NOT EXISTS cases (
  case_id VARCHAR(64) PRIMARY KEY,
  case_type VARCHAR(64) NOT NULL, -- FRAUD | KYC | WITHDRAWAL | PAYMENT | SETTLEMENT | SUPPORT_ESCALATION | RESPONSIBLE_GAMING | SECURITY | OPERATIONAL
  priority VARCHAR(16) NOT NULL DEFAULT 'MEDIUM', -- LOW | MEDIUM | HIGH | CRITICAL
  severity VARCHAR(16) NOT NULL DEFAULT 'MEDIUM', -- LOW | MEDIUM | HIGH | CRITICAL
  status VARCHAR(32) NOT NULL DEFAULT 'OPEN', -- OPEN | IN_PROGRESS | WAITING | ESCALATED | RESOLVED | CLOSED
  title VARCHAR(255) NOT NULL,
  description TEXT,
  user_id VARCHAR(64) REFERENCES users(user_id),
  entity_type VARCHAR(64), -- bet | transaction | ticket | withdrawal | match | market
  entity_id VARCHAR(128),
  owner_id VARCHAR(64), -- assigned admin
  team VARCHAR(64), -- RISK | SUPPORT | FINANCE | TRADING | OPERATIONS | SECURITY
  sla_deadline TIMESTAMP WITH TIME ZONE,
  related_bets JSONB DEFAULT '[]'::jsonb,
  related_transactions JSONB DEFAULT '[]'::jsonb,
  related_tickets JSONB DEFAULT '[]'::jsonb,
  related_payments JSONB DEFAULT '[]'::jsonb,
  related_kyc JSONB DEFAULT '[]'::jsonb,
  resolution TEXT,
  resolution_type VARCHAR(64), -- RESOLVED | DISMISSED | ESCALATED | AUTO_RESOLVED
  tenant_id VARCHAR(64) DEFAULT 'oddsyra_in',
  created_by VARCHAR(64) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP WITH TIME ZONE,
  closed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status, priority);
CREATE INDEX IF NOT EXISTS idx_cases_type ON cases(case_type, status);
CREATE INDEX IF NOT EXISTS idx_cases_owner ON cases(owner_id, status);
CREATE INDEX IF NOT EXISTS idx_cases_user ON cases(user_id);
CREATE INDEX IF NOT EXISTS idx_cases_sla ON cases(sla_deadline) WHERE status NOT IN ('RESOLVED', 'CLOSED');
CREATE INDEX IF NOT EXISTS idx_cases_tenant ON cases(tenant_id);

-- 2. CASE NOTES TABLE
CREATE TABLE IF NOT EXISTS case_notes (
  note_id VARCHAR(64) PRIMARY KEY,
  case_id VARCHAR(64) NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
  author_id VARCHAR(64) NOT NULL,
  content TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_case_notes_case ON case_notes(case_id, created_at);

-- 3. CASE EVIDENCE TABLE
CREATE TABLE IF NOT EXISTS case_evidence (
  evidence_id VARCHAR(64) PRIMARY KEY,
  case_id VARCHAR(64) NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
  evidence_type VARCHAR(64) NOT NULL, -- SCREENSHOT | DOCUMENT | LOG | TRANSACTION | COMMUNICATION | SYSTEM_DATA
  title VARCHAR(255) NOT NULL,
  description TEXT,
  url TEXT,
  data JSONB DEFAULT '{}'::jsonb,
  uploaded_by VARCHAR(64) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_case_evidence_case ON case_evidence(case_id);

-- 4. CASE TASKS TABLE
CREATE TABLE IF NOT EXISTS case_tasks (
  task_id VARCHAR(64) PRIMARY KEY,
  case_id VARCHAR(64) NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  assignee_id VARCHAR(64),
  status VARCHAR(32) DEFAULT 'OPEN', -- OPEN | IN_PROGRESS | BLOCKED | COMPLETED | CANCELLED
  priority VARCHAR(16) DEFAULT 'MEDIUM',
  due_date TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_by VARCHAR(64) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_case_tasks_case ON case_tasks(case_id, status);
CREATE INDEX IF NOT EXISTS idx_case_tasks_assignee ON case_tasks(assignee_id, status);

-- 5. CASE HISTORY / AUDIT TABLE
CREATE TABLE IF NOT EXISTS case_history (
  history_id SERIAL PRIMARY KEY,
  case_id VARCHAR(64) NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
  action VARCHAR(64) NOT NULL, -- CREATED | STATUS_CHANGED | ASSIGNED | REASSIGNED | ESCALATED | NOTE_ADDED | EVIDENCE_ADDED | TASK_ADDED | RESOLVED | CLOSED | REOPENED
  actor_id VARCHAR(64) NOT NULL,
  old_value TEXT,
  new_value TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_case_history_case ON case_history(case_id, created_at);
