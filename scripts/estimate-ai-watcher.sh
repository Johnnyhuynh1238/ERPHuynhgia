#!/usr/bin/env bash
# Cron mỗi phút: (1) ghi heartbeat trạng thái worker vào DB cho UI hiển thị,
# (2) quét hạng mục dự toán chờ AI bóc (status=requested) → spawn session Claude Code
# mới qua viewer service (127.0.0.1:7683) với tin nhắn con trỏ.
# Session stateless: kill session cũ trước mỗi lượt — toàn bộ trạng thái nằm trong DB.
set -euo pipefail

exec 9>/tmp/estimate-watcher.lock
flock -n 9 || exit 0

PSQL=(docker exec erp_db_prod psql -U erp_user -d erp_huynhgia6_prod -tA)
CLIENT="ccw-estimate0001"
VIEWER="http://127.0.0.1:7683"
SOP="/home/claudeuser/ERPHuynhgia/scripts/estimate-sop.md"

# ── Heartbeat: đọc pane worker, suy trạng thái, upsert 1 row cho UI poll ──
write_heartbeat() {
  # state + tail_txt cố ý KHÔNG local — phần tự hồi sinh phía dưới đọc lại
  local capture busy_flag analyzing
  capture=$(curl -sf --max-time 5 "$VIEWER/capture?client=$CLIENT&lines=30" 2>/dev/null || echo "")
  analyzing=$("${PSQL[@]}" -c "SELECT count(*) FROM estimate_items WHERE status='analyzing'" || echo 0)

  if [ -z "$capture" ]; then
    busy_flag="False"; tail_txt="(không nối được viewer service)"; state="viewer_down"
  else
    busy_flag=$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("busy"))' "$capture" 2>/dev/null || echo "False")
    tail_txt=$(python3 -c 'import json,sys; print((json.loads(sys.argv[1]).get("output") or "")[-700:])' "$capture" 2>/dev/null || echo "")
    if echo "$tail_txt" | grep -qiE 'usage limit|limit will reset|limit reached|rate.?limit|out of credit|quota'; then
      state="quota"
    elif [ "$busy_flag" = "True" ]; then
      state="working"
    elif [ "$analyzing" != "0" ]; then
      # có item analyzing mà worker im — kẹt (composer/chết giữa chừng)
      state="stuck"
    else
      state="idle"
    fi
  fi

  docker exec -i erp_db_prod psql -U erp_user -d erp_huynhgia6_prod -q \
    -v s="$state" -v b="$([ "$busy_flag" = "True" ] && echo true || echo false)" -v t="$tail_txt" <<'HSQL' || true
INSERT INTO estimate_worker_status (id, state, busy, tail, updated_at)
VALUES (1, :'s', :'b'::boolean, :'t', now())
ON CONFLICT (id) DO UPDATE SET state=EXCLUDED.state, busy=EXCLUDED.busy, tail=EXCLUDED.tail, updated_at=now();
HSQL
}

write_heartbeat

# ── Tự hồi sinh: worker chết giữa chừng (swap acc restart session, crash…) ──
# Detect chắc chắn: session hiện tại được TẠO SAU lần spawn của watcher (lệch >30s)
# nghĩa là session cũ đã bị thay (swap-all/kill) → worker cũ chết chắc → re-queue.
# (Không dò text pane — tin nhắn trôi khỏi màn hình khi worker chạy dài gây báo chết nhầm.)
SPAWN_TS_FILE=/tmp/estimate-worker-spawn.ts
if [ "${state:-}" = "stuck" ] && [ -f "$SPAWN_TS_FILE" ]; then
  spawn_ts=$(cat "$SPAWN_TS_FILE" 2>/dev/null || echo 0)
  sess_created=$(curl -s "$VIEWER/sessions" | python3 -c '
import json,sys
for s in json.load(sys.stdin).get("sessions", []):
    if s["client_id"] == sys.argv[1]:
        print(s["created"]); break
' "$CLIENT" 2>/dev/null || echo "")
  if [ -n "$sess_created" ] && [ "$sess_created" -gt $((spawn_ts + 30)) ] 2>/dev/null; then
    requeued=$("${PSQL[@]}" -c "UPDATE estimate_items SET status='requested' WHERE status='analyzing' AND updated_at < now() - interval '2 minutes' RETURNING id" \
      | grep -cE '^[0-9a-f-]{36}$' || true)
    [ "${requeued:-0}" != "0" ] && echo "[$(date '+%F %T')] session bị thay (created=$sess_created > spawn=$spawn_ts) — re-queue $requeued item treo"
  fi
fi
# Lưới an toàn cuối: analyzing quá 30' bất kể lý do → re-queue
"${PSQL[@]}" -c "UPDATE estimate_items SET status='requested' WHERE status='analyzing' AND updated_at < now() - interval '30 minutes'" >/dev/null || true

# ── Spawn: worker đang bận (analyzing < 30 phút) → đợi lượt sau ──
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
date +%s > /tmp/estimate-worker-spawn.ts

# Chống race: gửi khi TUI chưa attach xong pty thì ký tự bị nuốt một phần (kẹt composer)
# hoặc mất sạch (pane trống). Lặp mỗi 5s, tối đa 12 lần:
#   - busy → worker đã chạy, xong
#   - pane KHÔNG chứa tin nhắn → mất sạch → GỬI LẠI nguyên tin nhắn (session sống nên không còn race)
#   - pane chứa tin nhắn mà chưa busy → kẹt composer → gõ Enter
for i in $(seq 1 12); do
  sleep 5
  cap=$(curl -s "$VIEWER/capture?client=$CLIENT&lines=40" 2>/dev/null || echo "")
  busy_flag=$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("busy"))' "$cap" 2>/dev/null || echo "")
  if [ "$busy_flag" = "True" ]; then
    echo "[$(date '+%F %T')] worker busy sau ${i} lần kiểm — OK"
    break
  fi
  if python3 -c 'import json,sys; sys.exit(0 if "Hạng mục cần bóc" in (json.loads(sys.argv[1]).get("output") or "") else 1)' "$cap" 2>/dev/null; then
    curl -s -X POST "$VIEWER/send_keys" -H 'Content-Type: application/json' \
      -d "{\"client\":\"$CLIENT\",\"keys\":[\"Enter\"]}" >/dev/null || true
  else
    echo "[$(date '+%F %T')] pane trống — gửi lại tin nhắn (lần kiểm $i)"
    curl -s -X POST "$VIEWER/send" -H 'Content-Type: application/json' -d "$payload" >/dev/null || true
  fi
done

write_heartbeat
