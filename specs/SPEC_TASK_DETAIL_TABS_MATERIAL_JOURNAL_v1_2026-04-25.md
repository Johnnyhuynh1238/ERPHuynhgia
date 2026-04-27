# SPEC: Task Detail Screen — Tab Restructure + Vật tư DB + Nhật ký báo cáo chiều

Version: 1.0
Ngày: 2026-04-25
Áp dụng cho: app/tasks/[id]/ — màn chi tiết task của Kỹ sư

## Review notes before implementation

- Spec is mostly consistent and implementable.
- Fix syntax issue in API section: `PATCH /material-items/[itemId]` and `DELETE /material-items/[itemId]` are separate endpoints.
- Verify actual schema names for evening report owner before coding journal: spec says `eveningReport.submittedBy`, but existing schema may use `reporter` / `reporterId`. Use the real Prisma relation name.
- `canManageItem` may not currently exist as a named export. Reuse existing permission helper if present; otherwise add it in `lib/task-permissions.ts` with exactly: admin | construction_manager | engineer, without creating a new role model.
- Seed-on-GET from `materialsNeeded` must avoid duplicates. Use transaction + recheck existing rows before createMany.
- Migration must be created and applied safely. Production deploy must include migration deploy before/with app rollout.
- Do not change QcSection internals.
- Do not alter Info tab content/logic except moving it last.
- Disk is constrained; clean temporary test/build files after use.

---

## Tổng quan

Restructure lại 4 tab của task-detail-client.tsx. Thứ tự tab mới (left → right):

|#|Key |Label |Icon|Ghi chú |
|-|----------|---------|----|--------------------------|
|1|`qc` |QC |🔍 |Default tab khi vào màn |
|2|`material`|Vật tư |🧱 |Tách riêng, dạng bảng + DB|
|3|`journal` |Nhật ký |📓 |Đổi tên + làm lại logic |
|4|`info` |Thông tin|📋 |Giữ nguyên, move ra cuối |

## Checklist tổng

### Schema / Migration

- [ ] Tạo model TaskMaterialItem trong prisma/schema.prisma
- [ ] Thêm relation materialItems TaskMaterialItem[] vào model Task
- [ ] Chạy prisma migrate dev tạo migration mới cho bảng task_material_items

### API — Material Items

- [ ] Tạo app/api/tasks/[id]/material-items/route.ts (GET, POST)
- [ ] Tạo app/api/tasks/[id]/material-items/[itemId]/route.ts (PATCH, DELETE)
- [ ] Logic seed tự động từ materialsNeeded khi list trống

### API — Journal

- [ ] Tạo app/api/tasks/[id]/journal/route.ts (GET)

### UI Components

- [ ] Tạo app/tasks/[id]/_components/material-section.tsx
- [ ] Tạo app/tasks/[id]/_components/journal-section.tsx
- [ ] Sửa app/tasks/[id]/_components/task-detail-client.tsx:
  - [ ] Đổi thứ tự 4 tab
  - [ ] Đổi default tab sang qc
  - [ ] Đổi label tab 3 từ “Ảnh & Nhật ký” → “Nhật ký”
  - [ ] Tab material gọi <MaterialSection> thay vì inline cũ
  - [ ] Tab journal gọi <JournalSection> thay vì inline cũ
  - [ ] Tab qc chỉ còn <QcSection>, bỏ phần vật tư

## 1. Tab QC 🔍

Thay đổi: Tách <QcSection> ra tab riêng. Không thay đổi bất kỳ logic hay UI nào bên trong QcSection.

- Xóa wrapper card “Vật tư & QC” cũ
- <QcSection> render thẳng trong tab qc
- Default tab khi load màn là qc

Checklist:

- [ ] Tab qc chỉ render <QcSection taskId canUpdateQc canManageItem />
- [ ] Không còn card “Vật tư cần dùng” trong tab này

## 2. Tab Vật tư 🧱

### 2a. Prisma Schema

Thêm model mới vào prisma/schema.prisma:

```prisma
model TaskMaterialItem {
 id String @id @default(uuid()) @db.Uuid
 taskId String @map("task_id") @db.Uuid
 name String
 isAvailable Boolean @default(false) @map("is_available")
 orderIndex Int @map("order_index")
 createdAt DateTime @default(now()) @map("created_at")
 updatedAt DateTime @updatedAt @map("updated_at")

 task Task @relation(fields: [taskId], references: [id], onDelete: Cascade)

 @@index([taskId, orderIndex])
 @@map("task_material_items")
}
```

Thêm vào model Task:

```prisma
materialItems TaskMaterialItem[]
```

> Note kiến trúc: Model này sẽ phát triển thành phiếu đề xuất cấp vật tư gửi TPTC phê duyệt. Thiết kế DB phải sạch để dễ extend (thêm field status, requestedAt, approvedBy, v.v.) về sau.

### 2b. API Endpoints

