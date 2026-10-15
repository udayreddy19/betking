#!/usr/bin/env bash
# Convert /opt/oddsyra into a tracked git checkout of origin/main without wiping .env/data.
# Usage on VPS: bash scripts/bootstrap_vps_git.sh
set -euo pipefail

ROOT="${ODDSYRA_ROOT:-/opt/oddsyra}"
REMOTE_URL="${REMOTE_URL:-https://github.com/udayreddy19/betking.git}"
BRANCH="${BRANCH:-main}"

cd "$ROOT"
if [ -d .git ]; then
  echo "Already a git repo at $ROOT"
  git remote -v | head -5
  git fetch origin "$BRANCH"
  echo "HEAD=$(git rev-parse HEAD)"
  exit 0
fi

test -f .env || { echo "Missing $ROOT/.env — abort"; exit 1; }

TMP="$(mktemp -d /tmp/oddsyra-git-XXXXXX)"
echo "Cloning $REMOTE_URL ($BRANCH) → $TMP"
git clone --depth 1 --branch "$BRANCH" "$REMOTE_URL" "$TMP"

# Preserve runtime state
for keep in .env data backups dist node_modules docker-compose.v5-override.yml; do
  if [ -e "$ROOT/$keep" ] && [ ! -e "$TMP/$keep" ]; then
    cp -a "$ROOT/$keep" "$TMP/$keep" 2>/dev/null || true
  fi
done
# Prefer existing .env over cloned (clone should not have secrets)
cp -a "$ROOT/.env" "$TMP/.env"

# Swap in place
BACK="/opt/oddsyra.rsync-pre-git-$(date -u +%Y%m%dT%H%M%SZ)"
mv "$ROOT" "$BACK"
mv "$TMP" "$ROOT"
echo "Bootstrapped git at $ROOT (previous tree: $BACK)"
cd "$ROOT"
git rev-parse HEAD > .release-sha
echo "ok sha=$(cat .release-sha)"
