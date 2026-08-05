/**
 * Comprehensive Betting Markets & Odds Generator for BetKing
 * Dynamically computes a wide set of realistic markets and odds per match.
 */

function getSeed(matchId = 'm1') {
  return [...String(matchId)].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
}

function calcOdds(base, seedOffset) {
  const v = base + (seedOffset % 40) / 100;
  return Number(Math.max(1.05, v).toFixed(2));
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

  const t1Odds = Number(match.odds?.team1 || calcOdds(1.75, seed)).toFixed(2);
  const t2Odds = Number(match.odds?.team2 || calcOdds(2.05, seed + 7)).toFixed(2);
  const drawOdds = match.odds?.draw != null ? Number(match.odds.draw).toFixed(2) : null;

  const markets = [];

  // --- CRICKET MARKETS ---
  if (sport === 'cricket' || sport === 'virtual-cricket') {
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
    markets.push({
      key: 'tie',
      title: 'Will there be a tie',
      category: 'main',
      options: [
        { selection: 'Tie:Yes', name: 'Yes', odds: calcOdds(11.0, seed) },
        { selection: 'Tie:No', name: 'No', odds: calcOdds(1.04, seed) },
      ],
    });

    // 3. Total Match Sixes
    const sixesLine = 12.5;
    markets.push({
      key: 'match_sixes',
      title: 'Total Match Sixes',
      category: 'totals',
      options: [
        { selection: `Sixes:Over ${sixesLine}`, name: `Over ${sixesLine}`, odds: calcOdds(1.85, seed + 3) },
        { selection: `Sixes:Under ${sixesLine}`, name: `Under ${sixesLine}`, odds: calcOdds(1.88, seed + 5) },
      ],
    });

    // 4. Total Match Fours
    const foursLine = 28.5;
    markets.push({
      key: 'match_fours',
      title: 'Total Match Fours',
      category: 'totals',
      options: [
        { selection: `Fours:Over ${foursLine}`, name: `Over ${foursLine}`, odds: calcOdds(1.82, seed + 9) },
        { selection: `Fours:Under ${foursLine}`, name: `Under ${foursLine}`, odds: calcOdds(1.90, seed + 11) },
      ],
    });

    // 5. Total Match Runs
    const matchRunsLine = 315.5;
    markets.push({
      key: 'match_total_runs',
      title: 'Total Match Runs',
      category: 'totals',
      options: [
        { selection: `MatchRuns:Over ${matchRunsLine}`, name: `Over ${matchRunsLine}`, odds: calcOdds(1.87, seed + 2) },
        { selection: `MatchRuns:Under ${matchRunsLine}`, name: `Under ${matchRunsLine}`, odds: calcOdds(1.87, seed + 4) },
      ],
    });

    // 6. 1st Innings Over 12 Total
    markets.push({
      key: 'over10',
      title: `1st innings over 12 - ${team1Name} total`,
      category: 'over',
      options: [
        { selection: 'Over 12 Total:Over 6.5', name: 'Over 6.5', odds: calcOdds(2.02, seed + 1) },
        { selection: 'Over 12 Total:Under 6.5', name: 'Under 6.5', odds: calcOdds(1.65, seed + 8) },
      ],
    });

    // 7. 1st Over Runs Total
    markets.push({
      key: 'first_over_runs',
      title: '1st Innings 1st Over Total Runs',
      category: 'over',
      options: [
        { selection: 'First Over:Over 5.5', name: 'Over 5.5', odds: calcOdds(1.90, seed + 6) },
        { selection: 'First Over:Under 5.5', name: 'Under 5.5', odds: calcOdds(1.80, seed + 12) },
      ],
    });

    // 8. 5th delivery total
    markets.push({
      key: 'delivery',
      title: `1st innings over 12 - 5th delivery ${team2Name} total`,
      category: 'delivery',
      options: [
        { selection: 'Delivery:Over 0.5', name: 'Over 0.5', odds: calcOdds(1.45, seed + 4) },
        { selection: 'Delivery:Under 0.5', name: 'Under 0.5', odds: calcOdds(2.30, seed + 10) },
        { selection: 'Delivery:Over 1.5', name: 'Over 1.5', odds: calcOdds(3.85, seed + 14) },
        { selection: 'Delivery:Boundary', name: 'Boundary (4 or 6)', odds: calcOdds(4.50, seed + 16) },
      ],
    });

    // 9. 1st Partnership Total
    markets.push({
      key: 'partnership',
      title: '1st innings - 1st partnership total',
      category: 'partnership',
      options: [
        { selection: 'Partnership:Over 45.5', name: 'Over 45.5', odds: calcOdds(1.88, seed + 7) },
        { selection: 'Partnership:Under 45.5', name: 'Under 45.5', odds: calcOdds(1.88, seed + 13) },
      ],
    });

    // 10. Highest Opening Partnership
    markets.push({
      key: 'highest_opening',
      title: 'Highest Opening Partnership',
      category: 'partnership',
      options: [
        { selection: 'HighestPartnership:1', name: team1Name, odds: calcOdds(1.85, seed + 15) },
        { selection: 'HighestPartnership:2', name: team2Name, odds: calcOdds(1.95, seed + 17) },
        { selection: 'HighestPartnership:Tie', name: 'Tie', odds: calcOdds(18.0, seed + 20) },
      ],
    });

    // 11. Method of Next Wicket
    markets.push({
      key: 'next_wicket_method',
      title: 'Method of Next Wicket',
      category: 'props',
      options: [
        { selection: 'WicketMethod:Caught', name: 'Caught', odds: calcOdds(1.45, seed + 18) },
        { selection: 'WicketMethod:Bowled', name: 'Bowled', odds: calcOdds(3.50, seed + 21) },
        { selection: 'WicketMethod:LBW', name: 'LBW', odds: calcOdds(4.20, seed + 23) },
        { selection: 'WicketMethod:RunOut', name: 'Run Out / Other', odds: calcOdds(8.50, seed + 25) },
      ],
    });

    // 12. Top Batter Runs (Player prop)
    markets.push({
      key: 'top_batter',
      title: `${team1Name} Top Batter Total Runs`,
      category: 'props',
      options: [
        { selection: 'TopBatter:Over 34.5', name: 'Over 34.5 Runs', odds: calcOdds(1.83, seed + 27) },
        { selection: 'TopBatter:Under 34.5', name: 'Under 34.5 Runs', odds: calcOdds(1.83, seed + 29) },
      ],
    });
  }

  // --- SOCCER MARKETS ---
  else if (sport === 'soccer' || sport === 'esoccer') {
    // 1. 1X2 Match Winner
    markets.push({
      key: 'winner',
      title: 'Full Time Result (1X2)',
      category: 'main',
      options: [
        { selection: '1', name: team1Name, odds: Number(t1Odds) },
        { selection: 'X', name: 'Draw', odds: drawOdds ? Number(drawOdds) : calcOdds(3.30, seed + 2) },
        { selection: '2', name: team2Name, odds: Number(t2Odds) },
      ],
    });

    // 2. Both Teams To Score (BTTS)
    markets.push({
      key: 'btts',
      title: 'Both Teams to Score',
      category: 'goals',
      options: [
        { selection: 'BTTS:Yes', name: 'Yes', odds: calcOdds(1.78, seed + 1) },
        { selection: 'BTTS:No', name: 'No', odds: calcOdds(2.02, seed + 4) },
      ],
    });

    // 3. Total Goals Over/Under 2.5
    markets.push({
      key: 'goals_2_5',
      title: 'Total Goals Over/Under 2.5',
      category: 'goals',
      options: [
        { selection: 'Goals:Over 2.5', name: 'Over 2.5', odds: calcOdds(1.92, seed + 3) },
        { selection: 'Goals:Under 2.5', name: 'Under 2.5', odds: calcOdds(1.85, seed + 6) },
      ],
    });

    // 4. Total Goals Over/Under 3.5
    markets.push({
      key: 'goals_3_5',
      title: 'Total Goals Over/Under 3.5',
      category: 'goals',
      options: [
        { selection: 'Goals:Over 3.5', name: 'Over 3.5', odds: calcOdds(3.10, seed + 8) },
        { selection: 'Goals:Under 3.5', name: 'Under 3.5', odds: calcOdds(1.30, seed + 10) },
      ],
    });

    // 5. Double Chance
    markets.push({
      key: 'double_chance',
      title: 'Double Chance',
      category: 'chance',
      options: [
        { selection: 'DC:1X', name: `${team1Name} or Draw`, odds: calcOdds(1.35, seed + 12) },
        { selection: 'DC:12', name: `${team1Name} or ${team2Name}`, odds: calcOdds(1.28, seed + 14) },
        { selection: 'DC:X2', name: `Draw or ${team2Name}`, odds: calcOdds(1.52, seed + 16) },
      ],
    });

    // 6. First Half Winner
    markets.push({
      key: 'half1_winner',
      title: '1st Half Winner',
      category: 'halves',
      options: [
        { selection: '1H:1', name: team1Name, odds: calcOdds(2.40, seed + 18) },
        { selection: '1H:X', name: 'Draw', odds: calcOdds(2.10, seed + 20) },
        { selection: '1H:2', name: team2Name, odds: calcOdds(2.90, seed + 22) },
      ],
    });
  }

  // --- BASKETBALL MARKETS ---
  else if (sport === 'basketball' || sport === 'american-football') {
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
    const spreadVal = 4.5;
    markets.push({
      key: 'spread',
      title: 'Point Spread',
      category: 'spreads',
      options: [
        { selection: `Spread:1 -${spreadVal}`, name: `${team1Name} -${spreadVal}`, odds: calcOdds(1.90, seed + 2) },
        { selection: `Spread:2 +${spreadVal}`, name: `${team2Name} +${spreadVal}`, odds: calcOdds(1.90, seed + 5) },
      ],
    });

    // 3. Total Points
    const ptsLine = 214.5;
    markets.push({
      key: 'total_pts',
      title: 'Total Match Points',
      category: 'totals',
      options: [
        { selection: `Points:Over ${ptsLine}`, name: `Over ${ptsLine}`, odds: calcOdds(1.88, seed + 7) },
        { selection: `Points:Under ${ptsLine}`, name: `Under ${ptsLine}`, odds: calcOdds(1.88, seed + 9) },
      ],
    });

    // 4. 1st Quarter Winner
    markets.push({
      key: 'q1_winner',
      title: '1st Quarter Winner',
      category: 'quarters',
      options: [
        { selection: 'Q1:1', name: team1Name, odds: calcOdds(1.85, seed + 11) },
        { selection: 'Q1:2', name: team2Name, odds: calcOdds(1.95, seed + 13) },
      ],
    });
  }

  // --- TENNIS MARKETS ---
  else if (sport === 'tennis') {
    // 1. Match Winner
    markets.push({
      key: 'winner',
      title: 'Match Winner',
      category: 'main',
      options: [
        { selection: '1', name: team1Name, odds: Number(t1Odds) },
        { selection: '2', name: team2Name, odds: Number(t2Odds) },
      ],
    });

    // 2. Set 1 Winner
    markets.push({
      key: 'set1_winner',
      title: 'Set 1 Winner',
      category: 'sets',
      options: [
        { selection: 'Set1:1', name: team1Name, odds: calcOdds(1.80, seed + 3) },
        { selection: 'Set1:2', name: team2Name, odds: calcOdds(2.00, seed + 6) },
      ],
    });

    // 3. Total Games Over/Under
    const gamesLine = 21.5;
    markets.push({
      key: 'total_games',
      title: 'Total Games Over/Under',
      category: 'games',
      options: [
        { selection: `Games:Over ${gamesLine}`, name: `Over ${gamesLine}`, odds: calcOdds(1.85, seed + 8) },
        { selection: `Games:Under ${gamesLine}`, name: `Under ${gamesLine}`, odds: calcOdds(1.85, seed + 10) },
      ],
    });

    // 4. Set Betting (Exact Score)
    markets.push({
      key: 'set_score',
      title: 'Correct Set Score',
      category: 'sets',
      options: [
        { selection: 'SetScore:2-0', name: `${team1Name} 2-0`, odds: calcOdds(2.60, seed + 12) },
        { selection: 'SetScore:2-1', name: `${team1Name} 2-1`, odds: calcOdds(3.80, seed + 14) },
        { selection: 'SetScore:0-2', name: `${team2Name} 2-0`, odds: calcOdds(3.20, seed + 16) },
        { selection: 'SetScore:1-2', name: `${team2Name} 2-1`, odds: calcOdds(4.20, seed + 18) },
      ],
    });
  }

  // --- GENERAL / OTHER SPORTS MARKETS ---
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

    markets.push({
      key: 'specials',
      title: 'Handicap Selection',
      category: 'specials',
      options: [
        { selection: 'Handicap:1 -1.5', name: `${team1Name} -1.5`, odds: calcOdds(2.10, seed + 4) },
        { selection: 'Handicap:2 +1.5', name: `${team2Name} +1.5`, odds: calcOdds(1.70, seed + 8) },
      ],
    });
  }

  return markets;
}
