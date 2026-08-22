# OddsYra / BetKing — Final Production Readiness Report

**Datetime (UTC):** 2026-08-22T17:40:00Z  
**Git tip (pre-commit of this pass):** local working tree with P0 fixes  
**Automated tests:** **560/560 PASS** (148 files)  
**Build:** PASS · **Lint:** warnings only · **npm audit --omit=dev:** 0 vulnerabilities

---

## Verdict

# 🟡 YELLOW — READY WITH CONDITIONS

**Not GREEN** — mandatory browser E2E, production deploy from tip SHA, legacy ledger ops decision, measured perf, and Strix/pentest remain incomplete.

**Not RED** — verified P0 money/security defects found in this audit were fixed in code; automated money lifecycle and concurrency suites pass.

---

## What this audit fixed (evidence-based)

| ID | Severity | Fix |
|----|----------|-----|
| B-001 | P0 | Withdrawal review: `FOR UPDATE` + CAS + reserved guard |
| B-002 | P0 | Deposit capture: deposit row lock + `CREATED`→`CAPTURED` CAS |
| B-003 | P0 | Settlement: existing payout tx guard + ledger only if tx insert wins |
| B-004 | P0 | Unknown winner/ungradeable → `null` (await evidence), not VOID |
| B-005 | P0 | Support WS: no global broadcast of chat payloads |
| B-006 | P0 | Redis WS fanout worker→API (`oddsyra:ws:fanout`) |
| B-007 | P1 | Idempotency fail-closed on store errors |
| B-009 | P1 | `requireRole` flattens arrays; settlement uses real roles |
| B-011 | P1 | REJECT ledger `balance_after` uses post-credit balance |
| B-012 | P1 | PENDING/unknown market eval no longer defaults to LOST |
| Ops | P1 | Worker compose healthcheck (`kill -0 1`) |

---

## Remaining GREEN blockers

1. Browser settle → wallet/My Bets without refresh (see `PRODUCTION_E2E_CHECKLIST.md`)  
2. Full register→deposit→withdraw browser smoke  
3. Deploy Docker images built from release tip SHA (pending)  
4. Legacy 3 wallets: apply opening ledger **or** accept-exception  
5. Measured P50/P95/P99  
6. Strix / pentest  
7. Legal/compliance approval for real-money launch  

---

## Financial model (re-verified in source)

- Playable = `wallet.balance`  
- Withdrawable = `max(0, balance - locked_deposit_balance)`  
- `reserved_balance` audit-only (not double-subtracted)  
- `winnings_balance` reporting-only  

Mandatory Vitest path: ₹1000 → ₹500@1.06 → ₹1030 → second ₹1000 → ₹30 (`fullMoneyLifecycle`).

---

## Cross-references

- `FINAL_PRODUCTION_BLOCKER_AUDIT.md`  
- `PRODUCTION_E2E_CHECKLIST.md`  
- `RELEASE_RUNBOOK.md`  
- `FINANCIAL_RECONCILIATION_REPORT.md`  
- `SETTLEMENT_INTEGRITY_REPORT.md`  
- `SECURITY_FINAL_AUDIT.md`  
- `PERFORMANCE_FINAL_AUDIT.md`  
