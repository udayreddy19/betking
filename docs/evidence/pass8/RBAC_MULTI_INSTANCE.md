# Pass 8 — RBAC_MULTI_INSTANCE

JWT signed with shared `JWT_SECRET`; roles from verified token claims — no process-local privilege cache.

| Check | Instance | Result |
| --- | --- | --- |
| USER → trading/risk | API-2 | DENY 403 |
| OPERATIONS_ADMIN → risk | API-2 | DENY 403 |
| SUPER_ADMIN → risk | API-2 | ALLOW 200 |
| jwt_shared_secret_across_instances | both | PASS |

Canonical role naming retained: `OPERATIONS_ADMIN`.
