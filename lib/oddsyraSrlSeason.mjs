/** OddsYra SRL public season — in-house simulated cricket, no feed provider. */

export const SRL_LAUNCH_AT = Date.parse('2026-09-10T00:00:00+05:30');
export const SRL_LAUNCH_LABEL = '10 September';
export const SRL_PAGE_PATH = '/srl';

export function isSrlSeasonLive(now = Date.now()) {
  return Number(now) >= SRL_LAUNCH_AT;
}

export function getSrlHomeBanner(now = Date.now()) {
  if (!isSrlSeasonLive(now)) {
    return {
      kicker: 'Coming soon',
      title: `OddsYra SRL begins ${SRL_LAUNCH_LABEL}`,
      subtitle: `Simulated cricket on OddsYra from ${SRL_LAUNCH_LABEL} — 70 league matches, 4 playoffs, points table, and in-play markets. No external feed.`,
      cta: 'View schedule',
    };
  }
  return {
    kicker: 'Now live',
    title: 'OddsYra SRL is live',
    subtitle: `Season opened ${SRL_LAUNCH_LABEL}. 70 league matches, then Qualifier 1, Eliminator, Qualifier 2, and the Final.`,
    cta: 'Open SRL',
  };
}
