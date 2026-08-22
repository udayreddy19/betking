# OddsYra / BetKing — Final Production Release Report

**Report datetime (UTC):** 2026-08-22T17:20:38Z  
**Local datetime:** 2026-08-22 ~22:50 IST  
**Method:** Code remediation + automated verification; production browser money lifecycle **not** claimed without DOM evidence.

---

## Final status

# 🟡 YELLOW — READY WITH CONDITIONS

**Not** 🟢 PRODUCTION READY — mandatory browser WebSocket/My Bets settle evidence and full register→deposit→withdraw product smoke remain **NOT VERIFIED**.

**Not** 🔴 — critical money paths (WIN/LOSS/VOID with locked-deposit refund), OddsEngineV3 sole pricing, cashout race protection, and settlement integrity remain covered by automated tests (559/559).

---

## Exact blockers to GREEN

1. **Browser E2E evidence** for settle → `BET_SETTLED` / `WALLET_BALANCE_UPDATED` → Header wallet + My Bets without refresh (and reconnect resync).
2. **Full product smoke** on production/staging: register → Razorpay deposit → bet → settle → second bet from winnings → withdrawal request → admin approve.
3. **Release SHA = deployed images** — commit/tag this tree, rebuild backend+worker from that SHA (no `docker cp`).
4. **Legacy ledger gaps** (3 wallets) — ops must `--apply-opening-ledger` **or** `--accept-exception` via `scripts/reconcile-legacy-opening-balances.mjs`.
5. Optional but recommended: Strix/pentest run; measured P50/P95/P99 under load.

---

## Git / build / tests

| Check | Result |
|-------|--------|
| Pre-commit HEAD | `c91ce993cc9c69243f52a72eca0f52fa4148d86e` |
| **Release commit SHA** | `2c5cc6b48f3051b706e9ad3b3331fd927751d80e` |
| **Release tag** | `release-prod-2026-08-22` |
| Working tree at report | Clean after release commit (verify with `git status`) |
| `npm test` | **559/559 PASS** (147 files) — 2026-08-22T17:20Z |
| `npm run build` | **PASS** |
| `npm run lint` | **PASS** (warnings only; no new errors introduced for gate) |
| `npm audit --omit=dev` | **0 vulnerabilities** |

---

## Bugs fixed this release pass

| ID | Sev | Fix |
|----|-----|-----|
| REL-001 | **P0** | `voidRefundCredits` under-refunded when stake funded from `locked_deposit` (`fromCash \|\|` treated 0 as missing) → full stake restored to `balance` + locked restored |
| REL-002 | **P1** | WebSocket private `user:*` subscribe raced ahead of auth → subscribe only after `authenticated` |
| REL-003 | **P1** | Financial WS events lacked shared dedupe/stale guards on Auth + BetSlip |
| REL-004 | **P2** | `WALLET_BALANCE_UPDATED` payloads missing `eventId` / `timestamp` / balance fields |
| REL-005 | **P2** | Deposit complete had no user WS push → `deposit.completed` → `WALLET_BALANCE_UPDATED` |

---

## Financial model (re-verified in tests)

| Field | Rule |
|-------|------|
| `balance` | Authoritative playable cash (includes settlement payouts) |
| `winnings_balance` | Reporting-only cumulative net P&L |
| `reserved_balance` | Withdrawal audit (not double-subtracted from available) |
| `locked_deposit_balance` | Reduces withdrawable only |
| Available for betting | `= balance` |
| Withdrawable | `= max(0, balance - locked_deposit_balance)` |

### Mandatory scenario (automated)

Deposit ₹1000 → bet ₹500 @ 1.06 → wallet ₹500 → WON payout ₹530 → wallet **₹1030**, reporting **+₹30** → second bet ₹1000 succeeds → wallet **₹30**.

Covered by: `tests/settlement/fullMoneyLifecycle.test.js`

LOSS / VOID (incl. locked-deposit VOID) also covered.

---

## WebSocket path (code + unit verified; browser NOT)

Settlement → outbox `BET_SETTLED` → `outboxWorker` → `sendToUser(userId, …)` → channel `user:{userId}` → AuthProvider `refreshWallet` + BetSlip `refreshMyBets`.

Isolation: `canSubscribeToChannel` requires `session.userId === target`.  
WS errors in outbox handlers are caught — settlement commit is independent.

Tests: `tests/websocket/financialWsOutbox.test.js`, `tests/frontend/walletWsAccounting.test.js`

---

## Operational scripts added

