-- Migration 015: Support Platform & Real-Time Customer Communication Ecosystem
-- Authoritative Schema for Conversations, Messages, Internal Notes, Escalations, Assignments & Attachments

CREATE TABLE IF NOT EXISTS support_conversations (
  conversation_id VARCHAR(64) PRIMARY KEY,
  conversation_number VARCHAR(32) UNIQUE NOT NULL,
  user_id VARCHAR(64) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  tenant_id VARCHAR(64) DEFAULT 'betking_in',
  subject VARCHAR(255) NOT NULL DEFAULT 'Customer Support Inquiry',
  category VARCHAR(64) NOT NULL DEFAULT 'GENERAL',
  priority VARCHAR(32) NOT NULL DEFAULT 'NORMAL', -- LOW | NORMAL | HIGH | URGENT
  status VARCHAR(32) NOT NULL DEFAULT 'OPEN', -- OPEN | PENDING | RESOLVED | CLOSED | ESCALATED
  assigned_agent_id VARCHAR(64),
  assigned_agent_name VARCHAR(128) DEFAULT 'Unassigned',
  assigned_team VARCHAR(64) DEFAULT 'GENERAL',
  sla_due_at TIMESTAMP WITH TIME ZONE,
  first_response_at TIMESTAMP WITH TIME ZONE,
  resolved_at TIMESTAMP WITH TIME ZONE,
  closed_at TIMESTAMP WITH TIME ZONE,
  reopened_at TIMESTAMP WITH TIME ZONE,
  unread_user_count INT DEFAULT 0,
  unread_admin_count INT DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Upgrade existing support_conversations table if created by prior migration
ALTER TABLE support_conversations ADD COLUMN IF NOT EXISTS conversation_number VARCHAR(32);
ALTER TABLE support_conversations ADD COLUMN IF NOT EXISTS subject VARCHAR(255) DEFAULT 'Customer Support Inquiry';
ALTER TABLE support_conversations ADD COLUMN IF NOT EXISTS assigned_agent_id VARCHAR(64);
ALTER TABLE support_conversations ADD COLUMN IF NOT EXISTS assigned_agent_name VARCHAR(128) DEFAULT 'Unassigned';
ALTER TABLE support_conversations ADD COLUMN IF NOT EXISTS sla_due_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE support_conversations ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE support_conversations ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE support_conversations ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE support_conversations ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE support_conversations ADD COLUMN IF NOT EXISTS unread_user_count INT DEFAULT 0;
ALTER TABLE support_conversations ADD COLUMN IF NOT EXISTS unread_admin_count INT DEFAULT 1;

CREATE TABLE IF NOT EXISTS support_messages (
  message_id VARCHAR(64) PRIMARY KEY,
  conversation_id VARCHAR(64) NOT NULL REFERENCES support_conversations(conversation_id) ON DELETE CASCADE,
  sender_id VARCHAR(64) NOT NULL,
  sender_type VARCHAR(32) NOT NULL, -- user | admin | system
  message_type VARCHAR(32) NOT NULL DEFAULT 'USER_MESSAGE', -- USER_MESSAGE | ADMIN_MESSAGE | INTERNAL_NOTE | SYSTEM_MESSAGE
  agent_name VARCHAR(128),
  text TEXT NOT NULL,
  attachments JSONB DEFAULT '[]'::jsonb,
  idempotency_key VARCHAR(128),
  delivered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Upgrade existing support_messages table if created by prior migration
ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS sender_id VARCHAR(64);
ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS sender_type VARCHAR(32);
ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS message_type VARCHAR(32) DEFAULT 'USER_MESSAGE';
ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128);
ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMP WITH TIME ZONE;

CREATE TABLE IF NOT EXISTS support_attachments (
  attachment_id VARCHAR(64) PRIMARY KEY,
  message_id VARCHAR(64) REFERENCES support_messages(message_id) ON DELETE CASCADE,
  conversation_id VARCHAR(64) NOT NULL REFERENCES support_conversations(conversation_id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_type VARCHAR(64) NOT NULL,
  file_size INT NOT NULL,
  storage_path VARCHAR(512) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS support_assignments (
  assignment_id VARCHAR(64) PRIMARY KEY,
  conversation_id VARCHAR(64) NOT NULL REFERENCES support_conversations(conversation_id) ON DELETE CASCADE,
  assigned_by VARCHAR(64) NOT NULL,
  agent_id VARCHAR(64),
  agent_name VARCHAR(128) NOT NULL,
  team_id VARCHAR(64) NOT NULL,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS support_escalations (
  escalation_id VARCHAR(64) PRIMARY KEY,
  conversation_id VARCHAR(64) NOT NULL REFERENCES support_conversations(conversation_id) ON DELETE CASCADE,
  escalated_by VARCHAR(64) NOT NULL,
  from_team VARCHAR(64) NOT NULL,
  to_team VARCHAR(64) NOT NULL,
  reason TEXT NOT NULL,
  escalated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS support_audit_logs (
  log_id SERIAL PRIMARY KEY,
  conversation_id VARCHAR(64) NOT NULL,
  actor_id VARCHAR(64) NOT NULL,
  action VARCHAR(64) NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- INDEXES FOR HIGH PERFORMANCE QUERYING & SEARCH
CREATE INDEX IF NOT EXISTS idx_support_conv_user ON support_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_support_conv_status ON support_conversations(status);
CREATE INDEX IF NOT EXISTS idx_support_conv_assigned ON support_conversations(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_support_conv_category ON support_conversations(category);
CREATE INDEX IF NOT EXISTS idx_support_conv_tenant ON support_conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_support_conv_updated ON support_conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_msg_conv ON support_messages(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_support_msg_idempotency ON support_messages(idempotency_key);
