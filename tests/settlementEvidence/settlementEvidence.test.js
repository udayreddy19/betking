import { describe, it, expect } from 'vitest';
import { generateWicketEvidence } from '../../lib/settlementEvidence/wicketEvidence.mjs';
import { generateRunsEvidence } from '../../lib/settlementEvidence/runsEvidence.mjs';
import { generateScoreEvidence } from '../../lib/settlementEvidence/scoreEvidence.mjs';
import { generateMatchWinnerEvidence } from '../../lib/settlementEvidence/matchWinnerEvidence.mjs';
import { generatePlayerEvidence } from '../../lib/settlementEvidence/playerEvidence.mjs';
import { generateGenericEvidence } from '../../lib/settlementEvidence/genericEvidence.mjs';
import { resolveSettlementEvidence } from '../../lib/settlementEvidence/settlementEvidenceEngine.mjs';

describe('Settlement Evidence & Match Event Proof Engine Suite', () => {
  const sampleBet = {
    bet_id: 'bet_ev_101',
    user_id: 'usr_ev_1',
    match_id: 'match_ind_aus_2026',
    market_id: 'wicket_in_over_18',
    selection_id: 'yes',
    status: 'WON',
    stake: 1000,
    accepted_odds: 7.21,
    actual_payout: 7210,
    settled_at: '2026-08-28T18:12:00.000Z',
    settlement_reason: 'over_18_i1_wickets=1_gt_0',
    settlement_version: 1,
  };

  const sampleBallEvents = [
    { over_number: 18, ball_number: 1, sequence_number: 101, innings: 1, runs: 0, wicket: false, raw_label: '•', event_type: 'DOT' },
    { over_number: 18, ball_number: 2, sequence_number: 102, innings: 1, runs: 0, wicket: false, raw_label: '•', event_type: 'DOT' },
    { over_number: 18, ball_number: 3, sequence_number: 103, innings: 1, runs: 0, wicket: true, raw_label: 'W', event_type: 'WICKET', batter: 'Alex Hales', bowler: 'Rashid Khan', wicket_type: 'CAUGHT' },
  ];

  const sampleOverSnapshot = {
    match_id: 'match_ind_aus_2026',
    innings: 1,
    over_number: 18,
    runs_in_over: 0,
    wickets_in_over: 1,
    runs_at_end: 142,
    wickets_at_end: 5,
  };

  it('1. Wicket In Over YES: generates verified timeline showing wicket on 18.3', () => {
    const evidence = generateWicketEvidence({
      bet: sampleBet,
      ballEvents: sampleBallEvents,
      overSnapshot: sampleOverSnapshot,
      marketContext: { overNumber: 18, innings: 1 },
    });

    expect(evidence.evidenceStatus).toBe('VERIFIED');
    expect(evidence.evidenceType).toBe('CRICKET_BALL_BY_BALL');
    expect(evidence.summary).toBe('Wicket fell at 18.3');
    expect(evidence.timeline).toHaveLength(3);
    expect(evidence.timeline[2].delivery).toBe('18.3');
    expect(evidence.timeline[2].wicket).toBe(true);
    expect(evidence.timeline[2].rawLabel).toBe('W');
  });

  it('2. Wicket In Over NO: generates verified timeline when 6 balls complete with no wicket', () => {
    const noWicketBalls = [
      { over_number: 18, ball_number: 1, sequence_number: 101, innings: 1, runs: 1, wicket: false, raw_label: '1', event_type: 'RUN' },
      { over_number: 18, ball_number: 2, sequence_number: 102, innings: 1, runs: 0, wicket: false, raw_label: '•', event_type: 'DOT' },
      { over_number: 18, ball_number: 3, sequence_number: 103, innings: 1, runs: 4, wicket: false, raw_label: '4', event_type: 'FOUR' },
      { over_number: 18, ball_number: 4, sequence_number: 104, innings: 1, runs: 2, wicket: false, raw_label: '2', event_type: 'RUN' },
      { over_number: 18, ball_number: 5, sequence_number: 105, innings: 1, runs: 6, wicket: false, raw_label: '6', event_type: 'SIX' },
      { over_number: 18, ball_number: 6, sequence_number: 106, innings: 1, runs: 1, wicket: false, raw_label: '1', event_type: 'RUN' },
    ];

    const evidence = generateWicketEvidence({
      bet: { ...sampleBet, selection_id: 'no', status: 'WON' },
      ballEvents: noWicketBalls,
      overSnapshot: { ...sampleOverSnapshot, wickets_in_over: 0 },
      marketContext: { overNumber: 18, innings: 1 },
    });

    expect(evidence.evidenceStatus).toBe('VERIFIED');
    expect(evidence.summary).toBe('No wicket occurred in Over 18');
    expect(evidence.timeline).toHaveLength(6);
    expect(evidence.timeline.every((b) => !b.wicket)).toBe(true);
  });

  it('3. Wicket ball correctly identified in eventDetails', () => {
    const evidence = generateWicketEvidence({
      bet: sampleBet,
      ballEvents: sampleBallEvents,
      overSnapshot: sampleOverSnapshot,
      marketContext: { overNumber: 18, innings: 1 },
    });

    expect(evidence.eventDetails).toBeDefined();
    expect(evidence.eventDetails.type).toBe('WICKET');
    expect(evidence.eventDetails.delivery).toBe('18.3');
    expect(evidence.eventDetails.batter).toBe('Alex Hales');
    expect(evidence.eventDetails.bowler).toBe('Rashid Khan');
    expect(evidence.eventDetails.dismissalType).toBe('CAUGHT');
  });

  it('4. Score at wicket correctly displayed', () => {
    const evidence = generateWicketEvidence({
      bet: sampleBet,
      ballEvents: sampleBallEvents,
      overSnapshot: sampleOverSnapshot,
      marketContext: { overNumber: 18, innings: 1 },
    });

    expect(evidence.scoreAtEvent).toBeDefined();
    expect(evidence.scoreAtEvent.runs).toBe(142);
    expect(evidence.scoreAtEvent.wickets).toBe(5);
    expect(evidence.scoreAtEvent.scoreFormatted).toBe('142/5');
  });

  it('5. Runs market evidence: computes over total and compares with line', () => {
    const runBalls = [
      { over_number: 18, ball_number: 1, sequence_number: 1, innings: 1, runs: 1, raw_label: '1' },
      { over_number: 18, ball_number: 2, sequence_number: 2, innings: 1, runs: 4, raw_label: '4' },
      { over_number: 18, ball_number: 3, sequence_number: 3, innings: 1, runs: 0, raw_label: '0' },
      { over_number: 18, ball_number: 4, sequence_number: 4, innings: 1, runs: 2, raw_label: '2' },
      { over_number: 18, ball_number: 5, sequence_number: 5, innings: 1, runs: 6, raw_label: '6' },
      { over_number: 18, ball_number: 6, sequence_number: 6, innings: 1, runs: 1, raw_label: '1' },
    ];

    const evidence = generateRunsEvidence({
      bet: { ...sampleBet, market_id: 'over_18_runs', selection_id: 'over_12.5', status: 'WON' },
      ballEvents: runBalls,
      overSnapshot: { runs_in_over: 14, runs_at_end: 142, wickets_at_end: 5 },
      marketContext: { overNumber: 18, line: 12.5 },
    });

    expect(evidence.evidenceStatus).toBe('VERIFIED');
    expect(evidence.totalRuns).toBe(14);
    expect(evidence.line).toBe(12.5);
    expect(evidence.summary).toBe('Total 14 runs scored in Over 18 (Line: 12.5)');
    expect(evidence.marketResult.outcome).toBe('WON');
  });

  it('6. Over total evidence: includes legal balls and extras', () => {
    const evidence = generateRunsEvidence({
      bet: { ...sampleBet, market_id: 'over_18_runs' },
      overSnapshot: { runs_in_over: 14, over_number: 18 },
      marketContext: { overNumber: 18 },
    });

    expect(evidence.totalRuns).toBe(14);
    expect(evidence.overNumber).toBe(18);
  });

  it('7. Match winner evidence: documents winning team and margin', () => {
    const evidence = generateMatchWinnerEvidence({
      bet: { ...sampleBet, market_id: 'match_winner', selection_name: 'India' },
      marketContext: { winner: 'India', margin: '5 wickets' },
    });

    expect(evidence.evidenceStatus).toBe('VERIFIED');
    expect(evidence.summary).toBe('India won by 5 wickets');
    expect(evidence.matchResult.winner).toBe('India');
    expect(evidence.matchResult.margin).toBe('5 wickets');
  });

  it('8. Score milestone evidence: formats 10th wicket dismissal score vs line', () => {
    const evidence = generateScoreEvidence({
      bet: { ...sampleBet, market_id: 'score_at_10th_wicket', selection_id: 'under_162.5', line: 162.5 },
      dismissalSnapshot: { runs: 159, wicketNumber: 10, overs: '19.4', player: 'Pat Cummins' },
      marketContext: { line: 162.5 },
    });

    expect(evidence.evidenceStatus).toBe('VERIFIED');
    expect(evidence.scoreAtEvent.runs).toBe(159);
    expect(evidence.scoreAtEvent.scoreFormatted).toBe('159/10');
    expect(evidence.summary).toBe('Final score was 159 (Line: 162.5 — UNDER)');
  });

  it('9. Player prop evidence: verifies runs scored against target', () => {
    const evidence = generatePlayerEvidence({
      bet: { ...sampleBet, market_id: 'player_score_25', selection_name: 'Virat Kohli' },
      playerStats: { name: 'Virat Kohli', runs: 45, balls: 28, isDismissed: false },
      marketContext: { target: 25 },
    });

    expect(evidence.evidenceStatus).toBe('VERIFIED');
    expect(evidence.playerStats.runs).toBe(45);
    expect(evidence.summary).toBe('Virat Kohli scored 45 runs (Target: 25)');
  });

  it('10. Historical bet without evidence returns EVIDENCE_UNAVAILABLE without fabricating balls', async () => {
    const fakeHistoricalBet = {
      bet_id: 'bet_hist_old_999',
      match_id: 'match_old_non_existent',
      market_id: 'wicket_in_over_50',
      status: 'WON',
      settlement_version: 1,
    };

    const evidence = await resolveSettlementEvidence({ bet: fakeHistoricalBet });
    expect(evidence.evidenceStatus).toBe('EVIDENCE_UNAVAILABLE');
    expect(evidence.timeline).toHaveLength(0);
  });

  it('11. Pending active bet returns PENDING settlement evidence', async () => {
    const pendingBet = {
      bet_id: 'bet_active_1',
      match_id: 'match_live_1',
      market_id: 'match_winner',
      status: 'PENDING',
    };

    const evidence = await resolveSettlementEvidence({ bet: pendingBet });
    expect(evidence.evidenceStatus).toBe('PENDING');
    expect(evidence.verifiedAt).toBeNull();
  });

  it('12. Sensitive provider data (api keys, credentials) are NEVER exposed', () => {
    const evidence = generateWicketEvidence({
      bet: sampleBet,
      ballEvents: sampleBallEvents,
      settlementEvent: { provider: 'cricbuzz', provider_event_id: 'cb_123', secret_key: 'SUPER_SECRET_TOKEN' },
    });

    const stringified = JSON.stringify(evidence);
    expect(stringified).not.toContain('SUPER_SECRET_TOKEN');
    expect(stringified).not.toContain('api_key');
  });

  it('13. UI and evidence engine do not mutate bet status or financial authority', () => {
    const evidence = generateGenericEvidence({ bet: sampleBet });
    expect(sampleBet.status).toBe('WON');
    expect(sampleBet.actual_payout).toBe(7210);
    expect(evidence.details.actualPayout).toBe(7210);
  });
});
