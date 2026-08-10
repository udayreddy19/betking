/**
 * IPLSRL Simulation Scenario & Deterministic Form Engine
 * Configures model scenario parameters (high scoring, bowling dominant) with deterministic seed support.
 * ZERO HARDCODED SPORTS DATA.
 */

export const SIMULATION_SCENARIOS = {
  NORMAL: { runMultiplier: 1.0, wicketMultiplier: 1.0, name: 'Normal Balanced Pitch' },
  HIGH_SCORING: { runMultiplier: 1.25, wicketMultiplier: 0.8, name: 'Flat Pitch High Scoring' },
  BOWLING_DOMINANT: { runMultiplier: 0.85, wicketMultiplier: 1.3, name: 'Green Pitch Bowling Dominant' },
  CHASE_HEAVY: { runMultiplier: 1.1, wicketMultiplier: 0.9, name: 'Dew Factor Chase Favored' },
};

class SimulationScenarioEngine {
  constructor() {
    this.activeScenarios = new Map(); // matchId -> Scenario Key
  }

  setMatchScenario(matchId, scenarioKey = 'NORMAL') {
    const spec = SIMULATION_SCENARIOS[scenarioKey] || SIMULATION_SCENARIOS.NORMAL;
    this.activeScenarios.set(matchId, { key: scenarioKey, spec });
    return spec;
  }

  getMatchScenario(matchId) {
    const item = this.activeScenarios.get(matchId);
    return item ? item.spec : SIMULATION_SCENARIOS.NORMAL;
  }

  /**
   * Deterministic Pseudo-Random Number Generator using Seed.
   */
  createSeededRandom(seed = 12345) {
    let s = seed;
    return () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
  }
}

export const simulationScenarioEngine = new SimulationScenarioEngine();
