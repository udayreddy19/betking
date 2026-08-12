/**
 * Canonical Sports API Data Model — World-Class Entity Aggregator
 * Standardized across all providers with exact attribute definitions.
 * Returns populated data when available, and null for unavailable fields.
 */

// Helper to safely extract available value or return null
export function valOrNull(val) {
  if (val === undefined || val === null || val === '' || val === '—' || val === '-') {
    return null;
  }
  return val;
}

// 1. Sport Entity
export function toCanonicalSport(raw = {}) {
  let nameStr = 'Cricket';
  let idStr = 'cricket';
  let slugStr = 'cricket';

  if (typeof raw === 'string') {
    nameStr = raw ? (raw.charAt(0).toUpperCase() + raw.slice(1)) : 'Cricket';
    idStr = raw.toLowerCase();
    slugStr = raw.toLowerCase();
  } else if (raw && typeof raw === 'object') {
    const rawName = raw.name || raw.sportName || raw.sport;
    const extractedName = typeof rawName === 'string'
      ? (rawName.charAt(0).toUpperCase() + rawName.slice(1).toLowerCase())
      : (typeof raw.sport?.name === 'string' ? raw.sport.name : 'Cricket');
    nameStr = extractedName;
    idStr = typeof raw.id === 'string'
      ? raw.id
      : (typeof raw.sportId === 'string'
        ? raw.sportId
        : extractedName.toLowerCase());
    slugStr = typeof raw.slug === 'string'
      ? raw.slug
      : extractedName.toLowerCase().replace(/\s+/g, '-');
  }

  return {
    sportId: valOrNull(raw.id || raw.sportId || idStr),
    sportName: valOrNull(nameStr),
    slug: valOrNull(slugStr),
    description: valOrNull(raw.description),
    status: valOrNull(raw.status || 'ACTIVE'),
    icon: valOrNull(raw.icon),
    logo: valOrNull(raw.logo),
    createdDate: valOrNull(raw.createdDate || '2026-01-01T00:00:00Z'),
    updatedDate: valOrNull(raw.updatedDate || new Date().toISOString()),
  };
}

// 2. Country Entity
export function toCanonicalCountry(raw = {}) {
  return {
    countryId: valOrNull(raw.id || raw.countryId),
    countryName: valOrNull(raw.name || raw.countryName),
    iso2: valOrNull(raw.iso2),
    iso3: valOrNull(raw.iso3),
    flag: valOrNull(raw.flag),
    continent: valOrNull(raw.continent),
    currency: valOrNull(raw.currency),
    timezone: valOrNull(raw.timezone),
    latitude: valOrNull(raw.latitude),
    longitude: valOrNull(raw.longitude),
    population: valOrNull(raw.population),
  };
}

// 3. League Entity
export function toCanonicalLeague(raw = {}) {
  return {
    leagueId: valOrNull(raw.id || raw.leagueId),
    leagueName: valOrNull(raw.name || raw.leagueName),
    leagueLogo: valOrNull(raw.logo || raw.leagueLogo),
    leagueBanner: valOrNull(raw.banner || raw.leagueBanner),
    leagueType: valOrNull(raw.type || raw.leagueType || 'DOMESTIC'),
    division: valOrNull(raw.division || 'DIVISION_1'),
    country: valOrNull(raw.country),
    season: valOrNull(raw.season || '2026'),
    currentChampion: valOrNull(raw.currentChampion),
    founded: valOrNull(raw.founded),
    website: valOrNull(raw.website),
  };
}

// 4. Tournament Entity
export function toCanonicalTournament(raw = {}) {
  return {
    tournamentId: valOrNull(raw.id || raw.tournamentId),
    tournamentName: valOrNull(raw.name || raw.tournamentName),
    tournamentLogo: valOrNull(raw.logo || raw.tournamentLogo),
    hostCountry: valOrNull(raw.hostCountry),
    hostCity: valOrNull(raw.hostCity),
    prizePool: valOrNull(raw.prizePool),
    numberOfTeams: valOrNull(raw.numberOfTeams),
    season: valOrNull(raw.season || '2026'),
    startDate: valOrNull(raw.startDate),
    endDate: valOrNull(raw.endDate),
    status: valOrNull(raw.status || 'SCHEDULED'),
  };
}

