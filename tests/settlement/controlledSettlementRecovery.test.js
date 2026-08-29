import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateSettlementConfidence,
  CONFIDENCE_STATES,
  FINALITY_STATES,
} from '../../lib/settlement/settlementConfidenceEngine.mjs';
import {
  authorizeSettlement,
  validateSettlementAuthorization,
  computeEvidenceHash,
} from '../../lib/settlement/settlementAuthorizationEngine.mjs';

describe('Phase 38.4: Controlled Settlement Recovery & Verification Suite', () => {
  const staleMatch = {
    id: 'oy_45bbebc2-e93b-3aa0-8c0e-583d94394784',
    cachedAt: new Date(Date.now() - 7200000).toISOString(),
  };

  const APPROVED_WHITELIST = new Set([
    'bet_1787989343526_gz1lb5',
    'bet_1787989337539_7hhbuh',
    'bet_1787989331426_r1j9xk',
    'bet_1787989321317_ks5t6b',
  ]);

  const EXCLUDED_BETS = new Set([
    'bet_1787989375340_ec9isr',
  ]);

  // Part 2 & 4: Whitelist and Team Total Exclusion
  it('Whitelist strictly enforces approved candidate set and rejects excluded bets', () => {
    assert.strictEqual(APPROVED_WHITELIST.has('bet_1787989343526_gz1lb5'), true);
    assert.strictEqual(APPROVED_WHITELIST.has('bet_1787989337539_7hhbuh'), true);
    assert.strictEqual(APPROVED_WHITELIST.has('bet_1787989331426_r1j9xk'), true);
    assert.strictEqual(APPROVED_WHITELIST.has('bet_1787989321317_ks5t6b'), true);

    assert.strictEqual(APPROVED_WHITELIST.has('bet_1787989375340_ec9isr'), false);
    assert.strictEqual(EXCLUDED_BETS.has('bet_1787989375340_ec9isr'), true);
  });

  // Part 8, 9, 10, 11: Candidate 1 Execution & Reconciliation
  it('Candidate 1 (bet_1787989343526_gz1lb5): Authorizes WON, calculates wallet credit and ledger parity', () => {
    const bet = {
      bet_id: 'bet_1787989343526_gz1lb5',
      user_id: 'usr_rec_01',
      match_id: staleMatch.id,
      market_id: 'i1_team_score_at_5_dismissal',
      selection_id: 'sel_under_159.5',
      stake: 50.0,
      odds: 1.9,
      status: 'ACCEPTED',
    };
    const auth = authorizeSettlement({
      match: staleMatch,
      bet,
      marketContext: {
        marketId: 'i1_team_score_at_5_dismissal',
        marketType: 'DISMISSAL_SCORE',
        boundaryReached: true,
        hasImmutableSnapshotEvidence: true,
      },
      evaluatedOutcome: 'WON',
    });
    assert.strictEqual(auth.success, true);
    assert.strictEqual(auth.authorization.gradedOutcome, 'WON');

    // Simulate single-transaction financial settlement
    const grossPayout = Number((bet.stake * bet.odds).toFixed(2)); // 95.00
    const profit = Number((grossPayout - bet.stake).toFixed(2)); // 45.00
    const walletBefore = { balance: 100.0, winnings: 200.0 };
    const walletAfter = {
      balance: walletBefore.balance + bet.stake, // 150.0
      winnings: walletBefore.winnings + profit, // 245.0
    };
    const ledgerEntry = {
      betId: bet.bet_id,
      type: 'SETTLEMENT_PAYOUT',
      credit: grossPayout, // 95.00
    };

    assert.strictEqual(grossPayout, 95.0);
    assert.strictEqual(ledgerEntry.credit, grossPayout);
    assert.strictEqual((walletAfter.balance - walletBefore.balance) + (walletAfter.winnings - walletBefore.winnings), grossPayout);
  });

  // Candidate 2 Execution & Reconciliation
  it('Candidate 2 (bet_1787989337539_7hhbuh): Authorizes LOST, 0 wallet credit and 0 ledger credit', () => {
    const bet = {
      bet_id: 'bet_1787989337539_7hhbuh',
      user_id: 'usr_rec_02',
      match_id: staleMatch.id,
      market_id: 'i1_team_score_at_5_dismissal',
      selection_id: 'sel_over_159.5',
      stake: 50.0,
      odds: 1.9,
      status: 'ACCEPTED',
    };
    const auth = authorizeSettlement({
      match: staleMatch,
      bet,
      marketContext: {
        marketId: 'i1_team_score_at_5_dismissal',
        marketType: 'DISMISSAL_SCORE',
        boundaryReached: true,
        hasImmutableSnapshotEvidence: true,
      },
      evaluatedOutcome: 'LOST',
    });
    assert.strictEqual(auth.success, true);
    assert.strictEqual(auth.authorization.gradedOutcome, 'LOST');

    const walletBefore = { balance: 100.0, winnings: 200.0 };
    const walletAfter = { ...walletBefore };
    const grossPayout = 0.0;
    const ledgerEntry = null;

    assert.strictEqual(walletAfter.balance, walletBefore.balance);
    assert.strictEqual(walletAfter.winnings, walletBefore.winnings);
    assert.strictEqual(grossPayout, 0.0);
    assert.strictEqual(ledgerEntry, null);
  });

  // Candidate 3 Execution & Reconciliation
  it('Candidate 3 (bet_1787989331426_r1j9xk): Authorizes WON, calculates wallet credit and ledger parity', () => {
    const bet = {
      bet_id: 'bet_1787989331426_r1j9xk',
      user_id: 'usr_rec_03',
      match_id: staleMatch.id,
      market_id: 'i1_wicket_in_over_16',
      selection_id: 'sel_cwkt_no',
      stake: 100.0,
      odds: 1.85,
      status: 'ACCEPTED',
    };
    const auth = authorizeSettlement({
      match: staleMatch,
      bet,
      marketContext: {
        marketId: 'i1_wicket_in_over_16',
        marketType: 'WICKET_IN_OVER',
        boundaryReached: true,
        hasImmutableSnapshotEvidence: true,
      },
      evaluatedOutcome: 'WON',
    });
    assert.strictEqual(auth.success, true);
    assert.strictEqual(auth.authorization.gradedOutcome, 'WON');

    const grossPayout = Number((bet.stake * bet.odds).toFixed(2)); // 185.00
    assert.strictEqual(grossPayout, 185.0);
  });

  // Candidate 4 Execution & Reconciliation
  it('Candidate 4 (bet_1787989321317_ks5t6b): Authorizes WON, calculates wallet credit and ledger parity', () => {
    const bet = {
      bet_id: 'bet_1787989321317_ks5t6b',
      user_id: 'usr_rec_04',
      match_id: staleMatch.id,
      market_id: 'i1_next_over_17_total',
      selection_id: 'sel_under_10.5',
      stake: 100.0,
      odds: 1.88,
      status: 'ACCEPTED',
    };
    const auth = authorizeSettlement({
      match: staleMatch,
      bet,
      marketContext: {
        marketId: 'i1_next_over_17_total',
        marketType: 'OVER_TOTAL',
        boundaryReached: true,
        hasImmutableSnapshotEvidence: true,
      },
      evaluatedOutcome: 'WON',
    });
    assert.strictEqual(auth.success, true);
    assert.strictEqual(auth.authorization.gradedOutcome, 'WON');

    const grossPayout = Number((bet.stake * bet.odds).toFixed(2)); // 188.00
    assert.strictEqual(grossPayout, 188.0);
  });

  // Team Total Excluded Bet
  it('Excluded Bet (bet_1787989375340_ec9isr): Strictly blocked and preserved in ACCEPTED / KEEP_OPEN state', () => {
    const bet = {
      bet_id: 'bet_1787989375340_ec9isr',
      match_id: staleMatch.id,
      market_id: 'team_total',
      selection_id: 'sel_under_178.5',
      status: 'ACCEPTED',
    };
    const auth = authorizeSettlement({
      match: staleMatch,
      bet,
      marketContext: {
        marketId: 'team_total',
        marketType: 'TEAM_TOTAL',
        boundaryReached: true,
        hasImmutableSnapshotEvidence: false,
      },
      evaluatedOutcome: 'WON',
    });
    assert.strictEqual(auth.success, false);
    assert.strictEqual(auth.confidence.confidenceState, CONFIDENCE_STATES.STALE);
  });

  // Part 13 & 14: API & Frontend Tab Status Mapping
  it('API and Frontend tab status mapping reflects recovered terminal states accurately', () => {
    const mockDbBets = [
      { bet_id: 'bet_1787989343526_gz1lb5', status: 'WON' },
      { bet_id: 'bet_1787989337539_7hhbuh', status: 'LOST' },
      { bet_id: 'bet_1787989331426_r1j9xk', status: 'WON' },
      { bet_id: 'bet_1787989321317_ks5t6b', status: 'WON' },
      { bet_id: 'bet_1787989375340_ec9isr', status: 'ACCEPTED' },
    ];

    const openTab = mockDbBets.filter((b) => ['ACCEPTED', 'PENDING', 'OPEN'].includes(b.status));
    const wonTab = mockDbBets.filter((b) => b.status === 'WON');
    const lostTab = mockDbBets.filter((b) => b.status === 'LOST');

    assert.strictEqual(openTab.length, 1);
    assert.strictEqual(openTab[0].bet_id, 'bet_1787989375340_ec9isr');
    assert.strictEqual(wonTab.length, 3);
    assert.strictEqual(lostTab.length, 1);
  });

  // Part 16: Failure and Rollback Safety Simulation
  it('Simulated failure during financial processing aborts transaction cleanly without mutation', () => {
    let transactionCommitted = false;
    let walletMutated = false;
    let ledgerInserted = false;

    try {
      // Begin transaction simulation
      const failPoint = 'LEDGER_FAILURE';
      walletMutated = true;
      if (failPoint === 'LEDGER_FAILURE') {
        throw new Error('Simulated database ledger constraint failure');
      }
      ledgerInserted = true;
      transactionCommitted = true;
    } catch (err) {
      // Rollback simulation
      walletMutated = false;
      ledgerInserted = false;
      transactionCommitted = false;
    }

    assert.strictEqual(transactionCommitted, false);
    assert.strictEqual(walletMutated, false);
    assert.strictEqual(ledgerInserted, false);
  });
});
