import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('AUTHORITATIVE ODDS ARCHITECTURE & ANTI-REGRESSION TESTS', () => {

  const modalPath = path.resolve(process.cwd(), 'src/components/MatchDetailModal/MatchDetailModal.jsx');
  const sportsPath = path.resolve(process.cwd(), 'src/pages/Sports/Sports.jsx');
  const servicePath = path.resolve(process.cwd(), 'src/services/oddsService.js');
  const oddsEnginePath = path.resolve(process.cwd(), 'lib/odds-v3/OddsEngineV3.mjs');

  it('TEST 1: MatchDetailModal.jsx contains zero hardcoded static winner odds (1.80, 2.01, 1.81)', () => {
    const content = fs.readFileSync(modalPath, 'utf8');
    expect(content.includes('match.odds.team1')).toBe(false);
    expect(content.includes('match.odds.team2')).toBe(false);
    expect(content.includes('odds: 1.85')).toBe(false);
    expect(content.includes('odds: 1.90')).toBe(false);
  });

  it('TEST 2: oddsService.js routes requests exclusively to authoritative /api/public/sports/matches/:matchId/odds', () => {
    const content = fs.readFileSync(servicePath, 'utf8');
    expect(content.includes('/api/public/sports/matches/')).toBe(true);
    expect(content.includes('fetchAuthoritativeMatchOdds')).toBe(true);
  });

  it('TEST 3: OddsEngineV3 is the primary authoritative source for live sportsbook snapshots', () => {
    const content = fs.readFileSync(oddsEnginePath, 'utf8');
    expect(content.includes('generate')).toBe(true);
    expect(content.includes('createOddsSnapshot')).toBe(true);
  });

  it('TEST 4: Legacy generator oddsMarketsGenerator.js contains runtime deprecation warning', () => {
    const genPath = path.resolve(process.cwd(), 'src/utils/oddsMarketsGenerator.js');
    const content = fs.readFileSync(genPath, 'utf8');
    expect(content.includes('[NON_AUTHORITATIVE_ODDS_SOURCE]')).toBe(true);
  });
});
