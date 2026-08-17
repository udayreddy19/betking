const LOBBY_URL = 'https://oddsyra-two.vercel.app/casino';

/** @typedef {'spribe' | 'pragmatic' | 'tvbet' | 'spribe-turbo'} LaunchProvider */

/**
 * @param {LaunchProvider} provider
 * @param {string} key
 * @param {Record<string, string>} [extra]
 */
export function buildLaunchRequest(provider, key, extra = {}) {
  const lobby = encodeURIComponent(extra.lobbyUrl || LOBBY_URL);
  const lang = extra.lang || 'en';
  const currency = extra.currency || 'INR';

  if (provider === 'spribe') {
    return {
      provider,
      startUrl: `https://demo.spribe.io/launch/${key}?currency=${currency}&lang=EN&return_url=${lobby}`,
      followRedirects: true,
    };
  }

  if (provider === 'spribe-turbo') {
    return {
      provider: 'spribe',
      startUrl: `https://turbo.spribegaming.com/${key}?currency=${currency}&operator=demo&jurisdiction=CW&lang=EN&return_url=${lobby}`,
      followRedirects: false,
    };
  }

  if (provider === 'tvbet') {
    // Real live dealer / live lottery streams (TVBet/BETCORE frame)
    return {
      provider,
      startUrl: `https://tvbetframe.com/?lng=${lang}&singlegame=${key}#/game/${key}`,
      followRedirects: false,
      isLive: true,
    };
  }

  const symbol = key;
  return {
    provider,
    startUrl: `https://demogamesfree.pragmaticplay.net/gs2c/openGame.do?gameSymbol=${symbol}&lang=${lang}&cur=${currency}&lobbyUrl=${lobby}`,
    followRedirects: true,
  };
}

/** Game id → launch config */
export const GAME_LAUNCH_MAP = {
  // Crash
  g1: buildLaunchRequest('spribe', 'aviator'),
  g7: buildLaunchRequest('spribe-turbo', 'JetX'),
  g8: buildLaunchRequest('pragmatic', '1301'),
  g9: buildLaunchRequest('spribe', 'mines'),
  g10: buildLaunchRequest('spribe', 'plinko'),
  g11: buildLaunchRequest('spribe', 'goal'),
  g12: buildLaunchRequest('spribe', 'dice'),

  // Top slots
  g3: buildLaunchRequest('pragmatic', 'vs20olympgate'),
  g5: buildLaunchRequest('pragmatic', 'vs20fruitsw'),
  g13: buildLaunchRequest('pragmatic', 'vs20starlight'),
  g14: buildLaunchRequest('pragmatic', 'vs10bbbonanza'),
  g15: buildLaunchRequest('pragmatic', 'vs20sugarrush'),
  g16: buildLaunchRequest('pragmatic', 'vs25wolfgold'),
  g17: buildLaunchRequest('pragmatic', 'vs20bookdead'),
  g18: buildLaunchRequest('pragmatic', 'vs10starburst'),
  g19: buildLaunchRequest('pragmatic', 'vs20fruitparty'),
  g20: buildLaunchRequest('pragmatic', 'vs20doghouse'),
  g21: buildLaunchRequest('pragmatic', 'vs20reactoonz'),
  g22: buildLaunchRequest('pragmatic', 'vs20gorillamayhem'),

  // Jackpots
  g23: buildLaunchRequest('pragmatic', 'vs25mmouse'),
  g24: buildLaunchRequest('pragmatic', 'vs20godsofwar'),
  g25: buildLaunchRequest('pragmatic', 'vs20hburnhs'),
  g26: buildLaunchRequest('pragmatic', 'vs20kraken'),

  // RNG table
  g27: buildLaunchRequest('pragmatic', 'rla'),
  g28: buildLaunchRequest('pragmatic', 'bca'),
  g29: buildLaunchRequest('pragmatic', 'rla'),
  g30: buildLaunchRequest('pragmatic', 'rla'),
  g31: buildLaunchRequest('pragmatic', 'cp'),
  g32: buildLaunchRequest('pragmatic', 'thn'),

  // Live casino — real live streams via TVBet frame
  g2: buildLaunchRequest('tvbet', '199'),   // Crazy Time → Spin2Wheels
  g4: buildLaunchRequest('tvbet', '25'),    // Lightning Roulette → Roulette X500
  g6: buildLaunchRequest('tvbet', '19'),    // Infinite Blackjack → Blackjack
  lc1: buildLaunchRequest('tvbet', '22'),   // Immersive Roulette
  lc2: buildLaunchRequest('tvbet', '27'),   // Speed Roulette → Auto Roulette
  lc3: buildLaunchRequest('tvbet', '27'),   // Auto Roulette
  lc4: buildLaunchRequest('tvbet', '28'),   // Hindi Roulette → VIP Roulette
  lc5: buildLaunchRequest('tvbet', '517'),  // Blackjack VIP
  lc6: buildLaunchRequest('tvbet', '19'),   // Speed Blackjack
  lc7: buildLaunchRequest('tvbet', '19'),   // Free Bet Blackjack
  lc8: buildLaunchRequest('tvbet', '19'),   // Power Blackjack
  lc9: buildLaunchRequest('tvbet', '22'),   // Speed Baccarat → Roulette table
  lc10: buildLaunchRequest('tvbet', '22'),  // No Commission Baccarat
  lc11: buildLaunchRequest('tvbet', '5'),   // Dragon Tiger → War of Elements
  lc12: buildLaunchRequest('tvbet', '24'),  // Teen Patti Live
  lc13: buildLaunchRequest('tvbet', '2'),   // Dream Catcher → Wheelbet
  lc14: buildLaunchRequest('tvbet', '2'),   // Monopoly Live → Wheelbet
  lc15: buildLaunchRequest('tvbet', '12'),  // Mega Ball → Lucky 6
  lc16: buildLaunchRequest('tvbet', '199'),  // Funky Time → Spin2Wheels
  lc17: buildLaunchRequest('tvbet', '65'),   // Sweet Bonanza Candyland
  lc18: buildLaunchRequest('tvbet', '7'),   // Deal or No Deal → 7Bet
  lc19: buildLaunchRequest('tvbet', '19'),  // Lightning Blackjack
  lc20: buildLaunchRequest('tvbet', '2'),   // Gonzo's Treasure Map → Wheelbet
};

export function getLaunchConfig(gameId) {
  return GAME_LAUNCH_MAP[gameId] || null;
}
