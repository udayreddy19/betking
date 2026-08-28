# MY BETS — SETTLEMENT EVIDENCE & MATCH EVENT PROOF PRE-IMPLEMENTATION AUDIT

**Product**: OddsYra / BetKing  
**Audit Date**: 2026-08-29  
**Policy**: AUDIT → PRESERVE → EXTEND → VERIFY → DOCUMENT  
**Core Invariant**: AUTO_REPAIR = false. Zero modification to OddsEngineV3 pricing, wallet balances, ledger history, or settlement financial authority.

---

## 1. Runtime Flow Traceability Matrix

| Component | Source File | Call Site / Runtime Path | Classification |
|---|---|---|---|
| **Bet Placement** | `lib/betPlacementEngine.mjs` | `server/routes/bets.js:166` (`POST /api/bets/place`) | `IMPLEMENTED_AND_WIRED` |
| **Bet Records & Selections** | `bets`, `bet_selections` (PostgreSQL) | `lib/betPlacementEngine.mjs`, `server/routes/bets.js:45` | `IMPLEMENTED_AND_WIRED` |
| **OddsEngineV3** | `lib/odds-v3/OddsEngineV3.mjs` | `lib/aggregator.mjs`, `lib/betslipQuoteService.mjs` | `IMPLEMENTED_AND_WIRED` |
| **Market Definitions** | `lib/odds-v3/catalog/marketCatalog.mjs` | `lib/odds-v3/OddsEngineV3.mjs`, `lib/settlement/marketSettlementRegistry.mjs` | `IMPLEMENTED_AND_WIRED` |
| **Selection Resolver** | `lib/odds-v3/selectionResolver.mjs` | `lib/settlementRules.mjs`, `lib/liveMatchSettlement.mjs` | `IMPLEMENTED_AND_WIRED` |
| **Settlement Engine** | `lib/betSettlementEngine.mjs` | `lib/liveMatchSettlement.mjs:1390`, `workers/settlementWorker.mjs` | `IMPLEMENTED_AND_WIRED` |
| **Live Match Settlement Coordinator** | `lib/liveMatchSettlement.mjs` | `server/routes/bets.js:201`, `workers/liveMatchSettlementLoop.mjs` | `IMPLEMENTED_AND_WIRED` |
| **Result Ingestion (Ball-by-Ball)**| `lib/settlement/canonicalBallEvents.mjs` | `lib/liveMatchSettlement.mjs:30`, `lib/cricbuzzBallFeed.mjs` | `IMPLEMENTED_AND_WIRED` |
| **Over & Milestone Snapshot Store** | `lib/matchOverSnapshotStore.mjs` | `lib/liveMatchSettlement.mjs:12-21` | `IMPLEMENTED_AND_WIRED` |
| **Provider Integrations** | Cricbuzz, CREX, 10Cric, ESPN, FanCode | `lib/aggregator.mjs`, `lib/cricbuzzLiveScores.mjs` | `IMPLEMENTED_AND_WIRED` |
| **Wallet Payout & Wagering** | `lib/walletSettlement.mjs`, `lib/wageringRules.mjs` | `lib/betSettlementEngine.mjs:157` | `IMPLEMENTED_AND_WIRED` |
| **Double-Entry Ledger** | `ledger_entries` (PostgreSQL) | `lib/betSettlementEngine.mjs:240` | `IMPLEMENTED_AND_WIRED` |
| **My Bets API** | `server/routes/bets.js` (`/api/bets/mine`) | `src/context/BetSlipContext.jsx:161` | `IMPLEMENTED_AND_WIRED` |
| **My Bets UI Panel** | `src/components/MyBetsPanel/MyBetsPanel.jsx` | `src/components/Header/Header.jsx:677` | `IMPLEMENTED_AND_WIRED` |
| **Structured Settlement Evidence Engine** | `lib/settlementEvidence/` | *To be extended & connected* | `MISSING` (Target of this implementation) |

---

## 2. Existing Settlement Data Audit

1. **`bets` Table**:
   - `status`: `PENDING`, `WON`, `LOST`, `VOID`, `CASHED_OUT`
   - `settlement_reason`: Holds text summary (e.g. `over_18_i1_wickets=1_gt_0`, `runs_159_lt_162.5`)
   - `settled_at`: Timestamp of finalization
   - `actual_payout`: Decimal payout
   - `placement_snapshot`: Contains rich snapshot of match, leg names, lines, and handicaps at bet placement time.

2. **`match_ball_events` Table**:
   - Stores normalized legal & extra deliveries (`innings`, `over_number`, `ball_number`, `sequence_number`, `event_type`, `runs`, `wicket`, `raw_label`, `occurred_at`, `superseded_by`, `is_confirmed`).

3. **`match_over_snapshots` Table**:
   - Stores over boundaries: `innings`, `over_number`, `runs_in_over`, `wickets_in_over`, `runs_at_end`, `wickets_at_end`, `is_completed`.

4. **`settlement_events` Table**:
   - Stores immutable audit records: `bet_id`, `market_id`, `selection_id`, `result`, `payout`, `settlement_reason`, `settlement_rule`, `provider`, `provider_event_id`, `state_version`, `settlement_version`, `metadata`.

---

## 3. Implementation Plan for Settlement Evidence

1. **Modular Settlement Evidence Generators (`lib/settlementEvidence/`)**:
   - `wicketEvidence.mjs`: Over-by-over ball timeline and wicket fall event details (batter, bowler, dismissal).
   - `runsEvidence.mjs`: Ball-by-ball run accumulation for over totals / boundary markets.
   - `overEvidence.mjs`: Complete over boundary breakdown.
   - `scoreEvidence.mjs`: Innings score, target, and wicket milestones (e.g. 10th wicket / all-out).
   - `matchWinnerEvidence.mjs`: Final match score, margin of victory, Duckworth-Lewis/chase target confirmation.
   - `inningsEvidence.mjs`: Innings totals and team boundaries.
   - `playerEvidence.mjs`: Individual batter/bowler milestone verification.
   - `genericEvidence.mjs`: Clean fallback for non-cricket or generic markets.
   - `settlementEvidenceEngine.mjs`: Unified resolver dispatching to the appropriate generator based on market type, querying `match_ball_events`, `match_over_snapshots`, and `placement_snapshot`.

2. **Evidence Schema & Sanitization**:
   - Statuses: `VERIFIED`, `PENDING`, `EVIDENCE_UNAVAILABLE`, `CORRECTED`, `DISPUTED`.
   - Never exposes internal API keys, internal tokens, or secret infrastructure details.

3. **API Integration (`server/routes/bets.js`)**:
   - In `/api/bets/mine` and `/api/bets/:betId/evidence`, attach sanitized `settlement_evidence` structure.

4. **UI Integration (`src/components/MyBetsPanel/MyBetsPanel.jsx`)**:
   - Expandable, mobile-friendly **Settlement Evidence Accordion** with ball timeline (e.g. `18.1 •`, `18.2 •`, `18.3 W`), score when event occurred, participant names, verification timestamp, and verified status badge.

5. **Historical Bet Handling**:
   - If a settled bet lacks ball-by-ball records, returns `EVIDENCE_UNAVAILABLE` with clear friendly explanation without inventing synthetic ball timelines.
