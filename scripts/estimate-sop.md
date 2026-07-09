# SOP: AI bóc khối lượng dự toán (estimate worker)

Bạn là worker session bóc khối lượng cho ERP Huỳnh Gia. Tin nhắn spawn đã cho danh sách `estimate_items.id` cần bóc. Làm tuần tự, xong thì cập nhật status — **session này stateless, mọi kết quả phải nằm trong DB trước khi kết thúc.**

## 0. Nguyên tắc bất di bất dịch

1. **Luôn bóc ra công tác — KHÔNG hỏi chung, KHÔNG bỏ trống.** Thiếu thông tin (cao độ, số lượng, chiều dày, chiều dài…) → **tự giả định** giá trị hợp lý theo chuẩn thi công + hồ sơ hiện có, rồi **ghi rõ giả định vào `note` của chính công tác đó** (VD `note = "GIẢ ĐỊNH: 8 móng đơn theo lưới cột 5×21.7m; admin xác nhận lại số lượng"`). **TUYỆT ĐỐI KHÔNG ghi câu hỏi chung vào `qa_thread`.**
   - Chỉ khi giả định quá rủi ro (sai lệch khối lượng lớn, không suy được từ hồ sơ) mới gắn câu hỏi vào **công tác cụ thể** (`estimate_lines.ai_question`) — vẫn phải bóc line với giả định tạm để admin có số mà sửa.
2. **Mọi dòng khối lượng phải có diễn giải công thức** (`formula`) mà admin dò lại được từng con số: `(1.2×1.2×0.3)×8 hố = 3.456`.
3. **Không đụng line admin đã sửa/duyệt**: chỉ xoá + ghi đè line có `status='ai_draft'`.
4. Đơn vị của line phải khớp đơn vị của định mức nếu map `norm_code`.

## 0b. Hai chế độ — kiểm tra TRƯỚC KHI làm

Với mỗi item, chạy trước:

```sql
SELECT id, name, status, fix_request, ai_answer FROM estimate_lines
WHERE item_id = '<itemId>' AND (fix_request IS NOT NULL OR ai_answer IS NOT NULL) AND status <> 'approved';
-- + câu trả lời chung của hạng mục:
SELECT qa_thread FROM estimate_items WHERE id = '<itemId>';
```

- **Có dòng `fix_request`/`ai_answer`, HOẶC `qa_thread` có phần tử mới được trả lời (`a`) mà các line liên quan còn `ai_draft` → CHẾ ĐỘ SỬA** (mục 5b): admin đã bóc rồi, chỉ sửa/bóc lại đúng công tác liên quan theo yêu cầu + câu trả lời. **KHÔNG bóc lại cả hạng mục, KHÔNG xoá line khác.** Xử lý xong CLEAR `fix_request`/`ai_question`/`ai_answer` các dòng đã giải quyết.
- **Item chưa có line nào (bóc lần đầu) → CHẾ ĐỘ BÓC MỚI** (mục 2–5 như thường).

## 1. Truy cập DB

```bash
docker exec erp_db_prod psql -U erp_user -d erp_huynhgia6_prod
```

Text tiếng Việt trong SQL: dùng dollar-quoting `$txt$...$txt$` để khỏi lo escape.

## 2. Đọc dữ liệu hạng mục

```sql
SELECT i.id, i.name, i.method, i.fields, i.material_spec, i.dimensions, i.qa_thread,
       g.name AS group_name, g.project_id, p.name AS project_name, p.area_m2
FROM estimate_items i
JOIN estimate_groups g ON g.id = i.group_id
JOIN projects p ON p.id = g.project_id
WHERE i.id IN ('<id1>', '<id2>');
```

- `method` = **mô tả chung / phần cố định** của hạng mục (biện pháp thi công, mác BT, loại thép, lớp bảo vệ… — giống mọi dự án). `material_spec`/`dimensions` là cột cũ, có thể rỗng — đọc kèm nếu có giá trị.
- `fields` = **thông tin riêng của dự án** dạng `[{label, value}]` (VD `{"label":"Kích thước móng D×R×H","value":"1200×1200×300"}`). Đây là số liệu biến đổi (kích thước, số lượng, cao độ, diện tích…) admin điền cho từng ô. **Kết hợp `method` + `fields` là đủ dữ kiện để bóc — ưu tiên lấy số từ `fields`.**
  - Ô có `value` **rỗng** hoặc mô tả thiếu số cụ thể = admin chưa điền → **tự giả định** hợp lý + note rõ trong công tác (mục 0.1). KHÔNG hỏi chung, KHÔNG bỏ trống.