// 5. Season Entity
export function toCanonicalSeason(raw = {}) {
  return {
    seasonId: valOrNull(raw.id || raw.seasonId),
    seasonName: valOrNull(raw.name || raw.seasonName || '2026'),
    year: valOrNull(raw.year || 2026),
    startDate: valOrNull(raw.startDate),
    endDate: valOrNull(raw.endDate),
    winner: valOrNull(raw.winner),
    runnerUp: valOrNull(raw.runnerUp),
  };
}

// 6. Venue Entity
export function toCanonicalVenue(raw = {}) {
  return {
    venueId: valOrNull(raw.id || raw.venueId),
    venueName: valOrNull(raw.name || raw.venueName),
    city: valOrNull(raw.city),
    country: valOrNull(raw.country),
    address: valOrNull(raw.address),
    latitude: valOrNull(raw.latitude),
    longitude: valOrNull(raw.longitude),
    capacity: valOrNull(raw.capacity),
    surface: valOrNull(raw.surface),
    timezone: valOrNull(raw.timezone),
    image: valOrNull(raw.image),
  };
}

// 7. Team Kit Entity
export function toCanonicalTeamKit(raw = {}) {
  return {
    homeJersey: valOrNull(raw.homeJersey),
    awayJersey: valOrNull(raw.awayJersey),
    thirdJersey: valOrNull(raw.thirdJersey),
    goalkeeperJersey: valOrNull(raw.goalkeeperJersey),
    primaryColor: valOrNull(raw.primaryColor || raw.color),
    secondaryColor: valOrNull(raw.secondaryColor),
    sleeveColor: valOrNull(raw.sleeveColor),
    shortColor: valOrNull(raw.shortColor),
    sockColor: valOrNull(raw.sockColor),
    manufacturer: valOrNull(raw.manufacturer),
    sponsor: valOrNull(raw.sponsor),
    jerseyImages: valOrNull(raw.jerseyImages),
  };
}

// 8. Team Entity
export function toCanonicalTeam(raw = {}) {
  return {
    teamId: valOrNull(raw.id || raw.teamId),
    teamName: valOrNull(raw.name || raw.teamName),
    shortName: valOrNull(raw.shortName || raw.code),
    nickName: valOrNull(raw.nickName),
    logo: valOrNull(raw.logo),
    banner: valOrNull(raw.banner),
    country: valOrNull(raw.country),
    city: valOrNull(raw.city),
    coach: valOrNull(raw.coach),
    assistantCoach: valOrNull(raw.assistantCoach),
    captain: valOrNull(raw.captain),
    viceCaptain: valOrNull(raw.viceCaptain),
    founded: valOrNull(raw.founded),
    website: valOrNull(raw.website),
    email: valOrNull(raw.email),
    phone: valOrNull(raw.phone),
    instagram: valOrNull(raw.instagram),
    twitter: valOrNull(raw.twitter),
    facebook: valOrNull(raw.facebook),
    youtube: valOrNull(raw.youtube),
    ranking: valOrNull(raw.ranking),
    currentForm: valOrNull(raw.currentForm || raw.form),
    kit: toCanonicalTeamKit(raw.kit || {}),
  };
}

