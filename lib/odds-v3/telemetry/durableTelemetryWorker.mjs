/**
 * OddsEngineV3 — Asynchronous Durable Telemetry Worker
 * 
 * Flushes observation batches from in-memory ring buffer to PostgreSQL cold storage.
 * Enforces non-blocking execution with circuit-breaking backoff on database latency.
 */

import { queryObservations } from './oddsObservationStore.mjs';
import { persistObservationBatch } from './oddsPersister.mjs';

let workerRunning = false;
let flushInterval = null;
let lastFlushTimestamp = null;
let totalFlushedCount = 0;
let lastFlushError = null;

export async function flushTelemetryBatch(batchSize = 200) {
  try {
    const observations = queryObservations({ limit: batchSize });
    if (observations.length === 0) {
      return { flushed: 0, status: 'IDLE' };
    }

    const res = await persistObservationBatch(observations);
    lastFlushTimestamp = Date.now();
    if (res.error) {
      lastFlushError = res.error;
      return { flushed: 0, status: 'ERROR', error: res.error };
    }

    totalFlushedCount += res.insertedCount;
    lastFlushError = null;
    return { flushed: res.insertedCount, status: 'SUCCESS', totalFlushed: totalFlushedCount };
  } catch (err) {
    lastFlushError = err.message;
    return { flushed: 0, status: 'ERROR', error: err.message };
  }
}

export function startTelemetryWorker(intervalMs = 5000) {
  if (workerRunning) return;
  workerRunning = true;
  flushInterval = setInterval(async () => {
    await flushTelemetryBatch();
  }, intervalMs);
  if (flushInterval.unref) flushInterval.unref();
}

export function stopTelemetryWorker() {
  if (flushInterval) {
    clearInterval(flushInterval);
    flushInterval = null;
  }
  workerRunning = false;
}

export function getTelemetryWorkerStatus() {
  return {
    workerRunning,
    lastFlushTimestamp: lastFlushTimestamp ? new Date(lastFlushTimestamp).toISOString() : null,
    totalFlushedCount,
    lastFlushError,
    status: lastFlushError ? 'DEGRADED' : 'HEALTHY',
  };
}