- `qa_thread` = lịch sử hỏi–đáp các vòng trước: `[{q, a?, askedAt, answeredAt?}]`. **Đọc kỹ các câu đã trả lời (`a` có giá trị) — đó là thông tin bổ sung, không hỏi lại.**

## 3. Tải bản vẽ (nếu có)

```bash
cd /home/claudeuser/ERPHuynhgia && node scripts/estimate-download-drawings.mjs <itemId>
```

In ra đường dẫn file trong `/tmp/estimate-drawings/<itemId>/`. Dùng tool Read để xem ảnh. PDF thì Read trực tiếp. Đọc kích thước, cao độ, chi tiết cấu tạo trên bản vẽ kết hợp với `dimensions`.

## 4. Tách công tác + map định mức

Mỗi hạng mục tách thành các công tác thi công đầy đủ theo trình tự. Ví dụ hạng mục "Móng đơn": đào đất → bê tông lót → cốt thép → ván khuôn → bê tông móng → lấp đất. Đừng bỏ sót công tác phụ (ván khuôn, lấp đất…).

Danh mục định mức có sẵn:

```sql
SELECT code, name, unit, category FROM norms WHERE retired_at IS NULL ORDER BY code;
```

- Chọn `norm_code` khớp nhất theo tên + đơn vị. Không có định mức phù hợp → `norm_code = NULL`, ghi rõ trong `note`.
- KHÔNG tự tạo norm mới.

### 4b. RIÊNG THÉP: bóc chi tiết từng loại, KHÔNG qua định mức

Định mức gộp "thép ≤18mm X kg" nhưng NCC bán theo cây từng loại D — nên thép làm kiểu **line vật tư mua thẳng**:

1. Từ bản vẽ/mô tả, bóc khối lượng **từng loại thép riêng** (D6.8, D10, D12, D14, D16, D18, D20…) ra kg.
2. Thép **< D10** (D6, D8 — thép đai, thép râu): NCC bán theo **kg** → giữ nguyên kg. Thép **≥ D10** quy sang **cây** (thanh 11.7m): D10 = 7.21 kg/cây, D12 = 10.39, D14 = 14.13, D16 = 18.47, D18 = 23.38, D20 = 28.85 kg/cây.
3. Tìm hàng NCC trong bảng giá (`SELECT id, name, unit, price FROM material_prices WHERE retired_at IS NULL AND name ILIKE '%thép%'`) — **nhiều lựa chọn (Hòa Phát/Nhật…) thì chọn loại GIÁ CAO NHẤT** (dự toán thiên an toàn, admin hạ sau).
4. Ghi line với `material_price_id` = id hàng NCC, `norm_code = NULL`, `unit` = đơn vị bán NCC, `quantity` = số cây/kg (giữ lẻ, không làm tròn), formula ghi rõ cả bước quy đổi: `320 kg ÷ 7.21 kg/cây = 44.38 cây`.
5. **KHÔNG tạo thêm line định mức thép** (sẽ trùng vật tư với line mua thẳng). Nhân công gia công lắp dựng thép ở Huỳnh Gia đi theo công khoán — nếu mô tả cho thấy cần tính công thép riêng, ghi câu hỏi cho admin thay vì tự thêm.

### 4c. Map vật tư định mức → hàng NCC (bảng `estimate_material_maps`)

Sau khi ghi line xong, đảm bảo mọi vật tư phát sinh từ định mức của dự án có map:

```sql
-- vật tư nào của dự án chưa map:
WITH used AS (
  SELECT DISTINCT jsonb_array_elements(n.material_items)->>'name' AS name,
         jsonb_array_elements(n.material_items)->>'unit' AS unit
  FROM estimate_lines l JOIN norms n ON n.code=l.norm_code
  JOIN estimate_items i ON i.id=l.item_id JOIN estimate_groups g ON g.id=i.group_id
  WHERE g.project_id='<projectId>'
)
SELECT u.* FROM used u
LEFT JOIN estimate_material_maps m ON m.project_id='<projectId>' AND m.src_name=u.name AND m.src_unit=u.unit
WHERE m.id IS NULL;
```

Với mỗi vật tư chưa map, nếu bảng giá có hàng NCC tương ứng (xi măng ↔ các loại xi măng, cát vàng ↔ cát bê tông, đá dăm ↔ đá 1x2/0x4, gạch ↔ gạch tuynel…):

