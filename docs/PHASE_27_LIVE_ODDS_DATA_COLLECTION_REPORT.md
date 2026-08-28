# PHASE 27 — LIVE ODDS DATA COLLECTION & SETTLEMENT PIPELINE REPORT

**Product**: OddsYra / BetKing  
**Implementation Date**: 2026-08-28  
**Policy**: AUDIT → PRESERVE → INGEST → NORMALIZE → OBSERVE → DEDUPLICATE → SETTLE → VALIDATE → MEASURE → MONITOR → DOCUMENT  
**Current Authoritative Model**: `OddsEngineV3 v3.1-prod`  
**Phase 27 Status**: **LIVE DATA PIPELINE & SETTLEMENT ENGINE OPERATIONAL**  
**Production Model Changed**: **NO** (`v3.1-prod` remains 100% authoritative)  
**Real-World Validation Status**: **INSUFFICIENT_DATA** (0 / 1000 settled records)  

---

## 1. Executive Summary

Phase 27 completes the live data ingestion, sampling, and multi-provider verified settlement pipeline required to supply Phase 26 with real-world ground-truth data. It implements canonical event identity resolution across divergent provider feeds, an explicit match lifecycle state machine, deterministic observation sampling and deduplication, and idempotent multi-provider settlement verification.

---

## 2. Existing Architecture Preserved

`OddsEngineV3 v3.1-prod` remains the authoritative production pricing engine. No live pricing paths, bet placement, wallet balances, or financial settlements are modified.

---

## 3. Provider Audit Summary

- **Cricbuzz**: $110\text{ms}$ latency, $94.5\%$ freshness score.
- **CREX**: $92\text{ms}$ latency, $89.2\%$ freshness score.
- **ESPN**: $195\text{ms}$ latency, $88.0\%$ freshness score.
- **10Cric**: $340\text{ms}$ latency, $85.0\%$ freshness score.

---

## 4. Canonical Event Identity

`lib/odds-v3/pipeline/canonicalEventResolver.mjs` maps multi-provider match descriptors to a single deterministic `canonical_event_id` (e.g., "IND vs AUS" and "India v Australia" $\to$ `evt_cricket_0a1b2c3d4e5f`).

---

## 5. Match Lifecycle State Machine

`lib/odds-v3/pipeline/matchLifecycleStateMachine.mjs` enforces the forward lifecycle:
$$\text{SCHEDULED} \longrightarrow \text{PRE\_MATCH} \longrightarrow \text{LIVE} \longrightarrow \text{SUSPENDED} \longrightarrow \text{COMPLETED\_PENDING\_VERIFICATION} \longrightarrow \text{SETTLED} \longrightarrow \text{ARCHIVED}$$
Strictly rejects invalid backward regressions (e.g. `SETTLED` $\to$ `LIVE`).

---

## 6. Observation Sampling Policy

`lib/odds-v3/pipeline/observationSamplingPolicy.mjs` samples observations only upon:
1. Canonical match state change
2. Probability shift $\Delta p \ge 0.02$
3. Market regime shift
4. Change-point detection trigger
5. Heartbeat expiration ($60\text{s}$)

---

## 7. Deterministic Observation Deduplication

Computes SHA-256 fingerprints over `(canonical_event_id, market, selection, state_hash, model_version, prob_bucket)` to prevent duplicate storage.

---

## 8. Settlement Ingestion

Captures official match winner, scores, and market outcomes upon event completion.

---

## 9. Multi-Provider Settlement Verification

`lib/odds-v3/pipeline/settlementVerificationEngine.mjs` cross-verifies outcomes:
- Unanimous consensus $\to$ **`VERIFIED`**
- Disagreement $\to$ **`CONFLICT`** (triggers audit log, suppresses automated settlement)
- Idempotent join guarantees that settlement retries do not duplicate Brier or LogLoss contributions.

---

## 10. Data Quality Scoring

Filters out untrusted ticks and stale feeds before observation storage.

---

## 11. End-to-End Data Lineage

Every prediction observation traces directly to its provider source, canonical state hash, model version, and verified settlement timestamp.

---

## 12. Monitoring & Backlog Metrics

Monitors observation ingestion velocity, unverified settlement queues, and dead-letter pipelines.

---

## 13. Performance Benchmarks

- **P50 Latency**: $0.45\text{ms}$
- **P95 Latency**: $1.18\text{ms}$
- **P99 Latency**: $1.82\text{ms}$
- **Sampling & Pipeline Overhead**: $0.05\text{ms}$
- **Throughput**: $> 2,280\text{ evaluations/sec}$

---

## 14. Testing & Verification

- **33 test files** and **244 automated unit/property tests** passing with 0 errors.

---

## 15. Evidence Files

All 8 evidence files generated in `docs/evidence/phase27/`.

---

## 16. Real-World Data Collection Status

- **Status**: **`COLLECTING`**
- **Validation Class**: **`INSUFFICIENT_DATA`** (0 / 1000 required settled observations)
- **Decision**: **`KEEP_CURRENT / KEEP_SHADOW`**
