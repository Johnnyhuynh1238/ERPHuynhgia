# SPEC: Task Status Automation — ERP Huỳnh Gia

Phiên bản: 1.0  
Ngày: 24/04/2026  
Trạng thái: Draft chờ duyệt

---

## PART 1 — Mục tiêu & phạm vi

### 1.1 Mục tiêu
Tự động hóa trạng thái task để giảm thao tác tay và đồng bộ đúng nghiệp vụ thực tế:
- Task chưa có hoạt động: Chưa làm
- Có hoạt động báo cáo chiều/ảnh thực tế: Đang làm
- Quá hạn kế hoạch: Trễ tiến độ
- Chỉ khi TPTC/Admin duyệt QC: Hoàn thành

### 1.2 Ngoài phạm vi (phase này)
- Không thay đổi KPI logic.
- Không thay đổi quy trình duyệt QC đã triển khai ngoài phần cập nhật trạng thái task.
- Không mở quyền đổi trạng thái cho KS/foreman.

---

## PART 2 — Trạng thái chuẩn (domain)

## 2.1 Bộ trạng thái được dùng
1. `not_started` — Chưa làm
2. `in_progress` — Đang làm
3. `done` — Hoàn thành thi công (giữ để tương thích và vận hành nội bộ)
4. `delayed` — Trễ tiến độ
5. `inspected` — Hoàn thành (đã duyệt QC)
6. `na` — Không áp dụng (manual)

> Ghi chú: giữ `done` theo quyết định duyệt; không loại bỏ khỏi hệ thống.
### 2.2 Quyền cập nhật trạng thái tay
- Chỉ `admin` và `construction_manager`.
- KS/foreman không thấy tab trạng thái và không được gọi API đổi trạng thái.

---

## PART 3 — State machine (quy tắc chuyển)

### 3.1 Chuyển tự động
1) `not_started -> in_progress`
- Khi có hoạt động thật trong báo cáo chiều:
  - có cập nhật tiến độ task, hoặc
  - có ảnh thực tế của task.

2) `in_progress -> delayed`
- Khi quá `plannedEndDate` mà task chưa ở `inspected`.

3) `in_progress -> inspected` hoặc `delayed -> inspected`
- Chỉ khi TPTC/Admin phê duyệt QC thành công.

### 3.2 Quy tắc cứng
- **Không cho** `delayed -> in_progress` (theo duyệt của Anh).
- `na` là manual-only; khi ở `na` thì không auto chuyển trạng thái.

### 3.3 Priority khi nhiều rule cùng đúng
1. `na` (manual lock)
2. `inspected`
3. `delayed`
4. `in_progress`
5. `not_started`

---

## PART 4 — Trigger kỹ thuật

### 4.1 Trigger real-time
- Sau khi lưu báo cáo chiều (morning/evening module tùy endpoint đang dùng):
  - nếu có tiến độ/ảnh task => evaluate auto-status.
- Sau khi QC review approve bởi TPTC/Admin:
  - set `inspected` ngay.

### 4.2 Trigger định kỳ
- Job kiểm tra quá hạn (`plannedEndDate`) để set `delayed` cho task đang active chưa `inspected`.
- Tần suất chốt: **mỗi ngày 1 lần vào buổi sáng** (đề xuất 06:00 Asia/Saigon).
---

## PART 5 — API/Service design

### 5.1 Service mới
`lib/task-status-auto.ts`
- `recomputeTaskStatus(taskId: string, reason: string)`
- `applyOverdueStatus(now: Date)`
- `shouldMoveToInProgress(taskId)`
- `shouldMoveToInspected(taskId)` (gắn với QC approved event)

### 5.2 API hooks cần gọi service
1. Endpoint lưu báo cáo chiều + ảnh task
2. Endpoint `qc-review` (approve/reject)
3. (optional) Endpoint cập nhật planned dates

### 5.3 Guard backend
- PATCH `section=status` giữ quyền chỉ admin/TPTC.
- Nếu user không quyền: 403.

---

## PART 6 — Logging & audit

Mọi lần auto đổi trạng thái phải ghi `task_logs`:
- `AUTO_STATUS: not_started -> in_progress (evening report activity)`
- `AUTO_STATUS: in_progress -> delayed (overdue plannedEndDate)`
- `AUTO_STATUS: delayed -> inspected (qc approved)`

Manual update vẫn log như hiện tại nhưng thêm prefix `MANUAL_STATUS`.

---

## PART 7 — UI/UX impact

1) Tab trạng thái chỉ hiện cho admin/TPTC (đã triển khai trước đó).
2) Với role khác:
- Chỉ xem badge trạng thái hiện tại ở header task.
3) Tại timeline/log:
- Hiển thị rõ auto/manual để audit nhanh.

---

## PART 8 — Dữ liệu & migration

### 8.1 Không cần migration schema bắt buộc
- Tận dụng cột status hiện có.
- Có chạy dọn dữ liệu legacy bằng script one-off trong production theo quyết định duyệt.

### 8.2 Script chuẩn hóa (bắt buộc chạy ngay)
`scripts/normalize-task-status.ts`
- Quét task có status `done`
- Nếu đã có QC approved => chuyển `inspected`
- Nếu chưa QC approved => chuyển `in_progress`
- Ghi log số lượng record đã cập nhật và danh sách task affected (xuất file report)

---

## PART 9 — Test plan (smoke)

### 9.1 Core flow
1. Tạo task mới => `not_started`
2. KS gửi báo cáo chiều có tiến độ => `in_progress`
3. Set plannedEndDate quá hạn + chạy job => `delayed`
4. TPTC approve QC => `inspected`

### 9.2 Negative cases
1. Task `delayed` có hoạt động mới => vẫn `delayed`
2. Task `na` dù có activity => vẫn `na`
3. KS gọi API đổi status => 403

### 9.3 Audit cases
- Kiểm tra log auto/manual có đúng reason.

---

## PART 10 — Rollout plan (chia nhỏ để giảm rủi ro)

### Batch A — Service + Hook báo cáo chiều
- Implement `recomputeTaskStatus`
- Hook vào endpoint report activity
- Smoke not_started -> in_progress

### Batch B — Hook QC review approve + delayed job
- Hook approve => inspected
- Add overdue job => delayed
- Smoke delayed + inspected

### Batch C — Guard quyền + cleanup legacy
- Siết backend manual status admin/TPTC only
- **Bắt buộc normalize `done` ngay production** theo script đã chốt
- Full smoke + deploy

---

## PART 11 — Acceptance criteria

1) Trạng thái không cần KS bấm tay trong luồng bình thường.
2) TPTC duyệt QC là điểm chốt hoàn thành (`inspected`).
3) Task đã `delayed` không quay lại `in_progress` tự động.
4) Role không đủ quyền không đổi status được.
5) Có log truy vết đầy đủ mọi lần đổi trạng thái.

---

## PART 12 — Quyết định đã duyệt

1) **Giữ `done`**.
2) Job overdue chạy **mỗi sáng 1 lần**.
3) **Chạy normalize legacy ngay production** (không để batch sau).
