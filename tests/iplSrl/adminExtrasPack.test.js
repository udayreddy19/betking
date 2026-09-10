import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { getIplSrlMatches } from '../../lib/iplSrlSimulator.mjs';
import { resetAllSrlOperatorSessions } from '../../lib/iplSrlOperatorState.mjs';
import { executeIPLSRLToss } from '../../lib/iplSrlAdminControl.mjs';
import {
  getSrlMatchChecklist,
  unlockSrlToss,
  requestSrlDualControl,
  listSrlDualControlPending,
  approveSrlDualControl,
  getSrlBookHeatMap,
  getSrlFullSquadNames,
  updateSrlFixture,
  pushSrlMatchBanner,
  getSrlHighlightsReel,
  dryRunSrlSettlement,
  runSrlRegressionPack,
  openSrlPlayerPropMarkets,
  getSrlPublicPreviewParity,
  getSrlShiftHandoffPack,
} from '../../lib/iplSrlAdminExtras.mjs';

async function lockToss(matchId, winnerTeamId) {
  return executeIPLSRLToss(matchId, {
    winnerTeamId,
    decision: 'BAT',
    lockAndDeclare: true,
  }, 'admin_a', 'SUPER_ADMIN');
}

describe('SRL admin extras pack', () => {
  beforeEach(() => resetAllSrlOperatorSessions());
  afterEach(() => resetAllSrlOperatorSessions());

  function sampleMatch() {
    return getIplSrlMatches().find((m) => m.team1?.key && m.team1.key !== 'tbd') || getIplSrlMatches()[0];
  }

  it('builds checklist and full squad for every club key', () => {
    const m = sampleMatch();
    const checklist = getSrlMatchChecklist(m.id);
    expect(checklist.steps).toHaveLength(6);
    for (const key of ['csk', 'mi', 'rcb', 'kkr', 'gt', 'srh', 'lsg', 'dc', 'rr', 'pbks']) {
      expect(getSrlFullSquadNames(key).squad15).toHaveLength(15);
    }
  });

  it('unlocks a locked toss with reason', async () => {
    const m = sampleMatch();
    await lockToss(m.id, m.team1.key);
    const unlocked = unlockSrlToss(m.id, { reason: 'Wrong team called', admin: 'admin_b', role: 'SUPER_ADMIN' });
    expect(unlocked.success).toBe(true);
    expect(unlocked.toss?.locked).toBe(false);
  });

  it('requires second admin for dual-control approve', async () => {
    const m = sampleMatch();
    const req = requestSrlDualControl('kill_switch', {
      matchId: m.id,
      admin: 'admin_a',
      role: 'SUPER_ADMIN',
      note: 'test',
    });
    expect(req.pending?.id).toBeTruthy();
    expect(listSrlDualControlPending({ matchId: m.id }).length).toBeGreaterThan(0);
    await expect(approveSrlDualControl(req.pending.id, {
      admin: 'admin_a',
      role: 'SUPER_ADMIN',
      note: 'self',
    })).rejects.toThrow(/Second admin/i);
  });

  it('supports heat, banner, fixture, props, parity, highlights, dry-run, handoff, regression', async () => {
    const m = sampleMatch();
    const heat = await getSrlBookHeatMap(m.id);
    expect(heat.families.toss).toBeTruthy();

    const banner = pushSrlMatchBanner(m.id, { preset: 'MATCH_STARTING', admin: 'test' });
    expect(banner.banner?.text).toMatch(/starting/i);

    const fixture = updateSrlFixture(m.id, { venue: 'Ops Arena', startTime: Date.now() + 3600_000 }, 'test');
    expect(fixture.override.venue).toBe('Ops Arena');

    const props = await openSrlPlayerPropMarkets(m.id, { propType: 'sixes', admin: 'test' });
    expect(props.markets.length).toBeGreaterThan(0);

    const parity = await getSrlPublicPreviewParity(m.id);
    expect(parity.desk).toBeTruthy();
    expect(parity.public).toBeTruthy();

    const highlights = getSrlHighlightsReel(m.id);
    expect(highlights.whatsappText).toMatch(/OddsYra SRL Highlights/);

    const dry = await dryRunSrlSettlement(m.id, { winningTeamId: m.team1.key });
    expect(dry.dryRun).toBe(true);

    const handoff = await getSrlShiftHandoffPack();
    expect(handoff.coverage).toBeTruthy();

    const pack = await runSrlRegressionPack('test');
    expect(pack.results.length).toBeGreaterThan(3);
  });
});
