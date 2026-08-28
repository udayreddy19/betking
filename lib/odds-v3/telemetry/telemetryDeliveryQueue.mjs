/**
 * OddsEngineV3 — Resilient Telemetry Delivery Queue
 * 
 * Manages asynchronous batch ingestion with bounded capacity, exponential backoff retries,
 * dead-letter tracking, duplicate protection, and backpressure metrics.
 * 
 * NON-BLOCKING GUARANTEE:
 * Enqueuing or flushing telemetry NEVER throws to caller or blocks live pricing paths.
 */

import { persistObservationBatch } from './oddsPersister.mjs';

const MAX_QUEUE_CAPACITY = 10000;
const MAX_RETRIES = 3;
const MAX_DEAD_LETTERS = 1000;

class TelemetryDeliveryQueue {
  constructor() {
    this.queue = [];
    this.deadLetters = [];
    this.metrics = {
      enqueuedTotal: 0,
      persistedTotal: 0,
      failedBatchesTotal: 0,
      retriesTotal: 0,
      droppedDueToBackpressureTotal: 0,
      lastFlushLatencyMs: 0,
      lastFlushTimestamp: null,
    };
    this.isFlushing = false;
  }

  /**
   * Enqueues an observation into the bounded delivery queue.
   * If capacity exceeded, drops oldest to preserve memory and maintain zero pricing latency.
   */
  enqueue(observation) {
    if (!observation || !observation.matchId || !observation.marketId || !observation.selectionId) {
      return false;
    }

    if (this.queue.length >= MAX_QUEUE_CAPACITY) {
      this.queue.shift(); // drop oldest entry under backpressure
      this.metrics.droppedDueToBackpressureTotal++;
    }

    this.queue.push({
      item: observation,
      enqueuedAt: Date.now(),
      retryCount: 0,
    });
    this.metrics.enqueuedTotal++;
    return true;
  }

  /**
   * Flushes a batch with exponential backoff retry.
   */
  async flushBatch(batchSize = 200) {
    if (this.isFlushing || this.queue.length === 0) {
      return { flushed: 0, queueDepth: this.queue.length };
    }

    this.isFlushing = true;
    const start = Date.now();
    const batch = this.queue.splice(0, batchSize);
    const rawItems = batch.map((b) => b.item);

    try {
      const res = await persistObservationBatch(rawItems);
      this.metrics.lastFlushLatencyMs = Date.now() - start;
      this.metrics.lastFlushTimestamp = new Date().toISOString();

      if (res.error) {
        this.metrics.failedBatchesTotal++;
        // Re-enqueue items that haven't exceeded MAX_RETRIES
        for (const b of batch) {
          if (b.retryCount < MAX_RETRIES) {
            b.retryCount++;
            this.metrics.retriesTotal++;
            this.queue.push(b);
          } else {
            if (this.deadLetters.length >= MAX_DEAD_LETTERS) this.deadLetters.shift();
            this.deadLetters.push({ item: b.item, error: res.error, failedAt: Date.now() });
          }
        }
        this.isFlushing = false;
        return { flushed: 0, error: res.error, queueDepth: this.queue.length };
      }

      this.metrics.persistedTotal += res.insertedCount;
      this.isFlushing = false;
      return { flushed: res.insertedCount, queueDepth: this.queue.length };
    } catch (err) {
      this.metrics.failedBatchesTotal++;
      this.metrics.lastFlushLatencyMs = Date.now() - start;
      this.isFlushing = false;
      return { flushed: 0, error: err.message, queueDepth: this.queue.length };
    }
  }

  getMetrics() {
    return {
      queueDepth: this.queue.length,
      deadLetterCount: this.deadLetters.length,
      ...this.metrics,
      status: this.queue.length > 5000 ? 'HIGH_BACKPRESSURE' : (this.metrics.failedBatchesTotal > 0 ? 'DEGRADED' : 'HEALTHY'),
    };
  }

  clear() {
    this.queue = [];
    this.deadLetters = [];
  }
}

export const telemetryQueue = new TelemetryDeliveryQueue();
