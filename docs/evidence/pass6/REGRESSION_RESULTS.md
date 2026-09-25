# Pass 6 — REGRESSION_RESULTS

| Suite | Result |
| --- | --- |
| `tests/hardening` + `v4ProductionHardening` | 44 passed |
| `pass6MfaReplay` unit | PASS |
| Playwright E2E (`E2E_BASE_URL` + `E2E_API_URL`) | 19 passed / 1 skipped / 0 failed |
| security:smoke | AUTH probes GREEN |
| security:certification | PASS |
| production:certify | PASS_WITH_WARNINGS |

Pass 5 product fixes preserved (fantasy render, quick-bet odds state, settlement WS UI).  
Auto-promotion remains false. Engine V4 defaults unchanged.
