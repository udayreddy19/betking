/**
 * OddsEngineV3 — Alert & Incident Correlation Engine
 * 
 * Correlates multiple simultaneous alerts (e.g. Provider Outage + Stale Feed + Price Anomaly)
 * into a single unified CORRELATED_INCIDENT with root cause analysis and recovery actions.
 */

const incidentStore = [];
const MAX_INCIDENTS = 500;

export function correlateAlertIncident({
  title,
  factors = [],
  affectedSports = [],
  affectedMarkets = [],
  severity = 'MEDIUM',
  rootCause = 'FEED_DISRUPTION',
  recoveryAction = 'FAILOVER_AND_HOLD',
} = {}) {
  const incident = {
    incidentId: `inc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    title: String(title || 'Correlated Pricing Anomaly Incident'),
    severity: String(severity),
    status: 'ACTIVE',
    correlatedFactors: Array.isArray(factors) ? factors : [String(factors)],
    affectedSports: Array.from(new Set(affectedSports)),
    affectedMarkets: Array.from(new Set(affectedMarkets)),
    rootCause: String(rootCause),
    recoveryAction: String(recoveryAction),
  };

  incidentStore.push(incident);
  if (incidentStore.length > MAX_INCIDENTS) {
    incidentStore.shift();
  }
  return incident;
}

export function getActiveIncidents(limit = 50) {
  return [...incidentStore].reverse().slice(0, Math.min(limit, MAX_INCIDENTS));
}

export function resolveIncident(incidentId) {
  const inc = incidentStore.find((i) => i.incidentId === incidentId);
  if (inc) {
    inc.status = 'RESOLVED';
    inc.resolvedAt = new Date().toISOString();
    return inc;
  }
  return null;
}
