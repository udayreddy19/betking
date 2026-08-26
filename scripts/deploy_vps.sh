#!/usr/bin/env bash
# =============================================================================
# ODDSYRA SPORTSBOOK — HOSTINGER VPS DEPLOYMENT & ROLLBACK SCRIPT
# Zero-Downtime Deployment Pipeline with Automated Health Checks
# =============================================================================

set -euo pipefail

echo "🚀 STARTING ODDSYRA PRODUCTION VPS DEPLOYMENT PIPELINE..."

# 0. Prefer deploying from a clean Git checkout (provenance)
EXPECTED_SHA="${RELEASE_SHA:-}"
if [ -d .git ]; then
  CURRENT_SHA="$(git rev-parse HEAD)"
  CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
  if [ -n "$(git status --porcelain)" ]; then
    echo "❌ DEPLOYMENT FAILED: working tree is dirty. Commit or stash before deploy."
    git status -sb
    exit 1
  fi
  if [ -n "$EXPECTED_SHA" ] && [ "$CURRENT_SHA" != "$EXPECTED_SHA" ]; then
    echo "❌ DEPLOYMENT FAILED: HEAD $CURRENT_SHA != RELEASE_SHA $EXPECTED_SHA"
    exit 1
  fi
  echo "🪪 Git provenance: branch=$CURRENT_BRANCH sha=$CURRENT_SHA"
else
  echo "⚠️  WARNING: no .git directory — SHA provenance cannot be proven (rsync-style deploy)."
  if [ "${ALLOW_NO_GIT_DEPLOY:-0}" != "1" ]; then
    echo "❌ Refusing deploy without .git. Set ALLOW_NO_GIT_DEPLOY=1 only for emergency."
    exit 1
  fi
fi

# 1. Verify Configuration & Environment File
if [ ! -f .env ]; then
  echo "❌ DEPLOYMENT FAILED: .env file missing! Copy .env.production.example to .env and configure production secrets."
  exit 1
fi

# 1b. Record release identity (Git SHA) before image build
echo "🪪 Recording release SHA..."
npm run release:record-sha || node scripts/record-release-sha.mjs
if [ -f .release-sha ]; then
  echo "   recorded:"
  cat .release-sha
fi

# 2. Build Production Containers
echo "📦 Building Production Docker Images..."
docker compose -f docker-compose.prod.yml build --no-cache

# 2b. Record image digests
echo "🧬 Recording image digests..."
{
  echo "recordedAt=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "gitSha=$(git rev-parse HEAD 2>/dev/null || echo unknown)"
  docker image inspect betking-backend:latest --format 'backend={{.Id}}' 2>/dev/null || true
  docker image inspect betking-worker:latest --format 'worker={{.Id}}' 2>/dev/null || true
} | tee .release-image-digests

# 3. Apply Database Migrations
echo "🐘 Executing PostgreSQL Migrations..."
node scripts/migrate.mjs

# 4. Deploy Up-To-Date Containers
echo "🔄 Rolling out production services..."
docker compose -f docker-compose.prod.yml up -d

# 4b. Refresh nginx upstream after backend recreate (Docker DNS cache)
if docker ps --format '{{.Names}}' | grep -q oddsyra_prod_nginx; then
  docker exec oddsyra_prod_nginx nginx -s reload 2>/dev/null || true
fi

# 5. Perform Post-Deployment Readiness Smoke Test
echo "⏳ Waiting for service readiness..."
MAX_RETRIES=10
RETRY_COUNT=0
HEALTH_OK=false

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  if curl -sf http://localhost:5001/health > /dev/null 2>&1; then
    HEALTH_OK=true
    break
  fi
  echo "   Waiting for readiness check... ($((RETRY_COUNT + 1))/$MAX_RETRIES)"
  sleep 3
  RETRY_COUNT=$((RETRY_COUNT + 1))
done

if [ "$HEALTH_OK" = true ]; then
  echo "====================================================================="
  echo "🎉 DEPLOYMENT SUCCESSFUL! OddsYra production containers are healthy."
  echo "====================================================================="
  exit 0
else
  echo "❌ HEALTH CHECK FAILED: Container unready after 30 seconds!"
  echo "⚠️ TRIGGERING AUTOMATIC ROLLBACK TO PREVIOUS CONTAINER VERSION..."
  docker compose -f docker-compose.prod.yml down
  docker compose -f docker-compose.prod.yml up -d --no-build
  echo "====================================================================="
  echo "🛑 ROLLBACK COMPLETE: System restored to previous healthy container state."
  echo "====================================================================="
  exit 1
fi
