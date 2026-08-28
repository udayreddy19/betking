/**
 * OddsEngineV3 — Extended Player Markets (Group 7)
 * 
 * Generates:
 * 1. Player Total Runs Alternate Line (e.g. Over 34.5 / Under 34.5)
 * 2. Player To Score 25+
 * 3. Player To Score 50+
 * 4. Player To Score 75+
 * 5. Player To Score 100+
 * 6. Player Total Fours / Sixes
 * 7. Top Batter
 * 8. Top Bowler
 */

import { calculatePlayerMilestoneProbability, enforceMilestoneProbabilityOrdering, MILESTONE_MAX_ODDS } from '../models/playerPerformanceModel.mjs';
import { priceSelection } from '../pricing/OddsCalculator.mjs';
import { createMarketDefinition } from '../models/MarketDefinition.mjs';

/**
 * Calculate top batter probability from current runs and projected
 * remaining runs for each batter.
 *
 * Uses the milestone probability model in reverse: the batter with
 * more runs AND more remaining potential (balls faced ratio) is
 * more likely to finish as top scorer.
 */
function calculateTopBatterProbability(b1Runs, b2Runs, b1Balls, b2Balls, ballsRemaining) {
  // Each batter's expected share of remaining balls: proportional to how
  // active they currently are. If both just started, split evenly.
  const totalFaced = (b1Balls || 0) + (b2Balls || 0);
  const b1Share = totalFaced > 0 ? (b1Balls || 0) / totalFaced : 0.5;
  const b2Share = 1 - b1Share;

  // Projected remaining runs: SR × remaining balls faced
  const b1SR = b1Balls > 0 ? b1Runs / b1Balls : 1.2;
  const b2SR = b2Balls > 0 ? b2Runs / b2Balls : 1.2;
  const b1Projected = b1Runs + b1SR * (ballsRemaining * b1Share * 0.35);
  const b2Projected = b2Runs + b2SR * (ballsRemaining * b2Share * 0.35);

  // Logistic model based on projected score difference
  const diff = b1Projected - b2Projected;
  const rawP = 1 / (1 + Math.exp(-diff * 0.08));
  return Math.max(0.10, Math.min(0.90, rawP));
}

