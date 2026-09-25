# Pass 8 — MAKER_CHECKER (multi-instance)

| Check | Result |
| --- | --- |
| self_approve_deny | PASS |
| checker_approve | PASS |

Observed SQL rollback: `MAKER_CHECKER_SELF_APPROVAL_PROHIBITED`. Durable audit retained via shared Postgres.
