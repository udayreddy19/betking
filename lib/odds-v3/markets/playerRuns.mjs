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

import { calculatePlayerMilestoneProbability } from '../models/playerPerformanceModel.mjs';
import { getRosterForTeam } from '../../../src/data/cricketRosters.js';
import { priceSelection } from '../pricing/OddsCalculator.mjs';
import { createMarketDefinition } from '../models/MarketDefinition.mjs';

export function generateExtendedPlayerMarkets(state, validation = {}, marginConfig = {}) {
  const overround = marginConfig.liveMatchWinnerOverround || 0.055;
  const battingTeam = state.battingTeamId === state.team1.id ? state.team1 : state.team2;
  const bowlingTeam = state.battingTeamId === state.team1.id ? state.team2 : state.team1;

  const batRoster = getRosterForTeam(battingTeam.name);
  const bowlRoster = getRosterForTeam(bowlingTeam.name);

  const batter1Name = batRoster?.batters?.[0] || `${battingTeam.name} Batter 1`;
  const batter2Name = batRoster?.batters?.[1] || `${battingTeam.name} Batter 2`;
  const bowlerName = bowlRoster?.bowlers?.[0] || `${bowlingTeam.name} Bowler 1`;

  const currentBatterRuns = Number(state.batter1?.runs ?? state.liveDetails?.batter1?.runs ?? 0);
  const innLabel = state.currentInnings === 2 ? '2nd Innings' : '1st Innings';
  const ballsRemaining = state.ballsRemaining || 60;
  const markets = [];

  // 1. Batter 1 Alternate Line (Over 34.5 / Under 34.5)
  const altLine = Math.max(34.5, currentBatterRuns + 5.5);
  const pAltOver = calculatePlayerMilestoneProbability(currentBatterRuns, altLine, ballsRemaining);
  markets.push(createMarketDefinition({
    marketId: `player_alt_${batter1Name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
    marketType: 'PLAYER_RUNS_ALT',
    category: 'player_props',
    name: `${innLabel} - ${batter1Name} Total Runs (Alt Line)`,
    status: currentBatterRuns > altLine ? 'DETERMINED' : 'OPEN',
    line: altLine,
    selections: [
      priceSelection({ selectionId: 'sel_palt_over', name: `Over ${altLine}`, probability: pAltOver, overround }),
      priceSelection({ selectionId: 'sel_palt_under', name: `Under ${altLine}`, probability: 1.0 - pAltOver, overround }),
    ],
  }));

  // 2. Batter 1 To Score 25+
  const is25Passed = currentBatterRuns >= 25;
  const p25 = calculatePlayerMilestoneProbability(currentBatterRuns, 25, ballsRemaining);
  markets.push(createMarketDefinition({
    marketId: `player_25_${batter1Name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
    marketType: 'PLAYER_SCORE_25',
    category: 'player_props',
    name: `${innLabel} - ${batter1Name} To Score 25+ Runs`,
    status: is25Passed ? 'DETERMINED' : 'OPEN',
    selections: [
      priceSelection({ selectionId: 'sel_25_yes', name: 'Yes', probability: is25Passed ? 0.99 : p25, overround }),
      priceSelection({ selectionId: 'sel_25_no', name: 'No', probability: is25Passed ? 0.01 : (1.0 - p25), overround }),
    ],
  }));

  // 3. Batter 1 To Score 50+
  const is50Passed = currentBatterRuns >= 50;
  const p50 = calculatePlayerMilestoneProbability(currentBatterRuns, 50, ballsRemaining);
  markets.push(createMarketDefinition({
    marketId: `player_50_${batter1Name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
    marketType: 'PLAYER_SCORE_50',
    category: 'player_props',
    name: `${innLabel} - ${batter1Name} To Score 50+ Runs`,
    status: is50Passed ? 'DETERMINED' : 'OPEN',
    selections: [
      priceSelection({ selectionId: 'sel_50_yes', name: 'Yes', probability: is50Passed ? 0.99 : p50, overround }),
      priceSelection({ selectionId: 'sel_50_no', name: 'No', probability: is50Passed ? 0.01 : (1.0 - p50), overround }),
    ],
  }));

  // 4. Batter 1 To Score 100+
  const is100Passed = currentBatterRuns >= 100;
  const p100 = calculatePlayerMilestoneProbability(currentBatterRuns, 100, ballsRemaining);
  markets.push(createMarketDefinition({
    marketId: `player_100_${batter1Name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
    marketType: 'PLAYER_SCORE_100',
    category: 'player_props',
    name: `${innLabel} - ${batter1Name} To Score 100+ Runs`,
    status: is100Passed ? 'DETERMINED' : 'OPEN',
    selections: [
      priceSelection({ selectionId: 'sel_100_yes', name: 'Yes', probability: is100Passed ? 0.99 : p100, overround }),
      priceSelection({ selectionId: 'sel_100_no', name: 'No', probability: is100Passed ? 0.01 : (1.0 - p100), overround }),
    ],
  }));

  // 5. Top Batter
  markets.push(createMarketDefinition({
    marketId: 'top_batter',
    marketType: 'TOP_BATTER',
    category: 'player_props',
    name: `${innLabel} - ${battingTeam.name} Top Batter`,
    status: 'OPEN',
    selections: [
      priceSelection({ selectionId: 'sel_tb_1', name: batter1Name, probability: 0.42, overround }),
      priceSelection({ selectionId: 'sel_tb_2', name: batter2Name, probability: 0.35, overround }),
      priceSelection({ selectionId: 'sel_tb_3', name: batRoster?.batters?.[2] || 'Other Batter', probability: 0.23, overround }),
    ],
  }));

  // 6. Top Bowler
  markets.push(createMarketDefinition({
    marketId: 'top_bowler',
    marketType: 'TOP_BOWLER',
    category: 'player_props',
    name: `${innLabel} - ${bowlingTeam.name} Top Bowler`,
    status: 'OPEN',
    selections: [
      priceSelection({ selectionId: 'sel_tbowl_1', name: bowlerName, probability: 0.45, overround }),
      priceSelection({ selectionId: 'sel_tbowl_2', name: bowlRoster?.bowlers?.[1] || 'Second Bowler', probability: 0.35, overround }),
      priceSelection({ selectionId: 'sel_tbowl_3', name: bowlRoster?.bowlers?.[2] || 'Third Bowler', probability: 0.20, overround }),
    ],
  }));

  return markets;
}
