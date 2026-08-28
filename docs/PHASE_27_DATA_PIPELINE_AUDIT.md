# PHASE 27 — DATA PIPELINE & SETTLEMENT ARCHITECTURE AUDIT

**Product**: OddsYra / BetKing  
**Audit Date**: 2026-08-28  
**Policy**: AUDIT → PRESERVE → INGEST → NORMALIZE → OBSERVE → DEDUPLICATE → SETTLE → VALIDATE → MEASURE → MONITOR → DOCUMENT  
**Current Authoritative Model**: `OddsEngineV3 v3.1-prod`  
**Phase 27 Status**: **PRE-IMPLEMENTATION AUDIT COMPLETED**  

---

## 1. Current Provider Sources & Ingestion Stack

- **Cricbuzz Feed**: Live ball-by-ball commentary, runs, wickets, overs, match state, target.
- **CREX Feed**: Boundary velocity, fast live scoreboard update.
- **ESPN Feed**: Multi-sport coverage (Soccer, Tennis, Basketball, Cricket).
- **10Cric Feed**: Market reference line for consensus evaluation.

---

## 2. Current Match Lifecycle & Event Identity Strategy

- **Historical Approach**: Matches identified primarily by provider-assigned IDs with ad-hoc matching.
- **Identified Gap**: Need for a deterministic `canonical_event_id` resolver that maps divergent provider names (e.g. "India vs Australia" vs "IND v AUS") with multi-level confidence scoring (`MATCHED`, `POSSIBLE_MATCH`, `UNMATCHED`, `CONFLICT`).

---

## 3. Observation Sampling & Storage Reality

- **Storage Explosion Risk**: Unthrottled quote tick recording creates excessive duplicate records during high feed update frequencies.
- **Solution**: Configurable observation sampling policy triggering only on:
  1. Canonical state changes
  2. Probability delta $> \text{threshold}$ (e.g. 0.02)
  3. Regime shifts
  4. Change-point detection events
  5. Periodic heartbeat expiration (e.g. 60s)
- **Observation Deduplication**: SHA-256 fingerprint hashing over `(canonical_event_id, market, selection, state_hash, model_version)`.

---

## 4. Multi-Provider Settlement Verification & Idempotency

- **Settlement Gap**: Settle operations must require multi-provider consensus to avoid single-source false settlements. Disagreements must be classified as `CONFLICT`.
- **Idempotency Invariant**: Re-running settlement on an already settled observation must be a no-op that preserves historical prediction timestamps, probabilities, and Brier contributions.

---

## 5. Safe Implementation Plan

1. Build `lib/odds-v3/pipeline/canonicalEventResolver.mjs`.
2. Build `lib/odds-v3/pipeline/matchLifecycleStateMachine.mjs`.
3. Build `lib/odds-v3/pipeline/observationSamplingPolicy.mjs`.
4. Build `lib/odds-v3/pipeline/settlementVerificationEngine.mjs`.
5. Build `lib/odds-v3/validation/dataCollectionProgressEngine.mjs`.
6. Write test suite in `tests/odds-v3/pipeline/phase27LivePipeline.test.js`.
7. Generate Phase 27 evidence and report.
8. Deploy to Hostinger VPS.