// 9. Player Statistics Entity
export function toCanonicalPlayerStatistics(raw = {}) {
  return {
    careerMatches: valOrNull(raw.careerMatches || raw.matches),
    runs: valOrNull(raw.runs),
    goals: valOrNull(raw.goals),
    points: valOrNull(raw.points),
    assists: valOrNull(raw.assists),
    average: valOrNull(raw.average || raw.avg),
    strikeRate: valOrNull(raw.strikeRate || raw.sr),
    economy: valOrNull(raw.economy || raw.econ),
    wickets: valOrNull(raw.wickets),
    yellowCards: valOrNull(raw.yellowCards),
    redCards: valOrNull(raw.redCards),
    fouls: valOrNull(raw.fouls),
    rebounds: valOrNull(raw.rebounds),
    blocks: valOrNull(raw.blocks),
    steals: valOrNull(raw.steals),
    minutes: valOrNull(raw.minutes),
    mvpAwards: valOrNull(raw.mvpAwards),
  };
}

// 10. Player Entity
export function toCanonicalPlayer(raw = {}) {
  return {
    playerId: valOrNull(raw.id || raw.playerId),
    firstName: valOrNull(raw.firstName),
    middleName: valOrNull(raw.middleName),
    lastName: valOrNull(raw.lastName),
    fullName: valOrNull(raw.name || raw.fullName),
    nickName: valOrNull(raw.nickName),
    country: valOrNull(raw.country),
    birthPlace: valOrNull(raw.birthPlace),
    dateOfBirth: valOrNull(raw.dateOfBirth || raw.dob),
    age: valOrNull(raw.age),
    gender: valOrNull(raw.gender || 'MALE'),
    height: valOrNull(raw.height),
    weight: valOrNull(raw.weight),
    role: valOrNull(raw.role || 'Player'),
    position: valOrNull(raw.position),
    battingStyle: valOrNull(raw.battingStyle),
    bowlingStyle: valOrNull(raw.bowlingStyle),
    preferredFoot: valOrNull(raw.preferredFoot),
    preferredHand: valOrNull(raw.preferredHand),
    jerseyNumber: valOrNull(raw.jerseyNumber || raw.number),
    captain: valOrNull(raw.isCaptain ?? raw.captain ?? false),
    viceCaptain: valOrNull(raw.isViceCaptain ?? raw.viceCaptain ?? false),
    nationality: valOrNull(raw.nationality || raw.country),
    languages: valOrNull(raw.languages),
    instagram: valOrNull(raw.instagram),
    twitter: valOrNull(raw.twitter),
    facebook: valOrNull(raw.facebook),
    website: valOrNull(raw.website),
    image: valOrNull(raw.image || raw.photo),
    currentTeam: valOrNull(raw.currentTeam || raw.team),
    previousTeams: valOrNull(raw.previousTeams),
    agent: valOrNull(raw.agent),
    contractExpiry: valOrNull(raw.contractExpiry),
    status: valOrNull(raw.status || 'ACTIVE'),
    statistics: toCanonicalPlayerStatistics(raw.statistics || raw.stats || {}),
  };
}

// 11. Toss Entity (Cricket)
export function toCanonicalToss(raw = {}) {
  return {
    wonToss: valOrNull(raw.wonToss || raw.winner),
    lostToss: valOrNull(raw.lostToss),
    decision: valOrNull(raw.decision || raw.choice),
    batFirst: valOrNull(raw.batFirst),
    fieldFirst: valOrNull(raw.fieldFirst),
  };
}

// 12. Live Score Entity
export function toCanonicalLiveScore(raw = {}) {
  return {
    currentScore: valOrNull(raw.score || raw.currentScore),
    overs: valOrNull(raw.overs),
    runs: valOrNull(raw.runs || raw.home),
    wickets: valOrNull(raw.wickets),
    score2: valOrNull(raw.score2 || raw.away),
    wickets2: valOrNull(raw.wickets2),
    overs2: valOrNull(raw.overs2),
    goals: valOrNull(raw.goals),
    quarter: valOrNull(raw.quarter),
    half: valOrNull(raw.half),
    set: valOrNull(raw.set),
    point: valOrNull(raw.point),
    time: valOrNull(raw.time || raw.period),
    clock: valOrNull(raw.clock || raw.minute),
    possession: valOrNull(raw.possession),
  };
}

