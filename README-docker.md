# Hướng dẫn Docker (Phase 1)

Tài liệu ngắn để chạy nhanh stack local/VPS.

## 1) Chạy toàn bộ dịch vụ
```bash
docker compose up -d
```

## 2) Dừng toàn bộ dịch vụ
```bash
docker compose down
```

## 3) Xem log ứng dụng Next.js
```bash
docker compose logs -f app
```

## 4) Restart riêng PostgreSQL
```bash
docker compose restart db
```

## 5) Kiểm tra container đang chạy
```bash
docker ps
```

## Ghi chú
- Trước khi chạy thật, copy `.env.example` thành `.env` và điền mật khẩu mạnh.
- SSL/Certbot sẽ hoàn thiện ở Bước 10.
- Backup DB sẽ setup cron ở bước sau, script đã có sẵn tại `scripts/backup.sh`.
