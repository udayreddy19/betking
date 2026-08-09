# IPLSRL Architecture & Integration Documentation

## Overview

**IPLSRL** (Indian Premier League Simulated Reality League) is a proprietary, virtual T20 cricket league engine embedded directly within the BetKing Enterprise Sportsbook application.

It operates as an end-to-end simulated sports competition, generating physics-based delivery outcomes, dynamic live odds, real-time scorecards, ball-by-ball commentary, and automated settlement while integrating directly into BetKing's existing probability, market, odds, risk, and cashout engines.

---

## Architectural Principles

1. **Integrated Core Stack**: Built entirely using existing technology (Node.js, Express, ES Modules, React, WebSockets, Context API, Vanilla CSS design tokens). Zero external frameworks or stack migrations.
2. **Reuse Existing Engines**: Reuses and extends:
   - `lib/probabilityEngine.mjs`
   - `lib/oddsEngine.mjs`
   - `lib/marketEngine.mjs`
   - `lib/settlementRules.mjs`
   - `lib/statisticsEngine.mjs`
   - `lib/analyticsEngine.mjs`
   - `lib/searchEngine.mjs`
   - `lib/favoritesEngine.mjs`
   - `lib/notificationEngine.mjs`
   - `lib/configEngine.mjs`
3. **Physics & Weighted Probability**: Delivery outcomes are generated via rating differentials (Batter vs. Bowler), pitch conditions, weather, required run rates, fatigue, and match situation. Scores are **never** randomly generated.
4. **Deterministic Reproducibility**: Seeded simulation (`mulberry32` PRNG) enables exact match replay and auditability.
5. **Clear Legal & IP Distinction**: Marked with a prominent **SIMULATED REALITY LEAGUE** badge across all UI components.

---

## Data Flow Pipeline

```
Admin Config / Scheduler
       │
       ▼
Season & Fixture Engine (lib/iplSrlEngine.mjs, lib/iplSrlFixtureEngine.mjs)
       │
       ▼
Match Initialization & Toss Engine (lib/iplSrlMatchEngine.mjs)
       │
       ▼
Physics & Probability Simulation Engine (lib/iplSrlSimulationEngine.mjs)
       │
 ┌─────┴──────────────────────────┬─────────────────────────┐
 │                                │                         │
 ▼                                ▼                         ▼
Ball Log Engine           Probability Engine         Commentary Engine
(lib/iplSrlBallEngine.mjs)  (lib/probabilityEngine.mjs) (lib/iplSrlCommentaryEngine.mjs)
 │                                │                         │
 └─────┬──────────────────────────┴─────────────────────────┘
       │
       ▼
Dynamic Market & Odds Engine (lib/marketEngine.mjs, lib/oddsEngine.mjs)
       │
       ├─────────────────────────┐
       ▼                         ▼
WebSocket Broadcast      Bet Slip & Cashout Engine
(lib/websocketEngine.mjs) (lib/cashoutEngine.mjs, AuthContext.jsx)
       │                         │
       ▼                         ▼
React Frontend UI        Bet Settlement Engine
(MatchCenter.jsx)        (lib/settlementRules.mjs)
```

---

## Component Architecture

| Module | Location | Description |
| :--- | :--- | :--- |
| **Module A** | `lib/iplSrlEngine.mjs` | Competition lifecycle (`DRAFT`, `SCHEDULED`, `ACTIVE`, `COMPLETED`, `ARCHIVED`), standings & playoffs. |
| **Module B** | `lib/iplSrlTeamEngine.mjs` | Franchise team CRUD, squad rosters, ratings, and venues. |
| **Module C** | `lib/iplSrlPlayerEngine.mjs` | Player model (roles: `BATTER`, `BOWLING_ALL_ROUNDER`, etc.), stats, and ratings. |
| **Module D** | `lib/iplSrlFormEngine.mjs` | Dynamic player form calculation from recent match metrics. |
| **Module E** | `lib/iplSrlFixtureEngine.mjs` | Round-robin league fixture generator and playoff bracket creator. |
| **Module F** | `lib/iplSrlMatchEngine.mjs` | Match state machine (`SCHEDULED`, `TOSS`, `LINEUP`, `IN_PROGRESS`, etc.). |
| **Module G** | `lib/iplSrlSimulationEngine.mjs` | Weighted probability ball delivery engine with deterministic seed support. |
| **Module H** | `lib/iplSrlBallEngine.mjs` | Delivery record logger and ball-by-ball history. |
| **Module I** | `lib/iplSrlScorecardEngine.mjs` | Detailed live and post-match scorecard builder. |
| **Module Y** | `lib/iplSrlCommentaryEngine.mjs` | Event-driven text commentary generator. |
| **Module V** | `src/pages/Admin/IPLSRL/IPLSRLAdmin.jsx` | Admin simulation panel, speed controls, team ratings, and audit logs. |
| **Module W** | `src/pages/IPLSRL/IPLSRLHome.jsx` | IPLSRL Competition Hub & match listings. |
| **Module X** | `src/pages/IPLSRL/IPLSRLMatchCenter.jsx` | Real-time live match center with win probability bar, pitch graphic & live odds. |

---

## REST & WebSocket APIs

### REST Endpoints
- `GET /api/iplsrl` - API status & version metadata
- `GET /api/iplsrl/seasons` - Active and past IPLSRL seasons
- `GET /api/iplsrl/teams` - Franchise teams and squad rosters
- `GET /api/iplsrl/players` - Players and performance stats
- `GET /api/iplsrl/standings` - Points table with NRR & match breakdown
- `GET /api/iplsrl/statistics` - Golden Bat / Golden Ball leaderboards
- `GET /api/iplsrl/records` - All-time competition records
- `POST /api/admin/iplsrl/matches/start` - Admin start match trigger
- `POST /api/admin/iplsrl/matches/pause` - Admin pause match trigger

### WebSocket Channels
- `iplsrl:match:{matchId}` - Match state delta updates
- `iplsrl:score:{matchId}` - Ball-by-ball score updates
- `iplsrl:odds:{matchId}` - Live dynamic odds stream
- `iplsrl:markets:{matchId}` - Market suspension & status updates
- `iplsrl:commentary:{matchId}` - Live commentary feed

---

## Verification & Auditability

The test runner script `lib/testIPLSRL.mjs` validates all 41 modules end-to-end:
```bash
node lib/testIPLSRL.mjs
```
Checks include team creation, player role validation, dynamic form calculation, fixture generation, toss execution, deterministic seed reproduction, scorecard formatting, commentary generation, probability calculation, odds adjustments, market suspension on wickets/boundaries, and settlement execution.
