/**
 * Comprehensive Betting Markets & Dynamic Live Odds Generator for BetKing
 * Dynamically updates odds and lines in real time based on live match scores.
 */

import { resolveCricketTeamScores, isCricketSecondInnings } from './cricketScores';

function getSeed(matchId = 'm1') {
  return [...String(matchId)].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
}

function calcOdds(base, seedOffset) {
  const v = base + (seedOffset % 40) / 100;
  return Number(Math.max(1.05, v).toFixed(2));
}

function probToOdds(prob, margin = 1.06) {
  const clamped = Math.max(0.02, Math.min(0.97, prob));
  return Number(Math.max(1.02, Math.min(25.0, 1 / (clamped * margin))).toFixed(2));
}

/**
 * Compute real-time dynamic match odds (Team 1, Draw, Team 2) based on live score.
 */
export function computeLiveDynamicOdds(match) {
  if (!match) return { team1: 1.85, team2: 1.95 };
  const sport = match.sport || 'cricket';
  const seed = getSeed(match.id);

  // Pre-match base odds from seed or existing pre-match odds
  const baseT1 = match.preOdds?.team1 || match.odds?.team1 || calcOdds(1.80, seed);
  const baseT2 = match.preOdds?.team2 || match.odds?.team2 || calcOdds(2.00, seed + 7);
  const baseDraw = match.preOdds?.draw || match.odds?.draw;

  const isLive = match.isLive || match.matchState === 'in';
  if (!isLive) {
    const odds = { team1: Number(baseT1), team2: Number(baseT2) };
    if (baseDraw != null) odds.draw = Number(baseDraw);
    return odds;
  }

  const ld = match.liveDetails || {};

  // --- CRICKET DYNAMIC LIVE ODDS ---
  if (sport === 'cricket' || sport === 'virtual-cricket') {
    const { team1, team2 } = resolveCricketTeamScores(match, ld);
    const is2ndInnings = isCricketSecondInnings(match, ld);

    let p1 = 1 / baseT1;
    let p2 = 1 / baseT2;

    if (is2ndInnings) {
      // Team 2 chasing Team 1 target score
      const target = (team1.runs || 150) + 1;
      const chaseRuns = team2.runs || 0;
      const wickets = team2.wickets || 0;
      const ballsBowled = team2.balls || 1;
      const totalBalls = 120; // Standard T20 limit
      const remainingBalls = Math.max(1, totalBalls - ballsBowled);
      const runsNeeded = Math.max(1, target - chaseRuns);

      const rrr = (runsNeeded / remainingBalls) * 6;
      const crr = (chaseRuns / Math.max(1, ballsBowled)) * 6;

      // Higher RRR favors Team 1 (defending)
      let rrrFactor = (rrr - 7.5) * 0.06;
      let wicketFactor = wickets * 0.08;

      p1 += rrrFactor + wicketFactor;
      p2 -= (rrrFactor + wicketFactor);
    } else {
      // 1st Innings: Team 1 batting
      const runs = team1.runs || 0;
      const wickets = team1.wickets || 0;
      const balls = team1.balls || 1;
      const crr = (runs / Math.max(1, balls)) * 6;

      let crrFactor = (crr - 7.0) * 0.03;
      let wicketFactor = wickets * 0.05;

      p1 += (crrFactor - wicketFactor);
      p2 -= (crrFactor - wicketFactor);
    }

    const totalP = p1 + p2;
    p1 = p1 / totalP;
    p2 = p2 / totalP;

    return {
      team1: probToOdds(p1),
      team2: probToOdds(p2),
    };
  }

  // --- SOCCER DYNAMIC LIVE ODDS ---
  if (sport === 'soccer' || sport === 'esoccer') {
    const s1 = ld.score1 ?? 0;
    const s2 = ld.score2 ?? 0;
    const minute = Math.min(90, Math.max(0, parseInt(ld.minute || 0, 10)));
    const diff = s1 - s2;
    const timeWeight = 1 + (minute / 90) * 1.5;

    let p1 = 0.42;
    let pDraw = 0.28;
    let p2 = 0.30;

    if (diff > 0) {
      p1 += diff * 0.22 * timeWeight;
      pDraw -= diff * 0.08 * timeWeight;
      p2 -= diff * 0.14 * timeWeight;
    } else if (diff < 0) {
      const absDiff = Math.abs(diff);
      p2 += absDiff * 0.22 * timeWeight;
      pDraw -= absDiff * 0.08 * timeWeight;
      p1 -= absDiff * 0.14 * timeWeight;
    } else if (minute > 60) {
      pDraw += (minute - 60) * 0.008;
      p1 -= (minute - 60) * 0.004;
      p2 -= (minute - 60) * 0.004;
    }

    const totalP = Math.max(0.1, p1 + pDraw + p2);
    p1 = p1 / totalP;
    pDraw = pDraw / totalP;
    p2 = p2 / totalP;

    return {
      team1: probToOdds(p1),
      draw: probToOdds(pDraw),
      team2: probToOdds(p2),
    };
  }

  // --- BASKETBALL / TENNIS / OTHER DYNAMIC LIVE ODDS ---
  const s1 = ld.score1 ?? 0;
  const s2 = ld.score2 ?? 0;
  const diff = s1 - s2;

  let p1 = 0.50 + diff * 0.035;
  let p2 = 0.50 - diff * 0.035;
  const totalP = p1 + p2;

  return {
    team1: probToOdds(p1 / totalP),
    team2: probToOdds(p2 / totalP),
  };
}

