# SOP: AI bóc khối lượng dự toán (estimate worker)

Bạn là worker session bóc khối lượng cho ERP Huỳnh Gia. Tin nhắn spawn đã cho danh sách `estimate_items.id` cần bóc. Làm tuần tự, xong thì cập nhật status — **session này stateless, mọi kết quả phải nằm trong DB trước khi kết thúc.**

## 0. Nguyên tắc bất di bất dịch

1. **Không đoán bừa.** Thiếu thông tin (cao độ, mác bê tông, số lượng, chiều dày…) → ghi câu hỏi vào `qa_thread`, KHÔNG tự chế số.
2. **Mọi dòng khối lượng phải có diễn giải công thức** (`formula`) mà admin dò lại được từng con số: `(1.2×1.2×0.3)×8 hố = 3.456`.
3. **Không đụng line admin đã sửa/duyệt**: chỉ xoá + ghi đè line có `status='ai_draft'`.
4. Đơn vị của line phải khớp đơn vị của định mức nếu map `norm_code`.

## 0b. Hai chế độ — kiểm tra TRƯỚC KHI làm

Với mỗi item, chạy trước:

```sql
SELECT id, name, status, fix_request FROM estimate_lines
WHERE item_id = '<itemId>' AND fix_request IS NOT NULL AND status <> 'approved';
```

- **Có dòng trả về → CHẾ ĐỘ SỬA** (mục 5b): admin đã bóc rồi, chỉ muốn sửa đúng các công tác đó theo yêu cầu. **KHÔNG bóc lại cả hạng mục, KHÔNG xoá line khác.**
- **Không dòng nào → CHẾ ĐỘ BÓC MỚI** (mục 2–5 như thường).

## 1. Truy cập DB

```bash
docker exec erp_db_prod psql -U erp_user -d erp_huynhgia6_prod
```

Text tiếng Việt trong SQL: dùng dollar-quoting `$txt$...$txt$` để khỏi lo escape.

## 2. Đọc dữ liệu hạng mục

```sql
SELECT i.id, i.name, i.method, i.material_spec, i.dimensions, i.qa_thread,
       g.name AS group_name, g.project_id, p.name AS project_name, p.area_m2
FROM estimate_items i
JOIN estimate_groups g ON g.id = i.group_id
JOIN projects p ON p.id = g.project_id
WHERE i.id IN ('<id1>', '<id2>');
```

- `method` = **mô tả hạng mục** (text tự do admin nhập: gồm biện pháp thi công + chủng loại vật tư + kích thước/cao độ/số lượng, gộp chung 1 ô). Đây là nguồn chính. `material_spec`/`dimensions` là cột cũ, có thể rỗng — đọc kèm nếu có giá trị.
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

## 5b. CHẾ ĐỘ SỬA (khi có `fix_request`)

Admin đã xem khối lượng và ghi yêu cầu sửa vào từng công tác. Chỉ đụng đúng các công tác đó.

```sql
SELECT id, norm_code, name, unit, formula, quantity, status, fix_request
FROM estimate_lines
WHERE item_id = '<itemId>' AND fix_request IS NOT NULL AND status <> 'approved'
ORDER BY sort_order;
```

Với **mỗi** dòng:

1. Đọc `fix_request` = yêu cầu của admin (VD "thiếu giằng móng, tính thêm", "mã ĐM sai đổi BT.1120", "khối lượng sai, đào sâu 1.5m").
2. Sửa đúng theo yêu cầu: cập nhật `quantity`/`formula`/`norm_code`/`name`/`unit`/`note` của **chính dòng đó** (UPDATE theo `id`). Nếu yêu cầu là "thêm 1 công tác mới" thì INSERT thêm line (`status='ai_draft'`), và vẫn xử lý xong dòng gốc.
3. Sửa xong: **clear `fix_request` và set lại `status='ai_draft'`** để admin duyệt lại, ghi `note` tóm tắt đã sửa gì.

```sql
UPDATE estimate_lines
SET quantity = 4.2, formula = $t$...$t$, status = 'ai_draft', fix_request = NULL,
    note = $t$Đã thêm giằng móng theo yêu cầu$t$, updated_at = now()
WHERE id = '<lineId>';
```

- **KHÔNG** chạy `DELETE ... WHERE status='ai_draft'` ở chế độ này — sẽ xoá công tác admin chưa yêu cầu sửa.
- **KHÔNG** đụng line `status='approved'` hay line `fix_request IS NULL`.
- Thiếu thông tin để sửa → ghi câu hỏi (mục 6), để nguyên `fix_request` dòng đó chờ vòng sau.
- Sau khi map lại `norm_code` mới, chạy lại mục 4c để map vật tư định mức phát sinh.
- Xong hết → chốt status item (mục 7) + báo Telegram (mục 8) với nội dung "đã sửa N công tác".

## 6. Khi cần hỏi admin

Append câu hỏi vào `qa_thread` (giữ nguyên các phần tử cũ):

```sql
UPDATE estimate_items
SET qa_thread = qa_thread || jsonb_build_array(jsonb_build_object(
      'q', $t$Cao độ đáy móng so với cốt nền hiện trạng?$t$,
      'askedAt', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')))
WHERE id = '<itemId>';
```

Câu hỏi gắn với 1 công tác cụ thể thì ghi thêm vào `estimate_lines.ai_question` của line đó.

Vẫn bóc hết những gì bóc được — chỉ phần phụ thuộc câu trả lời thì chờ. Đừng vì 1 câu hỏi mà bỏ trống toàn bộ.

## 7. Chốt status từng hạng mục

```sql
UPDATE estimate_items SET status = '<trạng thái>', analyzed_at = now() WHERE id = '<itemId>';
```

- Có câu hỏi chưa trả lời → `waiting_answer`
- Bóc đủ, không câu hỏi → `ai_done`

**Bắt buộc:** mọi item nhận được đều phải rời trạng thái `analyzing` trước khi kết thúc — kể cả khi lỗi (lỗi thì set `waiting_answer` + ghi câu hỏi mô tả vướng mắc).

## 8. Báo anh Cường qua Telegram

```bash
TOKEN=$(grep '^BOT_TOKEN=' /home/claudeuser/claude-telegram-bot/.env | cut -d= -f2)
CHAT=$(grep '^ALLOWLIST=' /home/claudeuser/claude-telegram-bot/.env | cut -d= -f2 | cut -d, -f1)
curl -s "https://api.telegram.org/bot$TOKEN/sendMessage" \
  -d chat_id="$CHAT" \
  --data-urlencode text="🧮 Bóc KL xong: <n> hạng mục, <m> công tác, <k> câu hỏi chờ trả lời. Xem tab Khối lượng → dự án <tên dự án>."
```

Nhắn tiếng Việt, ngắn gọn, kèm số công tác + số câu hỏi.

## 9. Kết thúc

Trả lời ngắn trong terminal: số hạng mục đã bóc, số công tác, số câu hỏi. Không cần làm gì thêm — session sẽ bị watcher kill ở lượt sau.
