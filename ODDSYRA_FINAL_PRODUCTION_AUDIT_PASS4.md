# OddsYra Final Production Audit — Pass 4

**Date:** 2026-09-25 (Pass 4)  
**Rule:** Evidence-based only. No fabricated N. No mocks labeled live.  
**Companion:** [ODDSYRA_PASS4_TEST_EVIDENCE.md](ODDSYRA_PASS4_TEST_EVIDENCE.md)

---

## Executive Summary

| Milestone | Overall |
|-----------|--------:|
| Pass 0 | **7.6** |
| Pass 1 | **8.1** |
| Pass 2 | **8.4** |
| Pass 3 | **8.7** |
| **Pass 4** | **8.8** |
| Target | 9.0+ |

**Production recommendation:** **BLOCKED** for full go-live certification  

Reasons certification is not PASS_WITH_WARNINGS:

1. Security live matrix / `security:certification` = **FAIL / NOT VERIFIED**
2. Full Playwright E2E = **6 passed / 14 skipped** (not complete P0)
3. LIVE/SANDBOX payment gateway E2E = **not re-certified**
4. Production validation N ≈ **1** (honest — secondary WARN only)

Concurrency + financial invariant + WS unit gates **PASS**.

---

## V4 Status (preserved)

```text
Cricket OddsEngineV4:     DEFAULT
Other Sports Engine V4:   DEFAULT
OddsEngineV3:             FALLBACK / rollback / shadow
SRL:                      FORCED V4
Auto-promotion:           DISABLED (false)
Admin V3 override:        Temporary reason + TTL (Pass 3)
authoritativeExposureSource: open_bets_postgres
```

---

## Domain Scores

| Domain | Pass 3 | Pass 4 | Evidence | Remaining limitation |
|--------|-------:|-------:|----------|----------------------|
| Wallet / ledger | 9.0 | **9.0** | Untouched + concurrency wallet math | — |
| Auth / KYC / MFA | 8.5 | **8.5** | UNIT auth/IDOR 62 pass; live MFA matrix missing | Live MFA/RBAC matrix |
| Other sports V4 | 8.8 | **8.9** | Defaults + override expiry retained | — |
| Cricket V4 | 8.7 | **8.8** | Defaults retained | Cal N |
| Settlement | 8.6 | **8.7** | Settlement concurrency 14 pass | Orphan ops still manual |
| Betting | 8.8 | **9.0** | Fixed stake-return bug; 100-bet concurrency GREEN; IDEMPOTENCY_KEY_REUSE fixed | — |
| Risk / trading | 8.9 | **9.0** | Desk-tree API + UI drill-down; simulate parity | — |
| Payments | 8.6 | **8.7** | UNIT/INTEGRATION 52 pass; state machine | **LIVE E2E missing** |
| Provider feeds | 8.6 | **8.7** | Pass-3 resolver retained | Live multi-provider soak |
| Live feeds | 8.2 | **8.6** | WS resync UNIT suite added | LIVE socket soak missing |
| Admin | 8.9 | **9.0** | Desk-tree hierarchy UI | — |
| Support / ops | 7.5 | 7.5 | Untouched | — |
| Casino aggregator | 7.0 | **7.0** | Aggregator scope intentional | Not a house casino |

**Weighted overall ≈ 8.8 / 10.**  
**Not 9.0** — security + full E2E + LIVE payments remain incomplete.

---

## Certification gates

```text
npm run production:certify

PASS=15 WARN=2 BLOCKED=2 FAIL=0
CERTIFICATION: BLOCKED
```

| Gate | Status |
|------|--------|
| Concurrency | PASS |
| Financial invariants | PASS |
| WebSocket (UNIT) | PASS |
| Payments LIVE/SANDBOX | WARN |
| Security | BLOCKED |
| Full E2E | BLOCKED |
| Validation N | WARN (N≈1) |

---

## Financial Integrity

