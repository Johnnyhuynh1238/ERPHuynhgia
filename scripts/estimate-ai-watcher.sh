#!/usr/bin/env bash
# Cron mỗi phút: quét hạng mục dự toán chờ AI bóc (status=requested),
# spawn session Claude Code mới qua viewer service (127.0.0.1:7683) với tin nhắn con trỏ.
# Session stateless: kill session cũ trước mỗi lượt — toàn bộ trạng thái nằm trong DB.
set -euo pipefail

exec 9>/tmp/estimate-watcher.lock
flock -n 9 || exit 0

PSQL=(docker exec erp_db_prod psql -U erp_user -d erp_huynhgia6_prod -tA)
CLIENT="ccw-estimate0001"
VIEWER="http://127.0.0.1:7683"
SOP="/home/claudeuser/ERPHuynhgia/scripts/estimate-sop.md"

# Worker đang bận (có hạng mục analyzing chưa quá 30 phút) → đợi lượt sau.
# Quá 30 phút coi như session chết — admin bấm Reset trên UI hoặc lượt sau tự gom lại.
busy=$("${PSQL[@]}" -c "SELECT count(*) FROM estimate_items WHERE status='analyzing' AND updated_at > now() - interval '30 minutes'")
[ "$busy" != "0" ] && exit 0

# psql -tA vẫn in command tag "UPDATE n" sau các dòng RETURNING — lọc lấy đúng uuid
ids=$("${PSQL[@]}" -c "UPDATE estimate_items SET status='analyzing' WHERE status='requested' RETURNING id" \
  | grep -E '^[0-9a-f-]{36}$' | paste -sd, - || true)
[ -z "$ids" ] && exit 0

echo "[$(date '+%F %T')] spawn worker cho items: $ids"

# Kill session cũ để lượt này là session mới tinh (stateless — DB là nguồn sự thật)
curl -s -X POST "$VIEWER/kill" -H 'Content-Type: application/json' \
  -d "{\"client\":\"$CLIENT\"}" >/dev/null || true
sleep 2

msg="Bóc khối lượng dự toán ERP. Đọc file $SOP và làm đúng từng bước trong đó. Hạng mục cần bóc (estimate_items.id): $ids"
payload=$(python3 -c 'import json,sys; print(json.dumps({"client": sys.argv[1], "text": sys.argv[2]}))' "$CLIENT" "$msg")
result=$(curl -s -X POST "$VIEWER/send" -H 'Content-Type: application/json' -d "$payload")
echo "[$(date '+%F %T')] send result: $result"

# Chống race: session vừa respawn, Enter cuối có thể bị nuốt khi TUI chưa init xong
# → tin nhắn kẹt trong composer. Gửi Enter bù sau 5s — composer rỗng thì Enter vô hại.
sleep 5
curl -s -X POST "$VIEWER/send_keys" -H 'Content-Type: application/json' \
  -d "{\"client\":\"$CLIENT\",\"keys\":[\"Enter\"]}" >/dev/null || true
