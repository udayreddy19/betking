# ODDSENGINE V3 — REAL-WORLD DATA COLLECTION, OUTCOME JOIN & MODEL VALIDATION AUDIT

**Product**: OddsYra / BetKing  
**Audit Date**: 2026-08-28  
**Policy**: AUDIT → PRESERVE → VERIFY → COLLECT → JOIN → MEASURE → SHADOW → COMPARE → REPORT  
**Authoritative Engine**: `OddsEngineV3 v3.1-prod`  
**Real-World Validation Status**: **`REAL_WORLD_VALIDATION_NOT_VERIFIED`**  
**Settled Production Observations in Cold Store**: **0 / 1,000 required**  

---

## PHASE A — FULL ARCHITECTURAL AUDIT

### 1. Where Authoritative Predictions are Generated
- **Primary Live Engine**: `lib/odds-v3/OddsEngineV3.mjs` (`generate()`).
- **Cricket Chase Probability**: `lib/odds-v3/pricing/ProbabilityModel.mjs` (`calculateMatchWinnerProbability()`).
- **Non-Cricket Sports**: `lib/odds-v3/otherSportsOdds.mjs` (`winnerProbabilities()`).
- **Invocation Path**: `server/routes/public/odds.js` $\to$ `lib/liveScoresApiHandlers.mjs` (`buildMatchOddsPayload()`).

### 2. Where Candidate / Shadow Models Generate Predictions
- **Shadow Candidates**: `lib/odds-v3/optimization/` (`v3.2-candidate-001` through `005`).
- **Shadow Evaluation Router**: `lib/odds-v3/shadow/modelCandidateEvaluationEngine.mjs`.
- **Benchmarking Loop**: `lib/odds-v3/validation/championChallengerEngine.mjs`.
- **Status**: Executing in non-blocking parallel shadow mode; **zero candidate odds are exposed to live bettors**.

### 3. Prediction Capture & Metadata Completeness
- **Capture Engine**: `lib/odds-v3/validation/observationArchiveEngine.mjs` (`createObservationRecord()`).
- **Captured Schema Verification**:
  - `matchId`: **YES** (`String`)
  - `sport`: **YES** (`String`)
  - `marketType` / `marketId`: **YES** (`String`)
  - `selection`: **YES** (`String`)
  - `modelVersion`: **YES** (`v3.1-prod` for Champion, candidate version for Challenger)
  - `probability`: **YES** (`Float [0.001, 0.999]`)
  - `decimalOdds`: **YES** (`Float >= 1.01`)
  - `canonicalStateHash`: **YES** (`SHA-256 substring(0, 16)`)
  - `canonicalStateVersion`: **YES** (`Integer`)
  - `providerProbabilities` & `providerWeights`: **YES** (`JSONB`)
  - `providerDivergence`: **YES** (`Float`)
  - `dataQualityScore`: **YES** (`Float [0, 100]`)
  - `generatedAt` / `timestamp`: **YES** (`ISO 8601 String`)

### 4. Storage Architecture (`odds_observations`)
- **PostgreSQL Table**: `odds_observations` defined in `db/migrations/20260828_odds_observations.sql`.
- **Batch Persister**: `lib/odds-v3/telemetry/oddsPersister.mjs` (`persistObservationBatch()`).
- **Buffer & Sampling**: `lib/odds-v3/pipeline/observationSamplingPolicy.mjs` suppresses redundant ticks ($\Delta p < 0.02$, no state change) to prevent storage bloat.

### 5. Why Settled Longitudinal Observations are Currently Missing
1. **Recent Schema Deployment**: The migration `20260828_odds_observations.sql` and Phase 26/27 pipeline were deployed to production today.
2. **Cold Database State**: Live match fixtures take time to complete in the real world. Zero completed match cycles have accumulated and been joined in the cold table since initialization.
3. **Strict Policy Compliance**: Synthetic test data has NOT been inserted or counted toward real production certification.

### 6. Match Settlement Ingestion Flow
- **Official Outcomes Source**: `lib/liveMatchSettlement.mjs` resolves verified match completion from Cricbuzz, CREX, and ESPN scorecards.
- **Outcome Join**: `lib/odds-v3/validation/settlementIngestionPipeline.mjs` (`ingestMarketSettlement()`) matches observations by `matchId` + `marketType`, assigning binary outcome ($y \in \{0, 1\}$) and calculating individual Brier and LogLoss contributions.
- **Idempotency**: Append-only join. Retries return existing records without altering historical predictions.

---

## PHASE B — DATA GAP REPORT MATRIX

| Component | Exists in Code? | Working in Tests? | Real Production Data? | Synthetic Test Data? | Missing Functionality |
|---|---|---|---|---|---|
| **1. Prediction Capture** | **YES** | **YES** | **ACTIVE** | YES | None (buffers live quotes) |
| **2. Prediction Persistence** | **YES** | **YES** | **ACTIVE** | YES | Cold storage queue worker |
| **3. Candidate Shadow Capture** | **YES** | **YES** | **ACTIVE** | YES | None |
| **4. Match Settlement Ingestion**| **YES** | **YES** | **COLLECTING** | YES | Cold archive historical depth |
| **5. Prediction $\to$ Outcome Join** | **YES** | **YES** | **COLLECTING** | YES | Accumulated sample size ($N < 1000$) |
| **6. Brier Calculation** | **YES** | **YES** | **COLLECTING** | YES | Longitudinal settled count |
| **7. LogLoss Calculation** | **YES** | **YES** | **COLLECTING** | YES | Longitudinal settled count |
| **8. Calibration / ECE (10 bins)** | **YES** | **YES** | **COLLECTING** | YES | Longitudinal settled count |
| **9. Closing Line Analysis (CLV)** | **YES** | **YES** | **COLLECTING** | YES | Longitudinal settled count |
| **10. Champion vs Challenger** | **YES** | **YES** | **COLLECTING** | YES | Longitudinal settled count |
| **11. Historical Backtesting** | **YES** | **YES** | **NO** | **YES** | Verified historical dataset |
| **12. Walk-Forward Validation** | **YES** | **YES** | **NO** | **YES** | 30-day continuous archive |

