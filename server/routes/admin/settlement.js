import { Router } from 'express';
import { requireRole } from '../../middleware/adminAuth.js';
import { query } from '../../../db/pg.js';

const router = Router();

router.get('/api/admin/settlement/bet/:betId', requireRole('SUPER_ADMIN', 'FINANCE_ADMIN', 'OPERATIONS_ADMIN', 'TRADING_ADMIN'), async (req, res) => {
  try {
    const betId = req.params.betId;
    const betRes = await query('SELECT * FROM bets WHERE bet_id = $1', [betId]);
    if (!betRes.rows[0]) {
      return res.status(404).json({ error: 'Bet not found' });
    }
    const bet = betRes.rows[0];

    const legsRes = await query(
      `SELECT * FROM bet_selections WHERE bet_id = $1 ORDER BY created_at ASC`,
      [betId],
    );

    const historyRes = await query(
      `SELECT * FROM bet_status_history WHERE bet_id = $1 ORDER BY created_at ASC`,
      [betId],
    );

    const txRes = await query(
      `SELECT * FROM transactions
       WHERE user_id = $1 AND transaction_id IN ($2, $3)
       ORDER BY created_at ASC`,
      [bet.user_id, `tx_payout_${betId}`, `tx_lost_${betId}`],
    );

    let ledgerEntry = null;
    if (txRes.rows[0]) {
      const ledgerRes = await query(
        `SELECT * FROM ledger_entries WHERE transaction_id = $1 LIMIT 1`,
        [txRes.rows[0].transaction_id],
      );
      ledgerEntry = ledgerRes.rows[0] || null;
    }

    let settlementEvents = [];
    try {
      const seRes = await query(
        `SELECT * FROM settlement_events WHERE bet_id = $1 ORDER BY settled_at ASC`,
        [betId],
      );
      settlementEvents = seRes.rows;
    } catch { /* pre-migration */ }

    let ballEvents = [];
    try {
      const beRes = await query(
        `SELECT * FROM match_ball_events
         WHERE canonical_match_id = $1 AND superseded_by IS NULL
         ORDER BY sequence_number ASC LIMIT 200`,
        [bet.match_id],
      );
      ballEvents = beRes.rows;
    } catch { /* pre-migration */ }

    let currentMatchState = null;
    try {
      const { aggregateLiveScores } = await import('../../../lib/aggregator.mjs');
      const { buildSettlementMatchState } = await import('../../../lib/liveMatchSettlement.mjs');
      const snap = await aggregateLiveScores({ force: false });
      const match = (snap?.matches || []).find((m) =>
        String(m.id) === String(bet.match_id) || String(m.matchId) === String(bet.match_id));
      if (match) currentMatchState = buildSettlementMatchState(match);
    } catch {
      currentMatchState = null;
    }

    const placementSnapshot = bet.placement_snapshot
      ? (typeof bet.placement_snapshot === 'string' ? JSON.parse(bet.placement_snapshot) : bet.placement_snapshot)
      : null;

    const { parseMilestoneOverMarket } = await import('../../../lib/settlement/milestoneMarketParser.mjs');
    const { isMilestoneBoundaryReached, getInningsOversString } = await import('../../../lib/settlement/overBoundary.mjs');
    const { resolveMilestoneScore } = await import('../../../lib/settlement/milestoneScoreResolver.mjs');
    const { lookupMatchForSettlement } = await import('../../../lib/settlement/resolveCanonicalMatchIdForSettlement.mjs');
    const { evaluateBetForSettlement } = await import('../../../lib/liveMatchSettlement.mjs');
    const { resolveSettlementLine } = await import('../../../lib/settlement/placementContext.mjs');

    const marketParsed = parseMilestoneOverMarket(bet.market_id, bet);
    const canonical = lookupMatchForSettlement(new Map(), new Map(), bet.match_id);
    const innings = marketParsed?.innings ?? 1;
    const targetOver = marketParsed?.targetOver ?? 10;
    const boundaryReached = currentMatchState
      ? isMilestoneBoundaryReached(currentMatchState, innings, targetOver)
      : false;
    const boundaryScore = boundaryReached
      ? await resolveMilestoneScore({
        match: currentMatchState,
        matchId: bet.match_id,
        innings,
        targetOver,
        betId: bet.bet_id,
        marketId: bet.market_id,
      })
      : { score: null, scoreSource: 'none', boundaryReached: false };

    let evaluationResult = null;
    if (currentMatchState) {
      evaluationResult = await evaluateBetForSettlement(bet, () => currentMatchState);
    }

    res.json({
      betId: bet.bet_id,
      bet,
      legs: legsRes.rows,
      marketId: bet.market_id,
      marketType: marketParsed?.marketType ?? null,
      selection: bet.selection_id,
      line: resolveSettlementLine(bet, bet.selection_id, legsRes.rows[0]?.selection_name) ?? marketParsed?.line ?? null,
      innings,
      targetOver,
      canonicalMatchId: canonical.canonicalMatchId || bet.match_id,
      currentMatchState,
      boundaryReached,
      boundaryScore: boundaryScore.score,
      scoreSource: boundaryScore.scoreSource,
      evaluator: marketParsed ? 'milestoneOverEvaluator' : null,
      evaluationResult,
      settlementStatus: bet.status,
      settlementAttemptCount: settlementEvents.length,
      lastSettlementAttempt: settlementEvents[settlementEvents.length - 1]?.settled_at ?? null,
      lastSettlementError: null,
      settlementEvents,
      settlementTransactionId: txRes.rows[0]?.transaction_id ?? null,
      placementSnapshot,
      settlementState: {
        status: bet.status,
        settledAt: bet.settled_at,
        actualPayout: bet.actual_payout,
        settlementReason: bet.settlement_reason,
        settlementVersion: bet.settlement_version,
      },
      settlementHistory: historyRes.rows,
      providerEvents: ballEvents,
      walletTransaction: txRes.rows[0] || null,
      ledgerEntry,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/admin/settlement/bet/:betId/repair-winnings', requireRole('SUPER_ADMIN', 'FINANCE_ADMIN', 'OPERATIONS_ADMIN', 'TRADING_ADMIN'), async (req, res) => {
  try {
    const { withTransaction } = await import('../../../db/pg.js');
    const { repairUnderCreditedWinningsForBet } = await import('../../../lib/walletSettlement.mjs');
    const result = await withTransaction((client) => repairUnderCreditedWinningsForBet(req.params.betId, client));
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/admin/settlement/pending', requireRole('SUPER_ADMIN', 'FINANCE_ADMIN', 'OPERATIONS_ADMIN', 'TRADING_ADMIN'), async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const betsRes = await query(
      `SELECT bet_id, user_id, match_id, market_id, selection_id, stake, odds, status, created_at
       FROM bets WHERE UPPER(status) IN ('ACCEPTED', 'PENDING', 'OPEN')
       ORDER BY created_at ASC LIMIT $1`,
      [limit],
    );
    const { getPendingSettlementJobs } = await import('../../../lib/settlement/settlementQueue.mjs');
    const jobs = await getPendingSettlementJobs(limit);
    res.json({ pendingBets: betsRes.rows, pendingJobs: jobs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/admin/settlement/failed', requireRole('SUPER_ADMIN', 'FINANCE_ADMIN', 'OPERATIONS_ADMIN', 'TRADING_ADMIN'), async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const { getFailedSettlementJobs } = await import('../../../lib/settlement/settlementQueue.mjs');
    const jobs = await getFailedSettlementJobs(limit);
    const casesRes = await query(
      `SELECT * FROM reconciliation_cases
       WHERE reconciliation_type = 'SETTLEMENT_FAILED'
       ORDER BY created_at DESC LIMIT $1`,
      [limit],
    );
    res.json({ failedJobs: jobs, reconciliationCases: casesRes.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/admin/settlement/retry/:jobId', requireRole('SUPER_ADMIN', 'FINANCE_ADMIN', 'OPERATIONS_ADMIN', 'TRADING_ADMIN'), async (req, res) => {
  try {
    const { retrySettlementJob } = await import('../../../lib/settlement/settlementQueue.mjs');
    const row = await retrySettlementJob(req.params.jobId);
    if (!row) return res.status(404).json({ error: 'Job not found or not retryable' });
    res.json({ success: true, jobId: row.job_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/admin/settlement/replay/:betId', requireRole('SUPER_ADMIN', 'FINANCE_ADMIN', 'OPERATIONS_ADMIN', 'TRADING_ADMIN'), async (req, res) => {
  try {
    const betRes = await query('SELECT * FROM bets WHERE bet_id = $1', [req.params.betId]);
    if (!betRes.rows[0]) return res.status(404).json({ error: 'Bet not found' });

    const { aggregateLiveScores } = await import('../../../lib/aggregator.mjs');
    const { matchIdAliases } = await import('../../../lib/matchIdPublic.mjs');
    const { replayBetSettlement } = await import('../../../lib/settlement/settlementReplay.mjs');

    const snap = await aggregateLiveScores({ force: true });
    const byId = new Map();
    for (const m of snap?.matches || []) {
      for (const alias of [m.id, m.matchId, ...(matchIdAliases(m.id || m.matchId) || [])]) {
        if (alias) byId.set(String(alias), m);
      }
    }
    const matchLookup = (id) => byId.get(String(id)) || null;

    const replay = await replayBetSettlement({ bet: betRes.rows[0], matchLookup });
    res.json(replay);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/admin/settlement/reversals', requireRole('SUPER_ADMIN', 'FINANCE_ADMIN', 'OPERATIONS_ADMIN', 'TRADING_ADMIN'), async (req, res) => {
  try {
    const { listPendingReversals } = await import('../../../lib/settlement/settlementReversal.mjs');
    const rows = await listPendingReversals(Number(req.query.limit) || 100);
    res.json({ reversals: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/admin/settlement/reversal/request', requireRole('SUPER_ADMIN', 'FINANCE_ADMIN', 'OPERATIONS_ADMIN', 'TRADING_ADMIN'), async (req, res) => {
  try {
    const { betId, reason, newResult } = req.body || {};
    const { requestSettlementReversal } = await import('../../../lib/settlement/settlementReversal.mjs');
    const result = await requestSettlementReversal({
      betId,
      reason,
      newResult,
      requestedBy: req.admin?.id || req.user?.userId || 'admin',
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/api/admin/settlement/reversal/:correctionId/approve', requireRole('SUPER_ADMIN', 'FINANCE_ADMIN', 'OPERATIONS_ADMIN', 'TRADING_ADMIN'), async (req, res) => {
  try {
    const { approveSettlementReversal } = await import('../../../lib/settlement/settlementReversal.mjs');
    const row = await approveSettlementReversal({
      correctionId: req.params.correctionId,
      adminId: req.admin?.sub || 'admin',
      adjustmentAmount: req.body?.adjustmentAmount,
      notes: req.body?.notes || '',
    });
    res.json(row);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/api/admin/settlement/reversal/:correctionId/execute', requireRole('SUPER_ADMIN', 'FINANCE_ADMIN', 'OPERATIONS_ADMIN', 'TRADING_ADMIN'), async (req, res) => {
  try {
    const { executeSettlementReversal } = await import('../../../lib/settlement/settlementReversal.mjs');
    const result = await executeSettlementReversal({
      correctionId: req.params.correctionId,
      adminId: req.admin?.sub || 'admin',
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/api/admin/settlement/reversal/:correctionId/reject', requireRole('SUPER_ADMIN', 'FINANCE_ADMIN', 'OPERATIONS_ADMIN', 'TRADING_ADMIN'), async (req, res) => {
  try {
    const { rejectSettlementReversal } = await import('../../../lib/settlement/settlementReversal.mjs');
    const result = await rejectSettlementReversal({
      correctionId: req.params.correctionId,
      adminId: req.admin?.sub || 'admin',
      reason: req.body?.reason || '',
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/api/admin/settlement/jobs/:jobId/retry', requireRole('SUPER_ADMIN', 'FINANCE_ADMIN', 'OPERATIONS_ADMIN', 'TRADING_ADMIN'), async (req, res) => {
  try {
    const { retrySettlementJob } = await import('../../../lib/settlement/settlementQueue.mjs');
    const row = await retrySettlementJob(req.params.jobId);
    if (!row) return res.status(404).json({ error: 'Job not found or not retryable' });
    res.json({ success: true, jobId: row.job_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/admin/settlement/recover-dead-letters', requireRole('SUPER_ADMIN', 'FINANCE_ADMIN', 'OPERATIONS_ADMIN', 'TRADING_ADMIN'), async (req, res) => {
  try {
    const jobLimit = Math.min(Number(req.body?.jobLimit) || 50, 200);
    const openBetLimit = Math.min(Number(req.body?.openBetLimit) || 200, 500);
    const { runSettlementDeadLetterRecovery } = await import('../../../lib/settlement/settlementDeadLetterRecovery.mjs');
    const result = await runSettlementDeadLetterRecovery({ jobLimit, openBetLimit });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/admin/settlement/orphan-open-bets', requireRole('SUPER_ADMIN', 'FINANCE_ADMIN', 'OPERATIONS_ADMIN', 'TRADING_ADMIN'), async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const { findOrphanOpenSettlementBets } = await import('../../../lib/settlement/settlementHealth.mjs');
    const rows = await findOrphanOpenSettlementBets({ limit });
    res.json({ count: rows.length, bets: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/settlement/dry-run — Preflight settlement preview
router.post('/api/admin/settlement/dry-run', requireRole('SUPER_ADMIN', 'FINANCE_ADMIN', 'TRADING_ADMIN'), async (req, res) => {
  try {
    const { matchId, marketId, winningSelectionId, outcome } = req.body || {};
    if (!matchId || !marketId) {
      return res.status(400).json({ error: 'matchId and marketId are required for dry-run simulation' });
    }
    const { simulateMarketSettlement } = await import('../../../lib/settlementDryRun.mjs');
    const preview = await simulateMarketSettlement(matchId, marketId, winningSelectionId, outcome);
    res.json({ success: true, ...preview });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/settlement/review-queue — Operational review queue for blocked/conflicting/stale bets
router.get('/api/admin/settlement/review-queue', requireRole('SUPER_ADMIN', 'FINANCE_ADMIN', 'OPERATIONS_ADMIN', 'TRADING_ADMIN'), async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const { queryRead } = await import('../../../db/pg.js');
    const { aggregateLiveScores } = await import('../../../lib/aggregator.mjs');
    const { getCachedCanonicalMatchState } = await import('../../../lib/matchStateCache.mjs');
    const { evaluateSettlementConfidence } = await import('../../../lib/settlement/settlementConfidenceEngine.mjs');

    const openBets = (await queryRead(
      `SELECT * FROM bets
       WHERE UPPER(status) IN ('PENDING', 'ACCEPTED', 'OPEN')
       ORDER BY created_at ASC LIMIT $1`,
      [limit],
    )).rows;

    const snap = await aggregateLiveScores({ force: false });
    const liveMatches = new Map((snap?.matches || []).map((m) => [String(m.id || m.matchId), m]));

    const reviewItems = [];

    for (const bet of openBets) {
      const match = liveMatches.get(String(bet.match_id)) || (await getCachedCanonicalMatchState(bet.match_id));
      const confidence = evaluateSettlementConfidence({
        match,
        bet,
        marketContext: { marketId: bet.market_id },
        providerObservations: match?.providerObservations || [],
      });

      if (!confidence.settlementAllowed || confidence.confidence !== 'CONFIRMED') {
        reviewItems.push({
          betId: bet.bet_id,
          userId: bet.user_id,
          matchId: bet.match_id,
          marketId: bet.market_id,
          selectionId: bet.selection_id,
          stake: bet.stake,
          odds: bet.accepted_odds || bet.odds,
          status: bet.status,
          confidence: confidence.confidence,
          finality: confidence.finality,
          settlementAllowed: confidence.settlementAllowed,
          reasons: confidence.reasons,
          evidence: confidence.evidence,
          providerConsensus: confidence.providerConsensus,
          checkedAt: confidence.checkedAt,
        });
      }
    }

    res.json({
      count: reviewItems.length,
      totalOpenChecked: openBets.length,
      items: reviewItems,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/settlement/blocked — Alias for review-queue exposing all blocked settlements
router.get('/api/admin/settlement/blocked', requireRole('SUPER_ADMIN', 'FINANCE_ADMIN', 'OPERATIONS_ADMIN', 'TRADING_ADMIN'), async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const { queryRead } = await import('../../../db/pg.js');
    const { aggregateLiveScores } = await import('../../../lib/aggregator.mjs');
    const { getCachedCanonicalMatchState } = await import('../../../lib/matchStateCache.mjs');
    const { evaluateSettlementConfidence } = await import('../../../lib/settlement/settlementConfidenceEngine.mjs');

    const openBets = (await queryRead(
      `SELECT * FROM bets
       WHERE UPPER(status) IN ('PENDING', 'ACCEPTED', 'OPEN')
       ORDER BY created_at ASC LIMIT $1`,
      [limit],
    )).rows;

    const snap = await aggregateLiveScores({ force: false });
    const liveMatches = new Map((snap?.matches || []).map((m) => [String(m.id || m.matchId), m]));

    const blockedItems = [];

    for (const bet of openBets) {
      const match = liveMatches.get(String(bet.match_id)) || (await getCachedCanonicalMatchState(bet.match_id));
      const confidence = evaluateSettlementConfidence({
        match,
        bet,
        marketContext: { marketId: bet.market_id },
        providerObservations: match?.providerObservations || [],
      });

      if (!confidence.settlementAllowed) {
        blockedItems.push({
          betId: bet.bet_id,
          userId: bet.user_id,
          matchId: bet.match_id,
          marketId: bet.market_id,
          selectionId: bet.selection_id,
          stake: bet.stake,
          odds: bet.accepted_odds || bet.odds,
          status: bet.status,
          confidenceState: confidence.confidenceState,
          finalityState: confidence.finalityState,
          settlementAllowed: confidence.settlementAllowed,
          reasons: confidence.settlementReasonCodes,
          evidence: confidence.freshness,
          providerConsensus: confidence.providerConsensus,
          firstBlockedAt: bet.created_at,
          lastEvaluatedAt: confidence.evaluatedAt,
        });
      }
    }

    res.json({
      count: blockedItems.length,
      totalOpenChecked: openBets.length,
      blockedBets: blockedItems,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/settlement/confidence/match/:matchId — Match-level confidence assessment
router.get('/api/admin/settlement/confidence/match/:matchId', requireRole('SUPER_ADMIN', 'FINANCE_ADMIN', 'OPERATIONS_ADMIN', 'TRADING_ADMIN'), async (req, res) => {
  try {
    const matchId = req.params.matchId;
    const { aggregateLiveScores } = await import('../../../lib/aggregator.mjs');
    const { getCachedCanonicalMatchState } = await import('../../../lib/matchStateCache.mjs');
    const { evaluateSettlementConfidence } = await import('../../../lib/settlement/settlementConfidenceEngine.mjs');

    const snap = await aggregateLiveScores({ force: false });
    const match = (snap?.matches || []).find((m) => String(m.id || m.matchId) === String(matchId))
      || (await getCachedCanonicalMatchState(matchId));

    const assessment = evaluateSettlementConfidence({
      match,
      marketContext: { marketType: 'MATCH_WINNER' },
      providerObservations: match?.providerObservations || [],
    });

    res.json(assessment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/settlement/provider-conflicts/:matchId — Multi-provider conflict inspection
router.get('/api/admin/settlement/provider-conflicts/:matchId', requireRole('SUPER_ADMIN', 'FINANCE_ADMIN', 'OPERATIONS_ADMIN', 'TRADING_ADMIN'), async (req, res) => {
  try {
    const matchId = req.params.matchId;
    const { aggregateLiveScores } = await import('../../../lib/aggregator.mjs');
    const { getCachedCanonicalMatchState } = await import('../../../lib/matchStateCache.mjs');
    const { evaluateProviderConsensus } = await import('../../../lib/settlement/settlementConfidenceEngine.mjs');

    const snap = await aggregateLiveScores({ force: false });
    const match = (snap?.matches || []).find((m) => String(m.id || m.matchId) === String(matchId))
      || (await getCachedCanonicalMatchState(matchId));

    const observations = match?.providerObservations || [];
    const consensus = evaluateProviderConsensus(observations);

    res.json({
      matchId,
      providersAvailable: consensus.providersAvailable,
      providersAgree: consensus.providersAgree,
      conflictingFields: consensus.conflictingFields,
      observations: consensus.observations,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
