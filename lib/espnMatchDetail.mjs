/**
 * Fetch a single ESPN event by scoreboard path + event id.
 */
import {
  ESPN_ENDPOINTS,
  mapCricketEvent,
  mapSoccerEvent,
  mapBasketballEvent,
  mapTennisEvent,
  mapAmericanFootballEvent,
} from './espnLiveScores.mjs';

const SPORT_MAPPERS = {
  cricket: mapCricketEvent,
  soccer: mapSoccerEvent,
  basketball: mapBasketballEvent,
  tennis: mapTennisEvent,
  'american-football': mapAmericanFootballEvent,
  esoccer: mapSoccerEvent,
};

const LEAGUE_PATH_MAP = Object.fromEntries(
  ESPN_ENDPOINTS.map((ep) => {
    const path = ep.url.match(/sports\/(.+)\/scoreboard/)?.[1];
    return path ? [ep.league, path] : null;
  }).filter(Boolean),
);

export function resolveEspnPath(match) {
  if (match.espnPath) return match.espnPath;
  if (match.league && LEAGUE_PATH_MAP[match.league]) return LEAGUE_PATH_MAP[match.league];
  return null;
}

export function resolveEspnEventId(match) {
  if (match.espnEventId) return String(match.espnEventId);
  const m = match.id?.match(/^api_[a-z0-9]+_(\d+)$/i);
  return m ? m[1] : null;
}

export async function fetchEspnMatchDetail(match) {
  const eventId = resolveEspnEventId(match);
  const espnPath = resolveEspnPath(match);
  const sport = match.sport === 'esoccer' ? 'soccer' : match.sport;

  if (!eventId || !espnPath || !SPORT_MAPPERS[sport]) {
    return null;
  }

  const url = `https://site.api.espn.com/apis/site/v2/sports/${espnPath}/scoreboard`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OddsYra/1.0)' },
  });

  if (!response.ok) {
    throw new Error(`ESPN scoreboard failed (${response.status})`);
  }

  const data = await response.json();
  let evt = (data.events || []).find((e) => String(e.id) === String(eventId));
  if (!evt) {
    const summaryRes = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/${espnPath}/summary?event=${eventId}`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OddsYra/1.0)' } },
    );
    if (summaryRes.ok) {
      const summary = await summaryRes.json();
      evt = summary.header
        ? { ...summary.header, competitions: summary.header.competitions || summary.competitions }
        : summary;
      if (evt && !evt.id) evt.id = eventId;
    }
  }
  if (!evt) return null;

  const mapped = SPORT_MAPPERS[sport](evt);
  if (!mapped) return null;

  return {
    matchId: match.id,
    id: match.id,
    sport,
    source: 'espn',
    isLive: mapped.isLive,
    isCompleted: mapped.isCompleted,
    status: mapped.status,
    winnerSide: mapped.winnerSide,
    matchState: mapped.matchState,
    time: mapped.time,
    team1: mapped.team1,
    team2: mapped.team2,
    score1: mapped.score1,
    score2: mapped.score2,
    liveDetails: mapped.liveDetails,
    fetchedAt: new Date().toISOString(),
  };
}