---

## REAL-WORLD VALIDATION STATUS VERDICT

$$\mathbf{REAL\_WORLD\_VALIDATION = NOT\_VERIFIED}$$
$$\mathbf{STATUS = REAL\_WORLD\_VALIDATION\_COLLECTING}$$
$$\mathbf{REASON: Settled\ Production\ Observations = 0 / 1,000\ required}$$

---

## PHASE C — DURABLE OBSERVATION STORAGE DESIGN

The append-only schema preserves historical integrity:
```sql
CREATE TABLE IF NOT EXISTS odds_observations (
    observation_id VARCHAR(64) PRIMARY KEY,
    timestamp BIGINT NOT NULL,
    match_id VARCHAR(64) NOT NULL,
    sport VARCHAR(32) NOT NULL,
    league VARCHAR(64),
    market VARCHAR(64) NOT NULL,
    selection VARCHAR(64) NOT NULL,
    match_state JSONB,
    provider_inputs JSONB,
    provider_odds NUMERIC(10, 4),
    provider_consensus NUMERIC(10, 4),
    provider_used VARCHAR(64),
    model_probability NUMERIC(10, 6) NOT NULL,
    blended_probability NUMERIC(10, 6),
    published_odds NUMERIC(10, 4) NOT NULL,
    margin NUMERIC(6, 4) NOT NULL,
    liability_shading NUMERIC(6, 4),
    engine_version VARCHAR(32) NOT NULL DEFAULT '3.0.0',
    model_version VARCHAR(32) NOT NULL DEFAULT 'v3.1-prod',
    parameter_version VARCHAR(64) NOT NULL DEFAULT 'params_v1.0_prod',
    provider_latency_ms INT DEFAULT 0,
    feed_timestamp BIGINT,
    processing_timestamp BIGINT,
    quality_result JSONB,
    previous_odds NUMERIC(10, 4),
    new_odds NUMERIC(10, 4),
    odds_delta NUMERIC(10, 4),
    movement_percent NUMERIC(6, 2),
    suspension_reason VARCHAR(128),
    settled_outcome VARCHAR(16) DEFAULT 'UNKNOWN',
    settled_at BIGINT,
    retention_tier VARCHAR(16) DEFAULT 'HOT',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

## PHASE D — OUTCOME JOIN WORKER

A dedicated background worker routine queries unsettled records (`settled_outcome = 'UNKNOWN'`), matches with official match settlements (`liveMatchSettlement.mjs`), appends $y \in \{0, 1\}$, and records Brier contribution $(p - y)^2$ without altering original prediction attributes.

---

## PHASE E — MULTI-DIMENSIONAL MODEL SCORECARDS

- **Global**: Brier Score, LogLoss, ECE, Sample size.
- **By Sport**: Cricket, Soccer, Tennis, Basketball.
- **By Market**: Match Winner, Totals, Innings Totals, Player Props.
- **By Match Phase**: Pre-Match, Powerplay, Middle Overs, Death Overs, Chase.
- **By Model**: Authoritative Champion `v3.1-prod` vs Candidates `v3.2-001`..`005`.

---

## PHASE F — CHAMPION VS CHALLENGER PROMOTION GOVERNANCE

$$\text{ELIGIBILITY CRITERIA: } N \ge 1,000 \land \Delta_{\text{Brier}} \le -0.010 \land \Delta_{\text{LogLoss}} \le 0 \land \Delta_{\text{ECE}} \le 0 \land \text{No Regressions}$$
- **Automatic Promotion**: **STRICTLY FORBIDDEN (`AUTO_PROMOTION = false`)**.
- **Promotion Workflow**: `ELIGIBLE_FOR_REVIEW` requires signed human operator action.

---

## PHASE G — REAL DATA AVAILABILITY & FALLBACK ORDER

1. **Level 1**: Fresh Validated Provider Data ($< 2,500\text{ms}$ latency).
2. **Level 2**: Secondary Ranked Provider (Cricbuzz $\to$ CREX $\to$ FanCode $\to$ ESPN).
3. **Level 3**: Fresh Validated In-Memory Cache ($< 2,000\text{ms}$ TTL).
4. **Level 4**: Internal Deterministic Model (Live Chases).
5. **Level 5**: **SUSPEND MARKET** (Zero randomized guesses).

---

## PHASE H — ADMIN OPERATIONS UI INTEGRATION

Updated **[OddsIntelligenceDomainView.jsx](file:///Users/udayreddy/Desktop/betking/src/pages/admin/domains/OddsIntelligenceDomainView.jsx)** to display:
- **Settled Observations Progress**: `0 / 1000` (Status: `NOT_ENOUGH_REAL_DATA`)
- **Active Champion**: `v3.1-prod` (AUTHORITATIVE)
- **Active Shadow Challengers**: 5 Active
- **Promotion Status**: `NO AUTOMATIC MODEL PROMOTION`
