/**
 * Daily price boosts — curated 3–5 markets from live/upcoming feed.
 * Boosts are display + slip odds only; placement still validates server odds.
 */
import { createHash } from 'crypto';

const BOOST_TAGS = ['SUPER BOOST', 'MEGA BOOST', 'DAILY BOOST', 'LIVE BOOST', 'HOT PICK'];

function daySeed(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function hashPick(seed, id) {
  return createHash('sha1').update(`${seed}:${id}`).digest().readUInt32BE(0);
}

function boostOdds(raw, factor = 1.12) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1.15) return null;
  const boosted = Math.min(12, Number((n * factor).toFixed(2)));
  if (boosted <= n + 0.04) return null;
  return { originalOdds: Number(n.toFixed(2)), boostedOdds: boosted };
}

function pickSelection(match) {
  const sport = String(match.sport || match.sportKey || '').toLowerCase();
  const t1 = match.team1?.name || match.homeTeam?.name || 'Home';
  const t2 = match.team2?.name || match.awayTeam?.name || 'Away';
  const matchName = `${t1} vs ${t2}`;
  const markets = Array.isArray(match.markets) ? match.markets : [];
  const mw = markets.find((m) => /match.?winner|1x2|moneyline|winner/i.test(String(m.name || m.id || '')))
    || markets[0];
  const opts = Array.isArray(mw?.options) ? mw.options : (Array.isArray(mw?.selections) ? mw.selections : []);
  const opt = opts.find((o) => Number(o.odds || o.price) >= 1.4) || opts[0];
  if (!opt) {
    // Fallback synthetic line from match-level odds if present
    const homeOdds = Number(match.odds?.home || match.homeOdds || 0);
    if (homeOdds >= 1.4) {
      return {
        sport,
        league: match.league || match.competition || 'Featured',
        matchId: String(match.id || match.matchId),
        matchName,
        marketId: 'match_winner',
        marketName: 'Match Winner',
        selectionId: 'home',
        selectionName: `${t1} to win`,
        title: `${t1} to win`,
        odds: homeOdds,
      };
    }
    return null;
  }
  const odds = Number(opt.odds || opt.price || opt.decimalOdds);
  if (!Number.isFinite(odds) || odds < 1.2) return null;
  return {
    sport: sport || 'cricket',
    league: match.league || match.competition || 'Featured',
    matchId: String(match.id || match.matchId),
    matchName,
    marketId: String(mw?.id || mw?.marketId || 'match_winner'),
    marketName: String(mw?.name || 'Match Winner'),
    selectionId: String(opt.selectionId || opt.id || opt.selection || opt.name),
    selectionName: String(opt.name || opt.label || opt.selection || 'Selection'),
    title: `${String(opt.name || opt.label || 'Selection')} · ${String(mw?.name || 'Match Winner')}`,
    odds,
  };
}

/**
 * @returns {{ success: true, day: string, boosts: object[], count: number }}
 */
export async function getDailyPriceBoosts({ limit = 5 } = {}) {
  const day = daySeed();
  let matches = [];
  try {
    const { getCachedAggregatedLiveScores } = await import('./aggregator.mjs');
    const cached = getCachedAggregatedLiveScores?.() || {};
    matches = Array.isArray(cached.matches) ? cached.matches : [];
  } catch {
    matches = [];
  }

  const candidates = [];
  for (const match of matches) {
    const sport = String(match.sport || '').toLowerCase();
    if (sport && !/cricket|soccer|football|tennis/.test(sport)) continue;
    const isLive = Boolean(match.isLive) || String(match.matchState || '').toLowerCase() === 'in';
    const pick = pickSelection(match);
    if (!pick) continue;
    const priced = boostOdds(pick.odds, isLive ? 1.1 : 1.14);
    if (!priced) continue;
    const rank = hashPick(day, pick.matchId + pick.selectionId);
    candidates.push({
      ...pick,
      ...priced,
      isLive,
      rank,
      tag: BOOST_TAGS[rank % BOOST_TAGS.length],
    });
  }

  candidates.sort((a, b) => {
    if (a.isLive !== b.isLive) return a.isLive ? -1 : 1;
    return a.rank - b.rank;
  });

  const seen = new Set();
  const boosts = [];
  for (const c of candidates) {
    if (seen.has(c.matchId)) continue;
    seen.add(c.matchId);
    boosts.push({
      id: `boost_${day}_${c.matchId}_${c.selectionId}`.replace(/[^a-zA-Z0-9_:-]/g, '_').slice(0, 96),
      matchId: c.matchId,
      sport: c.sport,
      league: c.league,
      matchName: c.matchName,
      title: c.title,
      originalOdds: c.originalOdds,
      boostedOdds: c.boostedOdds,
      selection: c.selectionName,
      selectionId: c.selectionId,
      marketId: c.marketId,
      marketName: c.marketName,
      tag: c.tag,
      expiry: c.isLive ? 'Live now' : 'Today',
      isLive: c.isLive,
    });
    if (boosts.length >= Math.min(5, Math.max(3, limit))) break;
  }

  return {
    success: true,
    day,
    count: boosts.length,
    boosts,
    note: boosts.length
      ? 'Daily curated boosts from live/upcoming markets.'
      : 'No boostable markets right now — check Sports.',
  };
}
