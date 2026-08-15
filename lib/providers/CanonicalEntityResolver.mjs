/**
 * Canonical Entity Resolver & Deduplication Engine
 * Resolves teams, players, leagues, and competitions across multiple providers to unified canonical IDs.
 * Eliminates duplicate display entities.
 */

const TEAM_ALIAS_MAP = new Map([
  ['trent rockets', 'team_trent_rockets'],
  ['trent rockets men', 'team_trent_rockets'],
  ['trent rockets (m)', 'team_trent_rockets'],
  ['oval invincibles', 'team_oval_invincibles'],
  ['oval invincibles men', 'team_oval_invincibles'],
  ['oval invincibles (m)', 'team_oval_invincibles'],
  ['southern brave', 'team_southern_brave'],
  ['southern brave men', 'team_southern_brave'],
  ['london spirit', 'team_london_spirit'],
  ['manchester originals', 'team_manchester_originals'],
  ['northern superchargers', 'team_northern_superchargers'],
  ['welsh fire', 'team_welsh_fire'],
  ['birmingham phoenix', 'team_birmingham_phoenix'],
  ['india', 'team_india'],
  ['australia', 'team_australia'],
  ['england', 'team_england'],
  ['sri lanka', 'team_sri_lanka'],
  ['pakistan', 'team_pakistan'],
  ['west indies', 'team_west_indies'],
]);

const LEAGUE_ALIAS_MAP = new Map([
  ['cpl', 'league_cpl'],
  ['caribbean premier league', 'league_cpl'],
  ['ipl', 'league_ipl'],
  ['indian premier league', 'league_ipl'],
  ['the hundred', 'league_hundred'],
  ['the hundred men', 'league_hundred'],
  ['lpl', 'league_lpl'],
  ['lanka premier league', 'league_lpl'],
]);

export class CanonicalEntityResolver {
  /**
   * Resolves a team name to its canonical team ID.
   */
  static resolveTeamId(teamName) {
    if (!teamName || typeof teamName !== 'string') return 'team_unknown';
    const normalized = teamName.trim().toLowerCase();
    if (TEAM_ALIAS_MAP.has(normalized)) {
      return TEAM_ALIAS_MAP.get(normalized);
    }
    // Clean string fallback ID
    const cleanId = normalized.replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
    return `team_${cleanId || 'unknown'}`;
  }

  /**
   * Resolves a league/competition name to its canonical league ID.
   */
  static resolveLeagueId(leagueName) {
    if (!leagueName || typeof leagueName !== 'string') return 'league_unknown';
    const normalized = leagueName.trim().toLowerCase();
    if (LEAGUE_ALIAS_MAP.has(normalized)) {
      return LEAGUE_ALIAS_MAP.get(normalized);
    }
    const cleanId = normalized.replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
    return `league_${cleanId || 'unknown'}`;
  }

  /**
   * Resolves a player name and team to a canonical player ID.
   */
  static resolvePlayerId(playerName, teamName = '') {
    if (!playerName || typeof playerName !== 'string') return 'player_unknown';
    const cleanName = playerName.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
    const teamId = CanonicalEntityResolver.resolveTeamId(teamName);
    return `player_${teamId}_${cleanName}`;
  }

  /**
   * Deduplicates an array of entity objects by canonical ID.
   */
  static deduplicateEntities(entities = [], idExtractor = (e) => e.canonicalId || e.id) {
    const seen = new Set();
    const result = [];
    for (const item of entities) {
      const id = idExtractor(item);
      if (id && !seen.has(id)) {
        seen.add(id);
        result.push(item);
      }
    }
    return result;
  }
}
