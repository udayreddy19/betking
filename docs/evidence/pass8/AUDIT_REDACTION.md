# Pass 8 — AUDIT_REDACTION

Redaction covered by `server/middleware/auditLogger.js` (Pass 7 retained).

Representative values must not appear in audit payloads:

- password / JWT / refresh token
- MFA secret
- API key / payment secret / card data

Pass 8 dual-API matrix did not print secrets (`secretsPrinted: false`).
