# PHASE 28 — ODDSENGINE V3 REAL-WORLD MODEL VALIDATION & INTELLIGENCE AUDIT

**Product**: OddsYra / BetKing  
**Audit Date**: 2026-08-28  
**Policy**: AUDIT → PRESERVE → MEASURE → VALIDATE → CALIBRATE → COMPARE → SHADOW → CERTIFY → DOCUMENT  
**Current Authoritative Model**: `OddsEngineV3 v3.1-prod`  
**Current Real-World Validation Status**: **`INSUFFICIENT_DATA`** (0 / 1000 required settled observations)  

---

## 1. Current Architecture & Prediction Flow

```
CanonicalMatchState (Cricket, Soccer, Tennis, Basketball)
  ↓
matchStateValidator
  ↓
ProbabilityModel (v3.1-prod) + ProviderAgnosticModel (Cricbuzz, CREX, ESPN, 10Cric)
  ↓
ModelBlendEngine (Dynamic Bayesian Weights)
  ↓
OddsConversionEngine (Commercial Margins & Overrounds)
  ↓
MarketLifecycleEngine (Open, Suspended, Settled)
  ↓
Authoritative Published Odds to Live Bettors
```

---

## 2. Input Features & Model Invariants

- **Cricket**: Runs, wickets, balls bowled, required run rate, current run rate, innings number, target, partnership runs, format (T20/ODI/Test/T10).
- **Soccer**: Match minute, score1, score2, red cards, expected goal Poisson decay.
- **Tennis**: Sets won, games won, point server, tie-break state.
- **Basketball**: Quarter, clock seconds, possession delta, scoring run velocity.
- **Invariants**: All probabilities $0 \le p \le 1$, $\sum p = 1.0$, decimal odds $\ge 1.01$, overrounds $\ge 1.035$, zero client control over odds.

---

## 3. Observation & Settlement Tracking Status

- **Observation Pipeline**: `observationSamplingPolicy.mjs` buffers sampled predictions with SHA-256 state fingerprints.
- **Settlement Ingestion**: `settlementVerificationEngine.mjs` verifies multi-provider outcomes and performs append-only idempotent joins.
- **Current Observation Count**: 0 settled production records in PostgreSQL cold archive.
- **Validation Reality**: All candidate improvements run in **SHADOW ONLY**. Promotion to production requires $N \ge 1,000$ settled real-world observations.

---

## 4. Key Questions to be Solved by Phase 28 Engines

1. **Prediction Accuracy**: Global and segmented Brier Score, Log Loss, and Accuracy.
2. **Probability Calibration**: 10-bin reliability analysis classifying buckets as `WELL_CALIBRATED`, `OVERCONFIDENT`, `UNDERCONFIDENT`.
3. **Model & Concept Drift**: Multi-horizon tracking (24h, 7d, 30d vs baseline) classifying drift as `GREEN`, `YELLOW`, `RED`.
4. **Provider Quality**: Longitudinal scoring (0-100) assessing freshness, latency, disagreement, and conflict rate.
5. **Probability Stability**: Quantifying velocity $\Delta P / \Delta T$ and detecting rapid oscillations without modifying production odds.
6. **Candidate Comparison**: Rigorous sample-size gating ($N \ge 1,000$) preventing premature promotion.
7. **Model Health Score**: 0-100 composite health rating.
