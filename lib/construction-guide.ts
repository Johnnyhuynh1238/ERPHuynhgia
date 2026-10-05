// Hướng dẫn thi công & nghiệm thu — tài liệu IN cho giám sát dùng giấy tại công trình.
// Mỗi hạng mục của HĐ (quote_data: thoPhanBaoGia + hoanThien) = 1 hướng dẫn gồm:
//   phạm vi theo HĐ + vật tư sử dụng (mới nhất theo phụ lục, từ buildPurchaseGuide)
//   + các điểm dừng nghiệm thu (tiêu chí chuẩn theo loại hạng mục, khớp tên — KINDS bên dưới).
// Thêm loại hạng mục mới = thêm 1 phần tử KINDS (đặt loại cụ thể trước loại chung).

import { buildPurchaseGuide, type GuideAdjust, type GuideGroup } from "./purchase-guide";
import { receiveCheckFor } from "./receiving-check";

export type CgCrit = { noi: string; yc: string }; // nội dung kiểm tra — yêu cầu / sai số
export type CgStage = { title: string; when?: RegExp; items: CgCrit[] };
export type CgVt = {
  ten: string;
  loai: string;
  quycach: string;
  khachCap: boolean;
  src: string; // nhãn phụ lục nếu đã đổi so với HĐ gốc
  check: string[]; // kiểm khi nhận hàng
};
export type CgItem = {
  no: number;
  name: string;
  kind: "tho" | "ht";
  scope: string[];
  notes: string[];
  vt: CgVt[];
  stages: { no: string; title: string; items: CgCrit[] }[];
};
export type ConstructionGuide = { items: CgItem[]; excluded: { ten: string; ghi: string }[] };

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d");
const c = (noi: string, yc: string): CgCrit => ({ noi, yc });

type Kind = { re: RegExp; vtRe?: RegExp; stages: CgStage[] };

