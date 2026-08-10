-- Migration 016: Support Tickets, Resolution Engine, SLAs, & Audit Ecosystem
-- Enterprise DDL upgrading support_conversations into authoritative Support Tickets

CREATE SEQUENCE IF NOT EXISTS support_ticket_seq START WITH 100001 INCREMENT BY 1;

-- Ensure columns exist on support_conversations
ALTER TABLE support_conversations ADD COLUMN IF NOT EXISTS ticket_number VARCHAR(32);
ALTER TABLE support_conversations ADD COLUMN IF NOT EXISTS resolution_status VARCHAR(32) DEFAULT 'NOT_PROVIDED';
ALTER TABLE support_conversations ADD COLUMN IF NOT EXISTS resolution_code VARCHAR(64);
ALTER TABLE support_conversations ADD COLUMN IF NOT EXISTS resolution_summary TEXT;
ALTER TABLE support_conversations ADD COLUMN IF NOT EXISTS resolved_by VARCHAR(64);
ALTER TABLE support_conversations ADD COLUMN IF NOT EXISTS first_response_due_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE support_conversations ADD COLUMN IF NOT EXISTS resolution_due_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE support_conversations ADD COLUMN IF NOT EXISTS waiting_for VARCHAR(64);
ALTER TABLE support_conversations ADD COLUMN IF NOT EXISTS next_action_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE support_conversations ADD COLUMN IF NOT EXISTS related_entity_type VARCHAR(64);
ALTER TABLE support_conversations ADD COLUMN IF NOT EXISTS related_entity_id VARCHAR(64);

-- Populate ticket_number for existing records if missing
UPDATE support_conversations 
SET ticket_number = 'TK-' || nextval('support_ticket_seq') 
WHERE ticket_number IS NULL;

-- Make ticket_number unique
CREATE UNIQUE INDEX IF NOT EXISTS idx_support_conversations_ticket_number ON support_conversations(ticket_number);
CREATE INDEX IF NOT EXISTS idx_support_conversations_resolution_status ON support_conversations(resolution_status);
CREATE INDEX IF NOT EXISTS idx_support_conversations_user_category ON support_conversations(user_id, category, status);
CREATE INDEX IF NOT EXISTS idx_support_conversations_sla ON support_conversations(first_response_due_at, resolution_due_at);

-- Immutable Lifecycle History Table
CREATE TABLE IF NOT EXISTS support_ticket_history (
  history_id SERIAL PRIMARY KEY,
  conversation_id VARCHAR(64) NOT NULL REFERENCES support_conversations(conversation_id) ON DELETE CASCADE,
  actor_id VARCHAR(64) NOT NULL,
  action VARCHAR(64) NOT NULL,
  old_value VARCHAR(128),
  new_value VARCHAR(128),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_support_ticket_history_conv ON support_ticket_history(conversation_id);
