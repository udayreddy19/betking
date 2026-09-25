# Pass 8 — AUDIT_MULTI_INSTANCE

| Check | Result |
| --- | --- |
| write_visible_shared_db | PASS |
| append_only_retained | PASS (migration 097 triggers) |
| tamper_delete_denied | PASS |

Audit events written on API-1 are durable in PostgreSQL and visible independent of process restart. Not process-memory dependent.