`GET /api/tasks/[id]/material-items`
- Auth: getTaskWithAccess — trả 403 nếu không có quyền
- Return: { items: TaskMaterialItem[] } — sorted by orderIndex ASC
- Logic: Nếu items trống && task.materialsNeeded có nội dung → seed tự động

`POST /api/tasks/[id]/material-items`
- Permission: canManageItem = admin | construction_manager | engineer
- Body: { name: string, orderIndex?: number }
- Return: { item: TaskMaterialItem }

`PATCH /api/tasks/[id]/material-items/[itemId]`
- Permission: canUpdateQc (admin | construction_manager | mainEngineer | assignedEngineer)
- Body: { isAvailable?: boolean, name?: string }
- Return: { item: TaskMaterialItem }

`DELETE /api/tasks/[id]/material-items/[itemId]`
- Permission: canManageItem
- Return: { message: string }

### 2c. Seed Logic từ materialsNeeded

Kích hoạt trong GET khi items.length === 0 và task.materialsNeeded không rỗng:
1. Split materialsNeeded theo "\n"
2. Trim từng dòng, bỏ dòng rỗng
3. Tạo TaskMaterialItem cho từng dòng:
   - name = dòng text
   - isAvailable = false
   - orderIndex = index (0, 1, 2...)
4. Return list vừa seed

### 2d. UI — MaterialSection Component

File: app/tasks/[id]/_components/material-section.tsx

Hành vi:
- Checkbox tick → PATCH isAvailable ngay, optimistic update UI
- Nếu canManageItem: hiện nút + Thêm vật tư → inline input cuối bảng → Enter/Save để POST
- Nếu canManageItem: hover từng dòng hiện icon 🗑️ → click DELETE
- Dòng footer: X / Y vật tư đã có sẵn
- Style dark theme: bg-[#1a1d27], border #2e3347, text #f0f2f8

Checklist:
- [ ] Load items khi mount
- [ ] Checkbox tick/untick gọi PATCH và update UI ngay (optimistic)
- [ ] Nút thêm chỉ hiện với canManageItem
- [ ] Nút xóa chỉ hiện với canManageItem (hover)
- [ ] Footer tổng đếm đúng
- [ ] Empty state nếu không có item nào
- [ ] Loading state khi fetch

## 3. Tab Nhật ký 📓

### 3a. API Endpoint

`GET /api/tasks/[id]/journal`
- Auth: getTaskWithAccess
- Query: EveningReportTask filter theo taskId
- Order: reportDate DESC
- Include đủ fields/detail/photos for UI.
- Use real Prisma relation names from schema (reporter/submittedBy as applicable).
- Return: { entries: [...] }

### 3b. UI — JournalSection Component

File: app/tasks/[id]/_components/journal-section.tsx

Danh sách:
- Ngày báo cáo
- Báo cáo chiều · người lập
- Xem chi tiết

Modal/bottom sheet detail:
- Ngày báo cáo (format: dd/MM/yyyy)
- Người lập báo cáo
- Tất cả field quan trọng của EveningReportTask
- Ảnh báo cáo nếu có (grid 3 cột, tap để xem full)
- Nút Đóng, click backdrop đóng

Checklist:
- [ ] Load journal entries khi mount tab
- [ ] Danh sách hiển thị đúng ngày + tên người lập
- [ ] Click “Xem chi tiết” mở modal/bottom sheet
- [ ] Modal hiển thị đầy đủ nội dung báo cáo
- [ ] Modal có ảnh nếu entry có ảnh
- [ ] Đóng modal bằng nút Đóng hoặc click backdrop
- [ ] Empty state khi không có báo cáo
- [ ] Loading state khi fetch

## 4. Tab Thông tin 📋

Thay đổi: Chỉ move ra vị trí tab thứ 4 (cuối cùng). Không thay đổi bất kỳ nội dung hay logic nào bên trong.

Checklist:
- [ ] Tab info ở vị trí cuối cùng bên phải
- [ ] Nội dung giữ nguyên hoàn toàn (Kế hoạch + Phân công)

## Files cần tạo / sửa

|Action|File |
|------|-----------------------------------------------------|
|✏️ Sửa |`prisma/schema.prisma` |
|➕ Tạo |Migration mới |
|➕ Tạo |`app/api/tasks/[id]/material-items/route.ts` |
|➕ Tạo |`app/api/tasks/[id]/material-items/[itemId]/route.ts`|
|➕ Tạo |`app/api/tasks/[id]/journal/route.ts` |
|➕ Tạo |`app/tasks/[id]/_components/material-section.tsx` |
|➕ Tạo |`app/tasks/[id]/_components/journal-section.tsx` |
|✏️ Sửa |`app/tasks/[id]/_components/task-detail-client.tsx` |

## Thứ tự implement

1. Schema + Migration
2. API material-items
3. API journal
4. Component MaterialSection
5. Component JournalSection
6. Wire task-detail-client.tsx tabs
7. Build + smoke + deploy + regenerate PROJECT_STRUCTURE.md
