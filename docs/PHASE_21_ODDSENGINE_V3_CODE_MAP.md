# PHASE 21 — ODDSENGINE V3 ARCHITECTURE & CODE MAP

**Product**: OddsYra / BetKing  
**Audit Date**: 2026-08-28  
**Authoritative Version**: `v3.1-prod`  
**Engine Base Path**: `lib/odds-v3/`

---

## 1. End-to-End Pricing Flow

```
INPUTS (Raw Provider Feeds / Cricbuzz / CREX / ESPN / Live WebSocket)
  ↓
NORMALIZATION (lib/odds-v3/buildCanonicalFromMatch.mjs)
  ↓
FEATURE EXTRACTION (CanonicalMatchState: score, balls, wickets, run-rate, minute, sets)
  ↓
SPORT MODEL (lib/odds-v3/pricing/ProbabilityModel.mjs, otherSportsOdds.mjs)
  ↓
MARKET MODEL (lib/odds-v3/markets/*.mjs — 8 Market Groups / 30+ Markets)
  ↓
PROVIDER SIGNALS (extractProviderOdds, providerConsensus, providerDisagreementEngine.mjs)
  ↓
ENSEMBLE (lib/odds-v3/pricing/modelBlendEngine.mjs — Precision-weighted Bayesian blend)
  ↓
CALIBRATION (lib/odds-v3/calibration/empiricalCalibration.mjs, calibrationOptimizer.mjs)
  ↓
PROBABILITY (Bounded 0.001 ≤ p ≤ 0.999, exact partition normalization ∑ p_i = 1.0)
  ↓
MARGIN (lib/odds-v3/pricing/MarginCalculator.mjs — Proportional overround [0.035, 0.12])
  ↓
ODDS CONVERSION (lib/odds-v3/pricing/OddsCalculator.mjs — decimal odds = 1 / margined_p)
  ↓
ROUNDING (4-decimal precision, min decimal odds floor = 1.01)
  ↓
SAFETY CHECKS (lib/odds-v3/bookIntegrity.mjs, circuitBreaker.mjs, volatilityFilter.mjs)
  ↓
PUBLISHED ODDS (OddsSnapshot.mjs → WebSocket Dispatcher & Live Match Aggregator)
```

---

## 2. Comprehensive Module Mapping

| Component | File Path | Primary Function & Mathematical Description |
| :--- | :--- | :--- |
| **Master Orchestrator** | `lib/odds-v3/OddsEngineV3.mjs` | Top-level dispatcher; runs validation, eligibility, market generation, integrity, circuit breaker, volatility filter |
| **Canonical State** | `lib/odds-v3/buildCanonicalFromMatch.mjs` | Ingests multi-feed provider objects into immutable `CanonicalMatchState` |
| **State Validator** | `lib/odds-v3/validation/MatchStateValidator.mjs` | Enforces score monotonicity, wicket bounds, ball count ranges, non-negative totals |
| **Cricket Win Probability** | `lib/odds-v3/pricing/ProbabilityModel.mjs` | Calculates $P(\text{chase wins}) = \text{Sigmoid}(k \cdot (rr - 1)) \cdot (\text{wf})^{0.5 + 0.5 \cdot \text{bf}} + \text{progressBoost}$ |
| **Cricket Expected Runs** | `lib/odds-v3/pricing/ProbabilityModel.mjs` | Negative binomial / linear run rate decay: $E[\text{rem}] = \text{balls} \cdot \text{rate} \cdot (\text{wf})^{0.3}$ |
| **Soccer Dixon-Coles** | `lib/odds-v3/models/soccerDixonColesModel.mjs` | Bivariate Poisson with low-score correlation parameter $\tau_{\lambda, \mu}(x, y)$ |
| **Tennis Markov Model** | `lib/odds-v3/models/tennisMarkovModel.mjs` | Hierarchical Markov transition chain for point $\to$ game $\to$ set $\to$ match |
| **Basketball Pace Model** | `lib/odds-v3/models/basketballPaceModel.mjs` | Possession-adjusted offensive/defensive rating differential with time decay |
| **Model Blending** | `lib/odds-v3/pricing/modelBlendEngine.mjs` | Precision-weighted Bayesian shrinkage: $p_{\text{blend}} = \frac{w_m p_m + w_p p_p}{w_m + w_p}$ |
| **Margin Application** | `lib/odds-v3/pricing/MarginCalculator.mjs` | Proportional overround allocation: $p_{i, \text{margined}} = p_i \cdot (1 + \text{overround})$ with headroom reallocation |
| **Odds Calculator** | `lib/odds-v3/pricing/OddsCalculator.mjs` | Formats decimal odds, applies minimum floor $1.01$, computes implied probability |
| **Book Integrity** | `lib/odds-v3/bookIntegrity.mjs` | Prevents Dutch-booking, arbitrage locks, missing selections, inverted overround |
| **Volatility Filter** | `lib/odds-v3/volatilityFilter.mjs` | Dampens micro-flicker oscillations and temporary provider spikes |
| **Circuit Breaker** | `lib/odds-v3/circuitBreaker.mjs` | Automatically suspends markets when feed age exceeds $15\text{s}$ or state versions regress |
| **Telemetry Delivery** | `lib/odds-v3/telemetry/telemetryDeliveryQueue.mjs` | Bounded queue with exponential backoff retries and non-blocking guarantees |
| **Pricing Anomaly Detector** | `lib/odds-v3/monitoring/pricingAnomalyDetector.mjs` | Real-time detector for probability jumps, stale feeds, margin violations, and NaN values |
| **Alert Correlator** | `lib/odds-v3/monitoring/alertCorrelationEngine.mjs` | Unifies multi-source alerts into structured `CORRELATED_INCIDENT` objects |
| **Market Health Engine** | `lib/odds-v3/monitoring/liveMarketHealthEngine.mjs` | Real-time grading (`HEALTHY`, `WATCH`, `DEGRADED`, `SUSPENDED`) |
| **Cold Storage Persister** | `lib/odds-v3/telemetry/oddsPersister.mjs` | Batch insertion into PostgreSQL `odds_observations` table |
| **Settlement Ground Truth** | `lib/odds-v3/dataset/settlementLabeler.mjs` | Labels outcomes and strictly validates $t_{\text{prediction}} < t_{\text{settlement}}$ |
| **Dataset Versioning** | `lib/odds-v3/dataset/datasetVersioning.mjs` | SHA-256 hashed dataset packaging with sample size gating |
| **Deterministic Replay** | `scripts/oddsReplayCli.mjs` | CLI for exact odds reconstruction from canonical match states |
| **Sensitivity Analyzer** | `lib/odds-v3/pricing/sensitivityAnalyzer.mjs` | Partial derivatives ($\frac{\partial p}{\partial \text{runs}}$, $\frac{\partial p}{\partial \text{wickets}}$) |
