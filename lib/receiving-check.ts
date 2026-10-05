// Tiêu chí NHẬN HÀNG tại công trình — giám sát đối chiếu khi xe giao tới.
// Khớp từ khoá (bỏ dấu) theo TÊN VT trước, không có mới xét tên + chủng loại; lấy rule ĐẦU TIÊN khớp
// (rule cụ thể xếp trước). Không khớp → tiêu chí chung. Thêm loại VT mới = thêm 1 phần tử RULES.

export type ReceiveCheck = { check: string[]; reject: string[] };

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d");

type Rule = { re: RegExp; check: string[]; reject: string[] };

const RULES: Rule[] = [
  {
    re: /chong tham|sika|\btoa\b|raintite/,
    check: ["Thùng nguyên seal, đúng tên sản phẩm", "Còn hạn sử dụng", "Đủ số thùng/kg theo định mức"],
    reject: ["Đã mở seal, hết hạn, sai sản phẩm"],
  },
  {
    re: /be tong/,
    check: [
      "Thương phẩm: phiếu xuất ghi đúng mác, độ sụt, giờ xuất trạm (đổ trong ~2 giờ)",
      "Thương phẩm: thử độ sụt tại chỗ, đúc mẫu theo quy định",
      "Trộn tại chỗ: đúng cấp phối định mức theo mác",
    ],
    reject: ["Sai mác trên phiếu", "Quá giờ, bê tông đã ninh kết"],
  },
  {
    re: /\bthep\b|cb400|cb240/,
    check: [
      "Mác thép + logo hãng in nổi trên cây (VD Hòa Phát: CB400-V / CB240-T)",
      "Đo đường kính bằng thước kẹp, đếm số cây theo từng Ø",
      "Cân thử 1–2 cây so barem trọng lượng",
    ],
    reject: ["Không có chữ nổi mác/logo", "Gỉ bong vảy, cong gập"],
  },
  {
    re: /^xi mang|pcb40/,
    check: ["Bao nguyên, in đúng hãng + mác (PCB40)", "Ngày sản xuất in trên bao ≤ 60 ngày", "Đếm đủ số bao"],
    reject: ["Bao rách, ướt, xi măng vón cục", "Quá 60 ngày từ ngày sản xuất"],
  },
  {
    re: /gach op|op lat|gach lat|gach nen/,
    check: ["Cùng mã + cùng lô (số lô trên thùng giống nhau)", "Đúng kích thước, loại A", "Mở thử vài thùng: không cong vênh, sứt mẻ"],
    reject: ["Khác lô/khác màu", "Cong vênh, mẻ cạnh nhiều"],
  },
  {
    re: /gach (xay|ong|dinh)/,
    check: ["Đúng loại (ống / đinh / ống cháy)", "Kích thước đều, không cong vênh", "Nung chín đều màu, gõ kêu thanh"],
    reject: ["Nhiều viên vỡ, nứt", "Gạch non lửa (màu nhạt, gõ đục)"],
  },
  {
    re: /\bcat\b|da (1x2|1×2|xanh)/,
    check: ["Cát vàng hạt đều; đá đúng cỡ (1×2…)", "Sạch, không lẫn đất, rác", "Đo khối thùng xe: dài × rộng × cao"],
    reject: ["Lẫn bùn đất, rác (bóp nắm tay thấy dính bẩn)", "Thiếu khối so phiếu giao"],
  },
  {
    re: /^phu kien/,
    check: ["Đếm đủ vít, úp nóc, máng xối theo phiếu giao", "Úp nóc / máng cùng hãng, màu, độ dày với tôn lợp"],
    reject: ["Thiếu, sai màu / độ dày"],
  },
  {
    re: /\bton\b|zem/,
    check: ["Tên hãng + độ dày (zem) in trên mặt tôn", "Đo độ dày bằng thước kẹp", "Đúng loại sóng, màu, chiều dài tấm"],
    reject: ["Không in hãng/độ dày, dày thiếu", "Trầy, móp, gỉ"],
  },
  {
    re: /sat hop|xa go|khung mai|vi keo|chan bon/,
    check: ["Hãng in trên cây, đúng kích thước hộp", "Đo độ dày (li) bằng thước kẹp", "Đếm số cây, chiều dài"],
    reject: ["Dày thiếu, móp, gỉ"],
  },
  {
    re: /thach cao|khung xuong|gyproc|vinh tuong/,
    check: [
      "Khung: tên hãng + mã (VD Vĩnh Tường M29) in trên thanh",
      "Tấm: hãng + độ dày in mặt sau tấm; khu WC/bếp dùng tấm chịu ẩm",
      "Đếm đủ thanh/tấm",
    ],
    reject: ["Tấm ẩm, gãy góc, cong", "Sai hãng/mã khung"],
  },
  {
    re: /\bson\b|bot ba|bot tret/,
    check: ["Thùng/bao nguyên tem, đúng hãng + dòng sản phẩm", "Còn hạn sử dụng", "Tem chống hàng giả (cào / quét QR)", "Đúng mã màu (sơn phủ)"],
    reject: ["Mất tem, thùng móp méo, đã mở nắp", "Hết hạn, sai dòng/màu"],
  },
  {
    re: /day dien|cadivi/,
    check: ["Tên hãng + tiết diện (mm²) in trên vỏ dây", "Cuộn nguyên tem, đủ mét", "Tem chống hàng giả"],
    reject: ["Chữ in mờ/không có", "Lõi đồng nhỏ hơn tiết diện ghi"],
  },
  {
    re: /ong (cap|thoat|nuoc|nong|lanh)|binh minh|\bppr\b/,
    check: ["Tên hãng + đường kính + áp lực in trên thân ống", "Thành ống đều, không nứt, móp", "Phụ kiện (co, tê, keo) cùng hãng"],
    reject: ["Không in hãng/quy cách", "Ống nứt, biến dạng"],
  },
  {
    re: /cua nhom|xingfa|kinh (an toan|cuong luc|\d)/,
    check: ["Tem hãng trên thanh nhôm, đúng hệ + độ dày profile", "Kính đúng độ dày, có tem cường lực/an toàn", "Phụ kiện đồng bộ đủ bộ"],
    reject: ["Nhôm không tem, kính không tem", "Trầy xước, móp khung"],
  },
  {
    re: /cua (nhua|go|composite|phong)|composite/,
    check: ["Đúng mẫu, màu, kích thước ô chờ", "Đủ khung, cánh, bản lề, khoá"],
    reject: ["Nứt, trầy, sai kích thước"],
  },
  {
    re: /den (downlight|led|tuyp|am tran|op tran)|downlight|cong tac|o cam|aptomat|\bmcb\b|tu dien/,
    check: ["Đúng hãng + mã + công suất/dòng định mức", "Hộp nguyên, tem chống hàng giả", "Đếm đủ số lượng, thử vài cái"],
    reject: ["Hộp móp, mất tem, sai mã"],
  },
  {
    re: /thiet bi ve sinh|bon cau|lavabo|voi sen/,
    check: ["Hộp nguyên, đúng mã", "Mở kiểm men sứ không nứt, đủ phụ kiện"],
    reject: ["Nứt men, thiếu phụ kiện"],
  },
  {
    re: /bon nuoc/,
    check: ["Đúng hãng + dung tích, có phiếu bảo hành", "Không móp, đủ phao, van"],
    reject: ["Móp méo, thiếu phụ kiện"],
  },
  {
    re: /granite|da tam cap|da nung/,
    check: ["Đúng màu, độ dày, kích thước", "Không nứt, mẻ cạnh"],
    reject: ["Nứt, khác màu nhiều"],
  },
];

const GENERIC: ReceiveCheck = {
  check: ["Đúng hãng / chủng loại + quy cách như HD mua hàng", "Bao bì, tem nhãn nguyên vẹn", "Đếm đủ số lượng theo phiếu giao"],
  reject: ["Sai hãng/quy cách", "Hư hỏng, móp méo"],
};

export function receiveCheckFor(ten: string, loai: string): ReceiveCheck {
  const a = norm(ten);
  const b = norm(`${ten} ${loai}`);
  const r = RULES.find((x) => x.re.test(a)) ?? RULES.find((x) => x.re.test(b));
  return r ? { check: r.check, reject: r.reject } : GENERIC;
}
