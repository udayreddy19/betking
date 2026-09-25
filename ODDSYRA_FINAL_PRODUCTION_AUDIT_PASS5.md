# OddsYra Final Production Audit — Pass 5

**Date:** 2026-09-25 (Pass 5)  
**Rule:** Evidence-based. Staging verification prioritized. No fabricated N.  
**Companions:** [ODDSYRA_PASS4_TEST_EVIDENCE.md](ODDSYRA_PASS4_TEST_EVIDENCE.md) · [docs/evidence/pass5/](docs/evidence/pass5/)

---

## Executive Summary

| Milestone | Overall |
|-----------|--------:|
| Pass 0 | **7.6** |
| Pass 1 | **8.1** |
| Pass 2 | **8.4** |
| Pass 3 | **8.7** |
| Pass 4 | **8.8** |
| **Pass 5** | **8.9** |

**Production recommendation:** **BLOCKED** (credentialed security matrix still incomplete)

```text
Technical posture improved under STAGING (local-staging)
E2E: 19 passed / 1 skipped / 0 failed
Security MFA/RBAC: NOT_VERIFIED (missing SMOKE_ADMIN_TOKEN)
Production validation: N ≈ 1 INSUFFICIENT_SAMPLE
Auto-promotion: false
```

A genuine **9.0 / PRODUCTION READY** still requires provisioned admin MFA/RBAC smoke credentials (and preferably Cashfree sandbox + hosted Razorpay checkout evidence).

---

## Environment

```text
Classification: STAGING (local-staging)
Remote STAGING_BASE_URL: MISSING → local API :5001 + Vite :5173 used
Razorpay: SANDBOX_KEY_DETECTED
Cashfree: MISSING
Git (start): 9517ef0
```

See [docs/evidence/pass5/STAGING_CERTIFICATION.md](docs/evidence/pass5/STAGING_CERTIFICATION.md).

---

## Domain Scores

| Domain | Pass 4 | Pass 5 | Evidence | Remaining |
|--------|-------:|-------:|----------|-----------|
| Wallet / ledger | 9.0 | **9.0** | Settlement WS UI refresh PASS | — |
| Auth / KYC / MFA | 8.5 | **8.6** | Unauth staging probes GREEN | MFA matrix missing |
| Other sports V4 | 8.9 | **8.9** | Defaults preserved | — |
| Cricket V4 | 8.8 | **8.9** | Defaults preserved | Cal N |
| Settlement | 8.7 | **8.9** | place-settle → UI Available update | — |
| Betting | 9.0 | **9.0** | Odds-accept UX fix; API E2E | — |
| Risk / trading | 9.0 | **9.0** | Retained | — |
| Payments | 8.7 | **8.8** | Sandbox keys + API money-flow | Hosted checkout / Cashfree |
| Provider feeds | 8.7 | **8.7** | Unit failover retained | Live multi-provider |
| Live feeds | 8.6 | **8.9** | Staging WS soak PASS | Longer soak optional |
| Admin | 9.0 | **9.0** | Engine probes 401 without admin | Credentialed admin matrix |
| Casino aggregator | 7.0 | **7.0** | Scope intentional | — |

**Weighted ≈ 8.9 / 10.** Not 9.0 while security certification remains BLOCKED.

---

## Gate results (`npm run production:certify`)

```text
PASS=16 WARN=2 BLOCKED=1 FAIL=0
CERTIFICATION: BLOCKED
```

| Gate | Status |
|------|--------|
| E2E | **PASS** (19/1/0) |
| Concurrency | **PASS** |
| Financial invariants | **PASS** |
| WebSocket | **PASS** (staging soak + UI) |
| Payments | **WARN** (sandbox partial) |
| Security | **BLOCKED** (MFA/RBAC credentials) |
| Validation N | **WARN** (N≈1) |

---

## Pass 5 fixes discovered by staging gates

1. **Fantasy route** redirected to `/sports` when join disabled → gated copy never visible. Now always renders `Fantasy` page (join still gated).
2. **Odds-changed quick bet** dropped `previousOdds` / `oddsStatus` in `openQuickBetPanel` → accept CTA/notice broken. Fields preserved; accept label `Accept {odds}`.
3. **Settlement WS E2E** — harness now explicitly `sendToUser` wallet/settle events after outbox drain so profile Available updates without refresh.

---

## Test summary

| Category | Result |
|----------|--------|
| UNIT (risk/security/ws helpers) | PASS batches |
| INTEGRATION concurrency | **28 passed** |
| E2E Playwright | **19 passed, 1 skipped, 0 failed** |
| SECURITY smoke (staging) | AUTH probes GREEN; overall NOT_VERIFIED |
| SECURITY certification | NOT_VERIFIED (MFA/RBAC) |
| SANDBOX payments | UNIT/INTEGRATION PASS; hosted checkout not run |
| LIVE payments | **NOT RUN** |
| WS staging soak | **PASS** (~12s connect/drop/reconnect) |

---

## Validation

```text
Production N ≈ 1
INSUFFICIENT_SAMPLE
NOT CERTIFIED
AUTO_PROMOTION=false
```

No synthetic observations added.

---

## Dependency security

```text
npm audit: 3 moderate (@vitest/mocker via vitest)
Decision: ACCEPT_EXCEPTION_DEV_ONLY — not in production runtime bundle
```

---

## Remaining risks

1. **SMOKE_ADMIN_TOKEN / MFA / RBAC matrix** not provisioned → security gate BLOCKED  
2. Cashfree sandbox MISSING  
3. Hosted Razorpay checkout not exercised (order API path only)  
4. Remote dedicated staging URL not configured  
5. Production validation N ≪ 1000  

---

## Final recommendation

**BLOCKED** for declaring full production certification / 9.0.

Next unblockers (only):

1. Provision `SMOKE_ADMIN_TOKEN` (+ MFA test user) and re-run `security:smoke` / `security:certification`  
2. Optional: Cashfree sandbox + Razorpay hosted checkout SANDBOX traces  
3. Keep auto-promotion false until N ≥ 1000  

Staging E2E and WebSocket evidence now support a higher technical posture (**8.9**), but the security credential gate remains honestly incomplete.
