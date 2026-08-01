import {
  getLocalPlayer,
  getTeamRoster,
  getSeriesIdForLeague,
  buildLocalPlayerProfile,
  TEAM_SERIES_MAP,
} from '../data/playerDatabase';
import { fetchCricbuzzPlayers } from './cricbuzzService';

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map();

function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function cacheSet(key, data) {
  cache.set(key, { data, ts: Date.now() });
}

function normalizeKey(name) {
  return String(name || '').trim().toLowerCase();
}

function parseEspnRoster(rosters = []) {
  const players = [];

  for (const side of rosters) {
    const teamName = side.team?.displayName || side.team?.abbreviation || 'Team';
    for (const entry of side.roster || []) {
      const athlete = entry.athlete || {};
      const styles = athlete.style || [];
      const battingStyle = styles.find(s => s.type === 'batting')?.description || '—';
      const bowlingStyle = styles.find(s => s.type === 'bowling')?.description || '—';
      const inningsStats = extractInningsFromLinescores(entry.linescores);

      players.push({
        id: String(athlete.id || athlete.guid || athlete.displayName),
        name: athlete.battingName || athlete.displayName || athlete.name,
        fullName: athlete.fullName || athlete.displayName,
        team: teamName,
        role: entry.position?.name || athlete.position?.name || 'Player',
        battingStyle,
        bowlingStyle,
        headshot: athlete.headshot?.href || null,
        source: 'espn',
        matchStats: inningsStats,
        career: null,
        t20: null,
        bowling: inningsStats?.bowling || null,
        recentForm: null,
        espnId: athlete.id,
        cricinfoUrl: athlete.links?.find(l => l.rel?.includes('playercard'))?.href || null,
      });
    }
  }

  return players;
}

function extractInningsFromLinescores(linescores = []) {
  for (const period of linescores) {
    for (const line of period.linescores || []) {
      const stats = line.statistics;
      if (!stats) continue;
      const name = (stats.name || stats.abbreviation || '').toLowerCase();
      if (name.includes('bat') || stats.abbreviation === 'B') {
        return {
          runs: parseInt(stats.displayValue || stats.value || 0, 10) || 0,
          balls: parseInt(stats.balls || stats.attempts || 0, 10) || 0,
          fours: parseInt(stats.fours || 0, 10) || 0,
          sixes: parseInt(stats.sixes || 0, 10) || 0,
          dismissal: stats.dismissal || null,
        };
      }
    }
  }
  return null;
}

function parseEspnMatchcards(matchcards = []) {
  const byId = new Map();
  const byName = new Map();

  for (const card of matchcards) {
    const isBowling = (card.headline || '').toLowerCase().includes('bowl');
    for (const p of card.playerDetails || []) {
      const key = p.playerID || normalizeKey(p.playerName);
      const existing = byId.get(key) || { name: p.playerName, id: key };

      if (isBowling) {
        existing.bowling = {
          wickets: parseInt(p.wickets || 0, 10) || 0,
          runs: parseInt(p.runsConceded || p.runs || 0, 10) || 0,
          overs: p.overs || '—',
          economy: p.economy || null,
        };
      } else {
        existing.batting = {
          runs: parseInt(p.runs || 0, 10) || 0,
          balls: parseInt(p.ballsFaced || 0, 10) || 0,
          fours: parseInt(p.fours || 0, 10) || 0,
          sixes: parseInt(p.sixes || 0, 10) || 0,
          dismissal: p.dismissal || null,
        };
      }

      byId.set(key, existing);
      byName.set(normalizeKey(p.playerName), existing);
    }
  }

  return { byId, byName };
}

function mergeEspnSources(rosters, matchcards, leaders) {
  const players = parseEspnRoster(rosters);
  const cards = parseEspnMatchcards(matchcards);

  const leaderStats = new Map();
  for (const teamBlock of leaders || []) {
    for (const period of teamBlock.linescores || []) {
      for (const cat of period.leaders || []) {
        for (const leader of cat.leaders || []) {
          const id = String(leader.athlete?.id || '');
          if (!id) continue;
          leaderStats.set(id, {
            category: cat.displayName || cat.name,
            value: leader.displayValue || leader.value,
          });
        }
      }
    }
  }

  return players.map(player => {
    const card = cards.byId.get(player.id) || cards.byName.get(normalizeKey(player.name));
    const leader = leaderStats.get(player.id);
    const local = getLocalPlayer(player.name);

    const matchStats = card?.batting || card?.bowling
      ? { ...card?.batting, bowling: card?.bowling }
      : player.matchStats;

    return {
      ...player,
      matchStats,
      career: local?.career || null,
      t20: local?.t20 || null,
      bowling: card?.bowling || local?.bowling || player.bowling,
      recentForm: local?.recentForm || (leader ? `${leader.category}: ${leader.value}` : null),
      source: local ? 'espn+local' : 'espn',
    };
  });
}

