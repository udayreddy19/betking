# Pass 7 — MULTI_INSTANCE_MFA

**Previous limitation:** in-process Map only.  
**Fix:** Redis `SET key 1 EX 300 NX` atomic consume (`lib/adminMfaPendingOnce.mjs`), memory fallback if Redis down.

| Test | Result |
| --- | --- |
| Instance A consume | PASS |
| Instance B replay same token | DENY / PASS |
| Concurrent triple consume → exactly one winner | PASS |
| HTTP valid MFA then replay | PASS |

Shared Redis is already part of the stack (`REDIS_URL`).
