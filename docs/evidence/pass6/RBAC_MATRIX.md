# Pass 6 — RBAC_MATRIX

Policy follows `requireRole` / `adminAuth` on mounted admin routes (including newly mounted `/api/admin/trading/*`).

| Test | Anonymous | User | Operator (OPERATIONS_ADMIN) | Admin (SUPER_ADMIN) | MFA Admin | Result |
| --- | --- | --- | --- | --- | --- | --- |
| Admin production-readiness | DENY | DENY | ALLOW | ALLOW | ALLOW | PASS |
| Risk desk hierarchy | DENY | DENY | DENY | ALLOW | ALLOW | PASS |
| Exposure reconcile | DENY | DENY | DENY | ALLOW | ALLOW | PASS |
| Exposure rebuild dry-run | DENY | DENY | DENY | ALLOW | ALLOW | PASS |
| Exposure rebuild without confirm | DENY | DENY | DENY | CONFIRM_REQUIRED | CONFIRM_REQUIRED | PASS |
| Trading desk metrics | DENY | DENY | DENY | ALLOW | ALLOW | PASS |
| Hardening status | DENY | DENY | ALLOW | ALLOW | ALLOW | PASS |
| User bets mine | DENY | ALLOW | ALLOW | ALLOW | ALLOW | PASS |

**RBAC gate:** PASS

Note: Exposure rebuild with `dryRun=false` without `confirm=REBUILD_EXPOSURE` returns 400 (confirmation intact).
