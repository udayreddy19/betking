# Pass 8 — MFA_MULTI_INSTANCE

**Atomic op:** Redis `SET key '1' EX 300 NX` on `admin_mfa_pending_used:<sha256(token)>`

| Scenario | Expected | Actual |
| --- | --- | --- |
| Instance A consume | PASS | PASS |
| Instance B replay | DENY | PASS (denied) |
| Concurrent two verifies | exactly one wins | PASS |
| Key TTL | ~300s | PASS |
| Key stores hash not JWT | hash only | PASS |
| Login API-1 / verify API-2 | PASS | PASS |
| Replay API-1 after API-2 | 401 | PASS |

No plaintext MFA secrets in Redis values (value=`1`). Tokens hashed with SHA-256.
