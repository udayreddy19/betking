-- Allow pending support uploads before a conversation/message exists.
ALTER TABLE support_attachments
  ALTER COLUMN conversation_id DROP NOT NULL;
