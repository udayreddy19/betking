/**
 * Correlation ID Middleware — OddsYra Admin Operations
 * 
 * Injects a unique X-Correlation-ID into every request for distributed tracing.
 * If the client sends one, it's preserved. Otherwise a new one is generated.
 */

import crypto from 'crypto';

export function correlationId(req, res, next) {
  const existing = req.headers['x-correlation-id'];
  const id = existing || `corr-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  
  req.correlationId = id;
  res.setHeader('X-Correlation-ID', id);
  
  next();
}
