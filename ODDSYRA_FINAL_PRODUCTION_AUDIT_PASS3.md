# OddsYra Final Production Audit — Pass 3

**Date:** 2026-09-25 (Pass 3)  
**Rule:** Evidence-based scores only. Validation N not fabricated. Mocks never labeled live.

---

## Executive Summary

| Milestone | Overall |
|-----------|--------:|
| Pass 0 (baseline) | **7.6** |
| Pass 1 (V4 default + orphans + calibration bridge) | **8.1** |
| Pass 2 (velocity, payments skew, casino aggregator, feeds) | **8.4** |
| **Pass 3 (DB exposure SoT, risk hierarchy, override expiry, certify)** | **8.7** |
| Target | 9.0+ |

**Production recommendation:** **CONDITIONALLY READY** (improved financial posture; still not fully certified)

**Validation:** Production settled N ≈ **1** (`INSUFFICIENT_SAMPLE`) — **NOT CERTIFIED**  
Gate remains N ≥ 1000 + calibration + settlement + operator approval. Auto-promotion = **DISABLED**.

---

## V4 Status (preserved)

```text
Cricket OddsEngineV4:     DEFAULT
Other Sports Engine V4:   DEFAULT
OddsEngineV3:             FALLBACK / rollback / shadow only
SRL:                      FORCED V4
Auto-promotion:            DISABLED
Admin V3 override:        TEMPORARY (reason + TTL required; auto-expires)
```

---

## Domain Scores

| Domain | Pass 2 | Pass 3 | Evidence | Remaining limitation |
|--------|-------:|-------:|----------|----------------------|
| Wallet / ledger | 9.0 | **9.0** | Untouched core | — |
| Auth / KYC / MFA | 8.5 | **8.5** | Untouched | Full MFA live matrix not re-run |
| Referrals / growth | 8.5 | 8.5 | Untouched | — |
| Other sports odds | 8.6 | **8.8** | Override expiry mirrored | Non-P0 sports path thin |
| Cricket V4 | 8.4 | **8.7** | Temporary V3 override + expiry | Cal N low |
| Settlement | 8.5 | **8.6** | Prior orphan lifecycle retained | Ops voids still manual for escalated |
| Betting / placement | 8.3 | **8.8** | Payload-hash idempotency + richer snapshot | 100-concurrent suite not re-run here |
| Risk / trading | 8.0 | **8.9** | DB SoT exposure + hierarchy + simulate=prod | Desk UI drill-down still basic |
| Payments | 8.0 | **8.6** | Explicit state machine + transition guard | Full LIVE gateway E2E not re-certified |
| Provider feeds | 8.0 | **8.6** | Conflict resolver + failover hysteresis | Live multi-provider conflict UX thin |
| Live feeds | 8.1 | **8.2** | Prior health states | Expanded WS reconnect suite not completed |
| Admin | 8.5 | **8.9** | Hierarchy + reconcile/rebuild + override expiry UI | Heatmap still light |
| Notifications | 7.5 | 7.5 | Untouched | — |
| Support / ops | 7.2 | **7.5** | Exposure reconcile codes | SLA tooling unchanged |
| Casino aggregator | 6.5 | **7.0** | Pass-2 aggregator retained | Scope = aggregator, not house engine |

**Weighted overall ≈ 8.7 / 10.** Not 9.0 — security certification + full E2E + validation gates incomplete.

---

## Financial Integrity

| Area | Status | Notes |
|------|--------|-------|
| Wallet | OK | Prior double-entry retained |
| Ledger | OK | Prior invariants retained |
| Exposure | **UNIFIED** | `authoritativeExposureSource = open_bets_postgres` |
| Mem/Redis exposure | Derived only | Must not accept/reject bets |
| Bet | Hardened | Idempotency payload hash → `IDEMPOTENCY_KEY_REUSE` |
| Settlement | OK | Pass-1/2 orphan path retained |
| Payment | Hardened | `lib/paymentStateMachine.mjs` + deposit transition guard |
| Withdrawal | OK | Untouched this pass |

