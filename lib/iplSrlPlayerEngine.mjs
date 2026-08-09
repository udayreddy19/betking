/**
 * Module C: IPLSRL Player Engine
 * Player models, attributes, stats tracking, and player management.
 */

export const PLAYER_ROLES = {
  BATTER: 'BATTER',
  BATTING_ALL_ROUNDER: 'BATTING_ALL_ROUNDER',
  BOWLING_ALL_ROUNDER: 'BOWLING_ALL_ROUNDER',
  WICKET_KEEPER: 'WICKET_KEEPER',
  FAST_BOWLER: 'FAST_BOWLER',
  SPIN_BOWLER: 'SPIN_BOWLER',
};

const INITIAL_PLAYERS = [
  // CSK
  { playerId: 'p_csk_1', name: 'Devon Conway SRL', displayName: 'D Conway', teamId: 'csk_srl', role: 'BATTER', battingStyle: 'LHB', bowlingStyle: 'None', battingRating: 86, bowlingRating: 20, fieldingRating: 80, formRating: 84, consistency: 85, aggression: 78, fitness: 90, experience: 82, stats: { matches: 14, runs: 490, balls: 350, fours: 52, sixes: 18, fifties: 4, hundreds: 0, wickets: 0, economy: 0, catches: 8 } },
  { playerId: 'p_csk_2', name: 'Ruturaj Gaikwad SRL', displayName: 'R Gaikwad', teamId: 'csk_srl', role: 'BATTER', battingStyle: 'RHB', bowlingStyle: 'Off Break', battingRating: 89, bowlingRating: 30, fieldingRating: 85, formRating: 88, consistency: 88, aggression: 82, fitness: 92, experience: 85, stats: { matches: 14, runs: 580, balls: 410, fours: 60, sixes: 22, fifties: 5, hundreds: 1, wickets: 0, economy: 0, catches: 10 } },
  { playerId: 'p_csk_3', name: 'Ajinkya Rahane SRL', displayName: 'A Rahane', teamId: 'csk_srl', role: 'BATTER', battingStyle: 'RHB', bowlingStyle: 'Right-arm medium', battingRating: 80, bowlingRating: 25, fieldingRating: 82, formRating: 79, consistency: 80, aggression: 75, fitness: 88, experience: 92, stats: { matches: 14, runs: 320, balls: 235, fours: 30, sixes: 12, fifties: 2, hundreds: 0, wickets: 0, economy: 0, catches: 6 } },
  { playerId: 'p_csk_4', name: 'Shivam Dube SRL', displayName: 'S Dube', teamId: 'csk_srl', role: 'BATTING_ALL_ROUNDER', battingStyle: 'LHB', bowlingStyle: 'Right-arm medium', battingRating: 87, bowlingRating: 65, fieldingRating: 78, formRating: 86, consistency: 82, aggression: 92, fitness: 88, experience: 80, stats: { matches: 14, runs: 410, balls: 250, fours: 28, sixes: 34, fifties: 3, hundreds: 0, wickets: 4, economy: 8.5, catches: 5 } },
  { playerId: 'p_csk_5', name: 'Ravindra Jadeja SRL', displayName: 'R Jadeja', teamId: 'csk_srl', role: 'BOWLING_ALL_ROUNDER', battingStyle: 'LHB', bowlingStyle: 'Slow Left Arm', battingRating: 82, bowlingRating: 88, fieldingRating: 95, formRating: 85, consistency: 90, aggression: 80, fitness: 95, experience: 96, stats: { matches: 14, runs: 240, balls: 170, fours: 20, sixes: 10, fifties: 1, hundreds: 0, wickets: 16, economy: 7.2, catches: 12 } },
  { playerId: 'p_csk_6', name: 'MS Dhoni SRL', displayName: 'MS Dhoni', teamId: 'csk_srl', role: 'WICKET_KEEPER', battingStyle: 'RHB', bowlingStyle: 'Right-arm medium', battingRating: 84, bowlingRating: 10, fieldingRating: 92, formRating: 83, consistency: 89, aggression: 88, fitness: 86, experience: 99, stats: { matches: 14, runs: 190, balls: 110, fours: 12, sixes: 16, fifties: 0, hundreds: 0, wickets: 0, economy: 0, catches: 14, stumpings: 4 } },
  { playerId: 'p_csk_7', name: 'Matheesha Pathirana SRL', displayName: 'M Pathirana', teamId: 'csk_srl', role: 'FAST_BOWLER', battingStyle: 'RHB', bowlingStyle: 'Right-arm fast', battingRating: 30, bowlingRating: 90, fieldingRating: 75, formRating: 89, consistency: 84, aggression: 85, fitness: 90, experience: 78, stats: { matches: 14, runs: 12, balls: 15, fours: 1, sixes: 0, fifties: 0, hundreds: 0, wickets: 21, economy: 7.6, catches: 3 } },
  { playerId: 'p_csk_8', name: 'Tushar Deshpande SRL', displayName: 'T Deshpande', teamId: 'csk_srl', role: 'FAST_BOWLER', battingStyle: 'RHB', bowlingStyle: 'Right-arm medium fast', battingRating: 35, bowlingRating: 81, fieldingRating: 76, formRating: 80, consistency: 78, aggression: 80, fitness: 88, experience: 79, stats: { matches: 14, runs: 22, balls: 20, fours: 2, sixes: 1, fifties: 0, hundreds: 0, wickets: 15, economy: 8.8, catches: 4 } },
  { playerId: 'p_csk_9', name: 'Mukesh Choudhary SRL', displayName: 'M Choudhary', teamId: 'csk_srl', role: 'FAST_BOWLER', battingStyle: 'LHB', bowlingStyle: 'Left-arm fast medium', battingRating: 28, bowlingRating: 80, fieldingRating: 74, formRating: 78, consistency: 77, aggression: 78, fitness: 86, experience: 76, stats: { matches: 14, runs: 10, balls: 12, fours: 0, sixes: 0, fifties: 0, hundreds: 0, wickets: 13, economy: 8.4, catches: 2 } },
  { playerId: 'p_csk_10', name: 'Rajvardhan Hangargekar SRL', displayName: 'R Hangargekar', teamId: 'csk_srl', role: 'FAST_BOWLER', battingStyle: 'RHB', bowlingStyle: 'Right-arm fast medium', battingRating: 45, bowlingRating: 78, fieldingRating: 78, formRating: 77, consistency: 76, aggression: 82, fitness: 90, experience: 74, stats: { matches: 14, runs: 45, balls: 30, fours: 3, sixes: 3, fifties: 0, hundreds: 0, wickets: 10, economy: 8.9, catches: 3 } },
  { playerId: 'p_csk_11', name: 'Maheesh Theekshana SRL', displayName: 'M Theekshana', teamId: 'csk_srl', role: 'SPIN_BOWLER', battingStyle: 'RHB', bowlingStyle: 'Right-arm Offbreak', battingRating: 30, bowlingRating: 85, fieldingRating: 75, formRating: 82, consistency: 84, aggression: 75, fitness: 87, experience: 82, stats: { matches: 14, runs: 15, balls: 18, fours: 1, sixes: 0, fifties: 0, hundreds: 0, wickets: 14, economy: 7.1, catches: 3 } },

  // MI
  { playerId: 'p_mi_1', name: 'Rohit Sharma SRL', displayName: 'Rohit Sharma', teamId: 'mi_srl', role: 'BATTER', battingStyle: 'RHB', bowlingStyle: 'Right-arm Offbreak', battingRating: 91, bowlingRating: 35, fieldingRating: 84, formRating: 90, consistency: 86, aggression: 89, fitness: 88, experience: 98, stats: { matches: 14, runs: 520, balls: 360, fours: 55, sixes: 28, fifties: 4, hundreds: 1, wickets: 0, economy: 0, catches: 7 } },
  { playerId: 'p_mi_2', name: 'Suryakumar Yadav SRL', displayName: 'SKY', teamId: 'mi_srl', role: 'BATTER', battingStyle: 'RHB', bowlingStyle: 'Right-arm Offbreak', battingRating: 93, bowlingRating: 20, fieldingRating: 86, formRating: 92, consistency: 89, aggression: 96, fitness: 91, experience: 90, stats: { matches: 14, runs: 610, balls: 340, fours: 62, sixes: 38, fifties: 6, hundreds: 1, wickets: 0, economy: 0, catches: 9 } },
  { playerId: 'p_mi_3', name: 'Tilak Varma SRL', displayName: 'T Varma', teamId: 'mi_srl', role: 'BATTER', battingStyle: 'LHB', bowlingStyle: 'Right-arm Offbreak', battingRating: 85, bowlingRating: 40, fieldingRating: 85, formRating: 84, consistency: 85, aggression: 82, fitness: 93, experience: 79, stats: { matches: 14, runs: 390, balls: 280, fours: 36, sixes: 18, fifties: 3, hundreds: 0, wickets: 1, economy: 8.0, catches: 6 } },
  { playerId: 'p_mi_4', name: 'Hardik Pandya SRL', displayName: 'H Pandya', teamId: 'mi_srl', role: 'BATTING_ALL_ROUNDER', battingStyle: 'RHB', bowlingStyle: 'Right-arm fast medium', battingRating: 88, bowlingRating: 83, fieldingRating: 88, formRating: 87, consistency: 85, aggression: 90, fitness: 90, experience: 92, stats: { matches: 14, runs: 360, balls: 240, fours: 30, sixes: 24, fifties: 2, hundreds: 0, wickets: 12, economy: 8.1, catches: 8 } },
  { playerId: 'p_mi_5', name: 'Kieron Pollard SRL', displayName: 'K Pollard', teamId: 'mi_srl', role: 'BATTING_ALL_ROUNDER', battingStyle: 'RHB', bowlingStyle: 'Right-arm medium', battingRating: 84, bowlingRating: 70, fieldingRating: 86, formRating: 82, consistency: 80, aggression: 95, fitness: 86, experience: 97, stats: { matches: 14, runs: 280, balls: 170, fours: 18, sixes: 25, fifties: 1, hundreds: 0, wickets: 5, economy: 8.7, catches: 10 } },
  { playerId: 'p_mi_6', name: 'Ryan Rickelton SRL', displayName: 'R Rickelton', teamId: 'mi_srl', role: 'WICKET_KEEPER', battingStyle: 'LHB', bowlingStyle: 'None', battingRating: 81, bowlingRating: 10, fieldingRating: 85, formRating: 80, consistency: 80, aggression: 83, fitness: 90, experience: 76, stats: { matches: 14, runs: 310, balls: 220, fours: 32, sixes: 12, fifties: 2, hundreds: 0, wickets: 0, economy: 0, catches: 11, stumpings: 2 } },
  { playerId: 'p_mi_7', name: 'Jasprit Bumrah SRL', displayName: 'J Bumrah', teamId: 'mi_srl', role: 'FAST_BOWLER', battingStyle: 'RHB', bowlingStyle: 'Right-arm fast', battingRating: 30, bowlingRating: 96, fieldingRating: 82, formRating: 95, consistency: 96, aggression: 80, fitness: 94, experience: 94, stats: { matches: 14, runs: 15, balls: 18, fours: 1, sixes: 0, fifties: 0, hundreds: 0, wickets: 24, economy: 6.4, catches: 4 } },
  { playerId: 'p_mi_8', name: 'Trent Boult SRL', displayName: 'T Boult', teamId: 'mi_srl', role: 'FAST_BOWLER', battingStyle: 'RHB', bowlingStyle: 'Left-arm fast medium', battingRating: 32, bowlingRating: 89, fieldingRating: 84, formRating: 87, consistency: 88, aggression: 82, fitness: 91, experience: 93, stats: { matches: 14, runs: 18, balls: 20, fours: 2, sixes: 0, fifties: 0, hundreds: 0, wickets: 19, economy: 7.5, catches: 5 } },
  { playerId: 'p_mi_9', name: 'Rahul Chahar SRL', displayName: 'R Chahar', teamId: 'mi_srl', role: 'SPIN_BOWLER', battingStyle: 'RHB', bowlingStyle: 'Legbreak Googly', battingRating: 35, bowlingRating: 82, fieldingRating: 78, formRating: 80, consistency: 80, aggression: 76, fitness: 88, experience: 82, stats: { matches: 14, runs: 25, balls: 22, fours: 2, sixes: 1, fifties: 0, hundreds: 0, wickets: 14, economy: 7.6, catches: 3 } },
  { playerId: 'p_mi_10', name: 'Mitchell Santner SRL', displayName: 'M Santner', teamId: 'mi_srl', role: 'BOWLING_ALL_ROUNDER', battingStyle: 'LHB', bowlingStyle: 'Slow Left Arm', battingRating: 72, bowlingRating: 84, fieldingRating: 88, formRating: 82, consistency: 86, aggression: 76, fitness: 90, experience: 88, stats: { matches: 14, runs: 120, balls: 90, fours: 8, sixes: 5, fifties: 0, hundreds: 0, wickets: 13, economy: 7.0, catches: 7 } },
  { playerId: 'p_mi_11', name: 'Nuwan Thushara SRL', displayName: 'N Thushara', teamId: 'mi_srl', role: 'FAST_BOWLER', battingStyle: 'RHB', bowlingStyle: 'Right-arm medium fast', battingRating: 25, bowlingRating: 81, fieldingRating: 72, formRating: 79, consistency: 78, aggression: 80, fitness: 86, experience: 74, stats: { matches: 14, runs: 8, balls: 10, fours: 0, sixes: 0, fifties: 0, hundreds: 0, wickets: 11, economy: 8.3, catches: 2 } },

  // RCB
  { playerId: 'p_rcb_1', name: 'Virat Kohli SRL', displayName: 'V Kohli', teamId: 'rcb_srl', role: 'BATTER', battingStyle: 'RHB', bowlingStyle: 'Right-arm medium', battingRating: 95, bowlingRating: 25, fieldingRating: 90, formRating: 94, consistency: 94, aggression: 88, fitness: 98, experience: 99, stats: { matches: 14, runs: 680, balls: 450, fours: 72, sixes: 30, fifties: 7, hundreds: 2, wickets: 0, economy: 0, catches: 11 } },
  { playerId: 'p_rcb_2', name: 'Devdutt Padikkal SRL', displayName: 'D Padikkal', teamId: 'rcb_srl', role: 'BATTER', battingStyle: 'LHB', bowlingStyle: 'Right-arm Offbreak', battingRating: 82, bowlingRating: 20, fieldingRating: 80, formRating: 80, consistency: 80, aggression: 80, fitness: 90, experience: 80, stats: { matches: 14, runs: 380, balls: 290, fours: 40, sixes: 12, fifties: 3, hundreds: 0, wickets: 0, economy: 0, catches: 5 } },
  { playerId: 'p_rcb_3', name: 'Glenn Maxwell SRL', displayName: 'G Maxwell', teamId: 'rcb_srl', role: 'BATTING_ALL_ROUNDER', battingStyle: 'RHB', bowlingStyle: 'Right-arm Offbreak', battingRating: 88, bowlingRating: 78, fieldingRating: 88, formRating: 85, consistency: 78, aggression: 98, fitness: 91, experience: 94, stats: { matches: 14, runs: 420, balls: 240, fours: 35, sixes: 32, fifties: 4, hundreds: 0, wickets: 8, economy: 8.1, catches: 9 } },
  { playerId: 'p_rcb_4', name: 'Rajat Patidar SRL', displayName: 'R Patidar', teamId: 'rcb_srl', role: 'BATTER', battingStyle: 'RHB', bowlingStyle: 'Right-arm Offbreak', battingRating: 85, bowlingRating: 20, fieldingRating: 82, formRating: 86, consistency: 84, aggression: 86, fitness: 90, experience: 79, stats: { matches: 14, runs: 395, balls: 260, fours: 34, sixes: 22, fifties: 3, hundreds: 0, wickets: 0, economy: 0, catches: 6 } },
  { playerId: 'p_rcb_5', name: 'Cameron Green SRL', displayName: 'C Green', teamId: 'rcb_srl', role: 'BATTING_ALL_ROUNDER', battingStyle: 'RHB', bowlingStyle: 'Right-arm fast medium', battingRating: 86, bowlingRating: 80, fieldingRating: 86, formRating: 85, consistency: 83, aggression: 88, fitness: 93, experience: 82, stats: { matches: 14, runs: 350, balls: 230, fours: 30, sixes: 19, fifties: 2, hundreds: 0, wickets: 10, economy: 8.4, catches: 7 } },
  { playerId: 'p_rcb_6', name: 'Dinesh Karthik SRL', displayName: 'D Karthik', teamId: 'rcb_srl', role: 'WICKET_KEEPER', battingStyle: 'RHB', bowlingStyle: 'None', battingRating: 83, bowlingRating: 10, fieldingRating: 85, formRating: 82, consistency: 82, aggression: 92, fitness: 88, experience: 97, stats: { matches: 14, runs: 260, balls: 145, fours: 22, sixes: 20, fifties: 1, hundreds: 0, wickets: 0, economy: 0, catches: 12, stumpings: 3 } },
  { playerId: 'p_rcb_7', name: 'Mohammed Siraj SRL', displayName: 'M Siraj', teamId: 'rcb_srl', role: 'FAST_BOWLER', battingStyle: 'RHB', bowlingStyle: 'Right-arm fast', battingRating: 28, bowlingRating: 88, fieldingRating: 78, formRating: 86, consistency: 83, aggression: 85, fitness: 93, experience: 87, stats: { matches: 14, runs: 14, balls: 18, fours: 1, sixes: 0, fifties: 0, hundreds: 0, wickets: 18, economy: 7.9, catches: 4 } },
  { playerId: 'p_rcb_8', name: 'Lockie Ferguson SRL', displayName: 'L Ferguson', teamId: 'rcb_srl', role: 'FAST_BOWLER', battingStyle: 'RHB', bowlingStyle: 'Right-arm fast', battingRating: 30, bowlingRating: 85, fieldingRating: 76, formRating: 83, consistency: 80, aggression: 82, fitness: 89, experience: 85, stats: { matches: 14, runs: 16, balls: 16, fours: 1, sixes: 1, fifties: 0, hundreds: 0, wickets: 14, economy: 8.6, catches: 3 } },
  { playerId: 'p_rcb_9', name: 'Yash Dayal SRL', displayName: 'Y Dayal', teamId: 'rcb_srl', role: 'FAST_BOWLER', battingStyle: 'LHB', bowlingStyle: 'Left-arm fast medium', battingRating: 25, bowlingRating: 82, fieldingRating: 75, formRating: 82, consistency: 79, aggression: 78, fitness: 88, experience: 76, stats: { matches: 14, runs: 8, balls: 10, fours: 0, sixes: 0, fifties: 0, hundreds: 0, wickets: 15, economy: 8.5, catches: 3 } },
  { playerId: 'p_rcb_10', name: 'Karn Sharma SRL', displayName: 'K Sharma', teamId: 'rcb_srl', role: 'SPIN_BOWLER', battingStyle: 'LHB', bowlingStyle: 'Legbreak Googly', battingRating: 40, bowlingRating: 80, fieldingRating: 74, formRating: 78, consistency: 76, aggression: 80, fitness: 85, experience: 86, stats: { matches: 14, runs: 30, balls: 22, fours: 2, sixes: 2, fifties: 0, hundreds: 0, wickets: 11, economy: 8.2, catches: 2 } },
  { playerId: 'p_rcb_11', name: 'Vyshak Vijaykumar SRL', displayName: 'V Vijaykumar', teamId: 'rcb_srl', role: 'FAST_BOWLER', battingStyle: 'RHB', bowlingStyle: 'Right-arm medium fast', battingRating: 28, bowlingRating: 78, fieldingRating: 76, formRating: 77, consistency: 75, aggression: 76, fitness: 87, experience: 74, stats: { matches: 14, runs: 10, balls: 12, fours: 0, sixes: 0, fifties: 0, hundreds: 0, wickets: 9, economy: 8.8, catches: 2 } },
];

