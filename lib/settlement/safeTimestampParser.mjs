/**
 * Safe Timestamp Parsing & Trust Model Engine for Settlement
 *
 * Guarantees:
 * 1. Never throws RangeError / TypeError on malformed dates or status strings ("Live", "14.4", etc.).
 * 2. Never fabricates freshness by replacing missing or invalid timestamps with Date.now() (NOW).
 * 3. Enforces 5 explicit timestamp trust states: VALID, MISSING, INVALID, UNKNOWN, STALE.
 * 4. Preserves full audit metadata (source, value, status, ageSeconds, parsedTimestamp).
 */

export const TIMESTAMP_STATUS = Object.freeze({
  VALID: 'VALID',
  MISSING: 'MISSING',
  INVALID: 'INVALID',
  UNKNOWN: 'UNKNOWN',
  STALE: 'STALE',
});

/**
 * Safely parses any input value as a timestamp.
 *
 * @param {any} input - String, number, Date, or null/undefined
 * @param {string} [sourceName='unknown'] - Metadata source label (e.g. 'providerTimestamp')
 * @returns {object} Timestamp audit object
 */
export function parseSafeTimestamp(input, sourceName = 'unknown') {
  if (input === null || input === undefined || input === '') {
    return {
      timestampSource: sourceName,
      timestampValue: input,
      timestampStatus: TIMESTAMP_STATUS.MISSING,
      parsedTimestamp: null,
      timestampEpochMs: null,
    };
  }

  // Handle Date instances
  if (input instanceof Date) {
    const epochMs = input.getTime();
    if (Number.isFinite(epochMs) && !Number.isNaN(epochMs) && epochMs > 0) {
      return {
        timestampSource: sourceName,
        timestampValue: input.toISOString(),
        timestampStatus: TIMESTAMP_STATUS.VALID,
        parsedTimestamp: input.toISOString(),
        timestampEpochMs: epochMs,
      };
    }
    return {
      timestampSource: sourceName,
      timestampValue: String(input),
      timestampStatus: TIMESTAMP_STATUS.INVALID,
      parsedTimestamp: null,
      timestampEpochMs: null,
    };
  }

  // Handle numeric epoch timestamps
  if (typeof input === 'number' && Number.isFinite(input) && input > 0) {
    // Treat seconds vs milliseconds: if < 1e11, it's in seconds
    const epochMs = input < 1e11 ? input * 1000 : input;
    try {
      const iso = new Date(epochMs).toISOString();
      return {
        timestampSource: sourceName,
        timestampValue: input,
        timestampStatus: TIMESTAMP_STATUS.VALID,
        parsedTimestamp: iso,
        timestampEpochMs: epochMs,
      };
    } catch {
      return {
        timestampSource: sourceName,
        timestampValue: input,
        timestampStatus: TIMESTAMP_STATUS.INVALID,
        parsedTimestamp: null,
        timestampEpochMs: null,
      };
    }
  }

  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) {
      return {
        timestampSource: sourceName,
        timestampValue: input,
        timestampStatus: TIMESTAMP_STATUS.MISSING,
        parsedTimestamp: null,
        timestampEpochMs: null,
      };
    }

    // Common non-date cricket feed descriptors - immediate INVALID
    if (/^(live|in[ -]?play|first innings|second innings|1st innings|2nd innings|break|lunch|tea|stumps|delayed|rain|\d+\.\d+)$/i.test(trimmed)) {
      return {
        timestampSource: sourceName,
        timestampValue: input,
        timestampStatus: TIMESTAMP_STATUS.INVALID,
        parsedTimestamp: null,
        timestampEpochMs: null,
      };
    }

    // Handle string epoch (e.g. "1788004800000")
    if (/^\d{10,13}$/.test(trimmed)) {
      const num = Number(trimmed);
      if (Number.isFinite(num) && num > 0) {
        const epochMs = num < 1e11 ? num * 1000 : num;
        try {
          const iso = new Date(epochMs).toISOString();
          return {
            timestampSource: sourceName,
            timestampValue: input,
            timestampStatus: TIMESTAMP_STATUS.VALID,
            parsedTimestamp: iso,
            timestampEpochMs: epochMs,
          };
        } catch {
          // fall through
        }
      }
    }

    // Try standard ISO / RFC parsing
    const parsedEpoch = Date.parse(trimmed);
    if (Number.isFinite(parsedEpoch) && !Number.isNaN(parsedEpoch) && parsedEpoch > 0) {
      try {
        const iso = new Date(parsedEpoch).toISOString();
        return {
          timestampSource: sourceName,
          timestampValue: input,
          timestampStatus: TIMESTAMP_STATUS.VALID,
          parsedTimestamp: iso,
          timestampEpochMs: parsedEpoch,
        };
      } catch {
        return {
          timestampSource: sourceName,
          timestampValue: input,
          timestampStatus: TIMESTAMP_STATUS.INVALID,
          parsedTimestamp: null,
          timestampEpochMs: null,
        };
      }
    }

    return {
      timestampSource: sourceName,
      timestampValue: input,
      timestampStatus: TIMESTAMP_STATUS.INVALID,
      parsedTimestamp: null,
      timestampEpochMs: null,
    };
  }

  return {
    timestampSource: sourceName,
    timestampValue: String(input),
    timestampStatus: TIMESTAMP_STATUS.INVALID,
    parsedTimestamp: null,
    timestampEpochMs: null,
  };
}

