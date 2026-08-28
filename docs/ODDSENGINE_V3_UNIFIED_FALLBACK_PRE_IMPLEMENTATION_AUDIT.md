# ODDSENGINE V3 — UNIFIED FALLBACK PRE-IMPLEMENTATION AUDIT

**Product**: OddsYra / BetKing  
**Audit Date**: 2026-08-28  
**Policy**: AUDIT → PRESERVE → EXTEND → SHADOW → PROTECT → VERIFY → DOCUMENT  
**Authoritative Production Engine**: `OddsEngineV3 v3.1-prod`  

---

## 1. Provider Integrations & Runtime Wiring Audit

| Provider Feed | Source Implementation File | Live Score | Ball-by-Ball | Pre-Match Odds | Settlement Result | Production Runtime Wired? | Classification |
|---|---|---|---|---|---|---|---|
| **Cricbuzz** | `lib/cricbuzzLiveScores.mjs` & `lib/cricbuzzBallFeed.mjs` | **YES** | **YES** | NO | **YES** | **YES** (`lib/aggregator.mjs:22`) | `IMPLEMENTED_AND_RUNTIME_WIRED` |
| **CREX** | `lib/crexCricketProvider.mjs` | **YES** | NO | NO | **YES** | **YES** (`lib/aggregator.mjs:26`) | `IMPLEMENTED_AND_RUNTIME_WIRED` |
| **10Cric** | `lib/providers/tencricProvider.mjs` | NO | NO | **YES** | NO | **YES** (`lib/aggregator.mjs:30`) | `IMPLEMENTED_AND_RUNTIME_WIRED` |
| **ESPN** | `lib/espnLiveScores.mjs` | **YES** | NO | NO | **YES** | **YES** (`lib/aggregator.mjs:34`) | `IMPLEMENTED_AND_RUNTIME_WIRED` |
| **FanCode** | `lib/fancodeLiveScores.mjs` | **YES** | NO | NO | **YES** | **YES** (`lib/aggregator.mjs:28`) | `IMPLEMENTED_AND_RUNTIME_WIRED` |
| **SRL Simulator** | `lib/iplSrlSimulator.mjs` | **YES** | **YES** | **YES** | **YES** | **YES** (`lib/eventEngine.mjs:12`) | `IMPLEMENTED_AND_RUNTIME_WIRED (Virtuals)` |

---

## 2. Core Architecture File Inventory

- **Authoritative Engine**: `lib/odds-v3/OddsEngineV3.mjs`
- **Canonical Match State**: `lib/odds-v3/models/CanonicalMatchState.mjs` & `lib/odds-v3/buildCanonicalFromMatch.mjs`
- **Provider Aggregator**: `lib/aggregator.mjs`
- **Circuit Breaker**: `lib/odds-v3/circuitBreaker.mjs`
- **Caching**: `lib/liveScoresApiHandlers.mjs` (`matchOddsCache`, $2\text{s}$ TTL) & `_cachedScores` ($3\text{s}$ TTL)
- **Probability Model**: `lib/odds-v3/pricing/ProbabilityModel.mjs`
- **Odds & Margin Calculators**: `lib/odds-v3/pricing/OddsCalculator.mjs` & `MarginCalculator.mjs`
- **Public API Route**: `server/routes/public/odds.js`
- **WebSocket Broadcast**: `lib/websocketEngine.mjs`
- **Bet Placement Re-quote**: `lib/betPlacementEngine.mjs` & `lib/oddsQuoteService.mjs`
- **Settlement Engine**: `lib/liveMatchSettlement.mjs`

---

## 3. Fallback Mechanisms Reality Classification

| Mechanism | Current File | Status | Notes |
|---|---|---|---|
| **Multi-Provider Ranking Failover** | `lib/aggregator.mjs` | `IMPLEMENTED_AND_RUNTIME_WIRED` | Cricbuzz (Rank 50) $\to$ CREX (40) $\to$ FanCode (30) $\to$ 10Cric (20) $\to$ ESPN (10). |
| **In-Memory Cache Fallback** | `lib/liveScoresApiHandlers.mjs` | `IMPLEMENTED_AND_RUNTIME_WIRED` | Serves warm snapshot ($2\text{s}$ TTL) with in-flight deduplication. |
| **Circuit Breaker Auto-Suspension** | `lib/odds-v3/circuitBreaker.mjs` | `IMPLEMENTED_AND_RUNTIME_WIRED` | Trips on latency $> 2.5\text{s}$ or tick age $> 5.0\text{s}$. |
| **Deterministic Cricket Chase Model**| `lib/odds-v3/pricing/ProbabilityModel.mjs` | `IMPLEMENTED_AND_RUNTIME_WIRED` | Active for live cricket chases ($rr$ ratio and $wf$). |
| **Pre-match Missing Odds Suspension**| `lib/odds-v3/markets/MatchWinnerMarket.mjs`| `IMPLEMENTED_AND_RUNTIME_WIRED` | Suspends pre-match markets if no provider reference odds exist. |
| **Central Data Availability Router**| Proposed: `lib/odds-v3/pricing/dataAvailabilityRouter.mjs` | `DOCUMENTATION_ONLY` | Needs central module to coordinate 5-tier decisions. |
| **Central Provider Health Engine** | Proposed: `lib/odds-v3/providers/providerHealthEngine.mjs` | `PARTIALLY_WIRED` | Diagnostic evaluator exists (`providerQualityEngine.mjs`); central state machine needed. |
| **Market-Specific Fallback Rules** | Proposed | `DOCUMENTATION_ONLY` | Rules allowing match winner while suspending ball-by-ball need unification. |
| **2-Tick Thaw Policy Enforcement** | `lib/odds-v3/circuitBreaker.mjs` | `IMPLEMENTED_AND_RUNTIME_WIRED` | Requires 2 healthy ticks before resetting. |
| **Structured Audit Events Table** | Database sink | `MISSING` | Events currently logged to console/responses; table sink planned. |
