/**
 * Comprehensive Betting Markets & Dynamic Live Odds Generator for BetKing
 * Dynamically updates odds and lines in real time based on live match scores.
 */

import { resolveCricketTeamScores, isCricketSecondInnings } from './cricketScores.js';
import { evaluateMarketAgainstMatchState } from '../../lib/marketEvaluationEngine.mjs';

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

  // --- CRICKET DYNAMIC LIVE ODDS (HUMAN TRADER ALGORITHM) ---
  if (sport === 'cricket' || sport === 'virtual-cricket') {
    const scores = resolveCricketTeamScores(match, ld) || {};
    const team1 = scores.team1 || { runs: 0, wickets: 0, balls: 0 };
    const team2 = scores.team2 || { runs: 0, wickets: 0, balls: 0 };
    const is2ndInnings = isCricketSecondInnings(match, ld);

    const isOdiOrListA = ((team1.balls || 0) > 120 || (team2.balls || 0) > 120 || /50|one day|cup|list a/i.test(match.league || ''));
    const totalBalls = isOdiOrListA ? 300 : 120;
    const parRRR = isOdiOrListA ? 5.4 : 8.2;

    // Ball-by-ball micro factors (4s, 6s, Wickets, Dots)
    const currentOver = (ld.currentOverBalls || []).map(b => String(b).toUpperCase());
    const lastBall = currentOver.length ? currentOver[currentOver.length - 1] : String(ld.lastBall || ld.lastRun || '').toUpperCase();

    // Human Ball Momentum Impact:
    let ballMomentum = 0;
    if (lastBall === '6' || lastBall === '6B') {
      ballMomentum = 0.035; // 6 shifts batting win probability +3.5%
    } else if (lastBall === '4' || lastBall === '4B') {
      ballMomentum = 0.020; // 4 shifts batting win probability +2.0%
    } else if (lastBall === 'W' || lastBall === 'WKT') {
      ballMomentum = -0.065; // Wicket penalizes batting win probability -6.5%
    } else if (lastBall === '0' || lastBall === '•') {
      ballMomentum = -0.006;
    } else if (lastBall === '1' || lastBall === '2' || lastBall === '3') {
      ballMomentum = 0.004;
    }

    let pDefending = 0.50;
    let pChasing = 0.50;

    if (is2ndInnings) {
      // 2ND INNINGS: Team 1 defended, Team 2 chasing
      const target = (team1.runs || 150) + 1;
      const chaseRuns = team2.runs || 0;
      const wicketsLost = team2.wickets || 0;
      const ballsBowled = Math.max(0, team2.balls || 0);
      const remainingBalls = Math.max(1, totalBalls - ballsBowled);
      const runsNeeded = Math.max(0, target - chaseRuns);

      const rrr = (runsNeeded / remainingBalls) * 6;

      // Human Bookmaker 2nd Innings Target Curve:
      // Compare RRR to par RRR (e.g. 5.4 for 50-over, 8.2 for T20)
      const rrrDiff = rrr - parRRR;
      const oversRemaining = remainingBalls / 6;

      // Weight RRR pressure heavily when remaining overs shrink
      const urgencyFactor = 1 + (1 / Math.max(1, oversRemaining * 0.5));
      const rrrPenalty = rrrDiff * 0.035 * urgencyFactor;

      // Wickets lost penalty for chasing team
      const wicketPenalty = wicketsLost * 0.045 * (1 + (wicketsLost > 4 ? 0.3 : 0));

      // Chasing team probability starts at 0.50 (adjusted for target vs par target)
      let chaseProb = 0.50 - rrrPenalty - wicketPenalty + ballMomentum;

      // Target difficulty adjustment (e.g., Target 264 in 50 overs is very standard, ~47% chase)
      if (isOdiOrListA && target >= 250 && target <= 280 && ballsBowled < 12) {
        chaseProb = 0.47 + ballMomentum;
      } else if (!isOdiOrListA && target >= 165 && target <= 180 && ballsBowled < 12) {
        chaseProb = 0.48 + ballMomentum;
      }

      chaseProb = Math.max(0.03, Math.min(0.97, chaseProb));

      pDefending = 1 - chaseProb;
      pChasing = chaseProb;
    } else {
      // 1ST INNINGS: Team 1 batting, Team 2 bowling
      const runs = team1.runs || 0;
      const wickets = Math.min(9, team1.wickets || 0);
      const ballsBowled = Math.max(1, team1.balls || 1);
      const crr = (runs / ballsBowled) * 6;

      const crrDiff = crr - parRRR;
      const wicketPenalty = wickets * 0.04;

      let batProb = 0.50 + (crrDiff * 0.03) - wicketPenalty + ballMomentum;
      batProb = Math.max(0.08, Math.min(0.92, batProb));

      pDefending = batProb;
      pChasing = 1 - batProb;
    }

    // Map back to team1 (Hampshire / Home) vs team2 (Glamorgan / Away)
    const pTeam1 = pDefending;
    const pTeam2 = pChasing;

    const clamped1 = Math.max(0.04, Math.min(0.96, pTeam1));
    const clamped2 = Math.max(0.04, Math.min(0.96, pTeam2));
    const total = clamped1 + clamped2;

    return {
      team1: probToOdds(clamped1 / total),
      team2: probToOdds(clamped2 / total),
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
  console.warn('[NON_AUTHORITATIVE_ODDS_SOURCE] Legacy generateMatchMarkets invoked. OddsEngineV3 is the authoritative source.');
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
    const is2ndInnings = isCricketSecondInnings(match, ld);

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

    // 3. Double Chance
    const dc1XOdds = Number((1 / (1 / Number(t1Odds) + 1 / (Number(drawOdds) || 12.0))).toFixed(2));
    const dcX2Odds = Number((1 / (1 / Number(t2Odds) + 1 / (Number(drawOdds) || 12.0))).toFixed(2));
    markets.push({
      key: 'double_chance',
      title: 'Double Chance',
      category: 'main',
      options: [
        { selection: 'DC:1X', name: `${team1Name} or Draw`, odds: Math.max(1.05, dc1XOdds) },
        { selection: 'DC:12', name: `${team1Name} or ${team2Name}`, odds: 1.25 },
        { selection: 'DC:X2', name: `Draw or ${team2Name}`, odds: Math.max(1.05, dcX2Odds) },
      ],
    });

    // Ball-by-ball event inspection for markets
    const currentOver = (ld.currentOverBalls || []).map(b => String(b).toUpperCase());
    const lastBall = currentOver.length ? currentOver[currentOver.length - 1] : String(ld.lastBall || ld.lastRun || '').toUpperCase();
    const isLastBallBoundary = lastBall === '4' || lastBall === '6' || lastBall === '4B' || lastBall === '6B';
    const isLastBallSix = lastBall === '6' || lastBall === '6B';
    const isLastBallFour = lastBall === '4' || lastBall === '4B';
    const isLastBallWicket = lastBall === 'W' || lastBall === 'WKT';

    const b14s = (ld.batter1?.fours || 0) + (ld.batter2?.fours || 0);
    const b16s = (ld.batter1?.sixes || 0) + (ld.batter2?.sixes || 0);
    const liveFoursCount = ld.fours ?? Math.max(b14s, Math.floor((team1.runs + team2.runs) / 12));
    const liveSixesCount = ld.sixes ?? Math.max(b16s, Math.floor((team1.runs + team2.runs) / 24));

    // 4. Total Match Sixes
    const sixesLine = isLive ? Math.max(4.5, liveSixesCount + 2.5) : 12.5;
    const sixesOverOdds = isLastBallSix ? 1.65 : isLastBallWicket ? 2.15 : 1.85;
    const sixesUnderOdds = Number((3.65 - sixesOverOdds).toFixed(2));
    markets.push({
      key: 'match_sixes',
      title: 'Total Match Sixes',
      category: 'totals',
      options: [
        { selection: `Sixes:Over ${sixesLine}`, name: `Over ${sixesLine}`, odds: sixesOverOdds },
        { selection: `Sixes:Under ${sixesLine}`, name: `Under ${sixesLine}`, odds: sixesUnderOdds },
      ],
    });

    // 5. Total Match Sixes (Alt Line)
    markets.push({
      key: 'match_sixes_alt',
      title: 'Total Match Sixes (Alternate)',
      category: 'totals',
      options: [
        { selection: `SixesAlt:Over ${sixesLine - 3}`, name: `Over ${sixesLine - 3}`, odds: 1.40 },
        { selection: `SixesAlt:Under ${sixesLine + 3}`, name: `Under ${sixesLine + 3}`, odds: 1.40 },
      ],
    });

    // 6. Total Match Fours
    const foursLine = isLive ? Math.max(12.5, liveFoursCount + 5.5) : 28.5;
    const foursOverOdds = isLastBallFour ? 1.68 : isLastBallWicket ? 2.10 : 1.85;
    const foursUnderOdds = Number((3.65 - foursOverOdds).toFixed(2));
    markets.push({
      key: 'match_fours',
      title: 'Total Match Fours',
      category: 'totals',
      options: [
        { selection: `Fours:Over ${foursLine}`, name: `Over ${foursLine}`, odds: foursOverOdds },
        { selection: `Fours:Under ${foursLine}`, name: `Under ${foursLine}`, odds: foursUnderOdds },
      ],
    });

    // 7. Total Match Fours (Alt Line)
    markets.push({
      key: 'match_fours_alt',
      title: 'Total Match Fours (Alternate)',
      category: 'totals',
      options: [
        { selection: `FoursAlt:Over ${foursLine - 6}`, name: `Over ${foursLine - 6}`, odds: 1.38 },
        { selection: `FoursAlt:Under ${foursLine + 6}`, name: `Under ${foursLine + 6}`, odds: 1.38 },
      ],
    });

    // 8. Total Match Runs
    const currentTotalRuns = team1.runs + team2.runs;
    const target = match.target || (is2ndInnings && team1.runs ? team1.runs + 1 : null);
    let projectedRuns = isLive ? (currentTotalRuns + Math.max(10, Math.floor((120 - team2.balls) * 1.3))) : 315;
    if (is2ndInnings && team1.runs) {
      const maxPossibleTotal = team1.runs + (target ? target + 2 : 150);
      projectedRuns = Math.min(maxPossibleTotal, projectedRuns);
    }
    const matchRunsLine = Math.floor(projectedRuns) + 0.5;
    const runsOverOdds = isLastBallBoundary ? 1.72 : isLastBallWicket ? 2.08 : 1.87;
    const runsUnderOdds = Number((3.65 - runsOverOdds).toFixed(2));
    markets.push({
      key: 'match_total_runs',
      title: 'Total Match Runs',
      category: 'totals',
      options: [
        { selection: `MatchRuns:Over ${matchRunsLine}`, name: `Over ${matchRunsLine}`, odds: runsOverOdds },
        { selection: `MatchRuns:Under ${matchRunsLine}`, name: `Under ${matchRunsLine}`, odds: runsUnderOdds },
      ],
    });

    // 9. Team 1 Total Runs
    const t1Runs = team1.runs || 0;
    const t1Proj = isLive ? Math.max(165.5, Math.ceil((t1Runs + 15) / 5) * 5 + 0.5) : 165.5;
    const t1IsDetermined = t1Runs > t1Proj;
    markets.push({
      key: 'team1_runs',
      title: `${team1Name} Total Runs`,
      category: 'totals',
      status: t1IsDetermined ? 'DETERMINED' : 'OPEN',
      options: [
        { selection: `T1Runs:Over ${t1Proj}`, name: `Over ${t1Proj}`, odds: t1IsDetermined ? 1.01 : 1.85, status: t1IsDetermined ? 'DETERMINED' : 'OPEN', bettable: !t1IsDetermined, won: t1IsDetermined },
        { selection: `T1Runs:Under ${t1Proj}`, name: `Under ${t1Proj}`, odds: t1IsDetermined ? 1.01 : 1.85, status: t1IsDetermined ? 'DETERMINED' : 'OPEN', bettable: false, won: false },
      ],
    });

    // 10. Team 2 Total Runs
    const t2Runs = team2.runs || 0;
    let t2Proj = isLive ? Math.max(155.5, Math.ceil((t2Runs + 15) / 5) * 5 + 0.5) : 155.5;
    if (is2ndInnings && target != null) {
      t2Proj = Math.min(target + 0.5, t2Runs + 15.5);
    }
    const t2IsDetermined = t2Runs > t2Proj;
    markets.push({
      key: 'team2_runs',
      title: `${team2Name} Total Runs`,
      category: 'totals',
      status: t2IsDetermined ? 'DETERMINED' : 'OPEN',
      options: [
        { selection: `T2Runs:Over ${t2Proj}`, name: `Over ${t2Proj}`, odds: t2IsDetermined ? 1.01 : 1.85, status: t2IsDetermined ? 'DETERMINED' : 'OPEN', bettable: !t2IsDetermined, won: t2IsDetermined },
        { selection: `T2Runs:Under ${t2Proj}`, name: `Under ${t2Proj}`, odds: t2IsDetermined ? 1.01 : 1.85, status: t2IsDetermined ? 'DETERMINED' : 'OPEN', bettable: false, won: false },
      ],
    });

    const innLabel = is2ndInnings ? '2nd Innings' : '1st Innings';

    // 11. Innings Powerplay (6 Overs) Total
    markets.push({
      key: 'powerplay_total',
      title: `${innLabel} 6 Over Powerplay Total`,
      category: 'over',
      options: [
        { selection: 'Powerplay:Over 48.5', name: 'Over 48.5', odds: 1.87 },
        { selection: 'Powerplay:Under 48.5', name: 'Under 48.5', odds: 1.87 },
      ],
    });

    // 12. 1st Innings Over 12 Total
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

    // 13. 1st Over Runs Total
    markets.push({
      key: 'first_over_runs',
      title: '1st Innings 1st Over Total Runs',
      category: 'over',
      options: [
        { selection: 'First Over:Over 5.5', name: 'Over 5.5', odds: 1.90 },
        { selection: 'First Over:Under 5.5', name: 'Under 5.5', odds: 1.80 },
      ],
    });

    // 14. 1st Over Wicket
    markets.push({
      key: 'first_over_wicket',
      title: 'Wicket in 1st Over',
      category: 'over',
      options: [
        { selection: 'FirstOverWicket:Yes', name: 'Yes', odds: 4.50 },
        { selection: 'FirstOverWicket:No', name: 'No', odds: 1.18 },
      ],
    });

    // 15. Next delivery total & Boundary
    const deliveryOverOdds = isLive ? (isLastBallBoundary ? 1.25 : isLastBallWicket ? 1.65 : 1.45) : 1.45;
    const deliveryBoundaryOdds = isLastBallBoundary ? 3.40 : isLastBallWicket ? 5.50 : 4.50;
    markets.push({
      key: 'delivery',
      title: `1st innings over ${currentOversNum + 1} - next delivery total`,
      category: 'delivery',
      options: [
        { selection: 'Delivery:Over 0.5', name: 'Over 0.5', odds: deliveryOverOdds },
        { selection: 'Delivery:Under 0.5', name: 'Under 0.5', odds: Number((3.50 - deliveryOverOdds).toFixed(2)) },
        { selection: 'Delivery:Over 1.5', name: 'Over 1.5', odds: isLastBallBoundary ? 3.10 : 3.85 },
        { selection: 'Delivery:Boundary', name: 'Boundary (4 or 6)', odds: deliveryBoundaryOdds },
        { selection: 'Delivery:Wicket', name: 'Wicket', odds: 9.50 },
      ],
    });

    // 16. 1st Partnership Total
    markets.push({
      key: 'partnership',
      title: '1st innings - 1st partnership total',
      category: 'partnership',
      options: [
        { selection: 'Partnership:Over 45.5', name: 'Over 45.5', odds: 1.88 },
        { selection: 'Partnership:Under 45.5', name: 'Under 45.5', odds: 1.88 },
      ],
    });

    // 17. Highest Opening Partnership
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

    // 18. Team to Score Most Sixes
    markets.push({
      key: 'most_sixes',
      title: 'Team to Score Most Sixes',
      category: 'props',
      options: [
        { selection: 'MostSixes:1', name: team1Name, odds: Number((Number(t1Odds) * 1.05).toFixed(2)) },
        { selection: 'MostSixes:2', name: team2Name, odds: Number((Number(t2Odds) * 1.05).toFixed(2)) },
        { selection: 'MostSixes:Tie', name: 'Tie', odds: 7.50 },
      ],
    });

    // 19. Team to Score Most Fours
    markets.push({
      key: 'most_fours',
      title: 'Team to Score Most Fours',
      category: 'props',
      options: [
        { selection: 'MostFours:1', name: team1Name, odds: Number((Number(t1Odds) * 1.02).toFixed(2)) },
        { selection: 'MostFours:2', name: team2Name, odds: Number((Number(t2Odds) * 1.02).toFixed(2)) },
        { selection: 'MostFours:Tie', name: 'Tie', odds: 9.00 },
      ],
    });

    // 20. Method of Next Wicket
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

    // 21. Race to 50 Runs
    markets.push({
      key: 'race_to_50',
      title: 'Race to 50 Runs',
      category: 'props',
      options: [
        { selection: 'Race50:1', name: team1Name, odds: Number(t1Odds) },
        { selection: 'Race50:2', name: team2Name, odds: Number(t2Odds) },
        { selection: 'Race50:Neither', name: 'Neither', odds: 25.0 },
      ],
    });

    // 22. Top Batter Runs (Player prop)
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

    // 23. Player to Score 50+ Runs
    const strikerName = ld.batter1?.name || `${team1Name} Striker`;
    markets.push({
      key: 'player_fifty',
      title: `${strikerName} to Score 50+ Runs`,
      category: 'props',
      options: [
        { selection: 'Fifty:Yes', name: 'Yes', odds: 2.10 },
        { selection: 'Fifty:No', name: 'No', odds: 1.68 },
      ],
    });

    // 24. A Century to be Scored in Match
    markets.push({
      key: 'match_century',
      title: 'A Century (100+) to be Scored in Match',
      category: 'props',
      options: [
        { selection: 'Century:Yes', name: 'Yes', odds: 3.40 },
        { selection: 'Century:No', name: 'No', odds: 1.30 },
      ],
    });

    // 25. Total Match Wickets
    markets.push({
      key: 'total_wickets',
      title: 'Total Match Wickets',
      category: 'totals',
      options: [
        { selection: 'Wickets:Over 11.5', name: 'Over 11.5', odds: 1.85 },
        { selection: 'Wickets:Under 11.5', name: 'Under 11.5', odds: 1.85 },
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

    // 3. Total Goals Over/Under Line (Main)
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

    // 4. Total Goals Over/Under 1.5
    markets.push({
      key: 'goals_15',
      title: 'Total Goals Over/Under 1.5',
      category: 'goals',
      options: [
        { selection: 'Goals:Over 1.5', name: 'Over 1.5', odds: 1.25 },
        { selection: 'Goals:Under 1.5', name: 'Under 1.5', odds: 3.75 },
      ],
    });

    // 5. Total Goals Over/Under 3.5
    markets.push({
      key: 'goals_35',
      title: 'Total Goals Over/Under 3.5',
      category: 'goals',
      options: [
        { selection: 'Goals:Over 3.5', name: 'Over 3.5', odds: 3.10 },
        { selection: 'Goals:Under 3.5', name: 'Under 3.5', odds: 1.35 },
      ],
    });

    // 6. Team 1 Total Goals
    markets.push({
      key: 'team1_goals',
      title: `${team1Name} Total Goals`,
      category: 'goals',
      options: [
        { selection: 'T1Goals:Over 1.5', name: 'Over 1.5', odds: 1.85 },
        { selection: 'T1Goals:Under 1.5', name: 'Under 1.5', odds: 1.85 },
      ],
    });

    // 7. Team 2 Total Goals
    markets.push({
      key: 'team2_goals',
      title: `${team2Name} Total Goals`,
      category: 'goals',
      options: [
        { selection: 'T2Goals:Over 1.5', name: 'Over 1.5', odds: 1.95 },
        { selection: 'T2Goals:Under 1.5', name: 'Under 1.5', odds: 1.75 },
      ],
    });

    // 8. Double Chance
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

    // 9. Draw No Bet
    markets.push({
      key: 'dnb',
      title: 'Draw No Bet',
      category: 'chance',
      options: [
        { selection: 'DNB:1', name: team1Name, odds: Number((Number(t1Odds) * 0.72).toFixed(2)) },
        { selection: 'DNB:2', name: team2Name, odds: Number((Number(t2Odds) * 0.72).toFixed(2)) },
      ],
    });

    // 10. First Half Winner
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

    // 11. Half Time / Full Time (HT/FT)
    markets.push({
      key: 'ht_ft',
      title: 'Half Time / Full Time',
      category: 'halves',
      options: [
        { selection: 'HTFT:1/1', name: `${team1Name} / ${team1Name}`, odds: Number((Number(t1Odds) * 1.8).toFixed(2)) },
        { selection: 'HTFT:X/1', name: `Draw / ${team1Name}`, odds: 4.50 },
        { selection: 'HTFT:2/2', name: `${team2Name} / ${team2Name}`, odds: Number((Number(t2Odds) * 1.8).toFixed(2)) },
        { selection: 'HTFT:X/2', name: `Draw / ${team2Name}`, odds: 5.20 },
      ],
    });

    // 12. Correct Score Grid
    markets.push({
      key: 'correct_score',
      title: 'Correct Score',
      category: 'goals',
      options: [
        { selection: 'CS:1-0', name: '1-0', odds: 6.50 },
        { selection: 'CS:2-0', name: '2-0', odds: 8.50 },
        { selection: 'CS:2-1', name: '2-1', odds: 8.00 },
        { selection: 'CS:0-0', name: '0-0', odds: 9.00 },
        { selection: 'CS:1-1', name: '1-1', odds: 6.00 },
        { selection: 'CS:0-1', name: '0-1', odds: 7.50 },
        { selection: 'CS:0-2', name: '0-2', odds: 11.00 },
      ],
    });

    // 13. Total Corners Over/Under 9.5
    markets.push({
      key: 'corners_95',
      title: 'Total Match Corners Over/Under 9.5',
      category: 'main',
      options: [
        { selection: 'Corners:Over 9.5', name: 'Over 9.5 Corners', odds: 1.85 },
        { selection: 'Corners:Under 9.5', name: 'Under 9.5 Corners', odds: 1.85 },
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

    // 4. Team 1 Total Points
    markets.push({
      key: 'team1_pts',
      title: `${team1Name} Total Points`,
      category: 'totals',
      options: [
        { selection: 'T1Pts:Over 108.5', name: 'Over 108.5', odds: 1.85 },
        { selection: 'T1Pts:Under 108.5', name: 'Under 108.5', odds: 1.85 },
      ],
    });

    // 5. Team 2 Total Points
    markets.push({
      key: 'team2_pts',
      title: `${team2Name} Total Points`,
      category: 'totals',
      options: [
        { selection: 'T2Pts:Over 105.5', name: 'Over 105.5', odds: 1.85 },
        { selection: 'T2Pts:Under 105.5', name: 'Under 105.5', odds: 1.85 },
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

    markets.push({
      key: 'total_games',
      title: 'Total Match Games',
      category: 'games',
      options: [
        { selection: 'Games:Over 21.5', name: 'Over 21.5 Games', odds: 1.85 },
        { selection: 'Games:Under 21.5', name: 'Under 21.5 Games', odds: 1.85 },
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

  const { team1: team1Score, team2: team2Score } = (sport === 'cricket' || sport === 'virtual-cricket') ? resolveCricketTeamScores(match, ld) : { team1: {}, team2: {} };
  const isSecondInnings = (sport === 'cricket' || sport === 'virtual-cricket') ? isCricketSecondInnings(match, ld) : false;

  const matchStateObj = {
    teams: {
      team1: { name: team1Name, runs: team1Score?.runs ?? 0 },
      team2: { name: team2Name, runs: team2Score?.runs ?? 0 },
    },
    liveDetails: ld,
    currentInnings: { number: isSecondInnings ? 2 : 1 },
    status: match.status,
    matchState: match.matchState,
    chaseState: match.chaseState,
  };

  const evaluatedMarkets = markets.map((m) => {
    const evalRes = evaluateMarketAgainstMatchState(m, matchStateObj);
    return {
      ...m,
      status: evalRes.status,
      determined: evalRes.determined,
      options: evalRes.options || m.options,
    };
  });

  return evaluatedMarkets;
}
