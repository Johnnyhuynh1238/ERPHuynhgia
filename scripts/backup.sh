#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="$ROOT_DIR/backups"
COMPOSE_FILE="$ROOT_DIR/docker-compose.yml"
ENV_FILE="$ROOT_DIR/.env"
PRINT_PATH_ONLY=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --compose-file)
      COMPOSE_FILE="$2"
      shift 2
      ;;
    --env-file)
      ENV_FILE="$2"
      shift 2
      ;;
    --print-path)
      PRINT_PATH_ONLY=1
      shift
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "Compose file not found: $COMPOSE_FILE" >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Env file not found: $ENV_FILE" >&2
  exit 1
fi

TIMESTAMP="$(date +"%Y%m%d-%H%M%S")"
BACKUP_FILE="$BACKUP_DIR/postgres-$TIMESTAMP.sql.gz"

mkdir -p "$BACKUP_DIR"
cd "$ROOT_DIR"

if [ "$PRINT_PATH_ONLY" -eq 0 ]; then
  echo "[Backup] Starting PostgreSQL dump..."
fi

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T db \
  sh -lc 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  | gzip > "$BACKUP_FILE"

if [ ! -s "$BACKUP_FILE" ]; then
  echo "Backup file is empty: $BACKUP_FILE" >&2
  exit 1
fi

find "$BACKUP_DIR" -type f -name "postgres-*.sql.gz" -mtime +30 -delete

if [ "$PRINT_PATH_ONLY" -eq 1 ]; then
  printf '%s\n' "$BACKUP_FILE"
else
  echo "[Backup] Created: $BACKUP_FILE"
  echo "[Backup] Completed and cleaned files older than 30 days."
fi
