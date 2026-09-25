# Pass 8 — PASS8_CERTIFICATION

**Date:** 2026-09-25  
**Environment:** LOCAL_STAGING (production-like dual API :5001/:5002)  
**Git baseline:** `f5ff843` (+ Pass-8 working tree)  
**`production:certify`:** see production_certify.txt

## Closed gaps vs Pass 7

| Gap | Pass 7 | Pass 8 |
| --- | --- | --- |
| Dual-API multi-instance | single process | PASS (shared PG+Redis) |
| Redis MFA fail-safe | memory fallback single-instance | MULTI_INSTANCE fail-closed PASS |
| Readiness Redis dependency | partial | enforced when MULTI_INSTANCE |
| Remote staging | n/a | NOT_VERIFIED (STAGING_BASE_URL MISSING) |
| WS cross-instance soak | n/a | NOT_RUN (fanout code PASS) |
| Payments | WARN | WARN (unchanged honesty) |
| Validation N | WARN N=1 | WARN N=1 |

## Genuine fixes

1. `MULTI_INSTANCE=true` → MFA Redis required; no silent memory fallback (`MfaInfraUnavailableError` / 503)
2. Production/multi-instance startup validates `REDIS_URL`
3. Readiness DOWN when Redis unavailable in multi-instance mode
4. Dual-API certification harness + matrix
5. MFA unit tests use unique tokens + Redis reset (no cross-run pollution)

## Preserved

V4 defaults, auto-promotion false, open_bets_postgres SoT, Pass 5–7 product/security fixes.
