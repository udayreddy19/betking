/**
 * Sports Data API Platform — Server-side Gateway Router Middleware
 * Implements the Canonical World-Class Sports API Model & Endpoints.
 * Standardizes responses across all entities, returning null for missing attributes.
 */

import {
  SPORTS_CATALOG,
  COUNTRIES_CATALOG,
  COMPETITIONS_CATALOG,
  SEASONS_CATALOG,
  VENUES_CATALOG,
  getStandardizedTeams,
  getPlayersForTeam,
  getMatchesFiltered,
  getSingleMatchDetails,
  getStandingsCatalog,
  getRankingsCatalog,
  performGlobalSearch,
} from '../lib/sportsDataService.mjs';

import { fetchGatewaySportMatches } from '../lib/services/gatewayService.mjs';
import {
  toCanonicalSport,
  toCanonicalCountry,
  toCanonicalLeague,
  toCanonicalTournament,
  toCanonicalSeason,
  toCanonicalVenue,
  toCanonicalTeam,
  toCanonicalPlayer,
  toCanonicalMatch,
  toCanonicalPlayerStatistics,
  toCanonicalCommentary,
  toCanonicalMatchEvents,
  toCanonicalLineups,
  toCanonicalOfficials,
  toCanonicalStandings,
  toCanonicalRankings,
} from '../lib/normalizers/canonicalModel.mjs';

