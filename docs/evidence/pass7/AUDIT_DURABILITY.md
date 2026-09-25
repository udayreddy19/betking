# Pass 7 — AUDIT_DURABILITY

```text
write audit row via logAdminAction
        ↓
SELECT by event_id → PRESENT
        ↓
API process restart does not affect Postgres
        ↓
row remains queryable
```

**Result:** PASS  
Audit is not in-process memory; it is durable PostgreSQL.
