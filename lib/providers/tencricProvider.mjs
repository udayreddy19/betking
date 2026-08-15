/**
 * 10Cric 2026 live source.
 * Pages: https://www.10cric2026.com/, /live-betting/, and /sports/
 * All three load the OpenTag sportsbook GraphQL used here.
 */

import { formatTeamShortName } from '../../src/utils/teamShortName.js';

const TENCRIC_ORIGIN = 'https://www.10cric2026.com';
const TENCRIC_GRAPHQL_URL = `${TENCRIC_ORIGIN}/graphql`;
const TENCRIC_HOME_URL = `${TENCRIC_ORIGIN}/`;
const TENCRIC_LIVE_BETTING_URL = `${TENCRIC_ORIGIN}/live-betting/`;
const TENCRIC_SPORTS_URL = `${TENCRIC_ORIGIN}/sports/`;

const CATALOG_SPORT_NAMES = new Set([
  'cricket',
  'virtual fast cricket',
  'soccer',
  'football',
  'tennis',
  'table tennis',
  'basketball',
  'kabaddi',
  'baseball',
  'volleyball',
  'ice hockey',
  'hockey',
  'rugby',
  'american football',
  'esoccer',
]);

const TENCRIC_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  Accept: 'application/json',
  'Content-Type': 'application/json',
  Origin: TENCRIC_ORIGIN,
  Referer: TENCRIC_LIVE_BETTING_URL,
};

const SPORT_COLORS = {
  cricket: '#f97316',
  soccer: '#22c55e',
  tennis: '#14b8a6',
  basketball: '#f59e0b',
  'table-tennis': '#06b6d4',
  'american-football': '#b45309',
  hockey: '#64748b',
  baseball: '#ef4444',
  kabaddi: '#a855f7',
  volleyball: '#eab308',
  rugby: '#84cc16',
  golf: '#22c55e',
  esports: '#8b5cf6',
  'virtual-cricket': '#f97316',
};

const LIST_SPORTS_QUERY = `
  query ListWidgetSports($payload: ListWidgetSportsRequest!) {
    listWidgetSports(payload: $payload) {
      widgetSports { id name type eventsCount urlPath }
    }
  }
`;

const LIST_CATALOG_SPORTS_QUERY = `
  query ListSports($payload: ListSportsRequest!) {
    listSports(payload: $payload) {
      sports { id name eventsCount urlPath type }
    }
  }
`;

const LIST_CATEGORIES_QUERY = `
  query ListSbCategories($payload: ListSbCategoriesRequest!) {
    listSbCategories(payload: $payload) {
      categories {
        regionName
        leagues { id name eventsCount urlPath sportId sportName }
      }
    }
  }
`;

const LIST_LEAGUE_EVENTS_QUERY = `
  query ListEvents($payload: ListEventsRequest!) {
    listEvents(payload: $payload) {
      events {
        id
        name
        leagueId
        leagueName
        sportId
        sportName
        isLive
        startEventDate
        participantHomeName
        participantAwayName
        totalHomeScore
        totalAwayScore
        homeDismissals
        awayDismissals
        over
        eventStatus
        urlPath
        eventPhase { showPhase description }
        home { name isBatting }
        away { name isBatting }
        markets {
          name
          marketLines {
            selections { name odds isActive }
          }
        }
      }
    }
  }
`;

const LIST_EVENTS_QUERY = `
  query ListWidgetEvents($payload: ListWidgetEventsRequest!) {
    listWidgetEvents(payload: $payload) {
      events {
        id
        name
        leagueId
        leagueName
        sportId
        sportName
        isLive
        startEventDate
        participantHomeName
        participantAwayName
        totalHomeScore
        totalAwayScore
        homeDismissals
        awayDismissals
        over
        eventStatus
        urlPath
        eventPhase { showPhase description }
        home { name isBatting }
        away { name isBatting }
        markets {
          name
          marketLines {
            selections { name odds isActive }
          }
        }
      }
    }
  }
`;

function shortName(name = '', fallback = 'TBD') {
  return formatTeamShortName(name, '', fallback);
}

