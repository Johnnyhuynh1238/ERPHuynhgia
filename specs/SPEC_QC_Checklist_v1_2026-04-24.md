# SPEC: Hệ thống QC Checklist — ERP Huỳnh Gia

Phiên bản: 1.0 
Ngày: 24/04/2026 
Trạng thái: Đã duyệt

-----

## 1. Tổng quan

Nâng cấp hệ thống QC Checklist từ mô hình tick đơn giản lên luồng kiểm soát chất lượng 2 cấp: 
KS thi công → TPTC ký duyệt, có audit trail, bằng chứng bắt buộc và notification trong app.

-----

## 2. Vai trò & Quyền hạn

|Hành động |KS|TPTC|Admin|
|---------------------------|--|----|-----|
|Tick trạng thái từng mục QC|✅ |✅ |✅ |
|Thêm mục QC mới vào task |✅ |✅ |✅ |
|Sửa nội dung mục QC |❌ |✅ |✅ |
|Xóa mục QC |❌ |✅ |✅ |
|Upload ảnh bằng chứng |✅ |✅ |✅ |
|Ghi chú từng mục QC |✅ |✅ |✅ |
|Tick “Task không có ảnh” |✅ |✅ |✅ |
|Gửi báo cáo lên TPTC |✅ |❌ |✅ |
|Ký duyệt hoàn thành task |❌ |✅ |✅ |
|Từ chối & trả về KS |❌ |✅ |✅ |
|Sửa checklist template |❌ |✅ |✅ |

-----

## 3. Trạng thái từng mục QC

Mỗi mục QC có 3 trạng thái:

|Trạng thái |Ký hiệu|Mô tả |
|-------------|-------|-------------------------------------------|
|Chưa kiểm tra|⬜ |Mặc định khi tạo task |
|Đạt |✅ |KS xác nhận đạt, có bằng chứng nếu bắt buộc|
|Không đạt |❌ |KS ghi lý do, chuyển TPTC xử lý |

### Quy tắc chuyển trạng thái

- ⬜ → ✅ Đạt:
 - Nếu mục cấu hình bắt buộc ảnh → phải upload ít nhất 1 ảnh
 - Nếu mục cấu hình bắt buộc ghi chú → phải có ghi chú
 - Nếu không có ảnh thực tế → KS tick ô “Task không có ảnh” trước, sau đó mới cho tick Đạt
- ⬜ → ❌ Không đạt:
 - Bắt buộc nhập lý do (text, tối thiểu 10 ký tự)
 - Hệ thống tự tạo notification cho TPTC
- ✅ / ❌ → ⬜: Cho phép reset nếu task chưa gửi báo cáo

-----

## 4. Cấu trúc dữ liệu

### 4.1 Bảng qc_items (thay thế qc_checklist dạng text)
id UUID - Primary key
task_id FK → tasks.id
template_item_id FK → qc_template_items.id (null nếu KS tự thêm)
content TEXT - Nội dung mục QC
require_photo BOOLEAN - Bắt buộc ảnh
require_note BOOLEAN - Bắt buộc ghi chú
created_by FK → users.id
order_index INT - Thứ tự hiển thị
created_at TIMESTAMP

### 4.2 Bảng qc_progress (thay thế qc_progress JSON)
id UUID - Primary key
qc_item_id FK → qc_items.id
task_id FK → tasks.id
status ENUM: unchecked | passed | failed
note TEXT - Ghi chú của KS
no_photo_reason BOOLEAN - Tick "không có ảnh"
updated_by FK → users.id
updated_at TIMESTAMP

### 4.3 Bảng qc_photos
id UUID - Primary key
qc_item_id FK → qc_items.id
task_id FK → tasks.id
url TEXT - Đường dẫn ảnh
uploaded_by FK → users.id
uploaded_at TIMESTAMP

### 4.4 Bảng qc_logs (Audit trail)
id UUID - Primary key
task_id FK → tasks.id
qc_item_id FK → qc_items.id
action ENUM: status_changed | photo_added | note_updated | item_added
from_status ENUM: unchecked | passed | failed | null
to_status ENUM: unchecked | passed | failed | null
note TEXT - Lý do (bắt buộc khi failed)
performed_by FK → users.id
performed_at TIMESTAMP

### 4.5 Bảng qc_reviews (TPTC ký duyệt)
id UUID - Primary key
task_id FK → tasks.id
action ENUM: approved | rejected
reviewer_id FK → users.id
note TEXT - Lý do từ chối (bắt buộc khi rejected)
reviewed_at TIMESTAMP

-----

## 5. Luồng hoàn thành task
[KS] Tick từng mục QC (Đạt / Không đạt)
 ↓
[KS] Upload ảnh bằng chứng (nếu bắt buộc)
 ↓
[KS] Khi QC = 100% → điền đánh giá tổng thể
 ↓
[KS] Bấm "Gửi báo cáo lên TPTC"
 ↓
[TPTC] Nhận notification trong app
 ↓
[TPTC] Review toàn bộ checklist, ảnh, đánh giá KS
 ↓
 ┌─────────────────┬──────────────────┐
 ▼ ▼
 Ký duyệt ✅ Từ chối ❌
 ↓ ↓
