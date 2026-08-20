/**
 * Structured JSON logger. Include correlationId when a request is in flight.
 * Do not log secrets (tokens, passwords, webhook HMAC, TOTP).
 */
function serialize(level, message, meta = {}) {
  const { correlationId, ...rest } = meta;
  return JSON.stringify({
    ts: new Date().toISOString(),
    level,
    message,
    ...(correlationId ? { correlationId } : {}),
    ...rest,
  });
}

export function createLogger(defaults = {}) {
  return {
    info(message, meta = {}) {
      console.log(serialize('info', message, { ...defaults, ...meta }));
    },
    warn(message, meta = {}) {
      console.warn(serialize('warn', message, { ...defaults, ...meta }));
    },
    error(message, meta = {}) {
      const err = meta.err || meta.error;
      const payload = { ...defaults, ...meta };
      delete payload.err;
      delete payload.error;
      if (err) {
        payload.error = err.message || String(err);
      }
      console.error(serialize('error', message, payload));
    },
  };
}

export const logger = createLogger();
