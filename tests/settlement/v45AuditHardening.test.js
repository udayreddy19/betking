import { describe, it, expect } from 'vitest';
import { isTencricEventFinished } from '../../lib/providers/tencricProvider.mjs';
import { resolveLiveMatchWinner } from '../../lib/liveMatchSettlement.mjs';
import { resolveMarketFinalityPolicy, evaluateSettlementConfidence } from '../../lib/settlement/settlementConfidenceEngine.mjs';
import { CashfreeProvider } from '../../lib/paymentProviders/CashfreeProvider.mjs';
import { classifyLiveFeedHealth } from '../../lib/liveFeedHealth.mjs';

describe('V4.5 audit hardening', () => {
  it('does not finish 10Cric events from isLive=false + scores alone', () => {
    expect(isTencricEventFinished({
      isLive: false,
      eventStatus: 'In Play',
      totalHomeScore: 120,
      totalAwayScore: 80,
    })).toBe(false);
    expect(isTencricEventFinished({
      isLive: false,
      eventStatus: 'FINISHED',
      totalHomeScore: 31,
      totalAwayScore: 28,
    })).toBe(true);
  });

  it('grades cricket chase ties as X not defending win', () => {
    const match = {
      sport: 'cricket',
      isCompleted: true,
      matchState: 'post',
      status: 'COMPLETED',
      team1: { name: 'India' },
      team2: { name: 'Australia' },
      liveDetails: {
        firstRuns: 150,
        chaseRuns: 150,
        chaseTeamName: 'Australia',
        firstTeamName: 'India',
      },
    };
    expect(resolveLiveMatchWinner(match)).toBe('X');
  });

  it('maps match_total to TEAM_TOTAL policy not MATCH_WINNER', () => {
    expect(resolveMarketFinalityPolicy('match_total')).toBe(
      resolveMarketFinalityPolicy('team_total'),
    );
    const mw = resolveMarketFinalityPolicy('match_winner');
    expect(mw.requireMatchFinal).toBe(true);
  });

  it('blocks match_winner settlement when match is still live', () => {
    const conf = evaluateSettlementConfidence({
      match: {
        id: 'm1',
        sport: 'cricket',
        isLive: true,
        matchState: 'in',
        status: 'LIVE',
        score1: 10,
        score2: 0,
      },
      bet: { market_id: 'match_winner', match_id: 'm1' },
      evaluatedOutcome: 'WON',
    });
    expect(conf.settlementAllowed).toBe(false);
    expect(conf.evidenceStatus).toBe('AWAITING_MATCH_FINAL');
  });

  it('Cashfree rejects webhooks when secret is missing', () => {
    const prev = process.env.CASHFREE_WEBHOOK_SECRET;
    const prev2 = process.env.CASHFREE_CLIENT_SECRET;
    const prev3 = process.env.CASHFREE_SECRET_KEY;
    delete process.env.CASHFREE_WEBHOOK_SECRET;
    delete process.env.CASHFREE_CLIENT_SECRET;
    delete process.env.CASHFREE_SECRET_KEY;
    try {
      const provider = new CashfreeProvider({});
      expect(provider.verifyWebhookSignature({
        rawBody: '{}',
        headers: { 'x-webhook-signature': 'x', 'x-webhook-timestamp': '1' },
      })).toBe(false);
    } finally {
      if (prev != null) process.env.CASHFREE_WEBHOOK_SECRET = prev;
      if (prev2 != null) process.env.CASHFREE_CLIENT_SECRET = prev2;
      if (prev3 != null) process.env.CASHFREE_SECRET_KEY = prev3;
    }
  });

  it('treats empty cricket primaries as degraded', () => {
    const err = classifyLiveFeedHealth({
      tencric: 'empty',
      crex: 'empty',
      cricbuzz: 'empty',
      fancode: 'ok',
      espn: 'ok',
      flashscore: 'ok',
      cricketguru: 'ok',
      cricketliveline: 'ok',
    });
    expect(err?.code).toBe('CRICKET_PRIMARIES_DEGRADED');
  });
});
