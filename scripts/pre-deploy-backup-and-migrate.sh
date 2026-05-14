#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.prod.yml"
BACKUP_SCRIPT="$ROOT_DIR/scripts/backup.sh"
ENV_FILE="$ROOT_DIR/.env.production"
LOCK_FILE="$ROOT_DIR/.deploy.lock"

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "Missing compose file: $COMPOSE_FILE" >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

if [ ! -x "$BACKUP_SCRIPT" ]; then
  chmod +x "$BACKUP_SCRIPT"
fi

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "Another deploy is running. Lock file: $LOCK_FILE" >&2
  exit 1
fi

echo "[Deploy] Creating database backup before migration..."
BACKUP_FILE="$($BACKUP_SCRIPT --compose-file "$COMPOSE_FILE" --env-file "$ENV_FILE" --print-path)"

if [ -z "$BACKUP_FILE" ] || [ ! -s "$BACKUP_FILE" ]; then
  echo "Backup verification failed. File: $BACKUP_FILE" >&2
  exit 1
fi

echo "[Deploy] Backup ready: $BACKUP_FILE"
