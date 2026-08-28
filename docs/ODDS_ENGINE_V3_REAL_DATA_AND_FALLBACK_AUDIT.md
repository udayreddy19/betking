# OddsYra / BetKing — Real Model Data Availability & Fallback Logic Audit

**Document**: `docs/ODDS_ENGINE_V3_REAL_DATA_AND_FALLBACK_AUDIT.md`  
**Audit Date**: 2026-08-28  
**Scope**: Full Codebase Audit of OddsEngineV3, Data Feeds, Probability Models, Caching, Fallback Strategies, and Risk Controls  
**Status**: **REPORT ONLY — NO PRODUCTION CODE MODIFIED**  

---

## 1. Current OddsEngineV3 Architecture

### 1.1 Odds Generation & Pricing Flow
The authoritative pricing path originates from **[OddsEngineV3.mjs](file:///Users/udayreddy/Desktop/betking/lib/odds-v3/OddsEngineV3.mjs)**:

1. **Ingestion & Normalization**:
   - External provider feeds (Cricbuzz, CREX, FanCode, 10Cric, ESPN) are collected by **[aggregator.mjs](file:///Users/udayreddy/Desktop/betking/lib/aggregator.mjs)** and normalized into standard structures.
   - **[buildCanonicalFromMatch.mjs](file:///Users/udayreddy/Desktop/betking/lib/odds-v3/buildCanonicalFromMatch.mjs)** transforms the raw match object into an immutable `CanonicalMatchState`.
2. **State Validation & Circuit Breakers**:
   - **[MatchStateValidator.mjs](file:///Users/udayreddy/Desktop/betking/lib/odds-v3/validation/MatchStateValidator.mjs)** verifies cricket invariants (scores, overs, balls, wickets $\le 10$).
   - **[circuitBreaker.mjs](file:///Users/udayreddy/Desktop/betking/lib/odds-v3/circuitBreaker.mjs)** monitors feed tick arrival times. If feed latency exceeds $2,500\text{ms}$ or tick age exceeds $5,000\text{ms}$, markets automatically transition to `SUSPENDED`.
3. **Probability Modeling**:
   - **Pre-match**: **[MatchWinnerMarket.mjs](file:///Users/udayreddy/Desktop/betking/lib/odds-v3/markets/MatchWinnerMarket.mjs)** extracts external provider reference odds (e.g. 10Cric). If no valid provider odds exist ($> 1.0$), pre-match markets are **SUSPENDED**.
   - **Live In-Play (Cricket Chase)**: **[ProbabilityModel.mjs](file:///Users/udayreddy/Desktop/betking/lib/odds-v3/pricing/ProbabilityModel.mjs)** applies a deterministic logistic sigmoid model based on:
     $$\text{Run Rate Ratio } (rr) = \frac{\text{Required Run Rate}}{\text{Current Run Rate}}$$
     $$\text{Wicket Factor } (wf) = \left(\frac{\text{Wickets Remaining}}{10}\right)^{\left(0.5 + 0.5 \times \frac{\text{Balls Bowled}}{\text{Total Balls}}\right)}$$
     $$P(\text{chase}) = \text{clamp}\left(\frac{1}{1 + e^{k(rr - 1)}} \times wf, 0.01, 0.99\right)$$
   - **Non-Cricket Sports**: **[otherSportsOdds.mjs](file:///Users/udayreddy/Desktop/betking/lib/odds-v3/otherSportsOdds.mjs)** applies time-decay Poisson modeling for soccer, set/game Markov chains for tennis, and possession-pace models for basketball.
4. **Margin Application & Pricing**:
   - **[OddsCalculator.mjs](file:///Users/udayreddy/Desktop/betking/lib/odds-v3/pricing/OddsCalculator.mjs)** and **[MarginCalculator.mjs](file:///Users/udayreddy/Desktop/betking/lib/odds-v3/pricing/MarginCalculator.mjs)** inject commercial overrounds ($1.04$–$1.08$) and floor odds at $1.01$.
5. **Propagation & Consumption**:
   - **Public API**: `GET /api/public/sports/matches/:matchId/odds` served by **[liveScoresApiHandlers.mjs](file:///Users/udayreddy/Desktop/betking/lib/liveScoresApiHandlers.mjs)** with a $2,000\text{ms}$ in-memory cache and in-flight request deduplication.
   - **WebSockets**: Broadcasts updates via **[websocketEngine.mjs](file:///Users/udayreddy/Desktop/betking/lib/websocketEngine.mjs)**.
   - **Bet Placement**: **[betPlacementEngine.mjs](file:///Users/udayreddy/Desktop/betking/lib/betPlacementEngine.mjs)** and **[oddsQuoteService.mjs](file:///Users/udayreddy/Desktop/betking/lib/oddsQuoteService.mjs)** re-quote against the latest live state inside a PostgreSQL transaction (`FOR UPDATE` wallet lock). Rejects stale odds with `409 STALE_ODDS`.
   - **Bet Settlement**: **[liveMatchSettlement.mjs](file:///Users/udayreddy/Desktop/betking/lib/liveMatchSettlement.mjs)** grades bets using verified final scores.

---

## 2. Real Data Availability Matrix

| Data Type | Current Source | Real / Synthetic | Required? | Fallback Exists? | Staleness Check? |
|---|---|---|---|---|---|
| **Live Cricket Ball Feed** | Cricbuzz (`cricbuzzLiveScores.mjs` / `cricbuzzBallFeed.mjs`) | **REAL** (Scraped Live Feed) | YES (for delivery markets) | YES (scorecard-only fallback) | YES ($2.5\text{s}$ circuit breaker) |
| **Live Cricket Scoreboard** | CREX (`crexCricketProvider.mjs`) | **REAL** (Fast Score Stream) | YES | YES (Cricbuzz / ESPN) | YES ($5\text{s}$ max tick age) |
| **Pre-match Reference Odds** | 10Cric (`tencricProvider.mjs`) | **REAL** (GraphQL Feed) | YES (for pre-match) | NO (Suspends if missing) | YES (Stale feed rejection) |
| **Multi-Sport Scores** | ESPN (`espnLiveScores.mjs`) | **REAL** (Public API) | YES (Soccer, Tennis, Basketball) | YES (10Cric sports feed) | YES ($10\text{s}$ poll TTL) |
| **SRL Virtual Cricket** | IPL SRL Simulator (`iplSrlSimulator.mjs`) | **SYNTHETIC** (RNG / Poisson Sim) | NO (Only for SRL series) | N/A | N/A |
| **Live Model Probabilities** | ProbabilityModel (`ProbabilityModel.mjs`) | **REAL STATISTICAL / DETERMINISTIC** | YES | YES (Linear interpolation fallback) | YES (Regime & velocity checks) |
| **Player Prop Statistics** | Commentary scraper / scorecard | **REAL / PARTIAL** | NO | YES (Market not created) | YES |
| **Weather / Pitch Delays** | Event commentary stream | **REAL** | NO | YES (Manual / event suspension) | YES |

---

## 3. Model Detection: Architectural Classification

**Classification: HYBRID SYSTEM**

- **Pre-Match**: Operates as an **External Prediction Aggregator**. Extracts reference market prices from verified sportsbook feeds (10Cric) and normalizes implied probabilities.
- **In-Play (Live Cricket)**: Operates as an **Internal Deterministic Statistical Model**. Mathematical differential equation solver calculating win probability based on live match state (runs needed, balls left, wickets in hand, run rate elasticity).
- **Optimization Candidates (Shadow)**: Multi-model Bayesian blend (`ModelBlendEngine.mjs`, `v3.2-candidate-001` through `005`) running strictly in shadow mode.
- **Virtuals (SRL)**: Dedicated synthetic simulation engine isolated from live fixture feeds.

---

## 4. Data Availability State Machine

```
                 ┌───────────────┐
                 │   AVAILABLE   │ ──(Latency > 2.5s)──┐
                 └───────┬───────┘                     │
                         │                             ▼
                 (No new ticks > 5s)             ┌───────────┐
                         │                       │ DEGRADED  │
                         ▼                       └─────┬─────┘
                 ┌───────────────┐                     │
                 │     STALE     │ ──(Corrupt data)──┐ │
                 └───────┬───────┘                   │ │
                         │                           ▼ ▼
                 (Feed completely down)        ┌───────────┐
                         │                     │  INVALID  │
                         ▼                     └─────┬─────┘
                 ┌───────────────┐                   │
                 │  UNAVAILABLE  │                   │
                 └───────┬───────┘                   │
                         │                           │
                         │   ┌───────────────┐       │
                         └──►│  RECOVERING   │◄──────┘
                             └───────┬───────┘
                                     │ (2 valid fresh ticks)
                                     ▼
                             ┌───────────────┐
                             │   AVAILABLE   │
                             └───────────────┘
```

### State Definitions & Operational Policy

| State | Detection Criteria | Betting Allowed? | Odds Action | Fallback Policy | Market Suspension |
|---|---|---|---|---|---|
| **AVAILABLE** | Fresh ticks $< 2,500\text{ms}$ latency, valid schema, no provider conflict. | **YES** | Live recalculation on every tick. | Not needed; primary model active. | OPEN |
| **STALE** | No tick received between $2,500\text{ms}$ and $5,000\text{ms}$. | **YES (Temporary)** | Odds frozen at last validated quote ($< 2\text{s}$). | Use cached model output up to $5\text{s}$. | OPEN (Watch mode) |
| **DEGRADED** | Feed latency $> 2,500\text{ms}$, single provider dropped from cluster. | **REDUCED LIMITS** | Re-weight consensus; increase safety margin $+2\%$. | Switch to secondary provider feed. | OPEN (Higher overround) |
| **UNAVAILABLE**| All primary provider feeds offline $> 5,000\text{ms}$. | **NO (Live Chases)** | Stop generation; serve last validated snapshot marked `STALE`. | Internal deterministic baseline model if pre-match; freeze if live. | **SUSPENDED** (In-play) |
| **INVALID** | Malformed scores, negative overs, runs jump $> 10$ in 1 ball. | **NO** | Reject tick immediately; alert anomaly monitor. | Discard corrupted update; do not mutate active state. | **SUSPENDED** |
| **RECOVERING** | Fresh ticks received after outage, but $< 2$ consecutive healthy ticks. | **NO** | Validate state continuity in shadow memory. | Keep fallback active until verified. | **SUSPENDED** |

---

## 5. Real Data + Fallback Architecture

```
                 ┌────────────────────────────────┐
                 │ Multi-Provider Real Data Feeds │
                 │ (Cricbuzz, CREX, ESPN, 10Cric) │
                 └───────────────┬────────────────┘
                                 │
                   Feed Circuit Breaker & Health
                                 │
                 ┌───────────────▼────────────────┐
                 │ Data Validation & Completeness │
                 └───────────────┬────────────────┘
                                 │
                     Freshness & Quality Score
                                 │
               ┌─────────────────┴──────────────────┐
               │                                    │
        REAL DATA HEALTHY                   REAL DATA UNHEALTHY
               │                                    │
               ▼                                    ▼
    Authoritative v3.1-prod               Fallback Policy Router
               │                                    │
    Probability & Market Engine          [Priority 1: Warm Cache (<2s)]
               │                         [Priority 2: Secondary Provider]
               │                         [Priority 3: Deterministic Model]
               │                         [Priority 4: SUSPEND MARKET]
               │                                    │
               └─────────────────┬──────────────────┘
                                 ▼
                    Risk Adjustment & Limits
                                 │
                                 ▼
                     Published Decimals & Overround
                                 │
                                 ▼
                    Audit Logging & Lineage Archive
```

---

## 6. Fallback Priority & Hierarchy

When real data experiences degradation, the engine enforces the following **strict non-random hierarchy**:

1. **Priority 1: Fresh Validated Real Provider Data**
   - Active feed from Cricbuzz / CREX / 10Cric with latency $< 2,500\text{ms}$.
2. **Priority 2: Warm In-Memory Cached Snapshot ($< 2,000\text{ms}$ TTL)**
   - Serves recent validated snapshot without blocking on scraping.
3. **Priority 3: Secondary Resilient Provider Transition**
   - If Cricbuzz drops, failover to CREX or ESPN normalized stream with team name reconciliation.
4. **Priority 4: Internal Deterministic Statistical Model (Offline / Pre-Match)**
   - Pre-calculated format baseline distributions (e.g. historical T20 1st innings target curves).
5. **Priority 5: Automatic Market Suspension (`SUSPENDED`)**
   - If match state is volatile, unverified, or live chase data is absent, immediately suspend all affected markets.
   - **PROHIBITION**: Never use randomized probabilities or synthetic guesses as a production fallback.

---

## 7. Automatic Data Recovery & Thaw Logic

```
OUTAGE DETECTED (Circuit Breaker Tripped → Markets SUSPENDED)
       ↓
FEED RESTORED (New ticks arriving)
       ↓
STEP 1: Schema & Sanity Validation (Verify runs >= last_runs, wickets >= last_wickets)
       ↓
STEP 2: Consecutive Healthy Ticks Gate (Require >= 2 consecutive ticks with latency < 2500ms)
       ↓
STEP 3: Delta Check (Verify probability shift vs last valid quote <= 0.25)
       ↓
STEP 4: Thaw Execution (Clear suspension flag, resume normal market quoting)
       ↓
STEP 5: Audit Event Emission (Emit ODDS_REAL_DATA_RESTORED with recovery duration)
```

---

## 8. Required Output Metadata Schema

Every generated market snapshot and API payload will attach the following diagnostic lineage metadata:

```json
{
  "matchId": "evt_cricket_0a1b2c3d4e5f",
  "modelVersion": "v3.1-prod",
  "dataSource": "cricbuzz",
  "dataSourceType": "REAL_FEED",
  "dataTimestamp": "2026-08-28T18:05:22.100Z",
  "generatedAt": "2026-08-28T18:05:22.105Z",
  "freshnessMs": 110,
  "confidence": 0.95,
  "fallbackUsed": false,
  "fallbackReason": null,
  "providerStatus": "HEALTHY",
  "cacheAgeMs": 0,
  "circuitBreakerStatus": "NORMAL",
  "isAuthoritative": true
}
```

---

## 9. Market Safety Under Real-World Failure Scenarios

| Scenario | Market State Action | User Impact / Odds Display | Bet Placement Guard |
|---|---|---|---|
| **1. Real data missing before match starts** | `SUSPENDED` | Display "Pre-match odds unavailable". | Rejects bet placement (`409 ODDS_UNAVAILABLE`). |
| **2. Feed drops during live play** | `SUSPENDED` | Odds greyed out / locked icon. | Rejects bet placement (`409 MARKET_SUSPENDED`). |
| **3. In-memory cache expires ($> 5\text{s}$)** | `SUSPENDED` | Forces aggregator background refresh. | Rejects bet placement until fresh feed arrives. |
| **4. Provider returns malformed schema** | `SUSPENDED` | Discards tick; logs anomaly incident. | Rejects bet placement. |
| **5. Extreme probability jump ($> 0.35$ in $1\text{s}$)** | `FREEZE ODDS` / `SUSPENDED` | Triggers volatility filter. | Suspends until 2 confirmation ticks arrive. |
| **6. Provider data returns after outage** | `RESUME AFTER VALIDATION` | Auto-thaws after 2 healthy ticks. | Re-enables betting with fresh server odds. |
| **7. Multi-provider conflict (Cricbuzz vs CREX)** | `DEGRADED` / `SUSPENDED` | Widens margin to $+8\%$ or suspends. | Limits max stake to $25\%$ of standard ceiling. |

---

## 10. Risk Engine Integration

- **Exposure & Liability Protection**: Fallback or degraded odds automatically enforce tighter risk constraints:
  - **Dynamic Margin Expansion**: Live overround increases from standard $5\%$ to $8\%$ during fallback or degraded feed states.
  - **Stake Ceilings**: Maximum allowable single-bet stake reduced by $50\%$ when `fallbackUsed === true`.
  - **Cashout Safety**: Live cashout calculations automatically suspended when real match feed is in `STALE` or `DEGRADED` state.
- **Financial Invariance**: No fallback or model state can mutate wallet balances, ledger entries, or settle open bets without verified final match scores.

---

## 11. Traceable Audit Events

The system records the following structured audit events to the database and structured logger:

- `ODDS_REAL_DATA_AVAILABLE`: Normal live feed operational.
- `ODDS_DATA_STALE`: Feed latency $> 2,500\text{ms}$.
- `ODDS_PROVIDER_DEGRADED`: Provider dropped or disagreement detected.
- `ODDS_FALLBACK_ACTIVATED`: Market switched to cached or deterministic fallback.
- `ODDS_PROVIDER_RECOVERING`: Provider restored; accumulating verification ticks.
- `ODDS_REAL_DATA_RESTORED`: Market resumed with real provider data.
- `ODDS_MARKET_SUSPENDED`: Market locked due to feed circuit breaker.
- `ODDS_MARKET_RESUMED`: Market unlocked post-validation.

---

## 12. Recommended Environment Configuration

```env
# Real Data & Provider Settings
ODDS_REAL_DATA_ENABLED=true
ODDS_PROVIDER_TIMEOUT_MS=2500
ODDS_PROVIDER_MAX_STALE_MS=5000
ODDS_PROVIDER_HEALTH_CHECK_INTERVAL_MS=10000

# Cache & Storage
ODDS_CACHE_ENABLED=true
ODDS_CACHE_TTL_MS=2000
ODDS_CACHE_MAX_AGE_MS=5000

# Fallback & Safety Controls
ODDS_FALLBACK_ENABLED=true
ODDS_FALLBACK_MODE=DETERMINISTIC_SAFE
ODDS_MAX_PROBABILITY_DELTA_PER_SEC=0.25
ODDS_MAX_VOLATILITY_THRESHOLD=0.35
ODDS_AUTO_RESUME_TICKS=2

# Risk & Margin Shading in Fallback
ODDS_FALLBACK_MARGIN_BOOST_PCT=0.03
ODDS_FALLBACK_MAX_STAKE_MULTIPLIER=0.50
```

---

## 13. Admin Operations UI Integration

Compatible with **[OddsIntelligenceDomainView.jsx](file:///Users/udayreddy/Desktop/betking/src/pages/admin/domains/OddsIntelligenceDomainView.jsx)** and existing AdminShell:

- **Provider Feed Status Cards**: Real-time display of Cricbuzz, CREX, ESPN, and 10Cric health, latency, and freshness.
- **Fallback Operations Panel**: Real-time counter of markets currently using fallback vs real feeds.
- **Circuit Breaker Monitor**: Shows active tripped suspensions and countdown of recovery ticks.
- **Manual Thaw & Freeze Controls**: Allows operators to manually freeze or thaw markets with full audit trail.

---

## 14. Verification & Testing Matrix

### 14.1 Unit Tests
- `provider available` $\to$ uses real model probability.
- `provider latency > 2500ms` $\to$ trips circuit breaker.
- `stale tick > 5000ms` $\to$ suspends market.
- `invalid schema / negative overs` $\to$ rejected with `INVALID_STATE`.
- `warm cache valid (< 2000ms)` $\to$ serves cached snapshot.
- `cache expired` $\to$ triggers live refresh.
- `provider recovery` $\to$ requires 2 healthy ticks before thaw.
- `volatility filter` $\to$ detects extreme probability jump.

### 14.2 Integration Tests
- Full pipeline: `Provider Update` $\to$ `Canonical State` $\to$ `OddsEngineV3` $\to$ `Public API` $\to$ `Bet Placement`.
- Outage failover: `Feed Down` $\to$ `Market SUSPENDED` $\to$ `Bet Placement Rejected (409)`.
- Recovery thaw: `Feed Restored` $\to$ `Validation Gate Passed` $\to$ `Market Re-opened`.

### 14.3 Financial Safety Tests
- Zero wallet balance mutations during feed transitions.
- Zero ledger record modifications.
- Idempotent settlement engine remains strictly isolated from live odds fallback.

---

## FINAL VERDICT

```text
CURRENT ENGINE TYPE:
HYBRID (External Provider Reference for Pre-match + Internal Deterministic Statistical Model for Live In-play + Shadow Bayesian Optimization Suite)

REAL DATA CURRENTLY AVAILABLE:
YES (Live Scraped Feeds from Cricbuzz, CREX, FanCode, 10Cric, ESPN are actively ingested; Synthetic SRL simulator is isolated for virtuals)

FALLBACK SYSTEM:
EXISTS (In-memory caching, feed circuit breakers, scorecard-only fallback, and automatic market suspension are implemented)

SAFE TO ADD REAL DATA + FALLBACK LOGIC:
YES (With explicit metadata lineage tagging, configurable recovery thresholds, and unified risk margin expansion)

RECOMMENDED NEXT STEP:
Implement the 9-phase Real Data & Fallback enhancement roadmap in non-modifying increments.
```

---

## Prioritized Implementation Roadmap

1. **Phase 1 — Provider Abstraction & Health Matrix**: Unify feed health metrics across Cricbuzz, CREX, ESPN, 10Cric.
2. **Phase 2 — Data Validation & Schema Sanitization**: Hard runtime guards against corrupt scores or anomalous timestamps.
3. **Phase 3 — Freshness & Staleness Detection**: Standardize circuit breaker timers ($2.5\text{s}$ latency, $5\text{s}$ hard freeze).
4. **Phase 4 — Unified Cache Layer**: Centralize in-memory and Redis snapshot caches with deterministic TTLs.
5. **Phase 5 — Deterministic Fallback & Safe Mode**: Enforce fallback hierarchy without randomized guessing.
6. **Phase 6 — Recovery & Gradual Thaw Policy**: Require $\ge 2$ consecutive valid ticks before auto-resuming suspended markets.
7. **Phase 7 — Audit Event Emission**: Emit structured fallback and thaw events to database and telemetry queues.
8. **Phase 8 — Admin Operations Dashboard Enhancements**: Add fallback status cards and provider telemetry to `OddsIntelligenceDomainView.jsx`.
9. **Phase 9 — Full Test Suite & VPS Staging Deployment**: Run 34+ test suites and deploy live to Hostinger VPS.
