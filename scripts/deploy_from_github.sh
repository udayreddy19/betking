#!/usr/bin/env bash
# =============================================================================
# Pull origin/main into /opt/oddsyra (or CWD) and deploy — no docker cp.
# Usage on VPS:
#   cd /opt/oddsyra && bash scripts/deploy_from_github.sh
# Optional:
#   BRANCH=main RELEASE_SHA=<sha> bash scripts/deploy_from_github.sh
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BRANCH="${BRANCH:-main}"
REMOTE="${REMOTE:-origin}"

if [ ! -d .git ]; then
  echo "❌ No .git in $ROOT — clone the repo first (do not rsync over a dirty tree)."
  exit 1
fi

echo "⬇️  Fetching $REMOTE/$BRANCH…"
git fetch "$REMOTE" "$BRANCH"
TARGET_SHA="${RELEASE_SHA:-$(git rev-parse "$REMOTE/$BRANCH")}"
echo "🪪 Checking out $TARGET_SHA"
git checkout --force "$TARGET_SHA"
git clean -fd -e .env -e data -e dist -e node_modules -e backups -e '*.bak' || true

COMPOSE_FILES=(-f docker-compose.prod.yml)
if [ -f docker-compose.v5-override.yml ]; then
  COMPOSE_FILES+=(-f docker-compose.v5-override.yml)
fi

export RELEASE_SHA="$TARGET_SHA"
# Prefer the v5-aware compose set for image names oddsyra-backend / oddsyra-worker
echo "📦 Building backend + worker from checked-out source…"
docker compose "${COMPOSE_FILES[@]}" build backend worker

echo "🧱 Building frontend dist for nginx bind-mount…"
if [ -f package-lock.json ]; then
  npm ci --omit=dev 2>/dev/null || npm ci
else
  npm install
fi
npm run build

echo "🔄 Rolling backend + worker (postgres/redis/nginx deps untouched)…"
docker compose "${COMPOSE_FILES[@]}" up -d --no-deps backend worker

if docker ps --format '{{.Names}}' | grep -q oddsyra_prod_nginx; then
  docker compose "${COMPOSE_FILES[@]}" up -d nginx --force-recreate 2>/dev/null \
    || docker exec oddsyra_prod_nginx nginx -s reload 2>/dev/null \
    || true
fi

echo "⏳ Health…"
ok=0
for i in $(seq 1 15); do
  if docker exec oddsyra_prod_backend wget -qO- http://127.0.0.1:5001/liveness 2>/dev/null | grep -q alive; then
    ok=1
    break
  fi
  sleep 2
done

if [ "$ok" = 1 ]; then
  echo "✅ Deployed $TARGET_SHA — never docker-cp over this image; re-run this script instead."
  git rev-parse HEAD > .release-sha 2>/dev/null || true
  exit 0
fi

echo "❌ Backend liveness failed after deploy"
exit 1