| Check | Result |
|-------|--------|
| Exposure SoT = open_bets_postgres | PASS |
| Concurrent placement no negative wallet | PASS (INTEGRATION) |
| 100 multi-user bets liability equality | PASS |
| Idempotency same key / same payload | PASS |
| Idempotency same key / different payload | PASS (`IDEMPOTENCY_KEY_REUSE`) |
| Payment state machine illegal transitions | PASS (UNIT) |
| LIVE payment duplicate webhook | NOT RE-CERTIFIED |

**Pass-4 critical fix:** `enforceBetRisk` must return numeric stake (Pass-3 object return broke all bet inserts).

---

## Security

```text
UNIT security/auth:     62 passed
security:smoke:         NOT VERIFIED (no live server)
security:certification: FAIL
npm audit after fix:    3 moderate (vitest/mocker DEV) — HIGH nodemailer + qs remediated
```

**SECURITY: FAIL (not GREEN)**

---

## Full E2E

```text
Playwright: 6 passed, 14 skipped, 0 failed
```

Skipped require staging credentials / API. **FULL E2E: FAIL (incomplete)**

---

## Concurrency

```text
21 passed (pass4 + legacy concurrency + idempotency)
```

**CONCURRENCY: PASS**

---

## Payments

```text
UNIT/INTEGRATION: PASS (52 / 1 skipped)
LIVE/SANDBOX:     NOT RE-CERTIFIED → WARN/BLOCKED for full payment certification
```

---

## Validation

```text
Production N ≈ 1
INSUFFICIENT_SAMPLE
NOT CERTIFIED
Auto-promotion = false
```

Void/cancelled still must not inflate N (pipeline preserved from Pass 1–3).

---

## Casino

```text
Aggregator scope is intentional.
Score ~7.0 does not imply a missing house casino engine.
```

---

## Files changed (Pass 4)

| Path | Change |
|------|--------|
| `lib/betRiskEnforcement.mjs` | Return numeric stake (fix financial insert bug) |
| `lib/idempotencyEngine.mjs` | Preserve/enforce requestHash → `IDEMPOTENCY_KEY_REUSE` |
| `scripts/productionCertify.mjs` | Gate file → BLOCKED when security/E2E incomplete |
| `server/routes/admin/tradingDesk.js` | `/risk/desk-tree` drill-down |
| `src/pages/Admin/domains/TradingRiskDomainView.jsx` | Hierarchy drill-down UI |
| `tests/hardening/pass4Concurrency.test.js` | 100-bet concurrency + idempotency |
| `tests/hardening/pass4WebSocketResync.test.js` | WS resync protocol |
| `tests/hardening/pass4FinancialInvariants.test.js` | Consolidated invariants |
| `docs/evidence/pass4/*` | Raw evidence |
| `package-lock` via `npm audit fix` | nodemailer + qs |

### Migrations

None.

### Environment variables

Unchanged from Pass 3 (`ODDS_ENGINE_OVERRIDE_TTL_HOURS`, risk hierarchy caps, `AUTO_PROMOTION=false`).

Optional: `SKIP_CERT_GATES=1` skips evidence gates (local only — do not use for production claims).

---

## Remaining risks

1. Security live certification not GREEN  
2. Playwright P0 incomplete (14 skipped)  
3. LIVE/SANDBOX payment E2E missing  
4. Validation N ≪ 1000  
5. Remaining vitest moderate CVE (devDependency)  
6. LIVE WebSocket soak not run  

---

## Final recommendation

**BLOCKED** for declaring production fully certified / 9.0.

Safe next steps:

1. Run credentialed `security:smoke` + MFA/RBAC/CSRF matrix against a live staging host → update `cert_gates.json`  
2. Provision Playwright staging env; un-skip and green the 14 E2E tests  
3. Execute Razorpay/Cashfree **SANDBOX** (then LIVE if approved) payment E2E with labeled evidence  
4. Keep auto-promotion off until N ≥ 1000  

Engineering posture improved (concurrency + bet placement bugfix + honest BLOCKED certify).  
Statistical + live security/E2E gates still prevent a genuine **9.0** and **PRODUCTION READY**.
