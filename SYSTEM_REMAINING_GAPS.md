# OddsYra / BetKing — Remaining Production Gaps Inventory

**Created:** 2026-08-22  
**Source of truth:** Code + `FINAL_PRODUCTION_CLOSURE_REPORT.md` + production DB observations  
**Rule:** Inventory completed **before** further remediation in this pass.

---

## Summary

| Sev | Count | Blocks GREEN? |
|-----|-------|---------------|
| P0 | 2 | Yes |
| P1 | 6 | Yes (mostly) |
| P2 | 7 | No (ops/security/perf) |
| P3 | 3 | No |

**Current status:** 🟡 READY WITH CONDITIONS  
**GREEN requires:** browser WS+My Bets evidence + full deposit→withdraw smoke + release commit SHA matching deployed image + legacy gaps accepted or ledgered.

---

## Remediation progress (this pass)

| Gap | Status |
|-----|--------|
| GAP-003 / 015 auth-before-subscribe | **FIXED** in `liveFeedSocket.js` |
| GAP-004 / 005 dedupe + stale guard | **FIXED** via `wsFinancialEvents.js` + Auth/BetSlip |
| GAP-014 WALLET payload eventId | **FIXED** in `outboxWorker.mjs` |
| GAP-009 deposit WS | **FIXED** `deposit.completed` → WALLET_BALANCE_UPDATED |
| GAP-007 legacy script | **ADDED** `scripts/reconcile-legacy-opening-balances.mjs` |
| GAP-008 winnings audit | **ADDED** `scripts/audit-winnings-reporting.mjs` |
| GAP-002 money lifecycle | **PARTIAL** — Vitest full money lifecycle; browser still open |
| VOID locked-deposit under-refund | **FIXED** `voidRefundCredits` (P0 found during Phase 4) |
| GAP-001 browser WS | **OPEN** — code hardened; browser evidence still required for GREEN |
| GAP-006 release SHA | **OPEN** until commit/tag + rebuild |

---

## GAP-001 — Browser WebSocket settlement/wallet sync NOT VERIFIED

| Field | Value |
|-------|-------|
| Severity | **P0** |
| Files | `lib/outboxWorker.mjs` (`subscribeToEvent('BET_SETTLED')`, `BET_CASHED_OUT`); `lib/websocketEngine.mjs` (`sendToUser`, `canSubscribeToChannel`); `src/services/liveFeedSocket.js` (`dispatch`); `src/context/auth/AuthProvider.jsx` (WS → `refreshWallet`); `src/context/BetSlipContext.jsx` (WS → `refreshMyBets`) |
| Root cause | Code path exists; **no Playwright/Chrome evidence** that events update DOM without refresh |
| Required fix | Add automated WS unit tests + Playwright (or documented Chrome checklist) proving wallet + My Bets update |
| Test required | Unit: outbox → sendToUser payload shape / user isolation; E2E: settle → UI |
| Prod verification | Live settle or forced settle on test account; watch Header balance + My Bets |
| Migration | No |
| Frontend | Possibly harden handlers only |
| Deployment | Yes after tests |

---

## GAP-002 — Full product money lifecycle E2E NOT VERIFIED

| Field | Value |
|-------|-------|
| Severity | **P0** |
| Files | `e2e/money-flow.api.spec.js` (partial); `e2e/product-gates.ui.spec.js` (gates only); deposit `lib/depositEngine.mjs`; withdraw `lib/withdrawalEngine.mjs` |
| Root cause | API e2e accepts 400s; no closed register→deposit→bet→settle→second bet→withdraw path |
| Required fix | Deterministic server-side integration test for ₹1000→₹500@1.06→₹1030→second bet; Playwright where deposit sandbox allows |
| Test required | Vitest money lifecycle + Playwright smoke |
| Prod verification | Controlled test account (sandbox deposit or admin-funded with ledger) |
| Migration | No |
| Frontend | Possibly |
| Deployment | After tests |

---

## GAP-003 — WS reconnect auth/subscribe race

| Field | Value |
|-------|-------|
| Severity | **P1** |
| Files | `src/services/liveFeedSocket.js` (`open` handler sends auth then immediately `subscribe`) |
| Function | `ensureSocket` → `open` listener |
| Root cause | Server auth is async; subscribe to `user:{id}` may get `FORBIDDEN_CHANNEL` before auth completes |
| Required fix | Subscribe private channels only after `authenticated` message; retry failed user channel |
| Test required | Unit/integration mock WS handshake order |
| Prod verification | Disconnect/reconnect network; wallet still refreshes |
| Migration | No |
| Frontend | **Yes** |
| Deployment | Yes |

