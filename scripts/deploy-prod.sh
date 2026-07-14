#!/usr/bin/env bash
set -euo pipefail

# Dùng legacy builder: BuildKit trên VPS không resolve DNS -> next/font/google
# (fonts.gstatic.com) EAI_AGAIN làm build fail khi cache nguội. Legacy dùng
# default bridge, resolve được. (Fix bền hơn: self-host font.)
export DOCKER_BUILDKIT=0
export COMPOSE_DOCKER_CLI_BUILD=0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.prod.yml"
PRE_DEPLOY_SCRIPT="$ROOT_DIR/scripts/pre-deploy-backup-and-migrate.sh"

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "Missing compose file: $COMPOSE_FILE" >&2
  exit 1
fi

if [ ! -f "$ROOT_DIR/.env.production" ]; then
  echo "Missing env file: $ROOT_DIR/.env.production" >&2
  exit 1
fi

disk_pct() { df / --output=pcent | tail -1 | tr -dc '0-9'; }

DISK_USE_PCT=$(disk_pct)
if [ "${DISK_USE_PCT:-0}" -ge 85 ]; then
  echo "[Deploy] Disk at ${DISK_USE_PCT}% (>=85%). Auto-pruning Docker build cache + dangling images..."
  docker builder prune -af >/dev/null 2>&1 || true
  docker image prune -f >/dev/null 2>&1 || true
  DISK_USE_PCT=$(disk_pct)
  echo "[Deploy] Disk after prune: ${DISK_USE_PCT}%"
fi

if [ "${DISK_USE_PCT:-0}" -ge 90 ]; then
  echo "[Deploy] ABORT: disk still at ${DISK_USE_PCT}% after prune. Free space before deploying." >&2
  df -h /
  exit 1
fi

if [ ! -x "$PRE_DEPLOY_SCRIPT" ]; then
  chmod +x "$PRE_DEPLOY_SCRIPT"
fi

echo "[Deploy] Running pre-deploy checks (backup + migrate)..."
"$PRE_DEPLOY_SCRIPT"

echo "[Deploy] Building and restarting app container..."
docker compose --env-file "$ROOT_DIR/.env.production" -f "$COMPOSE_FILE" up -d --build app

echo "[Deploy] Waiting for app container to be running..."
for _ in $(seq 1 30); do
  if docker compose --env-file "$ROOT_DIR/.env.production" -f "$COMPOSE_FILE" ps --status running app | grep -q "erp_app_prod"; then
    break
  fi
  sleep 2
done

if ! docker compose --env-file "$ROOT_DIR/.env.production" -f "$COMPOSE_FILE" ps --status running app | grep -q "erp_app_prod"; then
  echo "App container is not running after deploy." >&2
  docker compose --env-file "$ROOT_DIR/.env.production" -f "$COMPOSE_FILE" ps
  exit 1
fi

echo "[Deploy] Running Prisma migrate deploy in new container..."
docker compose --env-file "$ROOT_DIR/.env.production" -f "$COMPOSE_FILE" exec -T app npx prisma migrate deploy
echo "[Deploy] Migration completed."

echo "[Deploy] Health check on http://127.0.0.1:3001 ..."
HEALTHY=0
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:3001" >/dev/null; then
    echo "[Deploy] App is healthy."
    HEALTHY=1
    break
  fi
  sleep 2
done

if [ "$HEALTHY" -ne 1 ]; then
  echo "Health check failed after deploy." >&2
  exit 1
fi

echo "[Deploy] Pruning Docker build cache older than 24h + dangling images..."
docker builder prune -f --filter "until=24h" >/dev/null 2>&1 || true
docker image prune -f >/dev/null 2>&1 || true
echo "[Deploy] Done."
exit 0
