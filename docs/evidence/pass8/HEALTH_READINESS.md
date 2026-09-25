# Pass 8 — HEALTH_READINESS

Dual-API readiness probes:

| Instance | `/readiness` |
| --- | --- |
| API-1 :5001 | 200 ready=true |
| API-2 :5002 | 200 ready=true |

When `MULTI_INSTANCE=true` and Redis is DOWN, readiness must not report ready for security-critical multi-instance operation (`devopsEngine` Redis dependency). Health endpoints must not expose secrets.
