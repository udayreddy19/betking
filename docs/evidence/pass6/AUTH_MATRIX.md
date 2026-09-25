# Pass 6 — AUTH_MATRIX

| Test | Result |
| --- | --- |
| Anonymous → admin/trading/wallet/bets/me | DENY (401/403) |
| User A / User B password login | PASS |
| Admin password login (may enroll if MFA enforced) | PASS |
| Operator (OPERATIONS_ADMIN) login | PASS |
| MFA-admin login → challenge | PASS |
| Invalid JWT / malformed / expired / wrong secret | DENY |
| Access token with forged SUPER_ADMIN role | DENY on admin routes |
| Tampered JWT payload (bad signature) | DENY |
| Invalid refresh token | DENY |

**AUTHENTICATION / JWT gates:** PASS
