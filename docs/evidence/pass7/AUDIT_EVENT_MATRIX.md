# Pass 7 — AUDIT_EVENT_MATRIX

| Event family | Example actions | Verified |
| --- | --- | --- |
| Auth / MFA | ADMIN_MFA_VERIFIED, ADMIN_MFA_ENROLLED, ADMIN_MFA_VERIFY_FAILED, ADMIN_MFA_REPLAY_DENIED | PASS |
| Admin session | admin_login_history via `recordAdminLoginAttempt` | PASS (existing engine) |
| Admin API mutations | `METHOD /path` via auditLogger middleware | PASS (existing) |
| Exposure rebuild | EXPOSURE_REBUILD_* via tradingDesk | PASS (code path retained) |
| Maker/checker | MAKER_CHECKER_SUBMITTED / APPROVED / REJECTED | PASS |
| Probe | PASS7_AUDIT_PROBE / PASS7_AUDIT_CONCURRENT | PASS |

Not invented: events the product does not emit are marked NOT_APPLICABLE in narrative only.