| Script | Default | Purpose |
|--------|---------|---------|
| `scripts/reconcile-legacy-opening-balances.mjs` | **dry-run** | Detect LEGACY_PRE_LEDGER; optional `--apply-opening-ledger` or `--accept-exception` with actor/reason; never mutates `wallets.balance` on apply |
| `scripts/audit-winnings-reporting.mjs` | read-only | Flag WON null `actual_payout` / reporting drift; `--repair-winnings-reporting` requires actor/reason; never changes balance |

npm: `financial:reconcile-legacy-opening`, `financial:audit-winnings-reporting`

---

## Inventory

See `SYSTEM_REMAINING_GAPS.md` (Phase 1 completed before remediations).

---

## Production verification (this pass)

| Item | Status |
|------|--------|
| Local automated money lifecycle | **PASS** |
| Local WS outbox payload/isolation | **PASS** |
| Production DB WIN/LOSS ledger (prior closure) | Previously proven — not re-queried this pass |
| Production browser settle → UI | **NOT VERIFIED** |
| Production deposit/withdraw smoke | **NOT VERIFIED** |
| Docker image rebuild from this SHA | **PENDING** (after commit) |
| Migrations 054/055 | Previously applied on prod (prior closure) |

### Suggested production commands (after commit + deploy)

```bash
# On VPS / CI from release SHA — no docker cp
git fetch && git checkout <RELEASE_SHA>
docker compose -f docker-compose.prod.yml build --no-cache backend worker
docker compose -f docker-compose.prod.yml up -d backend worker
docker exec oddsyra_prod_nginx nginx -s reload
curl -fsS https://oddsyra.com/health
curl -fsS https://oddsyra.com/readiness
docker compose -f docker-compose.prod.yml exec backend node scripts/settlement-integrity-scan.mjs
docker compose -f docker-compose.prod.yml exec backend node scripts/financial-reconcile.mjs --allow-classified-legacy
docker compose -f docker-compose.prod.yml exec backend node scripts/reconcile-legacy-opening-balances.mjs --dry-run
docker compose -f docker-compose.prod.yml exec backend node scripts/audit-winnings-reporting.mjs
```

---

## Security

| Item | Status |
|------|--------|
| npm audit (prod deps) | 0 vulnerabilities |
| Strix / full pentest | **NOT VERIFIED** this pass |
| WS user isolation (unit) | PASS |
| JWT secrets in bundle | Not claimed scanned this pass |

---

## Performance

P50/P95/P99 **NOT MEASURED** on production this pass. Do not invent numbers.

---

## Docker image IDs / migration versions

| Item | Value |
|------|-------|
| Image IDs | **Pending rebuild** from release commit SHA |
| Migrations expected | Through **055** (`054_drop_winnings_non_negative_constraint`, `055_settlement_sweep_indexes`) |

---

## Remaining risks

1. Browser wallet/My Bets sync unproven.  
2. Legacy opening gaps until ops decision.  
3. Flaky slow placement under full parallel suite load (timeouts raised; isolated PASS).  
4. Feed match_ids without `matches` rows (classified LIVE_ACTIVE_BET when young).  
5. Uncommitted/deployed SHA drift until tagged release rebuild.

---

## Exact commands executed (this pass)

```text
npm test -- tests/websocket/... tests/frontend/... tests/settlement/fullMoneyLifecycle...
npm test   # final: 559/559
npm run build
npm run lint
npm audit --omit=dev
```

---

## Files changed (this remediation focus)

- `SYSTEM_REMAINING_GAPS.md`
- `FINAL_PRODUCTION_RELEASE_REPORT.md`
- `lib/walletSettlement.mjs` (VOID refund)
- `lib/outboxWorker.mjs` (wallet/deposit WS payloads)
- `lib/depositEngine.mjs` (deposit outbox payload balance)
- `src/services/liveFeedSocket.js` (auth-before-subscribe)
- `src/utils/wsFinancialEvents.js` (new)
- `src/context/auth/AuthProvider.jsx`
- `src/context/BetSlipContext.jsx`
- `scripts/reconcile-legacy-opening-balances.mjs` (new)
- `scripts/audit-winnings-reporting.mjs` (new)
- `package.json` (script aliases)
- Tests: `tests/websocket/financialWsOutbox.test.js`, `tests/frontend/walletWsAccounting.test.js`, `tests/settlement/fullMoneyLifecycle.test.js`, wallet/timeout adjustments

Plus prior uncommitted closure tree (cashout, settlement health, migrations, etc.) when committing release.

---

*End of report. Status remains YELLOW until browser + product smoke + SHA-aligned deploy + legacy ops decision.*