async function fetchEspnMatchPlayers(seriesId, eventId) {
  const cacheKey = `espn:${seriesId}:${eventId}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const url = `https://site.api.espn.com/apis/site/v2/sports/cricket/${seriesId}/summary?event=${eventId}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN summary ${res.status}`);

  const data = await res.json();
  const players = mergeEspnSources(
    data.rosters || [],
    data.matchcards || [],
    data.leaders || []
  );

  const result = {
    players,
    source: 'espn',
    seriesId,
    eventId,
    fetchedAt: new Date().toISOString(),
  };

  cacheSet(cacheKey, result);
  return result;
}

function buildPlayersFromMatch(match) {
  const team1 = match.team1?.name;
  const team2 = match.team2?.name;
  const roster1 = getTeamRoster(team1);
  const roster2 = getTeamRoster(team2);
  const live = match.liveDetails || {};

  const names = new Set([
    live.batter1?.name,
    live.batter2?.name,
    live.bowler?.name,
    ...roster1.batters,
    ...roster1.bowlers,
    ...roster2.batters,
    ...roster2.bowlers,
  ].filter(Boolean));

  const players = [];

  for (const name of names) {
    const isBatter1 = live.batter1?.name === name;
    const isBatter2 = live.batter2?.name === name;
    const isBowler = live.bowler?.name === name;
    const team = roster1.batters.includes(name) || roster1.bowlers.includes(name) ? team1 : team2;

    let matchStats = null;
    if (isBatter1 && live.batter1) {
      matchStats = {
        runs: live.batter1.runs,
        balls: live.batter1.balls,
        fours: live.batter1.fours,
        sixes: live.batter1.sixes,
        dismissal: live.batter1.dismissal || 'batting',
      };
    } else if (isBatter2 && live.batter2) {
      matchStats = {
        runs: live.batter2.runs,
        balls: live.batter2.balls,
        fours: live.batter2.fours,
        sixes: live.batter2.sixes,
        dismissal: live.batter2.dismissal || 'not out',
      };
    } else if (isBowler && live.bowler) {
      matchStats = {
        bowling: {
          wickets: live.bowler.wickets ?? 2,
          overs: live.bowler.overs ?? '3.0',
          economy: live.bowler.economy ?? 7.5,
        },
      };
    }

    players.push(buildLocalPlayerProfile(name, team, matchStats));
  }

  return {
    players,
    source: 'local',
    fetchedAt: new Date().toISOString(),
  };
}

function enrichWithLocalDb(players, sourcePrefix) {
  return players.map(p => {
    const local = getLocalPlayer(p.name);
    if (!local) return p;
    const source = p.source === sourcePrefix ? `${sourcePrefix}+local` : p.source;
    return {
      ...p,
      career: p.career || local.career,
      t20: p.t20 || local.t20,
      bowling: p.bowling || local.bowling,
      battingStyle: p.battingStyle === '—' ? (local.battingStyle || p.battingStyle) : p.battingStyle,
      bowlingStyle: p.bowlingStyle === '—' ? (local.bowlingStyle || p.bowlingStyle) : p.bowlingStyle,
      recentForm: p.recentForm || local.recentForm,
      source: source || `${sourcePrefix}+local`,
    };
  });
}

/**
 * @param {object} match
 * @returns {Promise<{ players: object[], source: string, loading?: boolean }>}
 */
export async function fetchMatchPlayers(match) {
  if (!match) return { players: [], source: 'none' };

  const sport = match.sport || 'cricket';
  if (sport !== 'cricket' && sport !== 'virtual-cricket') {
    return { players: [], source: 'none' };
  }

  // 1. Cricbuzz — live scorecard with batting/bowling figures
  try {
    const cbData = await fetchCricbuzzPlayers(match);
    if (cbData?.players?.length > 0) {
      return {
        ...cbData,
        players: enrichWithLocalDb(cbData.players, 'cricbuzz'),
        source: cbData.players.some(p => getLocalPlayer(p.name)) ? 'cricbuzz+local' : 'cricbuzz',
      };
    }
  } catch {
    // fall through
  }

  const espn = match.espn || {};
  const seriesId = espn.seriesId || getSeriesIdForLeague(match.league);
  const eventId = espn.eventId || (match.id?.startsWith('api_cric_') ? match.id.replace('api_cric_', '') : null);

  // 2. ESPN summary API
  if (seriesId && eventId) {
    try {
      const espnData = await fetchEspnMatchPlayers(seriesId, eventId);
      if (espnData.players.length > 0) {
        espnData.players = enrichWithLocalDb(espnData.players, 'espn');
        return {
          ...espnData,
          source: espnData.players.some(p => getLocalPlayer(p.name)) ? 'espn+local' : 'espn',
        };
      }
    } catch {
      // fall through to local
    }
  }

  // 3. Local DB + liveDetails fallback
  return buildPlayersFromMatch(match);
}

export function getSourceLabel(source) {
  if (source === 'cricbuzz') return 'Cricbuzz';
  if (source === 'cricbuzz+local') return 'Cricbuzz + BetKing DB';
  if (source === 'espn') return 'ESPN';
  if (source === 'espn+local') return 'ESPN + BetKing DB';
  if (source === 'local') return 'BetKing DB';
  return 'Live';
}

export { TEAM_SERIES_MAP };
