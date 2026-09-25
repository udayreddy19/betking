# Pass 8 — REDIS_FAILURE

| Concern | Result |
| --- | --- |
| MFA multi-instance without Redis | fail-closed (503 / readiness DOWN) — PASS policy |
| Financial authority on Redis failure | remains PostgreSQL / open_bets_postgres — PASS |
| Memory cache as financial SoT | forbidden — PASS (exposure_sot) |

Full controlled Redis kill soak during live traffic: partially covered by unit + matrix policy; long soak NOT_RUN.