// ───────────────────────── Tiêu chí chuẩn theo loại hạng mục ─────────────────────────
// Sai số tham khảo TCVN 4453:1995 (BTCT toàn khối), TCVN 4085:2011 (khối xây), TCVN 9377 (hoàn thiện).
// Bản vẽ KC/KT của công trình là căn cứ cao nhất.
const KINDS: Kind[] = [
  {
    re: /nen mong|\bmong\b/,
    vtRe: /be tong|thep|gach|xi mang|cat|da\b/,
    stages: [
      {
        title: "Định vị tim trục, đào hố móng",
        items: [
          c("Tim trục, vị trí móng", "Đúng bản vẽ; sai lệch tim ≤ 10mm"),
          c("Kích thước, cao độ đáy hố móng", "Đúng bản vẽ; đáy phẳng, sạch, không đọng nước, không bùn"),
          c("Nền đất đáy móng", "Đất nguyên thổ / đầm chặt; không đặt móng lên đất đắp xốp"),
        ],
      },
      {
        title: "Cốp pha + cốt thép móng, cổ móng, đà kiềng (trước khi đổ bê tông)",
        items: [
          c("Đường kính, số lượng thanh thép chủ", "Đúng bản vẽ KC; đếm từng cấu kiện"),
          c("Khoảng cách thép đai", "Đúng bản vẽ; vùng gần cột đai dày theo bản vẽ; sai lệch ≤ 10mm"),
          c("Nối thép, neo thép", "Chiều dài nối chồng / neo đúng bản vẽ; mối nối so le, không nối tại vị trí cấm"),
          c("Thép chờ cột", "Đúng vị trí, đủ số lượng, đủ chiều dài chờ"),
          c("Con kê lớp bê tông bảo vệ", "Kê đủ, đúng chiều dày bản vẽ; thép không chạm đất / cốp pha"),
          c("Cốp pha: kích thước, cao độ", "Đúng tiết diện (sai lệch ≤ 5mm); cao độ mặt đà kiềng đúng bản vẽ"),
          c("Cốp pha: độ kín, chắc chắn", "Kín khít không mất nước xi măng; cây chống, gông chắc chắn"),
          c("Vệ sinh trước khi đổ", "Sạch đất, rác, dăm gỗ; thép không dính bùn, dầu"),
        ],
      },
      {
        title: "Đổ bê tông móng, cổ móng, đà kiềng",
        items: [
          c("Mác / cấp phối bê tông", "Đúng HĐ; trộn tay đúng cấp phối, thương phẩm đúng phiếu xuất"),
          c("Đầm bê tông", "Đầm dùi kỹ từng lớp, không bỏ sót góc, không chạm làm xô thép"),
          c("Mặt bê tông", "Đúng cao độ, cán phẳng"),
          c("Bảo dưỡng", "Tưới ẩm liên tục tối thiểu 7 ngày"),
        ],
      },
      {
        title: "Tháo cốp pha — kiểm tra bê tông móng, đà kiềng",
        items: [
          c("Bề mặt bê tông", "Không rỗ tổ ong, không lộ thép; rỗ nhẹ phải báo trước khi xử lý"),
          c("Kích thước, cao độ cấu kiện", "Đúng bản vẽ; cao độ mặt đà kiềng sai lệch ≤ 10mm"),
          c("Thép chờ cột", "Thẳng, đúng vị trí, không bị cong gãy"),
        ],
      },
      {
        title: "Xây tường bao nền / tường móng",
        when: /tuong bao nen|tuong mong|xay mong/,
        items: [
          c("Loại gạch, mác vữa", "Đúng HĐ (gạch ống cháy / gạch đặc theo HĐ)"),
          c("Mạch vữa", "Đầy vữa; mạch ngang ~12mm, mạch đứng ~10mm (8–15mm); so le ≥ 1/4 viên"),
          c("Độ thẳng đứng, ngang bằng", "Thả dọi, căng dây; sai lệch ≤ 10mm"),
          c("Chiều cao, chiều dày tường", "Đúng bản vẽ"),
        ],
      },
      {
        title: "Bể tự hoại (bể phốt)",
        when: /be phot|tu hoai/,
        items: [
          c("Vị trí, kích thước, cao độ đáy bể", "Đúng bản vẽ cấp thoát nước"),
          c("Ống vào / ra / thông hơi", "Đúng vị trí, đúng cao độ, có độ dốc"),
          c("Trát thành bể, chống thấm", "Trát kín 2 lớp, không nứt"),
          c("Thử nước", "Ngâm nước ≥ 24 giờ, mực nước không tụt"),
        ],
      },
    ],
  },
  {
    re: /ket cau|khung be tong|\bcot\b|\bdam\b/,
    vtRe: /be tong|thep|xi mang|cat|da\b/,
    stages: [
      {
        title: "Cốt thép + cốp pha cột (trước khi đổ)",
        items: [
          c("Thép chủ cột", "Đúng Ø, số lượng theo bản vẽ KC"),
          c("Thép đai cột", "Đúng Ø, khoảng cách; đai dày ở đầu và chân cột theo bản vẽ"),
          c("Nối thép cột", "Chiều dài nối chồng đúng bản vẽ, so le"),
          c("Con kê lớp bảo vệ", "Đủ con kê 4 mặt, đúng chiều dày bản vẽ"),
          c("Cốp pha cột: tiết diện, tim", "Sai lệch tiết diện ≤ 5mm; đúng tim trục"),
          c("Độ thẳng đứng cốp pha cột", "Thả dọi 2 phương; sai lệch ≤ 5mm/m, cả cột ≤ 10mm"),
          c("Chân cột", "Đục nhám, vệ sinh sạch mặt bê tông cũ; bịt kín chân cốp pha"),
        ],
      },
      {
        title: "Đổ bê tông cột",
        items: [
          c("Mác / cấp phối", "Đúng HĐ"),
          c("Đổ và đầm", "Đổ theo lớp, đầm kỹ; chiều cao rơi tự do lớn phải có máng/ống"),
          c("Bảo dưỡng", "Tưới ẩm tối thiểu 7 ngày"),
        ],
      },
      {
        title: "Cốp pha + cốt thép dầm, sàn (trước khi đổ)",
        items: [
          c("Cao độ đáy dầm, đáy sàn", "Đúng bản vẽ; sai lệch ≤ 10mm"),
          c("Hệ chống đỡ", "Cây chống đủ, kê chân chắc, có giằng; không lún"),
          c("Thép chủ dầm (lớp trên, lớp dưới)", "Đúng Ø, số lượng, vị trí cắt thép theo bản vẽ"),
          c("Thép đai dầm", "Đúng Ø, khoảng cách; đai dày gần gối theo bản vẽ"),
          c("Thép sàn 2 lớp", "Đúng Ø, khoảng cách (sai lệch ≤ 20mm); thép mũ đủ chiều dài; có chân ghế giữ lớp trên"),
          c("Chiều dày sàn", "Đúng bản vẽ (VD sàn 100mm); đánh dấu cốt mặt sàn"),
          c("Ống chờ điện nước, lỗ chờ", "Đã đặt đủ trước khi đổ; đúng vị trí"),
          c("Con kê, vệ sinh", "Đủ con kê; sạch rác, tưới ẩm cốp pha trước khi đổ"),
        ],
      },
      {
        title: "Đổ bê tông dầm, sàn",
        items: [
          c("Mác / cấp phối", "Đúng HĐ; đổ liên tục, mạch ngừng đúng vị trí cho phép"),
          c("Đầm, cán mặt", "Đầm dùi dầm, đầm bàn sàn; mặt sàn phẳng, đúng cao độ, đúng dốc"),
          c("Bảo dưỡng", "Tưới ẩm / phủ bao tối thiểu 7 ngày; không chất tải sớm"),
        ],
      },
      {
        title: "Tháo cốp pha — kiểm tra bê tông khung",
        items: [
          c("Thời gian tháo", "Cột ≥ 2 ngày; đáy dầm, sàn khi bê tông đủ cường độ (thường ≥ 14–21 ngày, giữ chống lại)"),
          c("Bề mặt bê tông", "Không rỗ, không lộ thép, không nứt"),
          c("Kích thước, độ thẳng", "Cột thẳng đứng, dầm thẳng; sai lệch trong giới hạn bản vẽ"),
          c("Sàn: võng, nứt", "Không võng nhìn thấy bằng mắt, không nứt"),
        ],
      },
    ],
  },
  {
    re: /xay|(^|\s)to(\s|$)|to trat/,
    vtRe: /gach|xi mang|cat|vua|luoi/,
    stages: [
      {
        title: "Xây tường",
        items: [
          c("Vị trí, tim tường, chiều dày", "Đúng bản vẽ KT; tường 100/200 đúng loại"),
          c("Gạch, vữa", "Gạch tưới ẩm trước khi xây; vữa đúng mác, dùng trong ~2 giờ"),
          c("Mạch vữa", "Đầy vữa; mạch ngang ~12mm, mạch đứng ~10mm (8–15mm); so le ≥ 1/4 viên"),
          c("Độ thẳng đứng, ngang bằng, phẳng mặt", "Thả dọi, căng dây; sai lệch ≤ 10mm"),
          c("Liên kết tường – cột", "Râu thép / liên kết neo vào cột theo bản vẽ; khe tiếp giáp chèn kín"),
          c("Lanh tô, ô cửa", "Lanh tô đủ, gác mỗi bên ≥ 200mm; ô cửa đúng kích thước, vuông góc"),
          c("Xây chèn đỉnh tường", "Xây nghiêng / chèn kín sát đáy dầm"),
        ],
      },
      {
        title: "Trước khi tô (sau đi điện nước âm tường)",
        items: [
          c("Ống điện nước âm tường", "Đã nghiệm thu điện nước thô; rãnh cắt trám kín"),
          c("Lưới chống nứt", "Đóng lưới tại vị trí tiếp giáp tường – cột – dầm và rãnh đi ống"),
          c("Mốc tô", "Gắn mốc / ghém đủ để đảm bảo độ phẳng"),
          c("Bề mặt", "Vệ sinh sạch, tưới ẩm; mặt bê tông được đánh nhám / hồ dầu"),
        ],
      },
      {
        title: "Tô trát",
        items: [
          c("Độ phẳng", "Áp thước 2m: khe hở ≤ 3mm"),
          c("Độ thẳng đứng, góc cạnh", "Thẳng đứng; góc, cạnh cửa sắc, vuông"),
          c("Bám dính", "Gõ không bộp, không nứt chân chim, không phồng"),
          c("Chiều dày lớp tô", "Đúng HĐ (thường 15mm); tô dày phải chia lớp"),
          c("Bảo dưỡng", "Tưới ẩm 2–3 ngày sau tô"),
        ],
      },
      {
        title: "Cán vữa lót nền",
        when: /lot nen|can nen/,
        items: [
          c("Nền trước khi cán", "Đầm chặt, sạch, tưới ẩm"),
          c("Cao độ, độ dốc", "Đúng cao độ hoàn thiện trừ chiều dày gạch; khu ướt dốc về phễu thu"),
          c("Độ phẳng", "Áp thước 2m: khe hở ≤ 5mm"),
        ],
      },
    ],
  },
  {
    re: /mai ton|\bmai\b/,
    stages: [
      {
        title: "Khung kèo, xà gồ",
        items: [
          c("Chủng loại thép hộp", "Đúng quy cách HĐ (kích thước, độ dày li)"),
          c("Khoảng cách xà gồ, vì kèo", "Đúng bản vẽ"),
          c("Liên kết hàn / bu lông", "Mối hàn đầy, không rỗ, không nứt; bu lông đủ, siết chặt"),
          c("Sơn chống rỉ", "Sơn kín các mối hàn, vị trí trầy mạ kẽm"),
          c("Độ dốc mái", "Đúng bản vẽ; thoát về seno / máng xối"),
        ],
      },
      {
        title: "Lợp tôn, úp nóc, máng xối",
        items: [
          c("Tôn", "Đúng hãng, độ dày, màu theo HĐ"),
          c("Chồng mí", "Chồng ≥ 1 sóng, xuôi chiều gió; hàng tôn thẳng"),
          c("Vít", "Đủ số vít, có long đen cao su, bắn vào đỉnh sóng"),
          c("Úp nóc, diềm, máng xối, seno", "Kín nước; máng có độ dốc về ống thoát"),
          c("Thử nước", "Xịt nước / sau cơn mưa: không dột, không đọng"),
        ],
      },
    ],
  },
  {
    re: /chong tham tuong|tuong ngoai/,
    stages: [
      {
        title: "Chuẩn bị bề mặt",
        items: [
          c("Phạm vi", "Đúng các mặt tường / trục theo HĐ"),
          c("Bề mặt tường", "Khô, sạch, đã xử lý vết nứt và lỗ ty; không bụi, không rêu"),
        ],
      },
      {
        title: "Thi công chống thấm tường ngoài",
        items: [
          c("Vật liệu", "Đúng sản phẩm HĐ, còn hạn"),
          c("Số lớp, định mức", "Đủ số lớp theo hướng dẫn nhà sản xuất; lớp sau khi lớp trước khô"),
          c("Bề mặt sau thi công", "Phủ kín đều, không bỏ sót góc, chân tường, mép cửa"),
        ],
      },
    ],
  },
  {
    re: /chong tham/,
    stages: [
      {
        title: "Chuẩn bị bề mặt, cổ ống",
        items: [
          c("Bề mặt", "Phẳng, sạch, không đọng nước; vết nứt / rỗ đã xử lý"),
          c("Cổ ống xuyên sàn", "Đục rộng, đổ vữa không co ngót + gioăng trương nở"),
          c("Góc tường – sàn", "Bo góc vữa / gia cường lưới theo quy trình"),
        ],
      },
      {
        title: "Thi công lớp chống thấm",
        items: [
          c("Vật liệu", "Đúng sản phẩm HĐ, còn hạn, trộn đúng tỉ lệ"),
          c("Phạm vi", "Đủ diện tích; WC kéo lên chân tường và tường khu tắm đúng chiều cao HĐ"),
          c("Số lớp", "Đủ số lớp; lớp sau quét vuông góc lớp trước, khi lớp trước khô"),
        ],
      },
      {
        title: "Ngâm nước thử",
        items: [
          c("Ngâm nước", "Ngâm ≥ 24–48 giờ, nước cao ~5cm"),
          c("Kiểm tra mặt dưới / tường lân cận", "Không thấm, không ẩm loang; mực nước không tụt"),
        ],
      },
    ],
  },
  {
    re: /di am|dien nuoc|dien tho|nuoc tho/,
    stages: [
      {
        title: "Điện âm tường / âm trần",
        items: [
          c("Tuyến ống luồn", "Đúng sơ đồ; ống chạy thẳng, cố định chắc; đầu ống bịt kín"),
          c("Dây dẫn", "Đúng hãng, đúng tiết diện từng nhánh theo sơ đồ nguyên lý"),
          c("Màu dây", "Phân biệt pha / trung tính / tiếp địa"),
          c("Đế âm, hộp nối", "Đúng vị trí, cao độ, cân bằng; không nối dây trong ống"),
          c("Đo kiểm", "Thông mạch từng nhánh; đo cách điện trước khi tô"),
        ],
      },
      {
        title: "Cấp nước âm",
        items: [
          c("Tuyến ống", "Đúng bản vẽ; nóng / lạnh tách riêng"),
          c("Mối hàn nhiệt PPR", "Đúng nhiệt, không bavia, không cong"),
          c("Đầu chờ thiết bị", "Đúng vị trí, cao độ; bịt đầu"),
          c("Thử áp", "Bơm thử áp (thường 1,5 lần áp làm việc, ~10 bar) giữ ≥ 30 phút không tụt, không rò"),
        ],
      },
      {
        title: "Thoát nước",
        items: [
          c("Tuyến ống, đường kính", "Đúng bản vẽ; ống xí riêng, có thông hơi"),
          c("Độ dốc", "Ống nhánh ≥ 2%, ống chính ≥ 1%; không võng"),
          c("Keo nối, phụ kiện", "Bôi keo kín; dùng co lơi / chếch, hạn chế co vuông"),
          c("Thử thông nước", "Đổ nước thử từng nhánh: thoát nhanh, không rò"),
        ],
      },
    ],
  },
  {
    re: /thach cao|\btran\b/,
    stages: [
      {
        title: "Khung xương trần",
        items: [
          c("Cao độ trần", "Đúng bản vẽ; bắn mực cao độ quanh tường"),
          c("Khoảng cách thanh chính, thanh phụ, ty treo", "Đúng tiêu chuẩn nhà sản xuất khung"),
          c("Độ phẳng khung", "Căng dây kiểm tra, không võng"),
          c("Điện, ống trên trần", "Đi xong, đã nghiệm thu trước khi đóng tấm"),
        ],
      },
      {
        title: "Tấm trần, xử lý mối nối",
        items: [
          c("Tấm", "Đúng loại, độ dày; khu WC / bếp dùng tấm chịu ẩm"),
          c("Vít", "Đủ vít, khoảng cách đều, mũ vít chìm không thủng giấy"),
          c("Mối nối", "Băng lưới + bột; không nứt sau khi bả"),
          c("Độ phẳng mặt trần", "Không võng, không gợn mối nối khi soi đèn"),
          c("Lỗ đèn, lỗ thăm", "Đúng vị trí, cắt gọn"),
        ],
      },
    ],
  },
  {
    re: /\bson\b|bot ba/,
    stages: [
      {
        title: "Bả matit",
        items: [
          c("Bề mặt trước khi bả", "Tường khô, sạch; đã xử lý nứt, lỗ"),
          c("Số lớp bả", "Đúng HĐ (thường 2 lớp)"),
          c("Độ phẳng sau xả nhám", "Soi đèn không gợn, không lượn sóng"),
        ],
      },
      {
        title: "Sơn lót, sơn phủ",
        items: [
          c("Sơn", "Đúng hãng, dòng sản phẩm, mã màu HĐ / chủ nhà chốt"),
          c("Số lớp", "Lót 1 lớp + phủ đủ số lớp theo HĐ"),
          c("Bề mặt sơn", "Màu đều, không loang, không vệt chổi lăn, không bong"),
          c("Mép, góc giáp ranh", "Sắc gọn; không dính sơn sang trần, cửa, ổ điện"),
        ],
      },
    ],
  },
  {
    re: /op lat|gach op|lat nen/,
    stages: [
      {
        title: "Lát nền",
        items: [
          c("Gạch", "Đúng mã, cùng lô; chọn mặt, chia gạch trước khi lát"),
          c("Cao độ, độ dốc", "Đúng cao độ hoàn thiện; khu ướt dốc về phễu thu, không đọng nước"),
          c("Độ phẳng", "Áp thước 2m: khe hở ≤ 2mm; chênh mép 2 viên ≤ 1mm"),
          c("Mạch gạch", "Thẳng, đều; đúng độ rộng mạch"),
          c("Bám dính", "Gõ không bộp"),
        ],
      },
      {
        title: "Ốp tường, len chân tường",
        items: [
          c("Chiều cao ốp", "Đúng HĐ (VD WC cao 2,7m)"),
          c("Độ thẳng đứng, phẳng", "Thả dọi, áp thước 2m: khe hở ≤ 2mm"),
          c("Mạch, góc", "Mạch đều thẳng hàng với nền; góc cắt gọn / nẹp"),
          c("Lỗ chờ thiết bị", "Khoét đúng vị trí, gọn"),
          c("Bám dính, chà ron", "Gõ không bộp; ron chà kín, sạch"),
        ],
      },
    ],
  },
  {
    re: /cua nhom|nhom kinh|xingfa/,
    stages: [
      {
        title: "Lắp đặt cửa nhôm kính",
        items: [
          c("Chủng loại", "Đúng hệ nhôm, màu, độ dày kính theo HĐ; có tem"),
          c("Kích thước, số lượng", "Đúng bảng thống kê cửa"),
          c("Khung", "Thẳng đứng, vuông góc; bắt vít nở đủ"),
          c("Khe khung – tường", "Bơm keo / foam kín, không thấm"),
          c("Vận hành", "Cánh đóng mở êm, khoá chốt hoạt động; không cạ"),
          c("Bề mặt", "Không trầy, móp; kính không vỡ mẻ"),
        ],
      },
    ],
  },
  {
    re: /cua phong|cua (nhua|go|composite)/,
    stages: [
      {
        title: "Lắp đặt cửa phòng",
        items: [
          c("Chủng loại, màu, kích thước", "Đúng HĐ và bảng thống kê cửa"),
          c("Khung bao", "Thẳng đứng, vuông góc, chắc chắn"),
          c("Phụ kiện", "Đủ khoá, bản lề, chặn cửa"),
          c("Vận hành", "Đóng mở êm, khe hở đều, khoá hoạt động"),
          c("Bề mặt", "Không nứt, trầy"),
        ],
      },
    ],
  },
  {
    re: /thiet bi ve sinh/,
    stages: [
      {
        title: "Lắp đặt thiết bị vệ sinh",
        items: [
          c("Thiết bị", "Đúng mẫu đã chốt; đủ phụ kiện"),
          c("Vị trí, cao độ", "Đúng bản vẽ; cân bằng, chắc chắn"),
          c("Mối nối cấp / thoát", "Không rò rỉ; bồn cầu trám kín chân"),
          c("Vận hành", "Xả, cấp nước thử: thoát tốt, không rò"),
          c("Bề mặt", "Không nứt men, trầy"),
        ],
      },
    ],
  },
  {
    re: /thiet bi dien|dien hoan thien/,
    stages: [
      {
        title: "Lắp đặt thiết bị điện",
        items: [
          c("Thiết bị", "Đúng hãng, mã, số lượng theo HĐ"),
          c("Đèn, công tắc, ổ cắm", "Đúng vị trí, ngay hàng, mặt áp sát tường"),
          c("Tủ điện, CB", "Đúng sơ đồ nhánh; dán nhãn từng CB"),
          c("Đấu nối", "Chắc chắn; ổ cắm có tiếp địa (nếu có)"),
          c("Thử vận hành", "Bật thử toàn bộ: đèn sáng, ổ có điện, CB không nhảy"),
        ],
      },
    ],
  },
  {
    re: /cap thoat nuoc|hoan thien nuoc/,
    stages: [
      {
        title: "Hoàn thiện cấp thoát nước",
        items: [
          c("Bồn nước, máy bơm", "Đúng hãng, dung tích; đặt chắc chắn, đúng vị trí"),
          c("Van, dây cấp, xi phông, phễu thu", "Đủ, đúng chủng loại; lắp kín"),
          c("Vận hành", "Bơm tự ngắt; mở thử các điểm dùng nước: đủ áp, không rò"),
          c("Thoát sàn", "Đổ nước: thoát nhanh, không đọng"),
        ],
      },
    ],
  },
  {
    re: /granite|da (tam cap|op)/,
    stages: [
      {
        title: "Lắp đặt đá granite",
        items: [
          c("Đá", "Đúng màu, độ dày; không nứt, mẻ"),
          c("Vị trí", "Đủ các vị trí theo HĐ (tam cấp, kệ, bậu cửa…)"),
          c("Độ phẳng, cao độ", "Phẳng, đúng cao độ; bậu cửa sổ dốc ra ngoài"),
          c("Mép, mạch", "Mài cạnh gọn; mạch kín, đều"),
          c("Bám dính", "Gõ không bộp"),
        ],
      },
    ],
  },
  {
    re: /ve sinh/,
    stages: [
      {
        title: "Vệ sinh công nghiệp trước bàn giao",
        items: [
          c("Phạm vi", "Toàn bộ diện tích theo HĐ"),
          c("Sàn, tường, kính", "Sạch vết xi măng, sơn; kính không ố"),
          c("Thiết bị", "Lau sạch thiết bị vệ sinh, điện; bóc màng bảo vệ"),
          c("Rác thải", "Dọn sạch, vận chuyển khỏi công trình"),
        ],
      },
    ],
  },
];

