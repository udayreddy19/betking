/**
 * OddsEngineV3 — Dataset Ingestion Engine
 * 
 * Ingests, normalizes, and validates historical match timelines:
 * - Validates observation schema
 * - Enforces chronological sorting (prevents look-ahead bias)
 * - Detects duplicate records
 * - Normalizes provider and canonical state inputs
 */

export function validateObservationSchema(record) {
  const errors = [];
  if (!record || typeof record !== 'object') {
    return { valid: false, errors: ['Record must be a non-null object'] };
  }

  if (typeof record.timestamp !== 'number' || !Number.isFinite(record.timestamp)) {
    errors.push('Missing or invalid timestamp (must be unix epoch ms)');
  }

  if (!record.matchId) {
    errors.push('Missing matchId');
  }

  if (!record.sport) {
    errors.push('Missing sport');
  }

  if (!record.matchState || typeof record.matchState !== 'object') {
    errors.push('Missing or invalid matchState object');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Ingests and normalizes an array of raw timeline observations.
 */
export function ingestDataset(rawRecords = []) {
  if (!Array.isArray(rawRecords)) {
    return { success: false, error: 'rawRecords must be an array', ingestedCount: 0, observations: [] };
  }

  const validObservations = [];
  const invalidRecords = [];
  const seenKeys = new Set();
  let duplicateCount = 0;

  for (let i = 0; i < rawRecords.length; i++) {
    const raw = rawRecords[i];
    const schemaCheck = validateObservationSchema(raw);

    if (!schemaCheck.valid) {
      invalidRecords.push({ index: i, errors: schemaCheck.errors, record: raw });
      continue;
    }

    const dedupKey = `${raw.matchId}:${raw.market || 'main'}:${raw.timestamp}`;
    if (seenKeys.has(dedupKey)) {
      duplicateCount++;
      continue;
    }
    seenKeys.add(dedupKey);

    validObservations.push({
      timestamp: raw.timestamp,
      matchId: String(raw.matchId),
      sport: String(raw.sport).toLowerCase(),
      league: String(raw.league || 'default'),
      market: String(raw.market || 'match_winner'),
      selection: raw.selection ? String(raw.selection) : null,
      matchState: raw.matchState,
      providerOdds: raw.providerOdds || null,
      providerInputs: raw.providerInputs || null,
      volatility: Number(raw.volatility) || 0,
      feedLatency: Number(raw.feedLatency) || 0,
      engineVersion: String(raw.engineVersion || '3.0.0'),
      modelVersion: String(raw.modelVersion || 'v3.1'),
      resolvedOutcome: raw.resolvedOutcome ?? null,
      resolvedWinner: raw.resolvedWinner ?? null,
    });
  }

  // Enforce chronological sorting
  validObservations.sort((a, b) => a.timestamp - b.timestamp);

  return {
    success: true,
    totalReceived: rawRecords.length,
    ingestedCount: validObservations.length,
    duplicateCount,
    invalidCount: invalidRecords.length,
    invalidRecords,
    observations: validObservations,
  };
}
