# RELEASE RUNBOOK

## Release tip (local)

```bash
git rev-parse HEAD
# Expected family after this pass: commit containing P0 fixes + reports
```

## Pre-deploy gate

```bash
npm test
npm run build
npm run lint
npm audit --omit=dev
npm run settlement:integrity-scan   # against target DB
npm run financial:reconcile -- --allow-classified-legacy
npm run financial:reconcile-legacy-opening -- --dry-run
npm run financial:audit-winnings-reporting
```

## Build & deploy (VPS) — no docker cp

```bash
cd /opt/betking   # or clone at release SHA
git fetch && git checkout <RELEASE_SHA>

docker compose -f docker-compose.prod.yml build --no-cache backend worker
docker compose -f docker-compose.prod.yml up -d postgres redis backend worker
# frontend static: build locally and sync dist/ OR bake into nginx volume
docker compose -f docker-compose.prod.yml up -d nginx
docker exec oddsyra_prod_nginx nginx -s reload

curl -fsS https://oddsyra.com/health
curl -fsS https://oddsyra.com/readiness
```

Record:

```bash
docker images --digests | grep oddsyra
docker inspect oddsyra_prod_backend --format '{{.Image}}'
docker inspect oddsyra_prod_worker --format '{{.Image}}'
```

## Migrations

Ensure 054 + 055 applied (and any newer). Never skip.

```bash
docker compose -f docker-compose.prod.yml exec backend node scripts/migrate.mjs
# or project-standard migrator
```

## Worker topology (mandatory)

| Process | Env |
|---------|-----|
| backend | `RUN_BACKGROUND_WORKERS=false`, `REQUIRE_DEDICATED_SETTLEMENT_WORKER=1` |
| worker | `WORKER_PROCESS=1`, `RUN_BACKGROUND_WORKERS=true` |

WS fanout: worker publishes Redis `oddsyra:ws:fanout`; API `initWebSocketServer` subscribes.

## Legacy wallet ops (never silent)

```bash
npm run financial:reconcile-legacy-opening -- --user=<ID> --dry-run
# Option A
npm run financial:reconcile-legacy-opening -- --user=<ID> --apply-opening-ledger --actor=... --reason=...
# Option B
npm run financial:reconcile-legacy-opening -- --user=<ID> --accept-exception --actor=... --reason=...
```

## Rollback

```bash
git checkout <PREVIOUS_SHA>
docker compose -f docker-compose.prod.yml build --no-cache backend worker
docker compose -f docker-compose.prod.yml up -d backend worker
docker exec oddsyra_prod_nginx nginx -s reload
# Do NOT reverse financial ledger credits without finance approval
```

## Post-deploy smoke

1. `/health` + `/readiness` healthy  
2. Integrity scan 0 TRUE_ORPHAN / 0 duplicate payouts / 0 DLQ  
3. Controlled test bet settle + confirm Header wallet (browser)  
4. Support chat not visible on anonymous odds sockets  