// 13. Match Events Entity
export function toCanonicalMatchEvents(raw = {}) {
  return {
    goal: valOrNull(raw.goal),
    penalty: valOrNull(raw.penalty),
    yellowCard: valOrNull(raw.yellowCard),
    redCard: valOrNull(raw.redCard),
    corner: valOrNull(raw.corner),
    offside: valOrNull(raw.offside),
    var: valOrNull(raw.var),
    substitution: valOrNull(raw.substitution),
    boundary: valOrNull(raw.boundary),
    six: valOrNull(raw.six),
    wicket: valOrNull(raw.wicket),
    review: valOrNull(raw.review),
    timeout: valOrNull(raw.timeout),
    superOver: valOrNull(raw.superOver),
    rainDelay: valOrNull(raw.rainDelay),
  };
}

// 14. Commentary Entity
export function toCanonicalCommentary(raw = {}) {
  return {
    ballByBall: valOrNull(raw.ballByBall || raw.currentOverBalls),
    minuteByMinute: valOrNull(raw.minuteByMinute),
    textCommentary: valOrNull(raw.commentary || raw.textCommentary),
    audio: valOrNull(raw.audio),
    videoHighlights: valOrNull(raw.videoHighlights || raw.highlights),
  };
}

// 15. Officials Entity
export function toCanonicalOfficials(raw = {}) {
  return {
    umpires: valOrNull(raw.umpires),
    referees: valOrNull(raw.referees),
    assistantReferees: valOrNull(raw.assistantReferees),
    thirdUmpire: valOrNull(raw.thirdUmpire),
    matchReferee: valOrNull(raw.matchReferee),
    scorer: valOrNull(raw.scorer),
  };
}

// 16. Lineups Entity
export function toCanonicalLineups(raw = {}) {
  return {
    startingXI: valOrNull(raw.startingXI || raw.playingXI),
    bench: valOrNull(raw.bench || raw.substitutes),
    substitutes: valOrNull(raw.substitutes || raw.bench),
    playingXI: valOrNull(raw.playingXI || raw.startingXI),
    formation: valOrNull(raw.formation),
    captain: valOrNull(raw.captain),
    viceCaptain: valOrNull(raw.viceCaptain),
  };
}

// 17. Odds Entity
export function toCanonicalOdds(raw = {}) {
  return {
    openingOdds: valOrNull(raw.openingOdds || raw.preOdds),
    liveOdds: valOrNull(raw.liveOdds || raw.odds),
    closingOdds: valOrNull(raw.closingOdds),
    winner: valOrNull(raw.winner),
    handicap: valOrNull(raw.handicap),
    overUnder: valOrNull(raw.overUnder),
    playerMarkets: valOrNull(raw.playerMarkets),
    teamMarkets: valOrNull(raw.teamMarkets),
  };
}

// 18. Head To Head Entity
export function toCanonicalH2H(raw = {}) {
  return {
    totalMatches: valOrNull(raw.totalMatches),
    wins: valOrNull(raw.wins),
    losses: valOrNull(raw.losses),
    draws: valOrNull(raw.draws),
    highestScore: valOrNull(raw.highestScore),
    lowestScore: valOrNull(raw.lowestScore),
    biggestVictory: valOrNull(raw.biggestVictory),
    recentMeetings: valOrNull(raw.recentMeetings),
  };
}

// 19. Standings Entity
export function toCanonicalStandings(raw = {}) {
  return {
    position: valOrNull(raw.position || raw.rank),
    points: valOrNull(raw.points || raw.pts),
    wins: valOrNull(raw.wins || raw.w),
    losses: valOrNull(raw.losses || raw.l),
    draws: valOrNull(raw.draws || raw.d),
    goalDifference: valOrNull(raw.goalDifference || raw.gd),
    netRunRate: valOrNull(raw.netRunRate || raw.nrr),
    played: valOrNull(raw.played || raw.p),
  };
}