---

## GAP-004 — No out-of-order / wallet version guard on frontend

| Field | Value |
|-------|-------|
| Severity | **P1** |
| Files | `AuthProvider.jsx` WS handler; `BetSlipContext.jsx`; `apiClient.js` `mapServerUserToSession` |
| Root cause | Handlers always call `refreshWallet()` (REST) — usually safe, but optimistic local paths / rapid events lack `walletUpdatedAt` / event timestamp compare |
| Required fix | Prefer REST refresh (keep); ignore WS payload for balances OR apply only if `timestamp` ≥ last applied; add `lastWalletSyncAt` |
| Test required | Out-of-order event test |
| Prod verification | Optional |
| Migration | No |
| Frontend | **Yes** |
| Deployment | Yes |

---

## GAP-005 — WALLET_BALANCE_UPDATED / BET_CASHED_OUT lack eventId dedupe in AuthProvider

| Field | Value |
|-------|-------|
| Severity | **P1** |
| Files | `AuthProvider.jsx` (~201–211); BetSlip only dedupes `BET_SETTLED` |
| Root cause | Duplicate WS delivery can spam `fetchMe` |
| Required fix | Shared eventId dedupe set (bounded) for all financial WS events |
| Test required | Duplicate event test |
| Prod verification | N/A |
| Migration | No |
| Frontend | **Yes** |
| Deployment | Yes |

---

## GAP-006 — Uncommitted release / SHA drift

| Field | Value |
|-------|-------|
| Severity | **P1** |
| Files | Entire working tree vs `c91ce99` |
| Root cause | Closure fixes deployed from dirty tree; git SHA ≠ image contents |
| Required fix | Single release commit + tag; rebuild from that SHA |
| Test required | `npm test` after commit |
| Prod verification | Image built from tagged SHA |
| Migration | No |
| Frontend | N/A |
| Deployment | **Yes** |

---

## GAP-007 — Legacy ledger gaps (3 wallets) without accepted-exception workflow completeness

| Field | Value |
|-------|-------|
| Severity | **P1** (ops) |
| Files | `scripts/document-ledger-opening-gaps.mjs`; missing `scripts/reconcile-legacy-opening-balances.mjs` alias with `--dry-run` default + accept-exception |
| Root cause | Gaps classified; apply requires ops; no first-class “accepted exception” record path documented in admin UI |
| Required fix | Formalize dry-run script + `--accept-exception` writing immutable audit without balance mutation |
| Test required | Dry-run unit test |
| Prod verification | Ops decision |
| Migration | Optional audit table columns only if needed |
| Frontend | Admin optional |
| Deployment | Script only |

---

## GAP-008 — Historical winnings reporting diagnostic script missing

| Field | Value |
|-------|-------|
| Severity | **P2** |
| Files | Need `scripts/audit-winnings-reporting.mjs`; repair exists partially via `financial-reconcile --repair-winnings-reporting` |
| Root cause | One WON bet with null `actual_payout` |
| Required fix | Read-only audit script; repair flag with actor/reason; never touch `wallets.balance` |
| Test required | Script dry-run on fixture |
| Prod verification | Read-only scan |
| Migration | No |
| Frontend | No |
| Deployment | Script |

---

## GAP-009 — Deposit completed → no user WebSocket

| Field | Value |
|-------|-------|
| Severity | **P2** |
| Files | `lib/depositEngine.mjs`; `lib/outboxWorker.mjs` (no `deposit.completed` subscriber) |
| Root cause | DepositModal polls; if closed early, balance stale until navigation |
| Required fix | Outbox → `WALLET_BALANCE_UPDATED` on deposit complete |
| Test required | Outbox handler unit test |
| Prod verification | Sandbox deposit |
| Migration | No |
| Frontend | Uses existing handler |
| Deployment | Yes |

---

## GAP-010 — Match row missing for feed-only match_ids