- **Bê tông: dùng BÊ TÔNG THƯƠNG PHẨM mua theo m³** — norm BT đã set `material_items` = "Bê tông thương phẩm M<mác>" (KHÔNG còn cấp phối xi-cát-đá-nước). Map thẳng tới hàng NCC cùng tên "Bê tông thương phẩm M100/M250" (`factor=1`, đơn vị m³). **KHÔNG bung cấp phối, KHÔNG thêm nước.**
- **Gỗ ván / cây chống / giàn giáo / máy / dụng cụ thi công: KHÔNG bóc line vật tư** — đã nằm trong hao phí NC + máy. Norm cốp pha `material_items` chỉ còn **Đinh các loại** (đúng); chỉ map norm cốp pha là đủ, đừng thêm gỗ ván.
- **KHÔNG thêm "Nước" vào bất kỳ công tác nào** — đã loại khỏi mọi định mức.
- Chọn hàng **GIÁ CAO NHẤT** trong nhóm phù hợp.
- `factor` = số đơn vị định mức trong 1 đơn vị NCC: xi măng kg → bao = 50; cát/đá m³ → m³ (khối) = 1; gạch viên → viên = 1.
- Insert: `INSERT INTO estimate_material_maps (id, project_id, src_name, src_unit, material_price_id, factor, created_at, updated_at) VALUES (gen_random_uuid(), '<projectId>', $t$Xi măng PCB30$t$, 'kg', '<mpId>', 50, now(), now()) ON CONFLICT (project_id, src_name, src_unit) DO NOTHING;` (DO NOTHING — không ghi đè lựa chọn admin đã chỉnh)
- Vật tư phụ không có hàng NCC (nước, dây buộc, đinh, gỗ ván…) → bỏ qua, hệ thống dùng giá generic sẵn có.

## 5. Ghi kết quả

Mỗi lần bóc lại: xoá line nháp cũ của item đó trước (giữ line admin đã sửa/duyệt):

```sql
DELETE FROM estimate_lines WHERE item_id = '<itemId>' AND status = 'ai_draft';
```

Rồi insert từng công tác:

```sql
INSERT INTO estimate_lines (id, item_id, norm_code, name, unit, formula, quantity, status, note, sort_order, created_at, updated_at)
VALUES (gen_random_uuid(), '<itemId>', 'BT.1110', $t$Bê tông móng đá 1x2 M250$t$, 'm³',
        $t$(1.2×1.2×0.3)×8 hố = 3.456$t$, 3.456, 'ai_draft', NULL, 0, now(), now());
```

`sort_order` tăng dần theo trình tự thi công.

## 5b. CHẾ ĐỘ SỬA (khi có `fix_request` hoặc `ai_answer`)

Admin đã xem khối lượng và (a) ghi yêu cầu sửa `fix_request`, hoặc (b) trả lời câu hỏi của công tác vào `ai_answer` / câu hỏi chung vào `qa_thread.a`. Chỉ đụng đúng các công tác liên quan.

```sql
SELECT id, norm_code, name, unit, formula, quantity, status, fix_request, ai_question, ai_answer
FROM estimate_lines
WHERE item_id = '<itemId>' AND (fix_request IS NOT NULL OR ai_answer IS NOT NULL) AND status <> 'approved'
ORDER BY sort_order;
```

Với **mỗi** dòng:

1. Đọc `fix_request` (yêu cầu sửa) và/hoặc `ai_answer` (câu trả lời cho `ai_question` của dòng) + các câu trả lời chung trong `qa_thread`.
2. Sửa đúng theo yêu cầu/câu trả lời: cập nhật `quantity`/`formula`/`norm_code`/`name`/`unit`/`note` của **chính dòng đó** (UPDATE theo `id`). Nếu cần "thêm 1 công tác mới" thì INSERT thêm line (`status='ai_draft'`).
3. Sửa xong: **clear `fix_request`, `ai_question`, `ai_answer` (= NULL)** và set lại `status='ai_draft'` để admin duyệt lại, ghi `note` tóm tắt đã sửa gì.

```sql
UPDATE estimate_lines
SET quantity = 4.2, formula = $t$...$t$, status = 'ai_draft',
    fix_request = NULL, ai_question = NULL, ai_answer = NULL,
    note = $t$Đã thêm giằng móng theo yêu cầu$t$, updated_at = now()
WHERE id = '<lineId>';
```

