const CRICBUZZ_API = 'https://www.cricbuzz.com/api';
const LIVE_SCORES_URL = 'https://www.cricbuzz.com/cricket-match/live-scores';

const TEAM_ALIASES = {
  'birmingham phoenix': ['brm', 'birmingham', 'phoenix'],
  'welsh fire': ['wef', 'welsh', 'fire'],
  'london spirit': ['ldn', 'ldnw', 'london', 'spirit'],
  'southern brave': ['sou', 'souw', 'southern', 'brave'],
  'manchester originals': ['mcr', 'mcrw', 'originals'],
  'northern superchargers': ['nos', 'nosw', 'superchargers'],
  'oval invincibles': ['ovl', 'ovlw', 'invincibles'],
  'trent rockets': ['tre', 'trew', 'rockets'],
  'sunrisers hyderabad': ['srh', 'sunrisers', 'hyderabad'],
  'royal challengers': ['rcb', 'bengaluru', 'bangalore'],
  'mumbai indians': ['mi', 'mumbai'],
  'chennai super kings': ['csk', 'chennai'],
  'kolkata knight riders': ['kkr', 'kolkata'],
  'delhi capitals': ['dc', 'delhi'],
  'rajasthan royals': ['rr', 'rajasthan'],
  'punjab kings': ['pbks', 'punjab'],
  'lucknow super giants': ['lsg', 'lucknow'],
  'gujarat titans': ['gt', 'gujarat'],
  'kenya': ['ken', 'kenya'],
  'bahrain': ['bhr', 'bahrain'],
  'colombo stars': ['col', 'colombo'],
  'galle gladiators': ['gag', 'galle', 'gladiators'],
};

function normalizeName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\s+w$/i, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

function teamTokens(teamName) {
  const norm = normalizeName(teamName);
  const aliases = TEAM_ALIASES[norm] || [];
  const words = norm.split(/\s+/).filter(Boolean);
  return new Set([norm, ...aliases, ...words]);
}

function slugMatchesTeams(slug, team1, team2) {
  const parts = slug.split('-vs-');
  if (parts.length < 2) return false;
  const slugTeam1 = parts[0];
  const slugTeam2 = parts[1].split('-')[0]; // first token after vs

  const t1 = teamTokens(team1);
  const t2 = teamTokens(team2);

  const matches = (slugCode, tokens) =>
    [...tokens].some(tok => tok && (slugCode.includes(tok) || tok.includes(slugCode)));

  return (
    (matches(slugTeam1, t1) && matches(slugTeam2, t2)) ||
    (matches(slugTeam1, t2) && matches(slugTeam2, t1))
  );
}

async function fetchCricbuzzJson(path) {
  const res = await fetch(`${CRICBUZZ_API}${path}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; BetKing/1.0)',
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Cricbuzz API ${res.status}`);
  const text = await res.text();
  if (text.trim().startsWith('<!')) throw new Error('Cricbuzz returned HTML');
  return JSON.parse(text);
}

export async function fetchLiveMatches() {
  const res = await fetch(LIVE_SCORES_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BetKing/1.0)' },
  });
  if (!res.ok) throw new Error(`Cricbuzz live page ${res.status}`);
  const html = await res.text();
  const matches = [];
  const seen = new Set();
  const re = /\/live-cricket-scores\/(\d+)\/([^"'?#]+)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    matches.push({ matchId: m[1], slug: m[2] });
  }
  return matches;
}

export function resolveMatchId(liveMatches, team1, team2) {
  if (!team1 || !team2) return null;
  const hit = liveMatches.find(m => slugMatchesTeams(m.slug, team1, team2));
  return hit?.matchId || null;
}

function roleFromPlayer(batter, bowler) {
  if (batter && bowler) return 'Allrounder';
  if (bowler) return 'Bowler';
  if (batter?.isKeeper) return 'WK-Batter';
  if (batter?.isCaptain) return 'Captain';
  return 'Batter';
}

