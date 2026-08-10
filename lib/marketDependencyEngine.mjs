/**
 * Market Dependency Graph Engine
 * Manages relationships between parent and child betting markets dynamically.
 */

export class MarketDependencyGraph {
  constructor() {
    this.dependencies = new Map(); // parentMarketKey -> Set<childMarketKey>
  }

  /** Register dynamic dependency */
  addDependency(parentKey, childKey) {
    if (!this.dependencies.has(parentKey)) {
      this.dependencies.set(parentKey, new Set());
    }
    this.dependencies.get(parentKey).add(childKey);
  }

  /** Get all affected markets when parent market changes */
  getAffectedMarkets(parentKey) {
    const affected = new Set();
    const stack = [parentKey];

    while (stack.length > 0) {
      const current = stack.pop();
      const children = this.dependencies.get(current);
      if (children) {
        for (const child of children) {
          if (!affected.has(child)) {
            affected.add(child);
            stack.push(child);
          }
        }
      }
    }

    return Array.from(affected);
  }
}

class MarketDependencyEngine {
  constructor() {
    this.graph = new MarketDependencyGraph();
    this.setupStandardDependencies();
  }

  setupStandardDependencies() {
    this.graph.addDependency('match_winner', 'handicap');
    this.graph.addDependency('match_winner', 'correct_score');
    this.graph.addDependency('match_winner', 'player_props');
    this.graph.addDependency('total_runs', 'over_under_5_5');
  }

  handleMarketStateChange(parentMarketId, newState) {
    const affected = this.graph.getAffectedMarkets(parentMarketId);
    return affected.map((marketId) => ({
      marketId,
      recommendedAction: newState === 'SUSPENDED' ? 'SUSPEND' : 'REPRICE',
      reason: `Parent market '${parentMarketId}' transitioned to ${newState}`,
    }));
  }
}

export const marketDependencyEngine = new MarketDependencyEngine();
