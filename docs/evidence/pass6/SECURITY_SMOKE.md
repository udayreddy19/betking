# Pass 6 — SECURITY_SMOKE

**Date:** 2026-09-25  
**Environment:** STAGING (local-staging) `http://127.0.0.1:5001`  
**Command:** `npm run security:smoke -- --environment=local --base-url=http://127.0.0.1:5001`  
**Secrets printed:** false

## Results

| Probe | HTTP | Verdict |
| --- | --- | --- |
| unauthenticated_admin_ops | 401 | GREEN |
| unauthenticated_finance | 401 | GREEN |
| readiness_public | 200 | GREEN |
| invalid_bearer_admin | 401 | GREEN |
| csrf_missing_cookie_mutation_shape | 200 | YELLOW (logout without session) |

**Overall (smoke alone):** NOT VERIFIED (partial by design)  
**Credentialed coverage:** see `SECURITY_CERTIFICATION.md` / `MFA_MATRIX.md`

Raw: `docs/evidence/pass6/security_smoke_run.txt`
