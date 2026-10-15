#!/usr/bin/env bash
# Enable ADMIN_MFA_REQUIRED=1 on the VPS Oddsyra stack (compose env).
# Safe rollout: enroll admins via first login MFA_SETUP_REQUIRED, then set this.
# Usage: bash scripts/enable_admin_mfa.sh
set -euo pipefail
ROOT="${ODDSYRA_ROOT:-/opt/oddsyra}"
cd "$ROOT"
test -f .env || { echo "Missing .env"; exit 1; }

if grep -q '^ADMIN_MFA_REQUIRED=' .env; then
  sed -i.bak 's/^ADMIN_MFA_REQUIRED=.*/ADMIN_MFA_REQUIRED=1/' .env
else
  printf '\nADMIN_MFA_REQUIRED=1\n' >> .env
fi

# Ensure TOTP encryption material exists
if ! grep -qE '^(TOTP_ENCRYPTION_KEY|JWT_SECRET)=' .env; then
  echo "WARNING: set TOTP_ENCRYPTION_KEY (32+ chars) or JWT_SECRET before relying on MFA."
fi

COMPOSE=(-f docker-compose.prod.yml)
[ -f docker-compose.v5-override.yml ] && COMPOSE+=(-f docker-compose.v5-override.yml)
docker compose "${COMPOSE[@]}" up -d --no-deps --force-recreate backend worker
echo "ADMIN_MFA_REQUIRED=1 applied. Admins must complete TOTP on next login."
