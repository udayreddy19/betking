# Pass 8 — MULTI_INSTANCE

**Harness:** `scripts/pass8-dual-api-runner.mjs`

```
API-1 :5001 ──┐
API-2 :5002 ──┼── Shared PostgreSQL + Shared Redis
```

| Check | Result |
| --- | --- |
| api1_readiness | PASS |
| api2_readiness | PASS |
| shared_redis | PASS |
| MFA login API-1 → verify API-2 | PASS |
| MFA replay after cross-instance consume | PASS (401) |
| RBAC JWT across instances | PASS |
| Audit write visible via shared DB | PASS |

Evidence: `pass8_matrix_raw.json`, `pass8_dual_api_run.txt`
