# FINANCIAL_RECONCILIATION_REPORT

**Mode:** Read-only classification. No automatic balance mutation.

## Local / CI verification

| Check | Result |
|-------|--------|
| Money lifecycle Vitest (WIN/LOSS/VOID/locked VOID) | PASS |
| Canonical available/withdrawable helpers | PASS (source + tests) |
| Withdrawal approve/reject race | PASS (`withdrawalReviewRace`) |
| Settlement payout idempotency guard | Implemented + suite PASS |

## Production commands (run against prod DB)

```bash
npm run financial:reconcile -- --allow-classified-legacy
npm run financial:reconcile-legacy-opening -- --dry-run
npm run financial:audit-winnings-reporting
```

## Known classified legacy (do not auto-repair)

Prior closure identified 3 wallets as `LEGACY_PRE_LEDGER_*` with stored balance > ledger history.

| Action | Command |
|--------|---------|
| Dry-run | `--dry-run` (default) |
| Opening CREDIT (no balance mutate) | `--apply-opening-ledger --actor= --reason=` |
| Formal exception | `--accept-exception --actor= --reason=` |

**Unexplained active discrepancies:** none newly proven in this pass beyond classified legacy (prod not re-queried here).

## Status

**YELLOW** until legacy wallets are applied or accepted and prod reconcile exits 0 unexplained.
