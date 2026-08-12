/**
 * Audit Logger Middleware — BetKing Admin Operations
 * 
 * Automatically logs all admin API calls to the audit_events table.
 * Captures actor, action, target, request details, and response status.
 */

let pgQuery = null;

async function getQuery() {
  if (!pgQuery) {
    try {
      const mod = await import('../../db/pg.js');
      pgQuery = mod.query;
    } catch {
      pgQuery = null;
    }
  }
  return pgQuery;
}

/**
 * Audit logger middleware.
 * Logs admin actions to audit_events after response is sent.
 */
export function auditLogger(req, res, next) {
  const startTime = Date.now();

  // Capture the original end method
  const originalEnd = res.end;

  res.end = function (...args) {
    // Restore original
    res.end = originalEnd;
    res.end(...args);

    // Log asynchronously — do not block response
    const duration = Date.now() - startTime;
    logAuditEvent(req, res, duration).catch((err) => {
      console.error('[AuditLogger] Failed to log audit event:', err.message);
    });
  };

  next();
}

async function logAuditEvent(req, res, duration) {
  // Skip GET requests for non-sensitive endpoints to reduce noise
  if (req.method === 'GET' && !req.path.includes('/security') && !req.path.includes('/audit')) {
    return;
  }

  const query = await getQuery();
  if (!query) return;

  const adminId = req.admin?.id || 'unknown';
  const action = `${req.method} ${req.path}`;
  const targetId = req.params?.id || req.body?.targetId || req.body?.entityId || null;

  const details = {
    method: req.method,
    path: req.path,
    statusCode: res.statusCode,
    duration,
    correlationId: req.correlationId || null,
    role: req.admin?.role || null,
    tenant: req.admin?.tenant || null,
    ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
    userAgent: req.headers['user-agent'] || null,
    // Sanitize body — remove sensitive fields
    body: sanitizeBody(req.body),
  };

  try {
    await query(
      `INSERT INTO audit_events (actor_id, target_id, action, details, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [adminId, targetId, action, JSON.stringify(details)]
    );
  } catch (err) {
    console.error('[AuditLogger] DB write failed:', err.message);
  }
}

function sanitizeBody(body) {
  if (!body || typeof body !== 'object') return null;
  const sanitized = { ...body };
  // Remove sensitive fields
  delete sanitized.password;
  delete sanitized.token;
  delete sanitized.secret;
  delete sanitized.credentials;
  delete sanitized.rawBody;
  return sanitized;
}

/**
 * Log a specific audit event programmatically (for services to call directly).
 */
export async function logAdminAction({ actorId, targetId, action, details = {} }) {
  const query = await getQuery();
  if (!query) return null;

  try {
    const res = await query(
      `INSERT INTO audit_events (actor_id, target_id, action, details, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING event_id, actor_id, action, created_at`,
      [actorId, targetId || null, action, JSON.stringify(details)]
    );
    return res.rows[0];
  } catch (err) {
    console.error('[AuditLogger] logAdminAction failed:', err.message);
    return null;
  }
}