let playersStore = [...INITIAL_PLAYERS];

export function getAllIPLSRLPlayers() {
  return playersStore;
}

export function getIPLSRLPlayerById(playerId) {
  return playersStore.find(p => p.playerId === playerId) || null;
}

export function getIPLSRLPlayersByTeam(teamId) {
  return playersStore.filter(p => p.teamId === teamId);
}

export function createIPLSRLPlayer(playerData) {
  const newPlayer = {
    playerId: playerData.playerId || `p_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    name: playerData.name || 'Custom Player SRL',
    displayName: playerData.displayName || 'C Player',
    teamId: playerData.teamId || null,
    role: playerData.role || PLAYER_ROLES.BATTER,
    battingStyle: playerData.battingStyle || 'RHB',
    bowlingStyle: playerData.bowlingStyle || 'Right-arm medium',
    battingRating: Number(playerData.battingRating) || 75,
    bowlingRating: Number(playerData.bowlingRating) || 75,
    fieldingRating: Number(playerData.fieldingRating) || 75,
    formRating: Number(playerData.formRating) || 75,
    consistency: Number(playerData.consistency) || 75,
    aggression: Number(playerData.aggression) || 75,
    fitness: Number(playerData.fitness) || 90,
    experience: Number(playerData.experience) || 80,
    stats: playerData.stats || {
      matches: 0, runs: 0, balls: 0, fours: 0, sixes: 0, fifties: 0, hundreds: 0, wickets: 0, economy: 0, catches: 0, stumpings: 0,
    },
  };
  playersStore.push(newPlayer);
  return newPlayer;
}

export function updateIPLSRLPlayer(playerId, updates) {
  const idx = playersStore.findIndex(p => p.playerId === playerId);
  if (idx < 0) return null;
  playersStore[idx] = { ...playersStore[idx], ...updates };
  return playersStore[idx];
}

export function updateIPLSRLPlayerStats(playerId, matchStats) {
  const player = getIPLSRLPlayerById(playerId);
  if (!player) return null;
  const s = player.stats;
  s.matches += 1;
  s.runs += matchStats.runs || 0;
  s.balls += matchStats.balls || 0;
  s.fours += matchStats.fours || 0;
  s.sixes += matchStats.sixes || 0;
  if (matchStats.runs >= 100) s.hundreds += 1;
  else if (matchStats.runs >= 50) s.fifties += 1;
  s.wickets += matchStats.wickets || 0;
  s.catches += matchStats.catches || 0;
  s.stumpings += matchStats.stumpings || 0;
  return player;
}
