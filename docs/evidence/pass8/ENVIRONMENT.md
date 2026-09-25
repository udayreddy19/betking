# Pass 8 — ENVIRONMENT

**Classification:** LOCAL_STAGING (production-like dual API)

| Field | Value |
| --- | --- |
| Environment | LOCAL_STAGING |
| Remote STAGING_BASE_URL | MISSING → NOT_VERIFIED |
| API-1 | http://127.0.0.1:5001 |
| API-2 | http://127.0.0.1:5002 |
| Shared PostgreSQL | yes (local) |
| Shared Redis | yes (127.0.0.1:6379) |
| MULTI_INSTANCE | true during dual-API harness |
| Frontend | :5173 (regression / Playwright) |

**Honesty rule:** This is not PRODUCTION evidence. Remote staging was not configured.
