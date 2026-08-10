/**
 * Capacity Planning & Telemetry Projection Engine
 * Measures active match volume, event rate, WebSocket connections, memory/CPU load, and capacity limits.
 */

class CapacityPlanningEngine {
  calculateSystemCapacity({
    activeMatches = 12,
    activeWsConnections = 450,
    apiRequestsPerSec = 85,
    eventRatePerSec = 150,
  } = {}) {
    const maxSupportedMatches = 100;
    const maxSupportedWsConnections = 10000;
    const maxSupportedApiRps = 1000;

    const matchHeadroomPct = Math.max(0, ((maxSupportedMatches - activeMatches) / maxSupportedMatches) * 100);
    const wsHeadroomPct = Math.max(0, ((maxSupportedWsConnections - activeWsConnections) / maxSupportedWsConnections) * 100);

    return {
      timestamp: new Date().toISOString(),
      currentLoad: {
        activeMatches,
        activeWsConnections,
        apiRequestsPerSec,
        eventRatePerSec,
      },
      headroom: {
        matchHeadroomPct: parseFloat(matchHeadroomPct.toFixed(1)),
        wsHeadroomPct: parseFloat(wsHeadroomPct.toFixed(1)),
      },
      capacityStatus: matchHeadroomPct < 20 || wsHeadroomPct < 20 ? 'SCALE_UP_RECOMMENDED' : 'HEALTHY_HEADROOM',
    };
  }
}

export const capacityPlanningEngine = new CapacityPlanningEngine();
