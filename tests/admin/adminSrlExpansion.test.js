import { describe, it, expect } from 'vitest';
import {
  injectIPLSRLIncident,
  pinpointIPLSRLTarget,
  triggerIPLSRLTieGame,
  toggleIPLSRLRainDelay,
  reduceIPLSRLOvers,
  setIPLSRLMarginDefense,
  broadcastIPLSRLCommentary,
  bulkSettleIPLSRLMarkets,
  createIPLSRLCustomMatch,
  getIPLSRLControlSnapshot,
} from '../../lib/iplSrlAdminControl.mjs';

describe('Advanced OddsYra SRL Match Control Suite', () => {
  let testMatchId = 'srl_ipl_0';

  it('provides baseline snapshot with matches and teams', () => {
    const snap = getIPLSRLControlSnapshot();
    expect(snap).toBeDefined();
    expect(snap.matches.length).toBeGreaterThan(0);
    testMatchId = snap.matches[0].matchId;
  });

  it('queues and executes next-ball incident (WICKET, BOUNDARY 6, DOT)', () => {
    const resWicket = injectIPLSRLIncident(testMatchId, {
      type: 'WICKET',
      subType: 'Bowled',
      customCommentary: 'Test Bowled clean!',
      instant: false,
    }, 'test_admin');
    expect(resWicket.success).toBe(true);
    expect(resWicket.queued.type).toBe('WICKET');

    const resSix = injectIPLSRLIncident(testMatchId, {
      type: 'SIX',
      customCommentary: 'Test Sixer!',
      instant: true,
    }, 'test_admin');
    expect(resSix.delivery).toBeDefined();
    expect(resSix.delivery.outcome).toBe('SIX');
  });

  it('pinpoints target score for chase innings', () => {
    const snap = pinpointIPLSRLTarget(testMatchId, 185, 'test_admin');
    expect(snap).toBeDefined();
    const match = snap.matches.find((m) => m.matchId === testMatchId);
    expect(match).toBeDefined();
  });

  it('triggers tie game for Super Over', () => {
    const snap = triggerIPLSRLTieGame(testMatchId, 'test_admin');
    expect(snap).toBeDefined();
  });

  it('toggles rain delay stoppage and resumption', () => {
    const pausedSnap = toggleIPLSRLRainDelay(testMatchId, true, 'test_admin');
    const match = pausedSnap.matches.find((m) => m.matchId === testMatchId);
    expect(match.rainDelay).toBe(true);
    expect(match.bettingClosed).toBe(true);

    const resumedSnap = toggleIPLSRLRainDelay(testMatchId, false, 'test_admin');
    const resumedMatch = resumedSnap.matches.find((m) => m.matchId === testMatchId);
    expect(resumedMatch.rainDelay).toBe(false);
  });

  it('reduces match overs with automatic DLS target score calculation', () => {
    const snap = reduceIPLSRLOvers(testMatchId, 12, 'test_admin');
    const match = snap.matches.find((m) => m.matchId === testMatchId);
    expect(match.revisedOvers).toBe(12);
    expect(match.dlsTarget).toBeGreaterThan(0);
  });

  it('adjusts live margin defense and spread bias', () => {
    const res = setIPLSRLMarginDefense(testMatchId, {
      marginBump: 0.08,
      spreadBias: 0.04,
      autoFreezeThreshold: 75000,
    }, 'test_admin');
    expect(res.success).toBe(true);
    expect(res.marginDefense.marginBump).toBe(0.08);
    expect(res.marginDefense.spreadBias).toBe(0.04);
  });

  it('broadcasts breaking commentary with event tag', () => {
    const snap = broadcastIPLSRLCommentary(testMatchId, {
      text: 'Third umpire review in progress for caught behind!',
      eventTag: 'DRS_REVIEW',
    }, 'test_admin');
    const match = snap.matches.find((m) => m.matchId === testMatchId);
    expect(match.customCommentary.text).toContain('Third umpire review');
    expect(match.customCommentary.eventTag).toBe('DRS_REVIEW');
  });

  it('supports 1-click bulk settlement for toss markets', async () => {
    const res = await bulkSettleIPLSRLMarkets(testMatchId, 'toss', 'test_admin');
    expect(res.success).toBe(true);
    expect(res.settledCount).toBe(2);
  });

  it('creates custom exhibition match', () => {
    const res = createIPLSRLCustomMatch({
      homeTeamId: 'csk',
      awayTeamId: 'mi',
      venue: 'Wankhede SRL Stadium',
      pitch: 'BATTING_PARADISE',
    }, 'test_admin');
    expect(res.success).toBe(true);
    expect(res.match.id).toContain('srl_custom_');
    expect(res.match.stageLabel).toBe('Exhibition');
  });
});
