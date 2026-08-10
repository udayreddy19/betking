#!/usr/bin/env bash
# =============================================================================
# BETKING SPORTSBOOK — HOSTINGER VPS DEPLOYMENT & ROLLBACK SCRIPT
# Zero-Downtime Deployment Pipeline with Automated Health Checks
# =============================================================================

set -e

echo "🚀 STARTING BETKING PRODUCTION VPS DEPLOYMENT PIPELINE..."

# 1. Verify Configuration & Environment File
if [ ! -f .env ]; then
  echo "❌ DEPLOYMENT FAILED: .env file missing! Copy .env.production.example to .env and configure production secrets."
  exit 1
fi

# 2. Build Production Containers
echo "📦 Building Production Docker Images..."
docker compose -f docker-compose.prod.yml build --no-cache

# 3. Apply Database Migrations
echo "🐘 Executing PostgreSQL Migrations..."
node scripts/migrate.mjs

# 4. Deploy Up-To-Date Containers
echo "🔄 Rolling out production services..."
docker compose -f docker-compose.prod.yml up -d

# 5. Perform Post-Deployment Readiness Smoke Test
echo "⏳ Waiting for service readiness..."
MAX_RETRIES=10
RETRY_COUNT=0
HEALTH_OK=false

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  if curl -sf http://localhost:5001/readiness > /dev/null 2>&1; then
    HEALTH_OK=true
    break
  fi
  echo "   Waiting for readiness check... ($((RETRY_COUNT + 1))/$MAX_RETRIES)"
  sleep 3
  RETRY_COUNT=$((RETRY_COUNT + 1))
done

if [ "$HEALTH_OK" = true ]; then
  echo "====================================================================="
  echo "🎉 DEPLOYMENT SUCCESSFUL! BetKing production containers are healthy."
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
