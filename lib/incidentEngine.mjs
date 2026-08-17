/**
 * Enterprise Incident Management Engine — OddsYra Enterprise Platform (lib/incidentEngine.mjs)
 * Manages service failures, automated alerts, recovery procedures, and escalation chains.
 */

const INCIDENTS_LOG = [];

const EMERGENCY_KILL_SWITCHES = {
  STOP_NEW_BETS: false,
  STOP_LIVE_BETTING: false,
  STOP_CASHOUT: false,
  STOP_SETTLEMENT: false,
  STOP_SIMULATION: false,
};

export function setKillSwitch(switchKey, enabled = true, reason = 'Operator Emergency Override') {
  if (switchKey in EMERGENCY_KILL_SWITCHES) {
    EMERGENCY_KILL_SWITCHES[switchKey] = !!enabled;
    const alert = raiseIncidentAlert(
      enabled ? 'CRITICAL' : 'INFO',
      'KILL_SWITCH_CONTROL_PLANE',
      `Emergency kill switch '${switchKey}' set to ${enabled ? 'ACTIVE' : 'INACTIVE'}. Reason: ${reason}`
    );
    return { switches: EMERGENCY_KILL_SWITCHES, alert };
  }
  return null;
}

export function isKillSwitchActive(switchKey) {
  return Boolean(EMERGENCY_KILL_SWITCHES[switchKey]);
}

export function getKillSwitchState() {
  return { ...EMERGENCY_KILL_SWITCHES };
}

export function raiseIncidentAlert(severity, serviceName, description) {
  const incident = {
    incidentId: `inc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    severity: String(severity).toUpperCase(),
    serviceName,
    description,
    status: 'OPEN',
    raisedAt: new Date().toISOString(),
    timeline: [
      { timestamp: new Date().toISOString(), action: 'INCIDENT_RAISED', notes: description },
    ],
  };
  INCIDENTS_LOG.push(incident);
  return incident;
}

export function updateIncidentStatus(incidentId, status, notes = '') {
  const inc = INCIDENTS_LOG.find((i) => i.incidentId === incidentId);
  if (!inc) return null;

  inc.status = status;
  inc.timeline.push({ timestamp: new Date().toISOString(), action: `STATUS_CHANGED_TO_${status}`, notes });
  if (status === 'RESOLVED') inc.resolvedAt = new Date().toISOString();

  return inc;
}

export function generatePostmortemReport(incidentId) {
  const inc = INCIDENTS_LOG.find((i) => i.incidentId === incidentId);
  if (!inc) return null;

  return {
    incidentId: inc.incidentId,
    serviceName: inc.serviceName,
    severity: inc.severity,
    durationMinutes: inc.resolvedAt ? Math.round((new Date(inc.resolvedAt) - new Date(inc.raisedAt)) / 60000) : null,
    timeline: inc.timeline,
    rootCause: inc.description,
    preventiveActionRequired: true,
  };
}
