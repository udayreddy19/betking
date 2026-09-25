# Pass 8 — REGRESSION_RESULTS

**Environment:** LOCAL_STAGING

| Suite | Result | Notes |
| --- | --- | --- |
| Dual-API matrix | PASS (core) / WARN (env/ws/pay) | `pass8_matrix_raw.json` |
| Hardening vitest | PASS | 42 passed |
| Payment gateway unit | PASS | 11 passed |
| MFA unit (pass6+pass8) | PASS | Redis NX + fail-safe |
| security:smoke | PARTIAL | public probes (credentialed covered by certification) |
| security:certification | PASS | MFA/RBAC/IDOR/JWT/CSRF/AUDIT_LOGGING PASS |
| Playwright E2E | PASS | 19 passed / 1 skipped / 0 failed |
| production:certify | see `production_certify.txt` | |
| npm audit | 3 moderate vitest (dev-only) | |

Skipped E2E: profile wallet without `E2E_AUTH_TOKEN` (same as Pass 7).