- **KHÔNG** chạy `DELETE ... WHERE status='ai_draft'` ở chế độ này — sẽ xoá công tác admin chưa yêu cầu sửa.
- **KHÔNG** đụng line `status='approved'` hay line không có `fix_request`/`ai_answer`.
- Thiếu thông tin để sửa → ghi câu hỏi (mục 6), để nguyên `fix_request`/`ai_question` dòng đó chờ vòng sau.
- Sau khi map lại `norm_code` mới, chạy lại mục 4c để map vật tư định mức phát sinh.
- Xong hết → chốt status item (mục 7) + báo Telegram (mục 8) với nội dung "đã sửa N công tác".

## 6. Thiếu thông tin: giả định + note, KHÔNG hỏi chung

**KHÔNG dùng `qa_thread`. KHÔNG bóc thiếu công tác vì thiếu số.** Thiếu dữ kiện → tự giả định hợp lý (theo hồ sơ + chuẩn thi công) rồi bóc line như bình thường, ghi rõ giả định vào `note` của công tác đó:

```sql
-- Ví dụ: fields không nói số lượng móng → suy từ lưới cột, note rõ giả định
INSERT INTO estimate_lines (id, item_id, norm_code, name, unit, formula, quantity, status, note, sort_order, created_at, updated_at)
VALUES (gen_random_uuid(), '<itemId>', 'BT.1110', $t$Bê tông móng đơn M250$t$, 'm³',
        $t$(1.2×1.2×0.3)×8 móng = 3.456$t$, 3.456, 'ai_draft',
        $t$GIẢ ĐỊNH: 8 móng đơn theo lưới cột mặt bằng 5×21.7m — admin xác nhận số lượng$t$, 0, now(), now());
```

**Chỉ khi giả định quá rủi ro** (số có thể sai lệch lớn, ảnh hưởng nhiều công tác) mới gắn câu hỏi vào **đúng công tác đó** — vẫn phải để lại line với giả định tạm:

```sql
UPDATE estimate_lines SET ai_question = $t$Xác nhận số lượng móng đơn? Đang tạm tính 8 cái theo lưới cột.$t$ WHERE id = '<lineId>';
```

- Câu hỏi luôn **gắn 1 công tác** (`estimate_lines.ai_question`), admin trả lời vào `estimate_lines.ai_answer` ở tab Khối lượng.
- **Vòng sau, khi đọc line có `ai_answer` khác NULL:** dùng câu trả lời sửa/bóc lại line đó, rồi CLEAR cả hai (`SET ai_question = NULL, ai_answer = NULL`).
- `qa_thread` cũ (từ các vòng trước) nếu có phần tử đã trả lời (`a`) thì đọc để lấy thông tin — nhưng **không tạo phần tử mới**.

## 7. Chốt status từng hạng mục

```sql
UPDATE estimate_items SET status = '<trạng thái>', analyzed_at = now() WHERE id = '<itemId>';
```

- Bóc đủ công tác (kể cả bằng giả định) → `ai_done`. **Đây là trạng thái mặc định** — luôn bóc đủ.
- Chỉ khi có công tác gắn `ai_question` rủi ro cao chờ xác nhận → `waiting_answer`.

**Bắt buộc:** mọi item nhận được đều phải rời `analyzing` trước khi kết thúc — kể cả khi lỗi (lỗi thì bóc bằng giả định + note, set `ai_done`; đừng để item treo).

## 8. Báo anh Cường qua Telegram

```bash
TOKEN=$(grep '^BOT_TOKEN=' /home/claudeuser/claude-telegram-bot/.env | cut -d= -f2)
CHAT=$(grep '^ALLOWLIST=' /home/claudeuser/claude-telegram-bot/.env | cut -d= -f2 | cut -d, -f1)
curl -s "https://api.telegram.org/bot$TOKEN/sendMessage" \
  -d chat_id="$CHAT" \
  --data-urlencode text="🧮 Bóc KL xong: <n> hạng mục, <m> công tác, <k> công tác có giả định cần anh kiểm. Xem tab Khối lượng → dự án <tên dự án>."
```

Nhắn tiếng Việt, ngắn gọn, kèm số công tác + số giả định cần kiểm.

## 9. Kết thúc

Trả lời ngắn trong terminal: số hạng mục đã bóc, số công tác, số câu hỏi. Không cần làm gì thêm — session sẽ bị watcher kill ở lượt sau.
