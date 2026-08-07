/**
 * Enterprise Incident Management Engine — BetKing Enterprise Platform (lib/incidentEngine.mjs)
 * Manages service failures, automated alerts, recovery procedures, and escalation chains.
 */

const INCIDENTS_LOG = [];

export function raiseIncidentAlert(severity, serviceName, description) {
  const incident = {
    incidentId: `inc_${Date.now()}`,
    severity: String(severity).toUpperCase(), // 'CRITICAL', 'HIGH', 'MEDIUM'
    serviceName,
    description,
    status: 'OPEN',
    raisedAt: new Date().toISOString(),
  };
  INCIDENTS_LOG.push(incident);
  return incident;
}
