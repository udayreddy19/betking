# Pass 6 — PASS6_CERTIFICATION

**Date:** 2026-09-25  
**Environment:** STAGING (local-staging) — API `:5001`, Vite `:5173`  
**Git:** `9517ef0`  
**`production:certify`:** PASS_WITH_WARNINGS (BLOCKED=0)

## Gate summary

| Gate | Result | Evidence |
| --- | --- | --- |
| E2E | PASS | `playwright_e2e.txt` — 19 passed / 1 skipped / 0 failed |
| Concurrency | PASS | Pass-5 retained + hardening 44 passed |
| Financial | PASS | `open_bets_postgres` SoT; Pass-5 invariants |
| WebSocket | PASS | Channel auth + settlement UI E2E |
| Security | PASS | Credentialed MFA/RBAC/IDOR/JWT/CSRF matrix |
| Payments | WARN | Sandbox only; Cashfree NOT VERIFIED; LIVE NOT RUN |
| Validation N | WARN | N=1 INSUFFICIENT_SAMPLE — not fabricated |

## Why security was previously BLOCKED

`scripts/security-certification.mjs` left MFA/RBAC as `NOT_VERIFIED` without credentialed execution. SMOKE_* credentials were missing. Pass 6 provisions ephemeral staging identities via DB (`ensureAdminUser` pattern) and runs `scripts/pass6-security-matrix.mjs`.

## Application fixes (genuine defects)

1. **Trading desk router not mounted** — `server/routes/admin/tradingDesk.js` existed but was never `adminRouter.use`'d → authenticated `/api/admin/trading/exposure/*` returned 404. Mounted at `/trading`.
2. **`OPS_ADMIN` typo** → `OPERATIONS_ADMIN` on hardening-status role list.
3. **MFA pending JWT replay** — successful verify did not invalidate pending challenge. Fixed with `lib/adminMfaPendingOnce.mjs`.

## Preserved

- Cricket/OtherSports V4 defaults; auto-promotion false  
- Pass 5 fantasy / quick-bet / settlement-WS UI fixes  
- Exposure rebuild requires `confirm=REBUILD_EXPOSURE`

## Score

**8.9 → 9.0** (security credentialed PASS; remaining production limitations listed in final audit).
