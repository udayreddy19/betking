# OddsYra Final Production Audit — Pass 6

**Date:** 2026-09-25  
**Environment:** STAGING (local-staging) — not production  
**Git commit:** `9517ef0`

## Overall score: 9.0

Justification: Pass 5’s primary blocker was missing credentialed MFA/RBAC evidence (`Security = BLOCKED`). Pass 6 provisioned safe staging identities, executed the full credentialed matrix, fixed three genuine defects, and moved Security to PASS. Score is not inflated for green unit tests alone; remaining production limitations are listed below.

## Production recommendation: NOT CERTIFIED

Technical certification: **PASS_WITH_WARNINGS** (`npm run production:certify`).  
Production go-live certification: **NOT CERTIFIED** — Validation N≈1 (`INSUFFICIENT_SAMPLE`), payments sandbox-only, evidence is local-staging not LIVE production.

| Gate | Result | Evidence |
| --- | --- | --- |
| E2E | PASS | 19 passed / 1 skipped / 0 failed |
| Concurrency | PASS | Hardening regression 44 passed; Pass-5 concurrency retained |
| Financial invariants | PASS | `open_bets_postgres` SoT |
| WebSocket | PASS | Channel auth + settlement UI |
| Security | PASS | Credentialed MFA/RBAC/IDOR/JWT/CSRF |
| Payments | WARN | Razorpay sandbox only; Cashfree NOT VERIFIED; LIVE NOT RUN |
| Validation N | WARN | N=1 INSUFFICIENT_SAMPLE |

**Auto-promotion:** false

### Security certification
- **MFA:** PASS (challenge / invalid / valid / enrollment / replay deny)
- **RBAC:** PASS (USER / OPERATIONS_ADMIN / SUPER_ADMIN / MFA-admin)
- **IDOR:** PASS (cross-user bet evidence denied)
- **CSRF:** PASS (logout with CSRF cookie, missing header → 403)
- **Rate limiting:** PASS (admin MFA 429 observed)
- **JWT/session:** PASS (invalid/expired/wrong-secret/escalation/tamper/refresh)

### Payment sandbox
WARN — sandbox Razorpay path only; hosted checkout NOT RUN; Cashfree NOT VERIFIED; LIVE NOT RUN.

### Remaining risks / limitations (required for any 9.0 claim)
1. Production validation sample **N=1** — far below N≥1000; auto-promotion must stay false.
2. Evidence is **local-staging**, not a remote production or shared staging cluster.
3. **AUDIT_LOGGING** row inspect still NOT_VERIFIED.
4. Payments: **Cashfree missing**; hosted Razorpay checkout not exercised; **LIVE not run**.
5. MFA pending one-time store is **in-process** (multi-instance should share Redis in a later hardening pass).
6. Optional Playwright profile wallet remains skipped without `E2E_AUTH_TOKEN`.
7. Maker/checker dual-admin procedure still outside this automated matrix.

### Files changed
- `server/routes/index.js` — mount trading desk
- `server/routes/admin/tradingDesk.js` — OPERATIONS_ADMIN role fix
- `lib/adminLoginFlow.mjs` / `lib/adminMfaPendingOnce.mjs` — MFA replay deny
- `scripts/pass6-security-matrix.mjs` — credentialed matrix
- `scripts/security-certification.mjs` — invoke matrix; emit honest PASS
- `package.json` — `security:pass6-matrix`
- `tests/hardening/pass6MfaReplay.test.js`
- `docs/evidence/pass4/cert_gates.json` + `docs/evidence/pass6/*`

### Tests executed
- `npm run security:smoke`
- `npm run security:pass6-matrix`
- `npm run security:certification`
- `npm run production:certify` → **PASS_WITH_WARNINGS**
- Playwright E2E 19/1/0
- Vitest hardening 44 passed
- `npm audit` → 3 moderate vitest (dev-only exception)

### Evidence directory
`docs/evidence/pass6/`

### Final conclusion
Pass 6 **GREEN** for the certification-unblock objective: security is no longer BLOCKED for missing MFA/RBAC credentials. Production remains **NOT CERTIFIED** until real production validation volume and payment LIVE scope are independently evidenced.

---

```
PASS 6 RESULT:
GREEN

PRODUCTION CERTIFICATION:
NOT CERTIFIED

SECURITY:
PASS

PRODUCTION VALIDATION N:
1 (INSUFFICIENT_SAMPLE)

AUTO-PROMOTION:
false
```
