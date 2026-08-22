# PERFORMANCE_FINAL_AUDIT

## Rule

Do **not** invent P50/P95/P99. None were measured on production in this pass.

## Observed locally (not production SLOs)

| Workload | Observation |
|----------|-------------|
| Full Vitest suite (560 tests) | ~26–40s wall on laptop |
| Cashout vs settlement race (isolated) | ~22s |
| Mass settlement / 100-bet stress | Covered by existing tests; pool `max: 20` limits extreme parallel cashout in CI |

## Risks

- PG pool contention under high concurrency  
- Provider payload size / N+1 in aggregator (not re-profiled)  
- Redis fanout added (low overhead publish; monitor subscriber lag)

## Required for GREEN

Run controlled load against staging/prod-like:

```text
1000 placements, 1000 settlements, 100 concurrent wallet ops
Record P50/P95/P99, error rate, pool wait, queue depth
```

## Status

**NOT MEASURED** → cannot claim performance PASS.