const GENERIC: CgStage[] = [
  {
    title: "Nghiệm thu hoàn thành hạng mục",
    items: [
      c("Vật tư", "Đúng chủng loại, quy cách theo HĐ / phụ lục"),
      c("Phạm vi, khối lượng", "Đủ theo HĐ"),
      c("Kỹ thuật, thẩm mỹ", "Đúng bản vẽ; bề mặt hoàn thiện đạt yêu cầu"),
      c("Vận hành (nếu có)", "Chạy thử đạt"),
    ],
  },
];

// ───────────────────────── Dựng tài liệu ─────────────────────────
const str = (v: unknown) => (typeof v === "string" ? v.replace(/ /g, " ").trim() : "");
const arr = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Record<string, unknown>[]) : [];
const bullets = (s: string) =>
  s
    .split(/\n+/)
    .map((x) => x.replace(/^[•\s]+/, "").trim())
    .filter(Boolean);

function vtOf(g: GuideGroup | undefined, vtRe?: RegExp): CgVt[] {
  if (!g) return [];
  return g.rows
    .filter((r) => !vtRe || vtRe.test(norm(r.ten)))
    .map((r) => {
      const a = r.adjust ?? g.adjust;
      const kc = a?.mode === "khach_cap";
      const loai = (!kc && a?.loai) || r.loai;
      return {
        ten: r.ten,
        loai,
        quycach: (!kc && a?.quycach) || r.quycach,
        khachCap: kc,
        src: a ? a.source || "Phụ lục" : "",
        check: kc ? [] : receiveCheckFor(r.ten, loai).check,
      };
    });
}