/**
 * Resolves match timestamp trust across hierarchical sources without fabricating NOW.
 *
 * Priority order:
 * 1. providerTimestamp
 * 2. providerUpdatedAt
 * 3. cachedAt
 * 4. lastUpdatedAt
 * 5. fetchedAt
 * 6. updatedAt
 * 7. time (only if valid date)
 *
 * @param {object} match - Match object
 * @param {object} [options={}] - Options { maxAgeSeconds, nowMs }
 * @returns {object} Resolved trust model result
 */
export function resolveMatchTimestampTrust(match, options = {}) {
  if (!match || typeof match !== 'object') {
    return {
      freshestTimestamp: null,
      timestampEpochMs: null,
      timestampSource: 'none',
      timestampStatus: TIMESTAMP_STATUS.MISSING,
      ageSeconds: null,
      stale: false,
      audit: [],
    };
  }

  const maxAgeSeconds = Number(options.maxAgeSeconds) || 0;
  const nowMs = Number(options.nowMs) || Date.now();

  const candidates = [
    { key: 'providerTimestamp', val: match.providerTimestamp },
    { key: 'providerUpdatedAt', val: match.providerUpdatedAt },
    { key: 'cachedAt', val: match.cachedAt },
    { key: 'lastUpdatedAt', val: match.lastUpdatedAt },
    { key: 'fetchedAt', val: match.fetchedAt },
    { key: 'updatedAt', val: match.updatedAt },
    { key: 'time', val: match.time },
  ];

  const audit = [];
  let chosen = null;
  let encounteredInvalid = false;

  for (const { key, val } of candidates) {
    if (val === undefined || val === null || val === '') {
      audit.push({ source: key, status: TIMESTAMP_STATUS.MISSING, value: val });
      continue;
    }

    const parsed = parseSafeTimestamp(val, key);
    audit.push({
      source: key,
      status: parsed.timestampStatus,
      value: val,
      parsed: parsed.parsedTimestamp,
    });

    if (parsed.timestampStatus === TIMESTAMP_STATUS.VALID && !chosen) {
      chosen = parsed;
      break; // Found highest priority valid timestamp
    } else if (parsed.timestampStatus === TIMESTAMP_STATUS.INVALID) {
      encounteredInvalid = true;
    }
  }

  if (chosen) {
    const ageSeconds = Math.max(0, (nowMs - chosen.timestampEpochMs) / 1000);
    const isStale = maxAgeSeconds > 0 && ageSeconds > maxAgeSeconds;

    return {
      freshestTimestamp: chosen.parsedTimestamp,
      timestampEpochMs: chosen.timestampEpochMs,
      timestampSource: chosen.timestampSource,
      timestampStatus: isStale ? TIMESTAMP_STATUS.STALE : TIMESTAMP_STATUS.VALID,
      ageSeconds: Math.round(ageSeconds),
      stale: isStale,
      audit,
    };
  }

  // No valid timestamp found across any candidate
  const overallStatus = encounteredInvalid ? TIMESTAMP_STATUS.INVALID : TIMESTAMP_STATUS.MISSING;
  return {
    freshestTimestamp: null,
    timestampEpochMs: null,
    timestampSource: 'none',
    timestampStatus: overallStatus,
    ageSeconds: null,
    stale: false, // Unknown age - do NOT mark as stale nor fresh
    audit,
  };
}