### Exposure architecture (Pass 3)

```text
Canonical DB open bets  →  Risk decision + Trading UI
Derived cache/memory    →  acceleration only (post-accept)
```

Reconcile codes: `EXPOSURE_MATCH` | `EXPOSURE_MISMATCH` | `EXPOSURE_REBUILT` | `EXPOSURE_RECONCILIATION_FAILED`  
Admin: `GET /trading/exposure/reconcile`, `POST /trading/exposure/rebuild` (dry-run default; confirm=`REBUILD_EXPOSURE`).

---

## Risk Status

- Hierarchy: GLOBAL → SPORT → COMPETITION → EVENT → MARKET → USER  
- Inheritance: **tightest max** (child cannot loosen parent)  
- Simulate API awaits same `calculateAuthoritativeExposureRisk` as production  
- Velocity breaker from Pass 2 preserved  

---

## Payment Status

- State machine: CREATED → PENDING → SUCCESS → CREDITED (+ FAILED/EXPIRED/REFUNDED/DISPUTED)  
- Illegal transitions rejected (`ILLEGAL_PAYMENT_TRANSITION`)  
- Webhook idempotency: Pass-2 paths retained (not re-labeled as LIVE)  
- Test distinction: Pass-3 payment tests = **UNIT**; LIVE/SANDBOX gateway E2E = **not re-certified this pass**

---

## Settlement Status

- Orphan lifecycle from Pass 1/2 retained (AWAITING_EVIDENCE → resolution)  
- Manual void still requires ops permission / reason / audit (prior work)  
- Not claimed 9.0 — escalated orphans still need human judgment  

---

## Provider Status

- `lib/providers/providerConflictResolver.mjs`: freshness + health + majority + confidence + sequence  
- Every resolution writes an in-process audit record  
- Failover hysteresis (`COOLDOWN_HYSTERESIS`) to avoid flap  
- Admin: `POST /odds-model/providers/resolve-conflict`, `GET .../conflict-audits`

---

## Live Feed Status

- Incremental only (+0.1)  
- Expanded WS reconnect/out-of-order suite **not completed** in this pass  

---

## Security Status

```text
security:smoke          PARTIAL / NOT VERIFIED (fetch failed against local — no live server)
security:certification  FAIL / gates BLOCKED or NOT_VERIFIED
dependency audit        NOT re-run as green claim this pass
IDOR/XSS/SSRF suite     NOT claimed green end-to-end
```

Honest: **Security is not Pass-3 certified GREEN.**

---

## E2E Status

```text
Targeted hardening (pass2+pass3+v4+osv4):  40 passed
Full playwright E2E:                       NOT claimed complete this pass
Concurrency 100-bet suite:                 NOT re-executed this pass
Live payment gateway E2E:                  NOT re-certified
```

---

## Validation

```text
Production settled calibration N:   ≈ 1 (observed via certify; not fabricated)
Status:                             INSUFFICIENT_SAMPLE
Auto-promotion:                     false
Gate:                               N ≥ 1000 + operator review
```

Do **not** promote on N=1.

---

## Production Certification

```bash
npm run production:certify
```

Latest local run:

```text
PASS=9 WARN=1 FAIL=0
CERTIFICATION: PASS_WITH_WARNINGS
WARN = Production validation N below gate 1000
```

---

## Pass 3 Changes (files)