export function sportsApiPlatformPlugin() {
  return {
    name: 'sports-api-platform',
    enforce: 'pre',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const fullUrl = req.url || '';
        const urlObj = new URL(fullUrl, 'http://localhost');
        const pathname = urlObj.pathname;

        if (!pathname.startsWith('/api/v1/')) {
          return next();
        }

        // Enable CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }

        // Real-Time Event SSE Stream: /api/v1/live/stream
        if (pathname === '/api/v1/live/stream') {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
          });

          const sendEvent = async () => {
            try {
              const liveMatches = await getMatchesFiltered({ status: 'live' });
              const canonicalLive = (liveMatches || []).map((m) => toCanonicalMatch(m, m.provider || 'gateway'));
              const data = JSON.stringify({
                timestamp: new Date().toISOString(),
                event: 'score_update',
                matchesCount: canonicalLive.length,
                matches: canonicalLive.slice(0, 5),
              });
              res.write(`data: ${data}\n\n`);
            } catch (err) {
              res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
            }
          };

          sendEvent();
          const interval = setInterval(sendEvent, 3000);

          req.on('close', () => {
            clearInterval(interval);
          });
          return;
        }

        // Response Helper
        const sendJson = (data, status = 200) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            status: status < 400 ? 'success' : 'error',
            code: status,
            data: data.matches || data,
            provider: data.provider || 'gateway',
            meta: {
              timestamp: new Date().toISOString(),
              version: 'v1',
            },
          }, null, 2));
        };

        try {
          // --- 1. Gateway Sport Specific Routes ---
          const gatewayMatch = pathname.match(/^\/api\/v1\/(cricket|football|basketball|tennis|formula1|hockey|baseball|american-football|multi-sport)\/(live|upcoming|scheduled|completed)$/);
          if (gatewayMatch) {
            const [, sport, type] = gatewayMatch;
            const gatewayResult = await fetchGatewaySportMatches(sport, type);
            const matchesList = gatewayResult.matches || (Array.isArray(gatewayResult) ? gatewayResult : []);
            const canonicalMatches = matchesList.map((m) => toCanonicalMatch(m, gatewayResult.provider || 'gateway'));
            return sendJson({ ...gatewayResult, matches: canonicalMatches });
          }

          // Single Match by ID in sport namespace: /api/v1/cricket/matches/:id
          const sportMatchDetailMatch = pathname.match(/^\/api\/v1\/(cricket|football|basketball|tennis|formula1|hockey|baseball|american-football|multi-sport)\/matches\/([^\/]+)$/);
          if (sportMatchDetailMatch) {
            const [, sport, matchId] = sportMatchDetailMatch;
            const detail = await getSingleMatchDetails(matchId);
            return detail ? sendJson(toCanonicalMatch(detail.match || detail, 'gateway')) : sendJson({ error: 'Match not found in gateway' }, 404);
          }

          // Team by ID in sport namespace: /api/v1/cricket/teams/:id
          const sportTeamMatch = pathname.match(/^\/api\/v1\/(cricket|football|basketball|tennis|formula1|hockey|baseball|american-football|multi-sport)\/teams\/([^\/]+)$/);
          if (sportTeamMatch) {
            const [, sport, teamId] = sportTeamMatch;
            const teams = getStandardizedTeams();
            const found = teams.find(t => t.id === teamId || t.name.toLowerCase() === teamId.toLowerCase());
            return found ? sendJson(toCanonicalTeam(found)) : sendJson({ error: 'Team not found in gateway' }, 404);
          }

          // Player by ID in sport namespace: /api/v1/cricket/players/:id
          const sportPlayerMatch = pathname.match(/^\/api\/v1\/(cricket|football|basketball|tennis|formula1|hockey|baseball|american-football|multi-sport)\/players\/([^\/]+)$/);
          if (sportPlayerMatch) {
            const [, sport, playerId] = sportPlayerMatch;
            const players = getPlayersForTeam('Hampshire');
            const found = players.find(p => p.playerId === playerId || p.name.toLowerCase().includes(playerId.toLowerCase()));
            return found ? sendJson(toCanonicalPlayer(found)) : sendJson({ error: 'Player not found in gateway' }, 404);
          }

          // --- 2. OpenAPI Specification: GET /api/v1/openapi.json ---
          if (pathname === '/api/v1/openapi.json') {
            return sendJson({
              openapi: '3.0.3',
              info: {
                title: 'Canonical World-Class Sports API Gateway',
                version: '1.0.0',
                description: 'Stateless Sports API Gateway & Aggregator providing standardized canonical entities across sports, teams, players, matches, statistics, commentary, lineups, standings, and rankings.',
              },
              servers: [{ url: 'http://localhost:5173/api/v1' }],
              paths: {
                '/sports': { get: { summary: 'List all sports' } },
                '/countries': { get: { summary: 'List all countries' } },
                '/leagues': { get: { summary: 'List all leagues' } },
                '/tournaments': { get: { summary: 'List all tournaments' } },
                '/seasons': { get: { summary: 'List all seasons' } },
                '/venues': { get: { summary: 'List all venues' } },
                '/teams': { get: { summary: 'List all teams' } },
                '/players': { get: { summary: 'List all players' } },
                '/matches': { get: { summary: 'List all canonical matches' } },
                '/matches/live': { get: { summary: 'Get live matches' } },
                '/matches/upcoming': { get: { summary: 'Get upcoming matches' } },
                '/matches/scheduled': { get: { summary: 'Get scheduled matches' } },
                '/matches/completed': { get: { summary: 'Get completed matches' } },
                '/rankings': { get: { summary: 'Get global rankings' } },
                '/standings': { get: { summary: 'Get league standings' } },
                '/statistics': { get: { summary: 'Get player/match statistics' } },
                '/commentary': { get: { summary: 'Get commentary data' } },
                '/events': { get: { summary: 'Get match events' } },
                '/lineups': { get: { summary: 'Get team lineups' } },
                '/officials': { get: { summary: 'Get match officials' } },
                '/search': { get: { summary: 'Global multi-entity search' } },
              },
            });
          }

          // --- 3. Canonical Entities APIs ---
          if (pathname === '/api/v1/sports') {
            return sendJson(SPORTS_CATALOG.map(toCanonicalSport));
          }
          if (pathname.startsWith('/api/v1/sports/')) {
            const sportId = pathname.replace('/api/v1/sports/', '');
            const found = SPORTS_CATALOG.find(s => s.id === sportId || s.slug === sportId);
            return found ? sendJson(toCanonicalSport(found)) : sendJson({ error: 'Sport not found' }, 404);
          }

          if (pathname === '/api/v1/countries') {
            return sendJson(COUNTRIES_CATALOG.map(toCanonicalCountry));
          }
          if (pathname === '/api/v1/leagues' || pathname === '/api/v1/competitions') {
            return sendJson(COMPETITIONS_CATALOG.map(toCanonicalLeague));
          }
          if (pathname === '/api/v1/tournaments') {
            return sendJson(COMPETITIONS_CATALOG.map(toCanonicalTournament));
          }
          if (pathname === '/api/v1/seasons') {
            return sendJson(SEASONS_CATALOG.map(toCanonicalSeason));
          }
          if (pathname === '/api/v1/venues') {
            return sendJson(VENUES_CATALOG.map(toCanonicalVenue));
          }
          if (pathname === '/api/v1/teams') {
            return sendJson(getStandardizedTeams().map(toCanonicalTeam));
          }
          if (pathname === '/api/v1/players') {
            return sendJson(getPlayersForTeam('Hampshire').map(toCanonicalPlayer));
          }

          // --- 4. Matches Collection Routes ---
          if (pathname === '/api/v1/matches/live') {
            const result = await fetchGatewaySportMatches('cricket', 'live');
            const matches = (result.matches || []).map((m) => toCanonicalMatch(m, result.provider || 'gateway'));
            return sendJson({ ...result, matches });
          }
          if (pathname === '/api/v1/matches/upcoming' || pathname === '/api/v1/matches/scheduled') {
            const result = await fetchGatewaySportMatches('cricket', 'upcoming');
            const matches = (result.matches || []).map((m) => toCanonicalMatch(m, result.provider || 'gateway'));
            return sendJson({ ...result, matches });
          }
          if (pathname === '/api/v1/matches/completed') {
            const result = await fetchGatewaySportMatches('cricket', 'completed');
            const matches = (result.matches || []).map((m) => toCanonicalMatch(m, result.provider || 'gateway'));
            return sendJson({ ...result, matches });
          }
          if (pathname === '/api/v1/matches') {
            const sport = urlObj.searchParams.get('sport') || 'cricket';
            const status = urlObj.searchParams.get('status') || 'live';
            const result = await fetchGatewaySportMatches(sport, status);
            const matches = (result.matches || []).map((m) => toCanonicalMatch(m, result.provider || 'gateway'));
            return sendJson({ ...result, matches });
          }

          // --- 5. Standings, Rankings, Stats & Detail Attributes ---
          if (pathname === '/api/v1/standings') {
            return sendJson(getStandingsCatalog().map(toCanonicalStandings));
          }
          if (pathname === '/api/v1/rankings') {
            const rawRankings = getRankingsCatalog();
            return sendJson({
              teams: (rawRankings.teams || []).map(toCanonicalRankings),
              players: (rawRankings.players || []).map(toCanonicalRankings),
            });
          }
          if (pathname === '/api/v1/statistics') {
            return sendJson(toCanonicalPlayerStatistics({ matches: 42, runs: 1420, avg: '42.5', sr: '138.4', wickets: 12 }));
          }
          if (pathname === '/api/v1/commentary') {
            return sendJson(toCanonicalCommentary({ commentary: 'FOUR! Driven past extra cover.', currentOverBalls: ['1', '4', '0', 'W'] }));
          }
          if (pathname === '/api/v1/events') {
            return sendJson(toCanonicalMatchEvents({ boundary: 14, six: 5, wicket: 3 }));
          }
          if (pathname === '/api/v1/lineups') {
            return sendJson(toCanonicalLineups({ startingXI: getPlayersForTeam('Hampshire').slice(0, 11).map(p => p.name) }));
          }
          if (pathname === '/api/v1/officials') {
            return sendJson(toCanonicalOfficials({ umpires: ['R. Kettleborough', 'N. Llong'], matchReferee: ['J. Srinath'] }));
          }

          // --- 6. Search APIs ---
          if (pathname === '/api/v1/search' || pathname.startsWith('/api/v1/search/')) {
            const q = urlObj.searchParams.get('q') || urlObj.searchParams.get('query') || '';
            const rawSearch = await performGlobalSearch(q);
            return sendJson({
              query: q,
              sports: (rawSearch.sports || []).map(toCanonicalSport),
              countries: (rawSearch.countries || []).map(toCanonicalCountry),
              competitions: (rawSearch.competitions || []).map(toCanonicalLeague),
              teams: (rawSearch.teams || []).map(toCanonicalTeam),
              players: (rawSearch.players || []).map(toCanonicalPlayer),
              matches: (rawSearch.matches || []).map(m => toCanonicalMatch(m, m.provider || 'gateway')),
            });
          }

          sendJson({ error: 'Endpoint not found', path: pathname }, 404);
        } catch (err) {
          console.error('[Sports API Gateway Error]', err);
          sendJson({ error: 'Internal Server Error', message: err.message }, 500);
        }
      });
    },
  };
}
