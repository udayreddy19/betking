# SETTLEMENT_INTEGRITY_REPORT

## Automated

| Check | Result |
|-------|--------|
| Concurrent settle → one credit | PASS |
| Cashout vs settlement race | PASS (isolated ~22s; suite timeout 60s) |
| Unknown winner → not VOID | PASS (`liveMatchGone`) |
| PENDING market eval → not LOST | Fixed in `betSettlementEngine` |
| Orphan classification LIVE vs TRUE_ORPHAN | Existing suite PASS |
| Crash-retry double payout guard | Code: existing `tx_payout_*` short-circuit |

## Cricket over / milestone markets (source)

- `evaluateMilestoneOverMarketBet` / over markets use innings-bound snapshots via `getRunsInOver` / `getScoreAtOverEnd`  
- Missing score → `null` (await), not invented lines  
- `i1_overs_0_N_total` routed through milestone evaluator  

**Browser live over-boundary settle:** NOT VERIFIED this pass.

## Production scan

```bash
npm run settlement:integrity-scan
```

Expect: 0 TRUE_ORPHAN incidents, 0 duplicate payouts, 0 DEAD_LETTER (or DLQ under recovery).

## Status

Code integrity **improved**; production scan + browser over-market settle still required for GREEN.
