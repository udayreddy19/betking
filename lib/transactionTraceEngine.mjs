/**
 * End-to-End Distributed Transaction Trace Engine
 * Traces critical bet & settlement pipelines with traceId propagation and per-stage latency profiling.
 */

export class TransactionTraceSpan {
  constructor(traceId, userId = 'system') {
    this.traceId = traceId;
    this.userId = userId;
    this.startTime = Date.now();
    this.stages = [];
  }

  recordStage(stageName, status = 'SUCCESS', metadata = {}) {
    const now = Date.now();
    const stageDuration = this.stages.length > 0 ? now - this.stages[this.stages.length - 1].timestampMs : now - this.startTime;

    const entry = {
      stageName,
      status,
      timestamp: new Date().toISOString(),
      timestampMs: now,
      stageDurationMs: stageDuration,
      metadata,
    };

    this.stages.push(entry);
    return entry;
  }

  complete(finalStatus = 'COMPLETED') {
    this.totalDurationMs = Date.now() - this.startTime;
    this.finalStatus = finalStatus;
    return this;
  }
}

class TransactionTraceEngine {
  constructor() {
    this.activeTraces = new Map(); // traceId -> TransactionTraceSpan
    this.completedTraces = [];
  }

  startTrace(userId = 'system') {
    const traceId = `trc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const span = new TransactionTraceSpan(traceId, userId);
    this.activeTraces.set(traceId, span);
    return span;
  }

  getTrace(traceId) {
    return this.activeTraces.get(traceId) || this.completedTraces.find((t) => t.traceId === traceId) || null;
  }

  finishTrace(traceId, status = 'COMPLETED') {
    const span = this.activeTraces.get(traceId);
    if (!span) return null;

    span.complete(status);
    this.activeTraces.delete(traceId);
    this.completedTraces.push(span);
    if (this.completedTraces.length > 500) this.completedTraces.shift();

    return span;
  }

  searchTraces({ userId, limit = 50 } = {}) {
    let list = this.completedTraces;
    if (userId) list = list.filter((t) => t.userId === userId);
    return list.slice(-limit);
  }
}

export const transactionTraceEngine = new TransactionTraceEngine();
