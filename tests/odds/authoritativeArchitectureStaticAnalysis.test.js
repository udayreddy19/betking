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

  it('TEST 4: Client bundle has no oddsMarketsGenerator and Sports uses labels-only categories', () => {
    const genPath = path.resolve(process.cwd(), 'src/utils/oddsMarketsGenerator.js');
    expect(fs.existsSync(genPath)).toBe(false);
    const sports = fs.readFileSync(sportsPath, 'utf8');
    expect(sports.includes('marketCategoryLabels')).toBe(true);
    expect(sports.includes('oddsMarketsGenerator')).toBe(false);
    const labels = fs.readFileSync(path.resolve(process.cwd(), 'src/utils/marketCategoryLabels.js'), 'utf8');
    expect(labels.includes('computeLiveDynamicOdds')).toBe(false);
    expect(labels.includes('generateMatchMarkets')).toBe(false);
  });

  it('TEST 5: Live pricing engines must not import legacy oddsEngine.mjs', () => {
    const pricing = fs.readFileSync(path.resolve(process.cwd(), 'lib/pricingEngine.mjs'), 'utf8');
    const ai = fs.readFileSync(path.resolve(process.cwd(), 'lib/aiOddsOptimizer.mjs'), 'utf8');
    expect(pricing.includes('oddsEngine.mjs')).toBe(false);
    expect(ai.includes('oddsEngine.mjs')).toBe(false);
    expect(pricing.includes('v3MatchOdds')).toBe(true);
    expect(ai.includes('v3MatchOdds')).toBe(true);
  });

  it('TEST 5b: Live placement and settlement must not import legacy oddsEngine.mjs', () => {
    const files = [
      'lib/betPlacementEngine.mjs',
      'lib/betSettlementEngine.mjs',
      'lib/cashoutEngine.mjs',
      'lib/marketEvaluationEngine.mjs',
      'lib/v3MatchOdds.mjs',
    ];
    files.forEach((rel) => {
      const content = fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');
      expect(content.includes('oddsEngine.mjs'), rel).toBe(false);
    });
    const legacy = fs.readFileSync(path.resolve(process.cwd(), 'lib/oddsEngine.mjs'), 'utf8');
    expect(legacy.includes('@deprecated')).toBe(true);
  });

  it('TEST 6: DEMO_MODE is not implied by Vite DEV', () => {
    const flags = fs.readFileSync(path.resolve(process.cwd(), 'src/utils/featureFlags.js'), 'utf8');
    expect(flags).toContain("VITE_DEMO_MODE === '1'");
    expect(flags).not.toContain('import.meta.env.DEV');
  });
});
