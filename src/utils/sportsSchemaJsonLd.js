/**
 * Schema.org SportsEvent & SportsMatch JSON-LD Generator
 * 
 * Produces structured data for Google Search rich snippets, live score indicators,
 * and tournament metadata.
 */

export function generateSportsMatchSchema(match = {}) {
  const matchId = match.id || match.matchId || 'match';
  const teamHome = match.teamHome || match.homeTeam || match.home_team || 'Home Team';
  const teamAway = match.teamAway || match.awayTeam || match.away_team || 'Away Team';
  const tournament = match.league || match.tournament || match.competition || 'Cricket Championship';
  const status = String(match.status || 'SCHEDULED').toUpperCase();

  const eventStatus = status === 'LIVE' || status === 'IN_PLAY'
    ? 'https://schema.org/EventLive'
    : status === 'COMPLETED' || status === 'FINISHED'
      ? 'https://schema.org/EventPostponed' // or completed
      : 'https://schema.org/EventScheduled';

  return {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: `${teamHome} vs ${teamAway}`,
    description: `Live cricket match betting odds and real-time scores for ${teamHome} vs ${teamAway} - ${tournament}.`,
    startDate: match.startTime || match.start_time || new Date().toISOString(),
    eventStatus,
    sport: 'Cricket',
    organizer: {
      '@type': 'Organization',
      name: 'OddsYra Sportsbook',
      url: 'https://oddsyra.com',
    },
    competitor: [
      {
        '@type': 'SportsTeam',
        name: teamHome,
      },
      {
        '@type': 'SportsTeam',
        name: teamAway,
      },
    ],
    offers: {
      '@type': 'Offer',
      url: `https://oddsyra.com/sports/match/${encodeURIComponent(matchId)}`,
      availability: 'https://schema.org/InStock',
      price: '0.00',
      priceCurrency: 'INR',
    },
  };
}
