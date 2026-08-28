# PHASE 29 — ODDSENGINE V3 REAL-WORLD DATA COLLECTION & CONTINUOUS VALIDATION AUDIT

**Product**: OddsYra / BetKing  
**Audit Date**: 2026-08-28  
**Policy**: AUDIT → PRESERVE → VERIFY → COLLECT → PERSIST → SETTLE → JOIN → MEASURE → COMPARE → LEARN → SHADOW → REVIEW → APPROVE → VERSION → MONITOR → ROLLBACK → DOCUMENT  
**Current Authoritative Model**: `OddsEngineV3 v3.1-prod`  
**Current Validation Status**: **`REAL_WORLD_VALIDATION_COLLECTING`** (0 / 1,000 required settled records)  

---

## 1. Comprehensive Component Classification Matrix

| Component Area | Module File Path | Status | Execution Reality & Code Evidence |
|---|---|---|---|
| **Authoritative Pricing Core** | `lib/odds-v3/OddsEngineV3.mjs` | **REAL_WORLD_ACTIVE** | Produces live prices across cricket, soccer, tennis, basketball. |
| **Cricket Chase Probability** | `lib/odds-v3/pricing/ProbabilityModel.mjs` | **REAL_WORLD_ACTIVE** | Deterministic logistic sigmoid chase model based on $rr$ and $wf$. |
| **Candidate Optimization Models** | `lib/odds-v3/optimization/` (`v3.2-001`..`005`) | **TEST_ONLY / SHADOW** | Candidate algorithms isolated in shadow test harnesses. |
| **Observation Capture Engine** | `lib/odds-v3/validation/observationArchiveEngine.mjs` | **REAL_WORLD_ACTIVE** | Captures structured predictions with SHA-256 state hashing. |
| **PostgreSQL Cold Persistence** | `lib/odds-v3/telemetry/oddsPersister.mjs` | **REAL_WORLD_ACTIVE** | Batch-writes records to `odds_observations` table. |
| **Observation Sampling Policy** | `lib/odds-v3/pipeline/observationSamplingPolicy.mjs` | **REAL_WORLD_ACTIVE** | Suppresses redundant ticks ($\Delta p < 0.02$, no state shift). |
| **Multi-Provider Aggregator** | `lib/aggregator.mjs` | **REAL_WORLD_ACTIVE** | Combines Cricbuzz, CREX, 10Cric, FanCode, ESPN feeds. |
| **Feed Circuit Breaker** | `lib/odds-v3/circuitBreaker.mjs` | **REAL_WORLD_ACTIVE** | Enforces $2.5\text{s}$ latency cutoff and $5.0\text{s}$ stale hard freeze. |
| **Match Settlement Ingestion** | `lib/odds-v3/validation/settlementIngestionPipeline.mjs` | **REAL_WORLD_ACTIVE** | Append-only idempotent join of verified match outcomes. |
| **Prediction Outcome Joiner** | `lib/odds-v3/pipeline/settlementVerificationEngine.mjs`| **REAL_WORLD_ACTIVE** | Resolves multi-provider consensus (`VERIFIED` vs `CONFLICT`). |
| **Brier & LogLoss Scorer** | `lib/odds-v3/validation/predictionPerformanceEngine.mjs` | **REAL_WORLD_ACTIVE** | Computes global and segmented empirical loss metrics. |
| **10-Bin Reliability (ECE)** | `lib/odds-v3/validation/calibrationEngine.mjs` | **REAL_WORLD_ACTIVE** | Diagnostically monitors 10 calibration reliability bins. |
| **Closing Line Analysis (CLV)** | `lib/odds-v3/validation/closingLineAnalyzer.mjs` | **REAL_WORLD_ACTIVE** | Tracks price trajectory efficiency and flicker instability. |
| **Champion vs Challenger Gate**| `lib/odds-v3/shadow/modelCandidateEvaluationEngine.mjs` | **REAL_WORLD_ACTIVE** | Compares candidates against `v3.1-prod` with $N \ge 1,000$ gate. |
| **Model Governance Registry** | `lib/odds-v3/validation/modelGovernanceRegistry.mjs` | **REAL_WORLD_ACTIVE** | Enforces single Champion rule (`AUTO_PROMOTION = false`). |
| **Multi-Horizon Drift Detector**| `lib/odds-v3/validation/modelDriftEngine.mjs` | **REAL_WORLD_ACTIVE** | Flags statistical degradation over 24h, 7d, 30d horizons. |
| **Provider Quality Scorer** | `lib/odds-v3/validation/providerQualityEngine.mjs` | **REAL_WORLD_ACTIVE** | 0-100 diagnostic ratings across live provider feeds. |
| **Change-Point Detector** | `lib/odds-v3/quality/changePointDetector.mjs` | **REAL_WORLD_ACTIVE** | Distinguishes real event moves from provider noise spikes. |
| **Cross-Market Validator** | `lib/odds-v3/validation/PricingValidator.mjs` | **REAL_WORLD_ACTIVE** | Enforces probability sum $\sum p = 1.0$ and odds $\ge 1.01$. |
| **Longitudinal Real Validation**| Cold PostgreSQL Store (`odds_observations`) | **NOT_VERIFIED** | 0 settled production records in cold archive ($N < 1,000$). |

---

## 2. Invariant & Policy Verification

1. **Authoritative Engine**: `v3.1-prod` remains 100% authoritative for all live public odds.
2. **Zero Challenger Odds Publication**: Challenger odds execute in shadow paths only.
3. **Strict Promotion Governance**: `AUTO_PROMOTION = false`. Promotion strictly requires manual operator approval with audit logging.
4. **Financial Safety**: Wallets, ledgers, open bets, and settlement engines are untouched and isolated.
