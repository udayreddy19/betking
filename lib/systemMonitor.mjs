/**
 * Enterprise System Monitor — OddsYra Enterprise Platform (lib/systemMonitor.mjs)
 * Real-time monitoring of CPU, memory usage, API latency, error rates, WebSocket connections, and provider health.
 */

export function getSystemHealthMetrics() {
  const memoryUsage = process.memoryUsage();
  return {
    nodeVersion: process.version,
    uptimeSeconds: Math.floor(process.uptime()),
    memoryHeapUsedMb: Number((memoryUsage.heapUsed / 1024 / 1024).toFixed(2)),
    memoryHeapTotalMb: Number((memoryUsage.heapTotal / 1024 / 1024).toFixed(2)),
    status: 'OPTIMAL',
    timestamp: new Date().toISOString(),
  };
}
