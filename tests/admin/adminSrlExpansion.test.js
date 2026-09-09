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

  it('scripts a full 6-ball narrative over from preset and custom balls', async () => {
    const { scriptIPLSRLOver, OVER_BLUEPRINT_PRESETS } = await import('../../lib/iplSrlAdminControl.mjs');
    expect(OVER_BLUEPRINT_PRESETS.DEFEND_DEATH_OVER).toBeDefined();

    const presetRes = scriptIPLSRLOver(testMatchId, { preset: 'DEFEND_DEATH_OVER' }, 'test_admin');
    expect(presetRes.success).toBe(true);
    expect(presetRes.queuedCount).toBe(6);

    const customRes = scriptIPLSRLOver(testMatchId, {
      balls: [
        { type: 'DOT', runs: 0 },
        { type: 'SIX', runs: 6 },
        { type: 'WICKET', runs: 0, subType: 'caught' },
      ],
    }, 'test_admin');
    expect(customRes.success).toBe(true);
    expect(customRes.queuedCount).toBe(3);
  });

  it('toggles smart profit maximizer and sets target margin defense', async () => {
    const { toggleIPLSRLProfitMaximizer } = await import('../../lib/iplSrlAdminControl.mjs');
    const res = toggleIPLSRLProfitMaximizer(testMatchId, {
      enabled: true,
      targetMargin: 0.08,
      marginBump: 0.03,
    }, 'test_admin');
    expect(res.success).toBe(true);
    expect(res.defense.autoProfitMaximizer).toBe(true);
    expect(res.defense.targetMargin).toBe(0.08);

    const match = res.snapshot.matches.find((m) => m.matchId === testMatchId);
    expect(match.autoProfitMaximizer).toBe(true);
    expect(match.targetMargin).toBe(0.08);
  });

  it('simulates pre-match toss and sets starting lineup', async () => {
    const { executeIPLSRLToss, updateIPLSRLLineup } = await import('../../lib/iplSrlAdminControl.mjs');
    const snap = getIPLSRLControlSnapshot();
    const match = snap.matches.find((m) => m.matchId === testMatchId);

    const tossRes = executeIPLSRLToss(testMatchId, {
      winnerTeamId: match.homeTeamId,
      decision: 'BAT',
    }, 'test_admin');
    expect(tossRes.success).toBe(true);
    expect(tossRes.toss.winner).toBe(match.homeTeamId);
    expect(tossRes.toss.decision).toBe('BAT');

    const lineupRes = updateIPLSRLLineup(testMatchId, {
      teamId: match.homeTeamId,
      playingXI: ['Batter A', 'Batter B', 'Bowler C'],
      impactPlayer: 'Allrounder D',
    }, 'test_admin');
    expect(lineupRes.success).toBe(true);
    expect(lineupRes.lineup.homePlayingXI).toContain('Batter A');
    expect(lineupRes.lineup.homeImpactPlayer).toBe('Allrounder D');
  });

  it('retrieves ball-by-ball replay timeline and exports comprehensive match audit', async () => {
    const { getIPLSRLMatchReplay, exportIPLSRLMatchAudit } = await import('../../lib/iplSrlAdminControl.mjs');
    const replay = getIPLSRLMatchReplay(testMatchId);
    expect(replay).toBeDefined();
    expect(replay.matchId).toBe(testMatchId);
    expect(Array.isArray(replay.deliveries)).toBe(true);
    expect(replay.deliveries.length).toBeGreaterThan(0);

    const audit = exportIPLSRLMatchAudit(testMatchId);
    expect(audit).toBeDefined();
    expect(audit.matchId).toBe(testMatchId);
    expect(audit.fixture).toBeDefined;
    expect(audit.exportedAt).toBeDefined();
    expect(Array.isArray(audit.deliveries)).toBe(true);
  });

  it('runs What-If pre-flight simulator and highlights optimal house pick', async () => {
    const { simulateSrlWhatIf } = await import('../../lib/iplSrlAdminControl.mjs');
    const res = simulateSrlWhatIf(testMatchId);
    expect(res).toBeDefined();
    expect(res.matchId).toBe(testMatchId);
    expect(Array.isArray(res.scenarios)).toBe(true);
    expect(res.scenarios.length).toBe(6);
    expect(res.bestHousePick).toBeDefined();
    expect(res.bestHousePick.recommended).toBe(true);

    const sixScenario = res.scenarios.find((s) => s.type === 'SIX');
    expect(sixScenario).toBeDefined();
    expect(sixScenario.runs).toBe(6);
    expect(sixScenario.projectedOdds.home).toBeGreaterThan(0);
  });

  it('streams live match wager tape and flags VIP/Whale bets', async () => {
    const { getSrlLiveWagerTape } = await import('../../lib/iplSrlAdminControl.mjs');
    const tape = await getSrlLiveWagerTape(testMatchId, { limit: 10 });
    expect(tape).toBeDefined();
    expect(tape.matchId).toBe(testMatchId);
    expect(Array.isArray(tape.wagers)).toBe(true);
    expect(tape.wagers.length).toBeGreaterThanOrEqual(0);
    expect(tape.whaleCount).toBeGreaterThanOrEqual(0);

    if (tape.wagers.length > 0) {
      const wager = tape.wagers[0];
      expect(wager.betId).toBeDefined();
      expect(wager.stake).toBeGreaterThan(0);
      expect(wager.userTier).toBeDefined();
    }
  });

  it('sets Autonomous AI Director Mode and applies player morale buffs', async () => {
    const { setIPLSRLDirectorMode, setIPLSRLPlayerBuff, DIRECTOR_MODES, PLAYER_BUFF_TYPES } = await import('../../lib/iplSrlAdminControl.mjs');
    expect(DIRECTOR_MODES.THRILLER_FINISH).toBeDefined();
    expect(PLAYER_BUFF_TYPES.GOD_MODE).toBeDefined();

    const dirRes = setIPLSRLDirectorMode(testMatchId, 'THRILLER_FINISH', 'test_admin');
    expect(dirRes.success).toBe(true);
    expect(dirRes.directorMode).toBe('THRILLER_FINISH');

    const buffRes = setIPLSRLPlayerBuff(testMatchId, {
      role: 'striker',
      buff: 'GOD_MODE',
    }, 'test_admin');
    expect(buffRes.success).toBe(true);
    expect(buffRes.playerBuffs.striker.buff).toBe('GOD_MODE');
  });

  it('configures environmental physics engine (dew, pitch wear, swing index)', async () => {
    const { setIPLSRLEnvironment, PITCH_WEAR_TYPES } = await import('../../lib/iplSrlAdminControl.mjs');
    expect(PITCH_WEAR_TYPES.DRY_DUSTBOWL).toBeDefined();

    const envRes = setIPLSRLEnvironment(testMatchId, {
      dewFactor: 65,
      pitchWear: 'DRY_DUSTBOWL',
      swingIndex: 45,
      overcast: true,
    }, 'test_admin');

    expect(envRes.success).toBe(true);
    expect(envRes.environment.dewFactor).toBe(65);
    expect(envRes.environment.pitchWear).toBe('DRY_DUSTBOWL');
    expect(envRes.environment.swingIndex).toBe(45);
    expect(envRes.environment.overcast).toBe(true);
  });

  it('manages dynamic micro-markets, per-market hold, and mass-suspension', async () => {
    const {
      getIPLSRLMicroMarkets,
      setIPLSRLMicroMarketStatus,
      setIPLSRLMicroMarketMargin,
      setIPLSRLMicroMarketsMassSuspend,
    } = await import('../../lib/iplSrlAdminControl.mjs');

    const listRes = getIPLSRLMicroMarkets(testMatchId);
    expect(listRes.totalMarkets).toBeGreaterThanOrEqual(3);
    const targetMkt = listRes.markets[0];
    expect(targetMkt.id).toBeDefined();

    // Toggle status
    const toggleRes = setIPLSRLMicroMarketStatus(testMatchId, {
      marketId: targetMkt.id,
      status: 'SUSPENDED',
    }, 'test_admin');
    expect(toggleRes.success).toBe(true);
    expect(toggleRes.market.status).toBe('SUSPENDED');

    // Adjust margin
    const marginRes = setIPLSRLMicroMarketMargin(testMatchId, {
      marketId: targetMkt.id,
      holdPercent: 0.12,
    }, 'test_admin');
    expect(marginRes.success).toBe(true);
    expect(marginRes.market.holdPercent).toBe(0.12);

    // Mass suspend
    const massRes = setIPLSRLMicroMarketsMassSuspend(testMatchId, true, 'test_admin');
    expect(massRes.success).toBe(true);
    expect(massRes.massSuspended).toBe(true);
    expect(massRes.microMarkets.every((m) => m.status === 'SUSPENDED')).toBe(true);
  });

  it('controls live cash-out haircut and pushes sweetener buyback offers', async () => {
    const {
      getIPLSRLCashout,
      setIPLSRLCashoutConfig,
      pushIPLSRLCashoutSweetener,
    } = await import('../../lib/iplSrlAdminControl.mjs');

    const configRes = setIPLSRLCashoutConfig(testMatchId, {
      globalHaircut: 0.14,
      cashoutHalted: false,
    }, 'test_admin');
    expect(configRes.success).toBe(true);
    expect(configRes.cashoutControl.globalHaircut).toBe(0.14);

    const cashoutRes = await getIPLSRLCashout(testMatchId);
    expect(cashoutRes).toBeDefined();
    expect(Array.isArray(cashoutRes.positions)).toBe(true);
    expect(cashoutRes.positions.length).toBeGreaterThanOrEqual(0);

    const sampleBetId = cashoutRes.positions[0]?.betId || 'test_bet_001';
    const sweetRes = pushIPLSRLCashoutSweetener(testMatchId, {
      betId: sampleBetId,
      bonusPercent: 5,
    }, 'test_admin');
    expect(sweetRes.success).toBe(true);
    expect(sweetRes.sweetenerOffer.bonusPercent).toBe(5);
  });

  it('triggers automated circuit breakers and emergency master kill-switch', async () => {
    const {
      getIPLSRLCircuitBreaker,
      setIPLSRLCircuitBreakerConfig,
      toggleIPLSRLEmergencyKillSwitch,
    } = await import('../../lib/iplSrlAdminControl.mjs');

    const cbRes = getIPLSRLCircuitBreaker(testMatchId);
    expect(cbRes.circuitBreaker).toBeDefined();
    expect(cbRes.circuitBreaker.velocityLimit).toBeGreaterThan(0);

    const setRes = setIPLSRLCircuitBreakerConfig(testMatchId, {
      velocityLimit: 150000,
    }, 'test_admin');
    expect(setRes.success).toBe(true);
    expect(setRes.circuitBreaker.velocityLimit).toBe(150000);

    // Master kill-switch activation
    const killRes = toggleIPLSRLEmergencyKillSwitch(testMatchId, true, 'test_admin');
    expect(killRes.success).toBe(true);
    expect(killRes.emergencyKillSwitch).toBe(true);
    expect(killRes.bettingClosed).toBe(true);

    // Disengage kill-switch
    const disengageRes = toggleIPLSRLEmergencyKillSwitch(testMatchId, false, 'test_admin');
    expect(disengageRes.success).toBe(true);
    expect(disengageRes.emergencyKillSwitch).toBe(false);
  });

  it('generates 2D tactical pitch map and wagon wheel radar', async () => {
    const { getIPLSRLTacticalRadar } = await import('../../lib/iplSrlAdminControl.mjs');
    const radar = getIPLSRLTacticalRadar(testMatchId);
    expect(radar).toBeDefined();
    expect(radar.pitchHeat).toBeDefined();
    expect(radar.pitchHeat.GOOD_LENGTH).toBeGreaterThanOrEqual(0);
    expect(radar.pitchHeat.YORKER).toBeGreaterThanOrEqual(0);

    expect(radar.wagonWheel).toBeDefined();
    expect(radar.wagonWheel.COVER).toBeDefined();
    expect(radar.wagonWheel.LONG_ON).toBeDefined();

    expect(radar.h2hMatchup).toBeDefined();
    expect(radar.h2hMatchup.striker).toBeDefined();
    expect(radar.h2hMatchup.strikeRate).toBeGreaterThan(0);
  });
});


