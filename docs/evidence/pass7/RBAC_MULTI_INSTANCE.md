# Pass 7 — RBAC_MULTI_INSTANCE

Role decisions use verified JWT claims + shared `JWT_SECRET` — not process-local permission caches.

| Test | Result |
| --- | --- |
| OPERATIONS_ADMIN → risk hierarchy | DENY |
| SUPER_ADMIN → risk hierarchy | ALLOW |
| No process-local role cache dependency | PASS |

**Result:** PASS
