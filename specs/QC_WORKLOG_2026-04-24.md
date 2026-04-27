# QC Worklog — 2026-04-24

## Purpose
Log tiến độ triển khai QC để có thể resume ngay nếu session bị treo/disconnect.

## References
- Main spec: `specs/SPEC_QC_Checklist_v1_2026-04-24.md`
- Context snapshot: `specs/QC_CONTEXT_SNAPSHOT_2026-04-24.md`

## Timeline

### 13:00
- User yêu cầu bắt tay làm tiếp phần gắn ảnh theo từng QC item.
- Yêu cầu bắt buộc: lưu spec + nhật ký liên tục để tránh mất ngữ cảnh khi treo.

### 13:01
- Start Batch A (backend upload ảnh QC theo file thật, không chỉ URL).
- Scope:
  1) `POST /api/tasks/[id]/qc-photos` nhận `multipart/form-data` (`qcItemId` + `files[]`).
  2) Lưu file vào `public/uploads/tasks/<taskId>/qc/<qcItemId>/...`.
  3) Vẫn giữ backward compatibility cho payload JSON `urls[]`.

### 13:02
- Start Batch B (UI `qc-section.tsx`):
  1) Gắn input file multiple cho từng item.
  2) Upload vào endpoint mới.
  3) Hiển thị gallery ảnh theo item + xóa ảnh.

### 13:14
- Completed Batch A (BE): `app/api/tasks/[id]/qc-photos/route.ts`
  - Hỗ trợ `multipart/form-data` (`qcItemId` + `files[]`) để upload file ảnh thật.
  - Lưu file dưới `public/uploads/tasks/<taskId>/qc/<qcItemId>/...` bằng sharp.
  - Vẫn giữ backward compatibility với JSON `urls[]` cũ.

### 13:19
- Completed Batch B (UI): `app/tasks/[id]/_components/qc-section.tsx`
  - Mỗi mục QC có input upload nhiều file ảnh.
  - Hiển thị danh sách ảnh đã gắn theo item.
  - Có nút xóa ảnh theo item.
  - Upload/xóa xong tự reload lại items.

### 13:24
- Build verify local PASS:
  - `npm run -s build` => exit code 0

### 13:31
- Production deploy done (user executed sudo docker compose build/up).
- Smoke image flow PASS (8/8) on production:
  - create requirePhoto item
  - blocked pass without photo (400 expected)
  - upload file per-item (multipart)
  - pass after photo upload
  - delete photo
  - cleanup temp item

### 14:35
- Root-cause xác nhận: ảnh QC cũ mất file vật lý do chưa persist uploads trước các lần recreate container.
- Đã dọn DB các record `qc_photos` mồ côi (file không tồn tại): deleted 9/9.
- Trạng thái sau dọn: `qc_photos = 0` (sạch, tránh UI hiển thị ảnh hỏng/404).
- Đã giữ cấu hình chống mất ảnh cho các upload mới: bind mount `./public/uploads:/app/public/uploads` trong `docker-compose.prod.yml`.

## Resume checklist (if interrupted)
1. Check modified files:
   - `app/api/tasks/[id]/qc-photos/route.ts`
   - `app/tasks/[id]/_components/qc-section.tsx`
   - `app/tasks/[id]/_components/task-detail-client.tsx`
2. Re-run smoke image cases:
   - upload 1 ảnh per-item
   - upload nhiều ảnh per-item
   - delete ảnh
   - requirePhoto gate
3. Build + deploy verify.