export function parseScorecardPlayers(scorecardData) {
  const playerMap = new Map();

  for (const innings of scorecardData?.scoreCard || []) {
    const batTeam = innings.batTeamDetails?.batTeamName || 'Team';
    const bowlTeam = innings.bowlTeamDetails?.bowlTeamName || 'Team';

    for (const b of Object.values(innings.batTeamDetails?.batsmenData || {})) {
      const id = String(b.batId);
      const existing = playerMap.get(id) || {
        id,
        name: b.batShortName || b.batName,
        fullName: b.batName,
        team: batTeam,
        role: 'Batter',
        battingStyle: '—',
        bowlingStyle: '—',
        headshot: null,
        source: 'cricbuzz',
        matchStats: null,
        bowling: null,
        cricbuzzId: b.batId,
        cricinfoUrl: `https://www.cricbuzz.com/profiles/${b.batId}/${slugify(b.batName)}`,
      };

      existing.matchStats = {
        runs: b.runs ?? 0,
        balls: b.balls ?? 0,
        fours: b.fours ?? 0,
        sixes: b.sixes ?? 0,
        strikeRate: b.strikeRate ?? null,
        dismissal: b.outDesc || (b.runs !== undefined ? 'out' : null),
      };
      if (b.isKeeper) existing.role = 'WK-Batter';
      if (b.isCaptain) existing.role = 'Captain';
      playerMap.set(id, existing);
    }

    for (const b of Object.values(innings.bowlTeamDetails?.bowlersData || {})) {
      const id = String(b.bowlerId);
      const existing = playerMap.get(id) || {
        id,
        name: b.bowlShortName || b.bowlName,
        fullName: b.bowlName,
        team: bowlTeam,
        role: 'Bowler',
        battingStyle: '—',
        bowlingStyle: '—',
        headshot: null,
        source: 'cricbuzz',
        matchStats: null,
        bowling: null,
        cricbuzzId: b.bowlerId,
        cricinfoUrl: `https://www.cricbuzz.com/profiles/${b.bowlerId}/${slugify(b.bowlName)}`,
      };

      existing.team = existing.team || bowlTeam;
      existing.bowling = {
        wickets: b.wickets ?? 0,
        runs: b.runs ?? 0,
        overs: b.overs ?? '—',
        economy: b.economy ?? null,
        maidens: b.maidens ?? 0,
      };
      existing.matchStats = existing.matchStats || {
        bowling: existing.bowling,
      };
      if (existing.matchStats && !existing.matchStats.runs) {
        existing.matchStats.bowling = existing.bowling;
      }
      existing.role = roleFromPlayer(
        existing.matchStats?.runs !== undefined ? { isKeeper: false, isCaptain: false } : null,
        existing.bowling
      );
      playerMap.set(id, existing);
    }
  }

  return [...playerMap.values()];
}

function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function fetchCricbuzzMatchPlayers(matchId) {
  const data = await fetchCricbuzzJson(`/mcenter/scorecard/${matchId}`);
  const players = parseScorecardPlayers(data);
  return {
    players,
    matchId: String(matchId),
    source: 'cricbuzz',
    fetchedAt: new Date().toISOString(),
  };
}

export async function handleCricbuzzRequest(query = {}) {
  const { type, matchId, team1, team2 } = query;

  try {
    switch (type) {
      case 'scorecard': {
        if (!matchId) return { status: 400, error: 'matchId required' };
        const data = await fetchCricbuzzJson(`/mcenter/scorecard/${matchId}`);
        return { status: 200, data };
      }
      case 'live-matches': {
        const data = await fetchLiveMatches();
        return { status: 200, data };
      }
      case 'resolve': {
        const list = await fetchLiveMatches();
        const resolved = matchId || resolveMatchId(list, team1, team2);
        if (!resolved) return { status: 404, error: 'No matching Cricbuzz match found' };
        return { status: 200, data: { matchId: resolved } };
      }
      case 'players': {
        let id = matchId;
        if (!id && team1 && team2) {
          const list = await fetchLiveMatches();
          id = resolveMatchId(list, team1, team2);
        }
        if (!id) return { status: 404, error: 'Could not resolve Cricbuzz match' };
        const result = await fetchCricbuzzMatchPlayers(id);
        return { status: 200, data: result };
      }
      default:
        return { status: 400, error: 'Unknown type. Use: scorecard, live-matches, resolve, players' };
    }
  } catch (err) {
    return { status: 502, error: err.message || 'Cricbuzz fetch failed' };
  }
}