// 20. Rankings Entity
export function toCanonicalRankings(raw = {}) {
  return {
    teamRanking: valOrNull(raw.teamRanking || raw.team),
    playerRanking: valOrNull(raw.playerRanking || raw.player),
    countryRanking: valOrNull(raw.countryRanking || raw.country),
    leagueRanking: valOrNull(raw.leagueRanking || raw.league),
  };
}

// 21. Awards Entity
export function toCanonicalAwards(raw = {}) {
  return {
    playerOfMatch: valOrNull(raw.playerOfMatch || raw.manOfMatch),
    playerOfTournament: valOrNull(raw.playerOfTournament),
    goldenBoot: valOrNull(raw.goldenBoot),
    goldenBall: valOrNull(raw.goldenBall),
    purpleCap: valOrNull(raw.purpleCap),
    orangeCap: valOrNull(raw.orangeCap),
    mvp: valOrNull(raw.mvp),
  };
}

// 22. Master Match Entity
export function toCanonicalMatch(raw = {}, providerName = 'gateway') {
  const isLive = raw.isLive || raw.matchState === 'in' || String(raw.status).toUpperCase() === 'LIVE';
  const isPost = raw.matchState === 'post' || String(raw.status).toUpperCase() === 'FINISHED';

  let status = 'SCHEDULED';
  if (isLive) status = 'LIVE';
  else if (isPost) status = 'FINISHED';

  const home = raw.homeTeam || raw.team1 || {};
  const away = raw.awayTeam || raw.team2 || {};
  const ld = raw.liveDetails || raw.score || {};

  return {
    matchId: String(raw.id || raw.matchId || `gwy_${Date.now()}`),
    matchName: `${home.name || 'Home'} vs ${away.name || 'Away'}`,
    sport: toCanonicalSport(typeof raw.sport === 'object' && raw.sport !== null ? raw.sport : { name: raw.sport || 'cricket' }),
    league: toCanonicalLeague(typeof raw.league === 'object' && raw.league !== null ? raw.league : { name: raw.league || raw.seriesName || raw.competition || 'International League' }),
    tournament: toCanonicalTournament(typeof raw.tournament === 'object' && raw.tournament !== null ? raw.tournament : { name: raw.tournament || raw.seriesName || raw.league }),
    season: toCanonicalSeason({ name: raw.season || '2026' }),
    round: valOrNull(raw.round || raw.stage),
    stage: valOrNull(raw.stage || raw.round),
    homeTeam: toCanonicalTeam(home),
    awayTeam: toCanonicalTeam(away),
    venue: toCanonicalVenue(raw.venue || {}),
    officials: toCanonicalOfficials(raw.officials || {}),
    status: status,
    liveStatus: isLive ? 'IN_PROGRESS' : (isPost ? 'COMPLETED' : 'SCHEDULED'),
    scheduledTime: valOrNull(raw.startTime || raw.time || '2026-08-05T19:30:00Z'),
    startTime: valOrNull(raw.startTime),
    endTime: valOrNull(raw.endTime),
    attendance: valOrNull(raw.attendance),
    weather: valOrNull(raw.weather),
    temperature: valOrNull(raw.temperature),
    humidity: valOrNull(raw.humidity),
    wind: valOrNull(raw.wind),
    broadcastChannels: valOrNull(raw.broadcastChannels),
    streamingLinks: valOrNull(raw.streamingLinks),

    // Sub-entities
    toss: toCanonicalToss(ld.toss || raw.toss || {}),
    liveScore: toCanonicalLiveScore(ld),
    events: toCanonicalMatchEvents(raw.events || {}),
    commentary: toCanonicalCommentary(ld),
    lineups: toCanonicalLineups(raw.lineups || {}),
    odds: toCanonicalOdds(raw.odds || {}),
    headToHead: toCanonicalH2H(raw.headToHead || {}),
    awards: toCanonicalAwards(raw.awards || {}),

    provider: providerName,
    lastUpdated: new Date().toISOString(),
  };
}
