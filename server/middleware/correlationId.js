/**
 * Correlation / request ID middleware for distributed tracing.
 * Preserves client X-Correlation-ID / X-Request-ID when present.
 */

import crypto from 'crypto';

export function correlationId(req, res, next) {
  const existing = req.headers['x-correlation-id'] || req.headers['x-request-id'];
  const id = existing || `corr-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

  req.correlationId = id;
  req.requestId = id;
  res.setHeader('X-Correlation-ID', id);
  res.setHeader('X-Request-ID', id);

  next();
}
