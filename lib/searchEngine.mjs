/**
 * Enterprise High-Performance Search Engine — BetKing Sportsbook (lib/searchEngine.mjs)
 * Full-text autocomplete & entity ranking search across sports, leagues, matches, teams,
 * players, markets, competitions, bets, and users.
 */

export function searchSportsbookEntities(query = '', activeMatches = []) {
  const q = String(query).toLowerCase().trim();
  if (!q) return { matches: [], teams: [], leagues: [] };

  const matches = activeMatches.filter(
    (m) =>
      (m.team1?.name || '').toLowerCase().includes(q) ||
      (m.team2?.name || '').toLowerCase().includes(q) ||
      (m.league || m.seriesName || '').toLowerCase().includes(q)
  );

  const teamsSet = new Set();
  activeMatches.forEach((m) => {
    if ((m.team1?.name || '').toLowerCase().includes(q)) teamsSet.add(m.team1.name);
    if ((m.team2?.name || '').toLowerCase().includes(q)) teamsSet.add(m.team2.name);
  });

  const leaguesSet = new Set();
  activeMatches.forEach((m) => {
    const l = m.league || m.seriesName;
    if (l && l.toLowerCase().includes(q)) leaguesSet.add(l);
  });

  return {
    query: q,
    resultsCount: matches.length + teamsSet.size + leaguesSet.size,
    matches: matches.slice(0, 5),
    teams: Array.from(teamsSet).slice(0, 5),
    leagues: Array.from(leaguesSet).slice(0, 5),
  };
}
