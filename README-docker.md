# Hướng dẫn Docker

Tài liệu ngắn để chạy nhanh stack local/VPS và vận hành deploy production tự động.

## 1) Chạy toàn bộ dịch vụ local
```bash
docker compose up -d
```

## 2) Dừng toàn bộ dịch vụ local
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

## 6) Backup DB thủ công
```bash
bash scripts/backup.sh
```

## 7) Deploy production thủ công (an toàn)
```bash
bash scripts/deploy-prod.sh
```

Script deploy sẽ chạy theo thứ tự:
1. Tạo backup DB.
2. Chạy `prisma migrate deploy`.
3. Build + restart app container production.
4. Health check app.

Nếu backup hoặc migrate lỗi thì deploy dừng ngay.

## 8) GitHub Actions auto deploy
Workflow: `.github/workflows/deploy-prod.yml`

Trigger:
- Push lên nhánh `master`
- Hoặc chạy tay bằng `workflow_dispatch`

Cần cấu hình GitHub Actions Secrets:
- `PROD_SSH_HOST`
- `PROD_SSH_PORT`
- `PROD_SSH_USER`
- `PROD_SSH_PRIVATE_KEY`
- `PROD_APP_DIR`
- `PROD_KNOWN_HOSTS` (khuyến nghị)

`PROD_APP_DIR` là thư mục repo trên server production (ví dụ: `/home/claudeuser/.openclaw/workspace/erp-huynhgia6`).

## 9) Rollback nhanh app version
Trên server production:
```bash
cd /home/claudeuser/.openclaw/workspace/erp-huynhgia6
git fetch origin
git checkout <commit_hoặc_tag_ổn_định>
docker compose -f docker-compose.prod.yml up -d --build app
```

## Ghi chú quan trọng
- Không commit `.env.production` hoặc secret lên Git.
- DB và MinIO đang dùng volume (`postgres_data_prod`, `minio_data_prod`) để tránh mất dữ liệu khi restart container.
- DB restore là phương án cuối cùng, chỉ dùng khi có sự cố dữ liệu nghiêm trọng.
