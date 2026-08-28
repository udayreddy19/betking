import { describe, it, expect } from 'vitest';
import { generateSportsMatchSchema } from '../../src/utils/sportsSchemaJsonLd';

describe('OpenSEO — Schema.org SportsEvent & SportsMatch JSON-LD', () => {
  it('generates valid SportsEvent schema for live cricket match', () => {
    const match = {
      id: 'match_ind_aus',
      teamHome: 'India',
      teamAway: 'Australia',
      league: 'ICC World Cup',
      status: 'LIVE',
    };

    const schema = generateSportsMatchSchema(match);
    expect(schema['@type']).toBe('SportsEvent');
    expect(schema.name).toBe('India vs Australia');
    expect(schema.eventStatus).toBe('https://schema.org/EventLive');
    expect(schema.competitor.length).toBe(2);
    expect(schema.offers['@type']).toBe('Offer');
  });
});
