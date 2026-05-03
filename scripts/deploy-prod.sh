#!/usr/bin/env bash
set -euo pipefail

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

if [ ! -x "$PRE_DEPLOY_SCRIPT" ]; then
  chmod +x "$PRE_DEPLOY_SCRIPT"
fi

echo "[Deploy] Running pre-deploy checks (backup + migrate)..."
"$PRE_DEPLOY_SCRIPT"

echo "[Deploy] Building and restarting app container..."
docker compose -f "$COMPOSE_FILE" up -d --build app

echo "[Deploy] Waiting for app container to be running..."
for _ in $(seq 1 30); do
  if docker compose -f "$COMPOSE_FILE" ps --status running app | grep -q "erp_app_prod"; then
    break
  fi
  sleep 2
done

if ! docker compose -f "$COMPOSE_FILE" ps --status running app | grep -q "erp_app_prod"; then
  echo "App container is not running after deploy." >&2
  docker compose -f "$COMPOSE_FILE" ps
  exit 1
fi

echo "[Deploy] Health check on http://127.0.0.1:3001 ..."
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:3001" >/dev/null; then
    echo "[Deploy] App is healthy."
    exit 0
  fi
  sleep 2
done

echo "Health check failed after deploy." >&2
exit 1
