# Pass 6 — MFA_MATRIX

**Environment:** local-staging, `ADMIN_MFA_REQUIRED=1`  
**Identities:** ephemeral `*.staging.oddsyra.local` admins provisioned in DB (passwords/TOTP never written here)

| Test | Result | Notes |
| --- | --- | --- |
| MFA challenge after password (enabled account) | PASS | `MFA_REQUIRED` + pending token |
| Missing MFA code | PASS | DENY 401 |
| Invalid MFA code | PASS | DENY 401 |
| Valid MFA code | PASS | session token issued |
| Replay pending MFA JWT after success | PASS | DENY `MFA_REPLAY` (Pass-6 fix) |
| Enrollment invalid code | PASS | DENY 401 |
| Enrollment valid TOTP | PASS | ALLOW |
| Admin MFA rate limit | PASS | 429 observed (shared admin-login limiter) |

**MFA gate:** PASS

Application fix shipped: `lib/adminMfaPendingOnce.mjs` + `completeAdminMfa` consume-on-success.
