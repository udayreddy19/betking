# OddsYra / BetKing — Final Production Blocker Audit

**Audit datetime (UTC):** 2026-08-22T17:55:00Z  
**Git tip at audit start:** `f0da2d9352debe1d3bcd2c71ace0afe71292ba10`  
**Method:** Fresh source inspection (not prior report trust). Subagent + primary review of engines, WS, Docker, admin RBAC.

**Rule:** A test PASS does not imply production correctness.

---

## Executive verdict (pre-fix snapshot)

Platform is **not GREEN**. Multiple **P0** financial/security/realtime defects verified in source.

---

## P0 — Must fix before any GREEN claim

| ID | Area | File / function | Root cause | Required fix | Migration? | FE? | Deploy? |
|----|------|-----------------|------------|--------------|------------|-----|---------|
| B-001 | Withdrawal race | `lib/withdrawalEngine.mjs` `reviewWithdrawal` | Status gate outside txn; withdrawal row not `FOR UPDATE`; REJECT lacks reserved sufficiency + CAS | Lock withdrawal `FOR UPDATE`, re-check `PENDING_REVIEW`, CAS update, reject only if reserved ≥ amount | No | No | Yes |
| B-002 | Deposit double credit | `lib/depositEngine.mjs` `processWebhook` | Deposit not locked; update not CAS on `CREATED`; new `payment_id` on same `order_id` can credit twice | `SELECT deposits … FOR UPDATE`; credit only if status `CREATED`; `UPDATE … WHERE status='CREATED' RETURNING` | No | No | Yes |
| B-003 | Settlement crash double credit | `lib/betSettlementEngine.mjs` `settleSingleBet` | Wallet credit + ledger insert before terminal status; tx `ON CONFLICT DO NOTHING` still allows second ledger/wallet credit on retry | Guard on existing `tx_payout_*`; insert ledger only if tx insert won; optional unique ledger index | Optional 056 | No | Yes |
| B-004 | Premature VOID | `lib/liveMatchSettlement.mjs` `evaluateOpenBetOutcome` / `evaluateBetAfterMatchOver` | Unknown winner / ungradeable → `VOID` refund | Return `null` (AWAITING_EVIDENCE); VOID only abandon/cancel/explicit rules | No | No | Yes |
| B-005 | Support WS leak | `lib/websocketEngine.mjs` `broadcastWsMessage` | Global fanout of support message text to **all** WS clients | Send only to `support:conversation:{id}` subscribers | No | No | Yes |
| B-006 | Worker→API WS black hole | `outboxWorker` + `websocketEngine` + `docker-compose.prod.yml` | Worker processes outbox; sockets live on API; no Redis pub/sub | Redis fanout channel; API subscriber delivers locally | No | No | Yes |

---

## P1 — Major production failure / incorrect money / ops

| ID | Area | File / function | Root cause | Required fix |
|----|------|-----------------|------------|--------------|
| B-007 | Idempotency fail-open | `lib/idempotencyEngine.mjs` `checkOrLock` catch | DB error → `isDuplicate: false` | Fail closed (throw) |
| B-008 | Cashout reprice TOCTOU | `lib/cashoutEngine.mjs` | In-tx reprice uses global `query`, not txn client | Pass client into quote/pricing where possible |
| B-009 | Admin settlement RBAC | `server/routes/admin/settlement.js` | `requireRole(['ADMIN',…])` nests array; `ADMIN` not a defined role | Flatten roles; use real role names |
| B-010 | Worker health | `docker-compose.prod.yml` | Worker has no healthcheck; backend probe is `/health` only | Healthcheck worker; probe readiness |
| B-011 | REJECT ledger balance_after | `withdrawalEngine` REJECT | Uses pre-credit balance in ledger | Use `newBalance` |
| B-012 | UNKNOWN→LOST risk | `settlementRules.mjs` + engine | PENDING path can become LOST | Abort on PENDING |

---

## P2 — Reliability / observability / E2E

| ID | Finding |
|----|---------|
| B-013 | Browser money/WS E2E not present (API + product-gates only) |
| B-014 | Legacy ledger gaps (3 wallets) — ops, not auto-repair |
| B-015 | Prod P50/P95/P99 not measured |
| B-016 | Strix/pentest not run |
| B-017 | Public `/readiness` exposes queue/DLQ metrics |
| B-018 | Redis unauthenticated on private compose net |
| B-019 | JS `parseFloat` on NUMERIC money |
| B-020 | Release not deployed from tip SHA yet |

---

## P3 — Cleanup

| ID | Finding |
|----|---------|
| B-021 | Deprecated `lib/oddsEngine.mjs` retained (no runtime placement path) |
| B-022 | Dual Auth/BetSlip WS refresh (deduped per handler) |
| B-023 | `*.md` gitignored — reports need `git add -f` |

---

## Areas verified OK (implementation, not “tests exist”)

| Area | Evidence |
|------|----------|
| Canonical available/withdrawable | `lib/wageringRules.mjs` + `src/utils/wageringRules.js` — reserved not double-subtracted |
| Placement FOR UPDATE | `betPlacementEngine.mjs` |
| Cashout locks bet+wallet; rejects concurrent via status | `cashoutEngine.mjs` |
| Deposit HMAC | `depositEngine.processWebhook` timing-safe compare |
| Frontend secrets | No JWT_SECRET / DB URL / Razorpay secret in `src/` |
| OddsEngineV3 sole path | Deprecated V1 file; cross-market quote stubbed null |
| VOID locked-deposit refund formula | `voidRefundCredits` restores full stake + locked |
| Client WS auth-before-subscribe / dedupe | `liveFeedSocket.js`, `wsFinancialEvents.js` |
| Migrations 054/055 | Intentional winnings reporting + sweep indexes |

---

## Remediation order (this pass)

1. B-001, B-002, B-003 (money integrity)  
2. B-004 (premature VOID)  
3. B-005, B-006 (WS security + fanout)  
4. B-007, B-009, B-011  
5. Tests + reports  
6. Honest YELLOW until browser E2E + deploy + legacy ops + perf/security scans

---

*Inventory complete. Safe P0/P1 code fixes follow in the same pass.*
