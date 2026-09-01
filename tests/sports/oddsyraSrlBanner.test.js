import { describe, expect, it } from 'vitest';
import {
  getSrlHomeBanner,
  isSrlSeasonLive,
  SRL_LAUNCH_AT,
} from '../../src/data/oddsyraSrlSeason.js';

describe('OddsYra SRL home banner', () => {
  it('announces 10 August before launch', () => {
    const copy = getSrlHomeBanner(SRL_LAUNCH_AT - 1);
    expect(isSrlSeasonLive(SRL_LAUNCH_AT - 1)).toBe(false);
    expect(copy.title).toMatch(/begins 10 August/i);
  });

  it('says the season is live after 10 August', () => {
    const copy = getSrlHomeBanner(SRL_LAUNCH_AT);
    expect(isSrlSeasonLive(SRL_LAUNCH_AT)).toBe(true);
    expect(copy.title).toMatch(/is live/i);
    expect(copy.subtitle).toMatch(/10 August/);
  });
});