export function generateExtendedPlayerMarkets(state, validation = {}, marginConfig = {}) {
  const overround = marginConfig.liveMatchWinnerOverround || 0.055;
  const battingTeam = state.battingTeamId === state.team1.id ? state.team1 : state.team2;
  const bowlingTeam = state.battingTeamId === state.team1.id ? state.team2 : state.team1;

  const batter1Name = state.batter1?.name || state.liveDetails?.batter1?.name;
  const batter2Name = state.batter2?.name || state.liveDetails?.batter2?.name;
  const bowlerName = state.bowler?.name || state.liveDetails?.bowler?.name;
  if (!batter1Name) return [];

  const b1Runs = Number(state.batter1?.runs ?? state.liveDetails?.batter1?.runs ?? 0);
  const b1Balls = Number(state.batter1?.balls ?? state.liveDetails?.batter1?.balls ?? 0);
  const b2Runs = Number(state.batter2?.runs ?? state.liveDetails?.batter2?.runs ?? 0);
  const b2Balls = Number(state.batter2?.balls ?? state.liveDetails?.batter2?.balls ?? 0);
  const innLabel = state.currentInnings === 2 ? '2nd Innings' : '1st Innings';
  const ballsRemaining = state.ballsRemaining || 60;
  const markets = [];

  // 1. Batter 1 Alternate Line (Over X.5 / Under X.5)
  const altLine = Math.max(24.5, Math.ceil((b1Runs + 8) / 5) * 5 - 0.5);
  const maxPossibleRuns = b1Runs + Math.max(0, ballsRemaining) * 6;
  const isAltOverWon = b1Runs > altLine;
  const isAltUnderWon = maxPossibleRuns < altLine;

  if (isAltOverWon || isAltUnderWon) {
    markets.push(createMarketDefinition({
      marketId: `player_alt_${batter1Name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
      marketType: 'PLAYER_RUNS_ALT',
      category: 'player_props',
      name: `${innLabel} - ${batter1Name} Total Runs (Alt Line)`,
      status: 'SETTLED',
      determined: true,
      result: isAltOverWon ? `Over ${altLine}` : `Under ${altLine}`,
      line: altLine,
      selections: [
        { selectionId: 'sel_palt_over', name: `Over ${altLine}`, status: isAltOverWon ? 'WON' : 'LOST', bettable: false, odds: null, probability: null, fairOdds: null, margin: null, finalProbability: null, won: isAltOverWon },
        { selectionId: 'sel_palt_under', name: `Under ${altLine}`, status: isAltUnderWon ? 'WON' : 'LOST', bettable: false, odds: null, probability: null, fairOdds: null, margin: null, finalProbability: null, won: isAltUnderWon },
      ],
    }));
  } else {
    const rawAltOver = calculatePlayerMilestoneProbability(b1Runs, Math.ceil(altLine), ballsRemaining);
    const pAltOver = Math.max(1e-12, Math.min(0.9999, rawAltOver));

    markets.push(createMarketDefinition({
      marketId: `player_alt_${batter1Name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
      marketType: 'PLAYER_RUNS_ALT',
      category: 'player_props',
      name: `${innLabel} - ${batter1Name} Total Runs (Alt Line)`,
      status: 'OPEN',
      determined: false,
      line: altLine,
      selections: [
        priceSelection({ selectionId: 'sel_palt_over', name: `Over ${altLine}`, probability: pAltOver, overround }),
        priceSelection({ selectionId: 'sel_palt_under', name: `Under ${altLine}`, probability: Math.max(1e-12, 1.0 - pAltOver), overround }),
      ],
    }));
  }

  const playerSlug = batter1Name.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const milestoneDefs = [
    { target: 25, marketId: 'player_25', marketType: 'PLAYER_SCORE_25', name: 'To Score 25+ Runs' },
    { target: 50, marketId: 'player_50', marketType: 'PLAYER_SCORE_50', name: 'To Score 50+ Runs' },
    { target: 100, marketId: 'player_100', marketType: 'PLAYER_SCORE_100', name: 'To Score 100+ Runs' },
  ];
  const openMilestones = [];

  for (const def of milestoneDefs) {
    const { target, marketId, marketType, name } = def;
    const isPassed = b1Runs >= target;
    if (isPassed) {
      markets.push(createMarketDefinition({
        marketId: `${marketId}_${playerSlug}`,
        marketType,
        category: 'player_props',
        name: `${innLabel} - ${batter1Name} ${name}`,
        status: 'SETTLED',
        determined: true,
        result: 'YES',
        selections: [
          { selectionId: `sel_${target}_yes`, name: 'Yes', status: 'WON', bettable: false, odds: null, probability: null, fairOdds: null, margin: null, finalProbability: null, won: true },
          { selectionId: `sel_${target}_no`, name: 'No', status: 'LOST', bettable: false, odds: null, probability: null, fairOdds: null, margin: null, finalProbability: null, won: false },
        ],
      }));
      continue;
    }

    const maxPossible = b1Runs + Math.max(0, ballsRemaining) * 6;
    if (maxPossible < target) {
      markets.push(createMarketDefinition({
        marketId: `${marketId}_${playerSlug}`,
        marketType,
        category: 'player_props',
        name: `${innLabel} - ${batter1Name} ${name}`,
        status: 'SETTLED',
        determined: true,
        result: 'NO',
        selections: [
          { selectionId: `sel_${target}_yes`, name: 'Yes', status: 'LOST', bettable: false, odds: null, probability: null, fairOdds: null, margin: null, finalProbability: null, won: false },
          { selectionId: `sel_${target}_no`, name: 'No', status: 'WON', bettable: false, odds: null, probability: null, fairOdds: null, margin: null, finalProbability: null, won: true },
        ],
      }));
      continue;
    }

    openMilestones.push({
      ...def,
      rawReach: calculatePlayerMilestoneProbability(b1Runs, target, ballsRemaining),
    });
  }

  const orderedReach = enforceMilestoneProbabilityOrdering(
    openMilestones.map((entry) => entry.rawReach),
  );

  openMilestones.forEach((entry, index) => {
    const { target, marketId, marketType, name } = entry;
    const pReach = Math.max(1e-12, Math.min(0.9999, orderedReach[index]));
    const maxYesOdds = MILESTONE_MAX_ODDS[target] || 100.0;

    markets.push(createMarketDefinition({
      marketId: `${marketId}_${playerSlug}`,
      marketType,
      category: 'player_props',
      name: `${innLabel} - ${batter1Name} ${name}`,
      status: 'OPEN',
      determined: false,
      selections: [
        priceSelection({
          selectionId: `sel_${target}_yes`,
          name: 'Yes',
          probability: pReach,
          overround,
          maxOdds: maxYesOdds,
        }),
        priceSelection({
          selectionId: `sel_${target}_no`,
          name: 'No',
          probability: Math.max(1e-12, 1.0 - pReach),
          overround,
          maxOdds: 15.0,
        }),
      ],
    }));
  });

  // 5. Top Batter — dynamic model based on current runs + projected remaining
  if (batter2Name) {
    const pB1Top = calculateTopBatterProbability(b1Runs, b2Runs, b1Balls, b2Balls, ballsRemaining);
    markets.push(createMarketDefinition({
      marketId: 'top_batter',
      marketType: 'TOP_BATTER',
      category: 'player_props',
      name: `${innLabel} - ${battingTeam.name} Top Batter`,
      status: 'OPEN',
      selections: [
        priceSelection({ selectionId: 'sel_tb_1', name: batter1Name, probability: pB1Top, overround }),
        priceSelection({ selectionId: 'sel_tb_2', name: batter2Name, probability: 1.0 - pB1Top, overround }),
      ],
    }));
  }

  // 6. Top Bowler — skip if only 1 bowler known (single-selection market isn't useful)
  // Would need bowler2 data to generate a meaningful H2H market

  return markets;
}