| Module | Change |
|--------|--------|
| `lib/persistedMarketLiability.mjs` | Authoritative open-bets exposure + reconcile/rebuild |
| `lib/risk/riskHierarchy.mjs` | Hierarchical limits + reason codes |
| `lib/betRiskEnforcement.mjs` / `globalRiskOrchestrator.mjs` | DB-only liability decisions |
| `lib/risk/riskSimulation.mjs` | Async; same DB exposure path |
| `lib/odds-v4/EngineModeControl.mjs` | Temporary override reason + TTL + auto-expiry |
| `lib/other-sports-v4/EngineModeControl.mjs` | Same override expiry model |
| `lib/idempotencyEngine.mjs` / `betPlacementEngine.mjs` | Payload hash + `IDEMPOTENCY_KEY_REUSE` |
| `lib/placementSnapshot.mjs` | Provider/canonical/quote reproducibility fields |
| `lib/paymentStateMachine.mjs` | Explicit payment transitions |
| `lib/depositEngine.mjs` | Transition guard on fail path |
| `lib/providers/providerConflictResolver.mjs` | Conflict policy + failover hysteresis |
| `server/routes/admin/tradingDesk.js` | reconcile/rebuild/hierarchy + async simulate |
| `server/routes/admin/oddsModelHealth.js` | Conflict APIs + TTL on engine set |
| `src/pages/Admin/domains/TradingRiskDomainView.jsx` | Hierarchy + exposure + override expiry UX |
| `scripts/productionCertify.mjs` | `npm run production:certify` |
| `tests/hardening/pass3Hardening.test.js` | Pass-3 unit coverage |

### Migrations

None new this pass (Pass-2 `132_bets_idempotency_unique.sql` remains).

### Environment variables

| Variable | Purpose |
|----------|---------|
| `ODDS_ENGINE_OVERRIDE_TTL_HOURS` | Default cricket V3/shadow TTL (24) |
| `OTHER_SPORTS_ENGINE_OVERRIDE_TTL_HOURS` | Other-sports override TTL (24) |
| `RISK_*_MAX_STAKE` / `RISK_GLOBAL_*` | Hierarchy defaults (existing pattern) |
| `AUTO_PROMOTION` | Must remain false until gates pass |

---

## Top Remaining Risks

1. Validation N ≪ 1000 — statistical readiness blocked  
2. Security certification not GREEN without live credentialed matrix  
3. Full E2E / concurrency / LIVE payment not re-certified this pass  
4. Casino is aggregator (~7.0), not house engine — by product scope  
5. Live feed WS robustness suite still thin  

---

## Definition of Done (Pass 3 checklist)

| Item | Status |
|------|--------|
| Mem/DB liability dual path resolved | **DONE** (DB open bets authoritative) |
| One authoritative exposure source | **DONE** (`open_bets_postgres`) |
| Exposure reconciliation | **DONE** |
| Exposure rebuild (dry-run + confirm) | **DONE** |
| Risk hierarchy | **DONE** |
| Trading desk hierarchy UI | **PARTIAL** (limits + reconcile; full drill-down basic) |
| Risk simulate = production engine | **DONE** |
| Idempotency same-key/diff-payload | **DONE** (`IDEMPOTENCY_KEY_REUSE`) |
| Immutable odds snapshot fields | **DONE** |
| Payment state machine | **DONE** |
| Payment webhook idempotency | Retained Pass-2 (UNIT) |
| Payment reconciliation | Retained prior tooling |
| Live/sandbox/mock distinction | Documented |
| Provider conflict resolution | **DONE** |
| Provider conflict UI/API | **DONE** (API + audit; thin UI) |
| Provider failover hysteresis | **DONE** (unit) |
| WS reconnect expanded | **NOT DONE** |
| Settlement orphan lifecycle | Retained |
| Admin V3 override expiration | **DONE** |
| Full security suite green | **NOT DONE** |
| Full E2E suite | **NOT DONE** |
| Concurrency suite | **NOT DONE** this pass |
| Financial invariant suite | **PARTIAL** (exposure + payment SM unit) |
| Casino aggregator hardened | Retained / modest bump |
| Production validation pipeline | Preserved (honest N) |
| Production certify command | **DONE** |
| Final audit | **This document** |

---

## Final Recommendation

Ship Pass-3 financial/risk unification to staging/production with **V4 defaults** and **auto-promotion off**.  
Do **not** claim 9.0 or validation certification until:

1. Production settled N ≥ 1000 with calibration gates,  
2. Security credentialed matrix GREEN,  
3. LIVE/SANDBOX payment E2E evidence attached,  
4. Concurrency + expanded WS suites green.

**Honest Pass-3 score: 8.7 / 10 — CONDITIONALLY READY.**