| Field | Value |
|-------|-------|
| Severity | **P2** |
| Files | Aggregator / match persistence; `classifyOpenSettlementBets` treats missing match &lt;7d as LIVE |
| Root cause | Bets reference provider ids not always in `matches` |
| Required fix | Ensure bet placement upserts match row OR classify via live feed health |
| Test required | Classification test for null match_status |
| Prod verification | Integrity scan |
| Migration | Maybe |
| Frontend | No |
| Deployment | Yes if code |

---

## GAP-011 — Cashout concurrency soak limited by pool max=20

| Field | Value |
|-------|-------|
| Severity | **P2** |
| Files | `db/pg.js` (`max: 20`); `tests/settlement/cashoutConcurrency100.test.js` (10 parallel) |
| Root cause | 100 parallel exhausts pool in CI |
| Required fix | Dedicated soak script outside suite OR raise pool for soak only |
| Test required | Existing 10-way race remains |
| Prod verification | Optional soak |
| Migration | No |
| Frontend | No |
| Deployment | No |

---

## GAP-012 — Security pentest / Strix NOT VERIFIED

| Field | Value |
|-------|-------|
| Severity | **P2** |
| Files | Auth/RBAC/IDOR suites exist; no Strix run this cycle |
| Root cause | Not executed |
| Required fix | Run Strix or scoped IDOR re-check; document |
| Test required | Existing auth tests |
| Prod verification | Scan report |
| Migration | No |
| Frontend | No |
| Deployment | No |

---

## GAP-013 — Performance P50/P95/P99 NOT MEASURED on prod

| Field | Value |
|-------|-------|
| Severity | **P3** |
| Files | Mass settlement tests exist; no prod metrics export |
| Root cause | No instrumentation dashboards wired |
| Required fix | Measure under load script; report actual numbers |
| Test required | Load script |
| Prod verification | Careful staging preferred |
| Migration | No |
| Frontend | No |
| Deployment | No |

---

## GAP-014 — WALLET_BALANCE_UPDATED payload missing eventId/version

| Field | Value |
|-------|-------|
| Severity | **P2** |
| Files | `lib/outboxWorker.mjs` lines ~53–62 |
| Function | `subscribeToEvent('BET_SETTLED')` WALLET payload |
| Root cause | Payload omits stable `eventId` (sendToUser generates one, but payload doesn’t carry settlementVersion) |
| Required fix | Include `eventId`, `settlementVersion`, `timestamp` in payload |
| Test required | Outbox payload assertion |
| Prod verification | Log sample |
| Migration | No |
| Frontend | Use for dedupe |
| Deployment | Yes |

---

## GAP-015 — Auth race: subscribe before auth on first connect

| Field | Value |
|-------|-------|
| Severity | **P1** (same as GAP-003) |
| Notes | Covered by GAP-003 |

---

## GAP-016 — No accepted-exception admin API for legacy gaps

| Field | Value |
|-------|-------|
| Severity | **P3** |
| Files | `reconciliation_cases` table exists; no dedicated REST |
| Root cause | Ops via scripts only |
| Required fix | Optional admin endpoint later; script `--accept-exception` sufficient for GREEN ops path |
| Test required | Script |
| Prod verification | Ops |
| Migration | No |
| Frontend | Optional |
| Deployment | Script |

---

## GAP-017 — Playwright UI money flow missing

| Field | Value |
|-------|-------|
| Severity | **P0** (part of GAP-002) |
| Files | `e2e/` |
| Required fix | Expand e2e when env allows; otherwise document BLOCKER |

---

## Already closed (do not re-open without evidence)

| Item | Status |
|------|--------|
| Cashout `bets.updated_at` crash | Fixed + deployed |
| Orphan false positives | Classified LIVE_ACTIVE_BET |
| Settlement concurrency race | Fixed |
| Reserved double-subtract | Fixed in server/client |
| OddsEngineV3 sole engine | Static analysis + no runtime imports |
| WIN/LOSS ledger on prod DB | Proven |
| Duplicate payouts / dead letters | 0 |

---

## Mandatory path to GREEN

1. Fix GAP-003/005/014 (WS harden) + tests  
2. Expand GAP-002 server money-flow test (₹1000 deposit sim → 500@1.06 → 1030 → second bet)  
3. Formalize GAP-007/008 scripts  
4. Commit + rebuild from SHA (GAP-006)  
5. Browser evidence for GAP-001 (or explicit residual YELLOW if env blocks)  
6. Ops: accept or apply opening ledger for 3 wallets  

---

*End of inventory. Remediation starts after this file.*
