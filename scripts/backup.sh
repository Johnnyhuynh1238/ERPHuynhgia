#!/usr/bin/env bash
set -euo pipefail

# Script backup PostgreSQL (chạy cron lúc 2h sáng ở bước sau)
# - Dump DB từ container "db"
# - Nén .sql.gz
# - Giữ lại 30 ngày gần nhất

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="$ROOT_DIR/backups"
TIMESTAMP="$(date +"%Y%m%d-%H%M%S")"
BACKUP_FILE="$BACKUP_DIR/postgres-$TIMESTAMP.sql.gz"

mkdir -p "$BACKUP_DIR"

cd "$ROOT_DIR"

echo "[Backup] Bắt đầu dump PostgreSQL..."
docker compose exec -T db pg_dump -U "${POSTGRES_USER:-erp_user}" "${POSTGRES_DB:-erp_db}" | gzip > "$BACKUP_FILE"

echo "[Backup] Đã tạo: $BACKUP_FILE"

# Xóa file backup cũ hơn 30 ngày
find "$BACKUP_DIR" -type f -name "postgres-*.sql.gz" -mtime +30 -delete

echo "[Backup] Hoàn tất. Đã dọn file > 30 ngày."
