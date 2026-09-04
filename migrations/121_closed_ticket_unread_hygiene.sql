-- Migration 121: Clear unread badges on closed/resolved support tickets (ops hygiene backfill)

UPDATE support_conversations
SET unread_admin_count = 0,
    unread_user_count = 0
WHERE UPPER(status) IN ('CLOSED', 'RESOLVED', 'RESOLVED_CLOSED')
  AND (unread_admin_count > 0 OR unread_user_count > 0);