Task → inspected Task trả về KS
Locked toàn bộ KS nhận notification
 Làm lại từ bước đầu

-----

## 6. Điều kiện chặn (Business Rules)|Tình huống |Hệ thống làm gì |
|--------------------------------------------------------|----------------------------------------------|
|KS tick Đạt nhưng chưa có ảnh (mục bắt buộc ảnh) |Chặn, hiện thông báo “Cần upload ảnh trước” |
|KS tick Đạt nhưng chưa có ghi chú (mục bắt buộc ghi chú)|Chặn, hiện thông báo “Cần nhập ghi chú trước” |
|KS bấm Gửi báo cáo nhưng QC chưa 100% |Chặn, hiện danh sách mục còn chưa kiểm tra |
|TPTC ký duyệt nhưng có mục Không đạt chưa xử lý |Cảnh báo, yêu cầu xác nhận |
|Task đã được TPTC ký duyệt |Toàn bộ QC locked, không ai sửa được |
|KS cố sửa task đã locked |Chặn, hiện thông báo “Task đã được nghiệm thu”|

-----

## 7. Notification trong app

|Sự kiện |Người nhận |Nội dung |
|-----------------|------------|----------------------------------------------------------|
|KS gửi báo cáo |TPTC |“Task [3.01] - [Tên task] đã gửi báo cáo QC, chờ ký duyệt”|
|TPTC ký duyệt |KS phụ trách|“Task [3.01] đã được TPTC ký duyệt ✅” |
|TPTC từ chối |KS phụ trách|“Task [3.01] bị từ chối ❌ — [Lý do]” |
|KS tick Không đạt|TPTC |“Task [3.01] có mục QC không đạt: [Tên mục]” |

-----

## 8. Đánh giá tổng thể của KS (khi QC 100%)

KS điền trước khi gửi báo cáo:

- Nhận xét tổng thể (text, bắt buộc)
- Vấn đề phát sinh (text, không bắt buộc)
- Đề xuất (text, không bắt buộc)

-----

## 9. Màn hình cần build/cập nhật

### 9.1 Màn Task Detail — Tab QC (KS)

- Danh sách mục QC với 3 trạng thái
- Nút thêm mục QC mới (KS tự thêm)
- Mỗi mục: upload ảnh, nhập ghi chú, tick “không có ảnh”
- Gallery ảnh theo từng mục QC: hiển thị thumbnail; bấm thumbnail mở popup ảnh full-size
- Trong popup chỉ được lướt ảnh thuộc **chính mục QC đó** (không lướt toàn bộ ảnh của task)
- Progress bar QC tổng thể
- Nút “Gửi báo cáo lên TPTC” (chỉ hiện khi QC = 100%)
- Form đánh giá tổng thể trước khi gửi

### 9.2 Màn Review QC — dành cho TPTC

- Toàn bộ checklist + trạng thái từng mục
- Ảnh bằng chứng từng mục (có thể phóng to)
- Ghi chú từng mục của KS
- Đánh giá tổng thể của KS
- Nhật ký hoạt động QC
- Nút “Ký duyệt” và “Từ chối” (bắt buộc nhập lý do khi từ chối)

### 9.3 Màn Notification

- Danh sách thông báo trong app
- Bấm vào notification → chuyển thẳng tới task liên quan

-----

## 10. API Endpoints cần thêm/cập nhật

|Method|Endpoint |Mô tả |
|------|-----------------------------------|-------------------------------|
|GET |/api/tasks/[id]/qc-items |Lấy danh sách mục QC |
|POST |/api/tasks/[id]/qc-items |Thêm mục QC mới (KS/TPTC/Admin)|
|PATCH |/api/tasks/[id]/qc-items/[itemId] |Cập nhật trạng thái/ghi chú |
|POST |/api/tasks/[id]/qc-photos |Upload ảnh bằng chứng |
|DELETE|/api/tasks/[id]/qc-photos/[photoId]|Xóa ảnh |
|POST |/api/tasks/[id]/qc-submit |KS gửi báo cáo lên TPTC |
|POST |/api/tasks/[id]/qc-review |TPTC ký duyệt hoặc từ chối |
|GET |/api/tasks/[id]/qc-logs |Lấy audit trail |

-----

## 11. Kế hoạch triển khai

### Giai đoạn 1 — Nền tảng (Ưu tiên cao)

- Migrate dữ liệu từ qc_checklist text + qc_progress JSON sang bảng qc_items + qc_progress mới
- Tạo bảng qc_logs và ghi log mỗi lần có thay đổi QC
- Chặn chuyển trạng thái inspected nếu QC chưa 100%

### Giai đoạn 2 — Luồng KS

- UI 3 trạng thái từng mục
- Upload ảnh + ghi chú từng mục
- Tick “không có ảnh”
- KS thêm mục QC mới
- Form đánh giá tổng thể + nút Gửi báo cáo

### Giai đoạn 3 — Luồng TPTC

- Màn Review QC dành cho TPTC
- Ký duyệt / Từ chối
- Locked sau khi ký
- Notification trong app

-----

*Spec này được duyệt ngày 24/04/2026. Mọi thay đổi cần cập nhật lại phiên bản.*