function mapSport(name = '') {
  const n = String(name).toLowerCase();
  if (n.includes('virtual') && n.includes('cricket')) return 'virtual-cricket';
  if (n.includes('cricket')) return 'cricket';
  if (n.includes('soccer') || n.includes('football') && !n.includes('american')) return 'soccer';
  if (n.includes('american')) return 'american-football';
  if (n.includes('tennis') && n.includes('table')) return 'table-tennis';
  if (n.includes('tennis')) return 'tennis';
  if (n.includes('basket')) return 'basketball';
  if (n.includes('hockey')) return 'hockey';
  if (n.includes('baseball')) return 'baseball';
  if (n.includes('kabaddi')) return 'kabaddi';
  if (n.includes('volley')) return 'volleyball';
  if (n.includes('rugby')) return 'rugby';
  if (n.includes('golf')) return 'golf';
  if (n.includes('esport') || n.startsWith('e')) return 'esports';
  return n.replace(/\s+/g, '-') || 'cricket';
}

function num(value, fallback = 0) {
  const n = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function pickWinnerOdds(event) {
  const home = event.participantHomeName || event.home?.name || '';
  const away = event.participantAwayName || event.away?.name || '';
  const markets = Array.isArray(event.markets) ? event.markets : [];
  let homeOdds = null;
  let awayOdds = null;
  let drawOdds = null;

  for (const market of markets) {
    const selections = market?.marketLines?.[0]?.selections || [];
    if (selections.length < 2) continue;
    const byName = (token) => selections.find((s) => String(s.name || '').toLowerCase() === String(token).toLowerCase());
    const h = byName(home);
    const a = byName(away);
    const d = selections.find((s) => /draw|tie/i.test(s.name || ''));
    if (h?.odds && a?.odds) {
      homeOdds = num(h.odds, null);
      awayOdds = num(a.odds, null);
      if (d?.odds) drawOdds = num(d.odds, null);
      break;
    }
  }

  if (homeOdds == null || awayOdds == null) {
    const first = markets[0]?.marketLines?.[0]?.selections || [];
    if (first.length >= 2) {
      homeOdds = num(first[0].odds, null);
      awayOdds = num(first[1].odds, null);
      const d = first.find((s) => /draw|tie/i.test(s.name || ''));
      if (d?.odds) drawOdds = num(d.odds, null);
    }
  }

  if (homeOdds == null || awayOdds == null) return null;
  return {
    home: homeOdds,
    away: awayOdds,
    team1: homeOdds,
    team2: awayOdds,
    draw: drawOdds,
  };
}

function collectEventMarkets(event) {
  return [
    ...(Array.isArray(event.markets) ? event.markets : []),
    ...(Array.isArray(event.expandedMarkets) ? event.expandedMarkets : []),
    ...(Array.isArray(event.collapsedMarkets) ? event.collapsedMarkets : []),
  ];
}

function oversFromMarkets(event) {
  let best = 0;
  for (const market of collectEventMarkets(event)) {
    const match = String(market?.name || '').match(/over\s+(\d+)/i);
    if (match) best = Math.max(best, Number(match[1]));
  }
  return best > 0 ? String(best) : '';
}

function playerNameFromMarketTitle(title = '') {
  const text = String(title);
  if (/winner|odd\/even|run range|extended\)|dismissal method|top batter|toss/i.test(text)) return null;
  if (/\bover\s+\d+|\bovers\s+\d+/i.test(text) && !/,\s*[A-Za-z]/.test(text)) return null;
  if (!/\btotal\b|\bto score\b/i.test(text)) return null;
  const lastFirst = text.match(
    /([A-Za-z][A-Za-z'.-]*),\s*([A-Za-z][A-Za-z'.-]*(?:\s+[A-Za-z][A-Za-z'.-]+)*)(?:\s*\(\s*SRL\s*\)|\s*[-–]\s*SRL)?/i,
  );
  if (!lastFirst) return null;
  const family = lastFirst[1].trim();
  const given = lastFirst[2].trim();
  if (!family || !given) return null;
  return `${given} ${family}`.replace(/\s+/g, ' ').trim();
}

function marketInnings(title = '') {
  if (/2nd innings|second innings/i.test(title)) return 2;
  if (/1st innings|first innings/i.test(title)) return 1;
  return 0;
}

function isPlayerRunsMarket(title = '') {
  return /\btotal\b/i.test(title) || /\bto score\b/i.test(title);
}

function overLineFromMarket(market) {
  for (const line of market?.marketLines || []) {
    for (const selection of line?.selections || []) {
      const hit = String(selection?.name || '').match(/over\s+([\d.]+)/i);
      if (hit) return Number(hit[1]);
    }
  }
  return null;
}

function extractLivePlayersFromMarkets(event, { inningsId } = {}) {
  const liveStrip = [
    ...(Array.isArray(event.expandedMarkets) ? event.expandedMarkets : []),
    ...(Array.isArray(event.collapsedMarkets) ? event.collapsedMarkets : []),
  ];
  const phaseSecond = inningsId === 2 || /second/i.test(String(event.eventPhase?.description || ''));
  let wantInnings = phaseSecond ? 2 : 1;

  const batters = [];
  const seen = new Set();
  let bowlerName = '';

  const pushBatter = (playerName, runs, fromLiveStrip) => {
    const key = playerName.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    batters.push({
      name: playerName,
      runs: Number.isFinite(runs) ? Math.max(0, Math.floor(runs)) : 0,
      balls: 0,
      fours: 0,
      sixes: 0,
      fromLiveStrip: !!fromLiveStrip,
    });
  };

  const scan = (markets, fromLiveStrip, totalsOnly) => {
    for (const market of markets) {
      const title = String(market?.name || '');
      const playerName = playerNameFromMarketTitle(title);
      if (!playerName) continue;
      if (/\bbowler\b/i.test(title) && !bowlerName) bowlerName = playerName;
      if (!isPlayerRunsMarket(title)) continue;
      if (totalsOnly && !/\btotal\b/i.test(title)) continue;
      const inn = marketInnings(title);
      if (wantInnings && inn && inn !== wantInnings) continue;
      pushBatter(playerName, overLineFromMarket(market), fromLiveStrip);
    }
  };

  scan(liveStrip, true, true);
  if (batters.length < 2) scan(liveStrip, true, false);
  if (batters.length < 2 && wantInnings) {
    wantInnings = 0;
    scan(liveStrip, true, true);
    if (batters.length < 2) scan(liveStrip, true, false);
  }

  batters.sort((a, b) => Number(b.fromLiveStrip) - Number(a.fromLiveStrip) || b.runs - a.runs);

  const liveCount = batters.filter((batter) => batter.fromLiveStrip).length;
  const inPlay = event.isLive === true
    || /first|second|innings/i.test(String(event.eventPhase?.description || ''));
  const out = {};
  if (liveCount > 3) {
    if (bowlerName) out.bowler = { name: bowlerName, overs: null, maidens: 0, runs: 0, wickets: 0 };
    return out;
  }
  if (!inPlay && liveCount !== 2) {
    return out;
  }

  if (batters[0]) {
    const { fromLiveStrip: _a, ...batter1 } = batters[0];
    out.batter1 = batter1;
  }
  if (batters[1]) {
    const { fromLiveStrip: _b, ...batter2 } = batters[1];
    out.batter2 = batter2;
  }
  if (bowlerName) out.bowler = { name: bowlerName, overs: null, maidens: 0, runs: 0, wickets: 0 };
  return out;
}

function mapEvent(event) {
  const homeName = event.participantHomeName || event.home?.name || 'Team 1';
  const awayName = event.participantAwayName || event.away?.name || 'Team 2';
  const sport = mapSport(event.sportName);
  const isLive = event.isLive === true
    || /in.?play|live|active/i.test(String(event.eventStatus || ''));
  const phase = event.eventPhase?.description || '';
  const isSecond = /second/i.test(phase);
  const homeRuns = num(event.totalHomeScore);
  const awayRuns = num(event.totalAwayScore);
  const homeWkts = num(event.homeDismissals);
  const awayWkts = num(event.awayDismissals);
  const overs = event.over != null && event.over !== ''
    ? String(event.over)
    : oversFromMarkets(event);

  const battingHome = event.home?.isBatting === true
    || (isSecond && event.away?.isBatting !== true)
    || (!isSecond && event.away?.isBatting !== true);

  const firstRuns = isSecond ? (battingHome ? awayRuns : homeRuns) : (battingHome ? homeRuns : awayRuns);
  const firstWickets = isSecond ? (battingHome ? awayWkts : homeWkts) : (battingHome ? homeWkts : awayWkts);
  const firstTeamName = isSecond
    ? (battingHome ? awayName : homeName)
    : (battingHome ? homeName : awayName);
  const chaseRuns = isSecond ? (battingHome ? homeRuns : awayRuns) : undefined;
  const chaseWickets = isSecond ? (battingHome ? homeWkts : awayWkts) : undefined;
  const chaseTeamName = isSecond ? (battingHome ? homeName : awayName) : undefined;

  const liveDetails = {
    runs: battingHome ? homeRuns : (isSecond ? firstRuns : awayRuns),
    wickets: battingHome ? homeWkts : (isSecond ? firstWickets : awayWkts),
    overs: isSecond ? (battingHome ? overs || '0.0' : '0.0') : (overs || '0.0'),
    score2: awayRuns,
    wickets2: awayWkts,
    overs2: isSecond ? (!battingHome ? overs || '0.0' : overs || '0.0') : '0.0',
    firstRuns,
    firstWickets,
    firstOvers: isSecond ? undefined : (overs || undefined),
    firstTeamName,
    commentary: phase || (isLive ? 'Live' : ''),
    inningsId: isSecond ? 2 : 1,
  };

  if (sport === 'cricket' || sport === 'virtual-cricket') {
    const fromMarkets = extractLivePlayersFromMarkets(event, { inningsId: isSecond ? 2 : 1 });
    if (fromMarkets.batter1) liveDetails.batter1 = fromMarkets.batter1;
    if (fromMarkets.batter2) liveDetails.batter2 = fromMarkets.batter2;
    if (fromMarkets.bowler) liveDetails.bowler = fromMarkets.bowler;
  }

  if (isSecond) {
    liveDetails.chaseRuns = chaseRuns;
    liveDetails.chaseWickets = chaseWickets;
    liveDetails.chaseOvers = overs || '0.0';
    liveDetails.chaseTeamName = chaseTeamName;
    liveDetails.overs2 = overs || liveDetails.overs2;
    if (!overs || overs === '0' || overs === '0.0') {
      liveDetails.overs = liveDetails.chaseOvers;
    } else if (battingHome) {
      liveDetails.overs = overs;
    } else {
      liveDetails.overs = '0.0';
    }
  }

  const odds = pickWinnerOdds(event);
  const path = event.urlPath ? `${TENCRIC_ORIGIN}${event.urlPath}` : TENCRIC_LIVE_BETTING_URL;

  return {
    id: `10cric_${event.id}`,
    source: '10cric2026',
    provider: '10cric2026',
    tencricEventId: event.id,
    tencricUrl: path,
    league: event.leagueName || event.sportName || '10Cric',
    sport,
    sportColor: SPORT_COLORS[sport] || '#64748b',
    time: isLive ? 'Live' : 'Scheduled',
    isLive,
    matchState: isLive ? 'in' : 'pre',
    team1: { name: homeName, shortName: shortName(homeName), color: '#22c55e' },
    team2: { name: awayName, shortName: shortName(awayName), color: '#e5e7eb' },
    liveDetails,
    odds,
    startTime: event.startEventDate || null,
    scoreboardEventId: event.scoreboardEventId || null,
  };
}

const LAZY_EVENT_QUERY = `
  query lazyEvent($payload: LazyEventRequest!) {
    lazyEvent(payload: $payload) {
      sportEvent {
        id
        name
        leagueName
        sportName
        isLive
        startEventDate
        participantHomeName
        participantAwayName
        totalHomeScore
        totalAwayScore
        scoreboardEventId
        eventStatus
        urlPath
        eventPhase { showPhase description }
        expandedMarkets {
          id
          name
          marketLines { name selections { name odds isActive } }
        }
        collapsedMarkets { id name }
      }
    }
  }
`;

const MARKETS_DATA_QUERY = `
  query markets($payload: MarketsDataRequest!) {
    marketsData(payload: $payload) {
      markets {
        name
        marketLines { name selections { name odds isActive } }
      }
    }
  }
`;

async function findLiveListEvent(eventId) {
  const sports = await listSports('WIDGET_TYPE_LIVE_EVENTS');
  const cricketSports = sports.filter((sport) => /cric/i.test(sport.name || ''));
  const chunks = await Promise.allSettled(
    cricketSports.map((sport) => listEvents('WIDGET_TYPE_LIVE_EVENTS', sport.id)),
  );
  for (const result of chunks) {
    if (result.status !== 'fulfilled') continue;
    const found = (result.value || []).find((event) => String(event.id) === String(eventId));
    if (found) return found;
  }
  return null;
}

export async function fetch10CricMatchById(matchId) {
  const id = String(matchId || '').replace(/^10cric_/, '').trim();
  if (!id) return null;
  try {
    const [lazyData, listEvent] = await Promise.all([
      graphql(LAZY_EVENT_QUERY, { payload: { eventId: id } }).catch(() => null),
      findLiveListEvent(id).catch(() => null),
    ]);
    const sportEvent = lazyData?.lazyEvent?.sportEvent;
    const merged = {
      ...(listEvent && listEvent.id ? listEvent : {}),
      ...(sportEvent && sportEvent.id ? sportEvent : {}),
      markets: (listEvent?.markets?.length ? listEvent.markets : sportEvent?.markets) || [],
      expandedMarkets: [
        ...(Array.isArray(sportEvent?.expandedMarkets) ? sportEvent.expandedMarkets : []),
        ...(Array.isArray(listEvent?.expandedMarkets) ? listEvent.expandedMarkets : []),
      ],
      collapsedMarkets: [
        ...(Array.isArray(sportEvent?.collapsedMarkets) ? sportEvent.collapsedMarkets : []),
        ...(Array.isArray(listEvent?.collapsedMarkets) ? listEvent.collapsedMarkets : []),
      ],
      home: listEvent?.home || sportEvent?.home,
      away: listEvent?.away || sportEvent?.away,
      over: listEvent?.over ?? sportEvent?.over,
      homeDismissals: listEvent?.homeDismissals ?? sportEvent?.homeDismissals,
      awayDismissals: listEvent?.awayDismissals ?? sportEvent?.awayDismissals,
      eventPhase: listEvent?.eventPhase || sportEvent?.eventPhase,
      isLive: listEvent?.isLive === true || sportEvent?.isLive === true,
    };
    if (!merged.id) return null;

    const collapsedIds = [...new Set(
      (merged.collapsedMarkets || [])
        .map((market) => market?.id)
        .filter(Boolean),
    )].slice(0, 8);

    if (collapsedIds.length) {
      try {
        const extra = await graphql(MARKETS_DATA_QUERY, {
          payload: { eventId: id, marketIds: collapsedIds },
        });
        const extraMarkets = extra?.marketsData?.markets || [];
        merged.extraPlayerMarkets = extraMarkets;
      } catch {
        // Player markets are optional; scores still map.
      }
    }

    return mapEvent({
      ...merged,
      sportName: listEvent?.sportName || sportEvent?.sportName || merged.sportName || 'cricket',
    });
  } catch (err) {
    console.warn('[10Cric Provider] Match detail notice:', err.message);
    return null;
  }
}

async function graphql(query, variables, timeoutMs = 8000) {
  const res = await fetch(TENCRIC_GRAPHQL_URL, {
    method: 'POST',
    headers: TENCRIC_HEADERS,
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`10Cric GraphQL ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(json.errors[0]?.message || '10Cric GraphQL error');
  }
  return json.data;
}

async function listSports(widgetType) {
  const data = await graphql(LIST_SPORTS_QUERY, { payload: { widgetType } });
  return data?.listWidgetSports?.widgetSports || [];
}

async function listEvents(widgetType, sportId) {
  const data = await graphql(LIST_EVENTS_QUERY, {
    payload: { widgetType, sportId },
  });
  return data?.listWidgetEvents?.events || [];
}

async function collectEvents(widgetType, sports) {
  const chunks = await Promise.allSettled(
    sports.map((sport) => listEvents(widgetType, sport.id)),
  );
  const events = [];
  chunks.forEach((result, idx) => {
    if (result.status !== 'fulfilled') return;
    const sportName = sports[idx]?.name;
    for (const event of result.value) {
      events.push({ ...event, sportName: event.sportName || sportName });
    }
  });
  return events;
}

async function listCatalogSports(eventType = 'ALL') {
  const data = await graphql(LIST_CATALOG_SPORTS_QUERY, { payload: { eventType } });
  return data?.listSports?.sports || [];
}

async function listLeaguesForSport(sportId, eventType = 'ALL') {
  const data = await graphql(LIST_CATEGORIES_QUERY, {
    payload: { sportId, eventType },
  });
  const categories = data?.listSbCategories?.categories || [];
  return categories.flatMap((cat) => cat.leagues || []);
}

async function listLeagueEvents(leagueId, eventType = 'ALL') {
  const data = await graphql(LIST_LEAGUE_EVENTS_QUERY, {
    payload: { leagueId, eventType },
  });
  return data?.listEvents?.events || [];
}

async function collectSportsCatalogEvents() {
  const sports = await listCatalogSports('ALL');
  const wanted = sports.filter((sport) => CATALOG_SPORT_NAMES.has(String(sport.name || '').toLowerCase()));
  const leagueLists = await Promise.allSettled(
    wanted.map((sport) => listLeaguesForSport(sport.id, 'ALL')),
  );

  const leagues = [];
  leagueLists.forEach((result, idx) => {
    if (result.status !== 'fulfilled') return;
    const sportName = wanted[idx]?.name;
    for (const league of result.value) {
      if ((league.eventsCount || 0) < 1) continue;
      leagues.push({ ...league, sportName: league.sportName || sportName });
    }
  });

  leagues.sort((a, b) => (b.eventsCount || 0) - (a.eventsCount || 0));
  const capped = leagues.slice(0, 48);

  const eventLists = await Promise.allSettled(
    capped.map((league) => listLeagueEvents(league.id, 'ALL')),
  );
  const events = [];
  eventLists.forEach((result, idx) => {
    if (result.status !== 'fulfilled') return;
    const sportName = capped[idx]?.sportName;
    const leagueName = capped[idx]?.name;
    for (const event of result.value) {
      events.push({
        ...event,
        sportName: event.sportName || sportName,
        leagueName: event.leagueName || leagueName,
      });
    }
  });
  return events;
}

function ingestEvents(matchMap, events) {
  for (const event of events) {
    if (!event?.id || !event.participantHomeName || !event.participantAwayName) continue;
    const mapped = mapEvent(event);
    const existing = matchMap.get(mapped.id);
    if (!existing || (mapped.isLive && !existing.isLive)) {
      if (existing?.liveDetails && mapped.liveDetails) {
        if (!mapped.liveDetails.batter1?.name && existing.liveDetails.batter1?.name) {
          mapped.liveDetails.batter1 = existing.liveDetails.batter1;
        }
        if (!mapped.liveDetails.batter2?.name && existing.liveDetails.batter2?.name) {
          mapped.liveDetails.batter2 = existing.liveDetails.batter2;
        }
        if (!mapped.liveDetails.bowler?.name && existing.liveDetails.bowler?.name) {
          mapped.liveDetails.bowler = existing.liveDetails.bowler;
        }
      }
      matchMap.set(mapped.id, mapped);
    } else if (existing && mapped.odds && !existing.odds) {
      existing.odds = mapped.odds;
    }
  }
}

const PLAYER_ENRICH_TTL_MS = 8_000;
const playerEnrichCache = new Map();

async function mapPool(items, limit, fn) {
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      await fn(current);
    }
  });
  await Promise.all(workers);
}

async function enrichLiveCricketPlayers(matches) {
  const need = matches.filter((match) => (
    match.isLive
    && (match.sport === 'cricket' || match.sport === 'virtual-cricket')
    && !match.liveDetails?.batter1?.name
    && !match.liveDetails?.batter2?.name
  )).sort((a, b) => {
    const score = (match) => {
      const overs = parseFloat(match.liveDetails?.overs || match.liveDetails?.chaseOvers || 0);
      let value = Number.isFinite(overs) ? overs : 0;
      if (!/\(v\)/i.test(`${match.team1?.name || ''} ${match.team2?.name || ''}`)) value += 8;
      if (/srl/i.test(`${match.league || ''} ${match.team1?.name || ''}`)) value += 4;
      return value;
    };
    return score(b) - score(a);
  }).slice(0, 12);

  if (!need.length) return;

  await mapPool(need, 3, async (match) => {
    const cached = playerEnrichCache.get(match.id);
    if (cached && Date.now() - cached.at < PLAYER_ENRICH_TTL_MS) {
      match.liveDetails = { ...match.liveDetails, ...cached.players };
      return;
    }
    try {
      const detail = await fetch10CricMatchById(match.id);
      const ld = detail?.liveDetails || {};
      const players = {};
      if (ld.batter1?.name) players.batter1 = ld.batter1;
      if (ld.batter2?.name) players.batter2 = ld.batter2;
      if (ld.bowler?.name) players.bowler = ld.bowler;
      if (players.batter1 || players.batter2) {
        playerEnrichCache.set(match.id, { at: Date.now(), players });
        match.liveDetails = { ...match.liveDetails, ...players };
      }
    } catch {
      // List scores remain valid without player names.
    }
  });
}

/** Warm the same pages the site uses so cookies/CDN see a real browser session. */
async function touchSitePages() {
  const headers = {
    'User-Agent': TENCRIC_HEADERS['User-Agent'],
    Accept: 'text/html,application/xhtml+xml',
    Referer: TENCRIC_ORIGIN,
  };
  await Promise.allSettled([
    fetch(TENCRIC_HOME_URL, { headers, signal: AbortSignal.timeout(5000) }),
    fetch(TENCRIC_LIVE_BETTING_URL, { headers, signal: AbortSignal.timeout(5000) }),
    fetch(TENCRIC_SPORTS_URL, { headers, signal: AbortSignal.timeout(5000) }),
  ]);
}

export async function fetch10CricLiveScores() {
  try {
    await touchSitePages();
  } catch {
    // GraphQL still works without the HTML warm-up.
  }

  const matchMap = new Map();

  try {
    const [liveSports, upcomingSports, popularSports] = await Promise.all([
      listSports('WIDGET_TYPE_LIVE_EVENTS'),
      listSports('WIDGET_TYPE_UPCOMING_EVENTS').catch(() => []),
      listSports('WIDGET_TYPE_POPULAR_EVENTS').catch(() => []),
    ]);

    const [liveEvents, upcomingEvents, popularEvents, catalogEvents] = await Promise.all([
      collectEvents('WIDGET_TYPE_LIVE_EVENTS', liveSports),
      collectEvents('WIDGET_TYPE_UPCOMING_EVENTS', upcomingSports.slice(0, 12)),
      collectEvents('WIDGET_TYPE_POPULAR_EVENTS', popularSports.slice(0, 12)),
      collectSportsCatalogEvents().catch((err) => {
        console.warn('[10Cric Provider] /sports/ catalog notice:', err.message);
        return [];
      }),
    ]);

    ingestEvents(matchMap, liveEvents);
    ingestEvents(matchMap, upcomingEvents);
    ingestEvents(matchMap, popularEvents);
    ingestEvents(matchMap, catalogEvents);
  } catch (err) {
    console.warn('[10Cric Provider] GraphQL fetch failed:', err.message);
  }

  const matches = Array.from(matchMap.values());
  await enrichLiveCricketPlayers(matches);
  return matches;
}

export async function fetch10CricOdds(matchId) {
  const id = String(matchId || '').replace(/^10cric_/, '');
  if (!id) return null;
  try {
    const cricket = (await listSports('WIDGET_TYPE_LIVE_EVENTS'))
      .find((s) => /cricket/i.test(s.name));
    if (!cricket) return null;
    const events = await listEvents('WIDGET_TYPE_LIVE_EVENTS', cricket.id);
    const event = events.find((e) => String(e.id) === id);
    return event ? pickWinnerOdds(event) : null;
  } catch (err) {
    console.warn('[10Cric Provider] Odds fetch notice:', err.message);
    return null;
  }
}
