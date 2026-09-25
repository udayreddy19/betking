# Pass 8 — REDIS_FAILSAFE

**Policy (code):** When `MULTI_INSTANCE=true` (or `NODE_ENV=production`):

1. MFA consume uses Redis `SET NX EX` only — **no silent in-process fallback**
2. Unavailable Redis → `MfaInfraUnavailableError` (HTTP 503) / readiness **DOWN**
3. `validateProductionEnvironment` refuses start without `REDIS_URL` in multi-instance/production

| Check | Result |
| --- | --- |
| policy_multi_instance_requires_redis | PASS |
| MFA unit concurrent SET NX | PASS |
| Mock Redis rejected in multi-instance | enforced in `getRedisClient()` |

**Before:** single-instance memory fallback allowed when Redis down.  
**After Pass 8:** multi-instance mode fails closed.

Files: `lib/adminMfaPendingOnce.mjs`, `lib/devopsEngine.mjs`, `db/redis.js`