/**
 * Generate sport-tailored betting market categories and odds options for any match.
 */
export function getMarketCategoriesForSport(sport = 'cricket') {
  switch (sport) {
    case 'cricket':
    case 'virtual-cricket':
      return [
        { id: 'all', label: 'All' },
        { id: 'main', label: 'Main' },
        { id: 'totals', label: 'Match Totals' },
        { id: 'over', label: 'Overs' },
        { id: 'delivery', label: 'Deliveries' },
        { id: 'partnership', label: 'Partnership' },
        { id: 'props', label: 'Player Props' },
      ];
    case 'soccer':
    case 'esoccer':
      return [
        { id: 'all', label: 'All' },
        { id: 'main', label: 'Main' },
        { id: 'goals', label: 'Goals' },
        { id: 'halves', label: 'Halves' },
        { id: 'chance', label: 'Double Chance' },
      ];
    case 'basketball':
    case 'american-football':
      return [
        { id: 'all', label: 'All' },
        { id: 'main', label: 'Main' },
        { id: 'spreads', label: 'Handicap & Spreads' },
        { id: 'totals', label: 'Total Points' },
        { id: 'quarters', label: 'Quarters' },
      ];
    case 'tennis':
      return [
        { id: 'all', label: 'All' },
        { id: 'main', label: 'Main' },
        { id: 'sets', label: 'Sets' },
        { id: 'games', label: 'Games' },
      ];
    default:
      return [
        { id: 'all', label: 'All' },
        { id: 'main', label: 'Main' },
        { id: 'totals', label: 'Totals' },
        { id: 'specials', label: 'Specials' },
      ];
  }
}