export function buildConstructionGuide(quoteData: unknown, adjusts: GuideAdjust[]): ConstructionGuide {
  const q = (quoteData && typeof quoteData === "object" ? quoteData : {}) as Record<string, unknown>;
  const pg = buildPurchaseGuide(quoteData, adjusts);
  const items: CgItem[] = [];

  // Tên các công tác chi tiết theo nhóm (để bật điểm dừng tuỳ chọn, VD bể phốt / tường bao nền)
  const hmText = arr(q.thoHangMuc)
    .map((h) => `${str(h.nhom)} ${str(h.ten)}`)
    .join(" | ");

  const pick = (name: string) => KINDS.find((k) => k.re.test(norm(name)));
  const stagesFor = (kind: Kind | undefined, ctx: string, no: number) =>
    (kind ? kind.stages : GENERIC)
      .filter((s) => !s.when || s.when.test(norm(ctx)))
      .map((s, i) => ({ no: `${no}.${i + 1}`, title: s.title, items: s.items }));

  for (const p of arr(q.thoPhanBaoGia)) {
    const name = str(p.name) || "Hạng mục";
    const kind = pick(name.replace(/^phần\s+/i, ""));
    const no = items.length + 1;
    const scope = str(p.dienGiai);
    // phạm vi + tên công tác chi tiết cùng nhóm VT → bật điểm dừng tuỳ chọn (when)
    const ctx = `${scope} ${hmText
      .split(" | ")
      .filter((t) => t.startsWith(str(p.nhomVt)))
      .join(" ")}`;
    items.push({
      no,
      name,
      kind: "tho",
      scope: scope ? [scope] : [],
      notes: [],
      vt: vtOf(
        pg.tho.find((g) => g.name === (str(p.nhomVt) || name)),
        kind?.vtRe,
      ),
      stages: stagesFor(kind, ctx, no),
    });
  }

  for (const h of arr(q.hoanThien)) {
    const name = str(h.name) || "Hạng mục";
    const kind = pick(name);
    const no = items.length + 1;
    const scope = arr(h.costs)
      .map((x) => str(x.label))
      .filter(Boolean);
    items.push({
      no,
      name,
      kind: "ht",
      scope,
      notes: bullets(str(h.ghi)),
      vt: vtOf(pg.ht.find((g) => g.name === name)),
      stages: stagesFor(kind, `${name} ${scope.join(" ")}`, no),
    });
  }

  return { items, excluded: pg.excluded };
}
