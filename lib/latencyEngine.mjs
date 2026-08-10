/**
 * Latency Intelligence Engine — E2E Platform Latency Telemetry
 * Measures provider feed latency, processing latency, odds calculation time, and broadcast latency.
 */

class LatencyEngine {
  constructor() {
    this.measurements = [];
  }

  /** Record end-to-end latency metric for an event pipeline */
  recordLatency({
    providerName = 'generic',
    matchId = 'global',
    providerTimestamp = null,
    receivedTimestamp = Date.now(),
    processedTimestamp = Date.now(),
    broadcastTimestamp = Date.now(),
  }) {
    const providerMs = providerTimestamp ? Math.max(0, receivedTimestamp - new Date(providerTimestamp).getTime()) : 0;
    const processingMs = Math.max(0, processedTimestamp - receivedTimestamp);
    const broadcastMs = Math.max(0, broadcastTimestamp - processedTimestamp);
    const totalE2eMs = providerMs + processingMs + broadcastMs;

    const metric = {
      id: `lat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      providerName,
      matchId,
      providerMs,
      processingMs,
      broadcastMs,
      totalE2eMs,
      timestamp: new Date().toISOString(),
    };

    this.measurements.push(metric);
    if (this.measurements.length > 500) this.measurements.shift();
    return metric;
  }

  getMetricsSummary(providerName = null) {
    let list = this.measurements;
    if (providerName) list = list.filter((m) => m.providerName === providerName);
    if (list.length === 0) return { avgE2eMs: 0, count: 0 };

    const total = list.reduce((sum, m) => sum + m.totalE2eMs, 0);
    return {
      avgE2eMs: Math.round(total / list.length),
      count: list.length,
      recent: list.slice(-10),
    };
  }
}

export const latencyEngine = new LatencyEngine();