export function generateMatchMarkets(match) {
  if (!match) return [];
  const sport = match.sport || 'cricket';
  const seed = getSeed(match.id);
  const team1Name = match.team1?.name || match.team1?.shortName || 'Team 1';
  const team2Name = match.team2?.name || match.team2?.shortName || 'Team 2';

  const liveOdds = computeLiveDynamicOdds(match);
  const t1Odds = liveOdds.team1.toFixed(2);
  const t2Odds = liveOdds.team2.toFixed(2);
  const drawOdds = liveOdds.draw != null ? liveOdds.draw.toFixed(2) : null;

  const ld = match.liveDetails || {};
  const isLive = match.isLive || match.matchState === 'in';
  const markets = [];

  // --- CRICKET MARKETS ---
  if (sport === 'cricket' || sport === 'virtual-cricket') {
    const { team1, team2 } = resolveCricketTeamScores(match, ld);

    // 1. Winner
    const winnerOpts = [
      { selection: '1', name: team1Name, odds: Number(t1Odds) },
    ];
    if (drawOdds) {
      winnerOpts.push({ selection: 'X', name: 'Draw', odds: Number(drawOdds) });
    }
    winnerOpts.push({ selection: '2', name: team2Name, odds: Number(t2Odds) });

    markets.push({
      key: 'winner',
      title: 'Winner (incl. super over)',
      category: 'main',
      options: winnerOpts,
    });

    // 2. Will there be a tie
    const tieOdds = isLive ? calcOdds(14.0, (team1.runs + team2.runs) % 20) : calcOdds(11.0, seed);
    markets.push({
      key: 'tie',
      title: 'Will there be a tie',
      category: 'main',
      options: [
        { selection: 'Tie:Yes', name: 'Yes', odds: tieOdds },
        { selection: 'Tie:No', name: 'No', odds: 1.04 },
      ],
    });

    // 3. Total Match Sixes
    const estSixes = isLive ? Math.max(6, Math.floor((team1.runs + team2.runs) / 22)) : 12;
    const sixesLine = estSixes + 0.5;
    const sixesOverOdds = Number(liveOdds.team1 < liveOdds.team2 ? 1.75 : 2.05).toFixed(2);
    const sixesUnderOdds = Number(liveOdds.team1 < liveOdds.team2 ? 2.05 : 1.75).toFixed(2);
    markets.push({
      key: 'match_sixes',
      title: 'Total Match Sixes',
      category: 'totals',
      options: [
        { selection: `Sixes:Over ${sixesLine}`, name: `Over ${sixesLine}`, odds: Number(sixesOverOdds) },
        { selection: `Sixes:Under ${sixesLine}`, name: `Under ${sixesLine}`, odds: Number(sixesUnderOdds) },
      ],
    });

    // 4. Total Match Fours
    const estFours = isLive ? Math.max(14, Math.floor((team1.runs + team2.runs) / 10)) : 28;
    const foursLine = estFours + 0.5;
    markets.push({
      key: 'match_fours',
      title: 'Total Match Fours',
      category: 'totals',
      options: [
        { selection: `Fours:Over ${foursLine}`, name: `Over ${foursLine}`, odds: 1.85 },
        { selection: `Fours:Under ${foursLine}`, name: `Under ${foursLine}`, odds: 1.85 },
      ],
    });

    // 5. Total Match Runs
    const currentTotalRuns = team1.runs + team2.runs;
    const projectedRuns = isLive ? Math.max(280, currentTotalRuns + 120) : 315;
    const matchRunsLine = projectedRuns + 0.5;
    markets.push({
      key: 'match_total_runs',
      title: 'Total Match Runs',
      category: 'totals',
      options: [
        { selection: `MatchRuns:Over ${matchRunsLine}`, name: `Over ${matchRunsLine}`, odds: 1.87 },
        { selection: `MatchRuns:Under ${matchRunsLine}`, name: `Under ${matchRunsLine}`, odds: 1.87 },
      ],
    });

    // 6. 1st Innings Over 12 Total
    const currentOversNum = parseInt(team1.overs || '0', 10);
    const overTarget = isLive && currentOversNum >= 12 ? currentOversNum + 2 : 12;
    const overOddsBase = isLive ? Math.max(1.30, Math.min(3.20, 2.00 - (team1.runs % 10) * 0.08)) : 2.02;
    markets.push({
      key: 'over10',
      title: `1st innings over ${overTarget} - ${team1Name} total`,
      category: 'over',
      options: [
        { selection: `Over ${overTarget} Total:Over 6.5`, name: 'Over 6.5', odds: Number(overOddsBase.toFixed(2)) },
        { selection: `Over ${overTarget} Total:Under 6.5`, name: 'Under 6.5', odds: Number((3.60 - overOddsBase).toFixed(2)) },
      ],
    });

    // 7. 1st Over Runs Total
    markets.push({
      key: 'first_over_runs',
      title: '1st Innings 1st Over Total Runs',
      category: 'over',
      options: [
        { selection: 'First Over:Over 5.5', name: 'Over 5.5', odds: 1.90 },
        { selection: 'First Over:Under 5.5', name: 'Under 5.5', odds: 1.80 },
      ],
    });

    // 8. Next delivery total
    const deliveryOverOdds = isLive ? Number((1.35 + (team1.runs % 3) * 0.15).toFixed(2)) : 1.45;
    markets.push({
      key: 'delivery',
      title: `1st innings over ${currentOversNum + 1} - 5th delivery total`,
      category: 'delivery',
      options: [
        { selection: 'Delivery:Over 0.5', name: 'Over 0.5', odds: deliveryOverOdds },
        { selection: 'Delivery:Under 0.5', name: 'Under 0.5', odds: Number((3.50 - deliveryOverOdds).toFixed(2)) },
        { selection: 'Delivery:Over 1.5', name: 'Over 1.5', odds: 3.85 },
        { selection: 'Delivery:Boundary', name: 'Boundary (4 or 6)', odds: 4.50 },
      ],
    });

    // 9. 1st Partnership Total
    markets.push({
      key: 'partnership',
      title: '1st innings - 1st partnership total',
      category: 'partnership',
      options: [
        { selection: 'Partnership:Over 45.5', name: 'Over 45.5', odds: 1.88 },
        { selection: 'Partnership:Under 45.5', name: 'Under 45.5', odds: 1.88 },
      ],
    });

    // 10. Highest Opening Partnership
    markets.push({
      key: 'highest_opening',
      title: 'Highest Opening Partnership',
      category: 'partnership',
      options: [
        { selection: 'HighestPartnership:1', name: team1Name, odds: Number(t1Odds) },
        { selection: 'HighestPartnership:2', name: team2Name, odds: Number(t2Odds) },
        { selection: 'HighestPartnership:Tie', name: 'Tie', odds: 18.0 },
      ],
    });

    // 11. Method of Next Wicket
    markets.push({
      key: 'next_wicket_method',
      title: 'Method of Next Wicket',
      category: 'props',
      options: [
        { selection: 'WicketMethod:Caught', name: 'Caught', odds: 1.45 },
        { selection: 'WicketMethod:Bowled', name: 'Bowled', odds: 3.50 },
        { selection: 'WicketMethod:LBW', name: 'LBW', odds: 4.20 },
        { selection: 'WicketMethod:RunOut', name: 'Run Out / Other', odds: 8.50 },
      ],
    });

    // 12. Top Batter Runs (Player prop)
    const batterLine = isLive ? Math.max(25.5, (team1.runs || 10) + 15.5) : 34.5;
    markets.push({
      key: 'top_batter',
      title: `${team1Name} Top Batter Total Runs`,
      category: 'props',
      options: [
        { selection: `TopBatter:Over ${batterLine}`, name: `Over ${batterLine} Runs`, odds: 1.83 },
        { selection: `TopBatter:Under ${batterLine}`, name: `Under ${batterLine} Runs`, odds: 1.83 },
      ],
    });
  }

  // --- SOCCER MARKETS ---
  else if (sport === 'soccer' || sport === 'esoccer') {
    const s1 = ld.score1 ?? 0;
    const s2 = ld.score2 ?? 0;
    const totalGoals = s1 + s2;

    // 1. 1X2 Match Winner
    markets.push({
      key: 'winner',
      title: 'Full Time Result (1X2)',
      category: 'main',
      options: [
        { selection: '1', name: team1Name, odds: Number(t1Odds) },
        { selection: 'X', name: 'Draw', odds: Number(drawOdds || '3.30') },
        { selection: '2', name: team2Name, odds: Number(t2Odds) },
      ],
    });

    // 2. Both Teams To Score (BTTS)
    const bothScored = s1 > 0 && s2 > 0;
    const bttsYesOdds = bothScored ? 1.01 : isLive ? calcOdds(2.20, (s1 + s2) * 5) : 1.78;
    const bttsNoOdds = bothScored ? 18.0 : isLive ? calcOdds(1.60, (s1 + s2) * 3) : 2.02;
    markets.push({
      key: 'btts',
      title: 'Both Teams to Score',
      category: 'goals',
      options: [
        { selection: 'BTTS:Yes', name: 'Yes', odds: bttsYesOdds },
        { selection: 'BTTS:No', name: 'No', odds: bttsNoOdds },
      ],
    });

    // 3. Total Goals Over/Under Line
    const goalLine = totalGoals >= 2 ? totalGoals + 1.5 : 2.5;
    const overGoalOdds = totalGoals >= 2 ? 1.45 : isLive ? 2.10 : 1.92;
    const underGoalOdds = totalGoals >= 2 ? 2.50 : isLive ? 1.65 : 1.85;
    markets.push({
      key: 'goals_line',
      title: `Total Goals Over/Under ${goalLine}`,
      category: 'goals',
      options: [
        { selection: `Goals:Over ${goalLine}`, name: `Over ${goalLine}`, odds: overGoalOdds },
        { selection: `Goals:Under ${goalLine}`, name: `Under ${goalLine}`, odds: underGoalOdds },
      ],
    });

    // 4. Double Chance
    const dc1XOdds = Number((1 / (1 / liveOdds.team1 + 1 / (liveOdds.draw || 3.30))).toFixed(2));
    const dcX2Odds = Number((1 / (1 / liveOdds.team2 + 1 / (liveOdds.draw || 3.30))).toFixed(2));
    markets.push({
      key: 'double_chance',
      title: 'Double Chance',
      category: 'chance',
      options: [
        { selection: 'DC:1X', name: `${team1Name} or Draw`, odds: Math.max(1.05, dc1XOdds) },
        { selection: 'DC:12', name: `${team1Name} or ${team2Name}`, odds: 1.28 },
        { selection: 'DC:X2', name: `Draw or ${team2Name}`, odds: Math.max(1.05, dcX2Odds) },
      ],
    });

    // 5. First Half Winner
    markets.push({
      key: 'half1_winner',
      title: '1st Half Winner',
      category: 'halves',
      options: [
        { selection: '1H:1', name: team1Name, odds: Number((liveOdds.team1 * 1.25).toFixed(2)) },
        { selection: '1H:X', name: 'Draw', odds: 2.10 },
        { selection: '1H:2', name: team2Name, odds: Number((liveOdds.team2 * 1.25).toFixed(2)) },
      ],
    });
  }

  // --- BASKETBALL MARKETS ---
  else if (sport === 'basketball' || sport === 'american-football') {
    const s1 = ld.score1 ?? 0;
    const s2 = ld.score2 ?? 0;
    const diff = s1 - s2;
    const spreadLine = Math.max(1.5, Math.abs(diff) + 3.5);

    // 1. Moneyline
    markets.push({
      key: 'winner',
      title: 'Moneyline (incl. overtime)',
      category: 'main',
      options: [
        { selection: '1', name: team1Name, odds: Number(t1Odds) },
        { selection: '2', name: team2Name, odds: Number(t2Odds) },
      ],
    });

    // 2. Point Spread
    markets.push({
      key: 'spread',
      title: 'Point Spread',
      category: 'spreads',
      options: [
        { selection: `Spread:1 -${spreadLine}`, name: `${team1Name} -${spreadLine}`, odds: 1.90 },
        { selection: `Spread:2 +${spreadLine}`, name: `${team2Name} +${spreadLine}`, odds: 1.90 },
      ],
    });

    // 3. Total Points
    const currentPts = s1 + s2;
    const totalLine = isLive ? Math.max(180.5, currentPts + 40.5) : 214.5;
    markets.push({
      key: 'total_pts',
      title: 'Total Match Points',
      category: 'totals',
      options: [
        { selection: `Points:Over ${totalLine}`, name: `Over ${totalLine}`, odds: 1.88 },
        { selection: `Points:Under ${totalLine}`, name: `Under ${totalLine}`, odds: 1.88 },
      ],
    });
  }

  // --- TENNIS MARKETS ---
  else if (sport === 'tennis') {
    markets.push({
      key: 'winner',
      title: 'Match Winner',
      category: 'main',
      options: [
        { selection: '1', name: team1Name, odds: Number(t1Odds) },
        { selection: '2', name: team2Name, odds: Number(t2Odds) },
      ],
    });

    markets.push({
      key: 'set1_winner',
      title: 'Set 1 Winner',
      category: 'sets',
      options: [
        { selection: 'Set1:1', name: team1Name, odds: Number((liveOdds.team1 * 1.05).toFixed(2)) },
        { selection: 'Set1:2', name: team2Name, odds: Number((liveOdds.team2 * 1.05).toFixed(2)) },
      ],
    });
  }

  // --- GENERAL MARKETS ---
  else {
    markets.push({
      key: 'winner',
      title: 'Match Winner',
      category: 'main',
      options: [
        { selection: '1', name: team1Name, odds: Number(t1Odds) },
        { selection: '2', name: team2Name, odds: Number(t2Odds) },
      ],
    });
  }

  return markets;
}
