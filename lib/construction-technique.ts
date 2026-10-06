// Kỹ thuật thi công — thư viện MẪU chung toàn công ty (bảng construction_techniques).
// 1 mẫu = 1 loại hạng mục; tasks = công tác con, mỗi công tác có:
//   steps    — trình tự / kỹ thuật thi công (đội làm theo)
//   criteria — tiêu chí nghiệm thu (giám sát kiểm trước khi ký điểm dừng)
//   notes    — lưu ý, lỗi hay gặp, an toàn
// HD thi công từng dự án (lib/construction-guide.ts) khớp tên hạng mục HĐ với matchKeywords
// theo sortOrder (mẫu đứng trước khớp trước → đặt loại cụ thể trước loại chung).
// DEFAULT_TECHNIQUES = bộ gốc, tự nạp vào DB lần đầu (ensureTechniquesSeeded).

export type CtCrit = { noi: string; yc: string }; // nội dung kiểm tra — yêu cầu / sai số
export type CtTask = { title: string; when: string; steps: string[]; criteria: CtCrit[]; notes: string[] };
export type CtPhase = "tho" | "ht";
export type CtTechnique = {
  code: string;
  name: string;
  phase: CtPhase;
  matchKeywords: string; // từ khoá khớp tên hạng mục HĐ, cách nhau dấu phẩy (không dấu cũng được)
  vtKeywords: string; // lọc vật tư HĐ hiển thị cho hạng mục (rỗng = tất cả)
  standards: string;
  note: string;
  tasks: CtTask[];
  sortOrder: number;
  isActive: boolean;
};

export const ctNorm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();

export const splitKeywords = (s: string) =>
  s
    .split(/[,;\n|]+/)
    .map(ctNorm)
    .filter(Boolean);

// Khớp nguyên từ trên chuỗi đã bỏ dấu: "mong" khớp "phần móng" nhưng không khớp "mỏng manh"… (cùng gốc "mong" vẫn khớp — chấp nhận)
export function matchesKeywords(text: string, keywords: string): boolean {
  const t = ctNorm(text);
  return splitKeywords(keywords).some((kw) => {
    const esc = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${esc}(?=[^a-z0-9]|$)`).test(t);
  });
}

// ───────────── Sanitize dữ liệu jsonb / body API ─────────────
const s = (v: unknown, max = 2000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const sArr = (v: unknown) => (Array.isArray(v) ? v.map((x) => s(x)).filter(Boolean) : []);

export function parseTasks(v: unknown): CtTask[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x) => x && typeof x === "object")
    .map((x) => {
      const o = x as Record<string, unknown>;
      return {
        title: s(o.title, 300),
        when: s(o.when, 500),
        steps: sArr(o.steps),
        criteria: (Array.isArray(o.criteria) ? o.criteria : [])
          .filter((c) => c && typeof c === "object")
          .map((c) => ({ noi: s((c as CtCrit).noi, 500), yc: s((c as CtCrit).yc, 1000) }))
          .filter((c) => c.noi || c.yc),
        notes: sArr(o.notes),
      };
    })
    .filter((t) => t.title);
}

// ───────────── Bộ mẫu gốc ─────────────
// Sai số tham khảo TCVN 4453:1995 (BTCT toàn khối), TCVN 4085:2011 (khối xây), TCVN 9377 (hoàn thiện).
// Bản vẽ KC/KT của công trình là căn cứ cao nhất.
const c = (noi: string, yc: string): CtCrit => ({ noi, yc });
const t = (title: string, steps: string[], criteria: CtCrit[], notes: string[] = [], when = ""): CtTask => ({
  title,
  when,
  steps,
  criteria,
  notes,
});
type Def = Omit<CtTechnique, "sortOrder" | "isActive">;

const DEFS: Def[] = [
  {
    code: "MONG",
    name: "Nền móng",
    phase: "tho",
    matchKeywords: "nen mong, mong",
    vtKeywords: "be tong, thep, gach, xi mang, cat, da",
    standards: "TCVN 4453:1995; TCVN 4085:2011; bản vẽ KC móng",
    note: "",
    tasks: [
      t(
        "Định vị tim trục, đào hố móng",
        [
          "Nhận mốc ranh, mốc cao độ ±0.000 từ chủ nhà / bản vẽ; lập biên bản bàn giao mốc",
          "Căng dây, bắn tim trục bằng máy / thước; đóng cọc ngựa ra ngoài phạm vi đào",
          "Đào hố móng theo kích thước bản vẽ + chừa mép thao tác; đất đổ xa miệng hố ≥ 0,5m",
          "Sửa đáy, đầm chặt đáy hố; gặp nước ngầm thì bơm hút trước khi làm bước sau",
          "Đổ bê tông lót đá 4x6 / mác thấp dày theo bản vẽ (thường 100mm)",
        ],
        [
          c("Tim trục, vị trí móng", "Đúng bản vẽ; sai lệch tim ≤ 10mm"),
          c("Kích thước, cao độ đáy hố móng", "Đúng bản vẽ; đáy phẳng, sạch, không đọng nước, không bùn"),
          c("Nền đất đáy móng", "Đất nguyên thổ / đầm chặt; không đặt móng lên đất đắp xốp"),
        ],
        ["Hố sâu > 1,5m hoặc sát nhà bên: vách đào taluy / chống vách, báo admin trước khi đào", "Gặp đất yếu, bùn, công trình ngầm cũ → dừng, chụp ảnh báo kỹ sư KC"],
      ),
      t(
        "Cốp pha + cốt thép móng, cổ móng, đà kiềng (trước khi đổ bê tông)",
        [
          "Gia công thép theo bảng thống kê bản vẽ KC; cắt, uốn tại bãi, phân loại theo cấu kiện",
          "Lắp lưới thép đáy móng, kê con kê; dựng thép cổ cột chờ đúng tim, giằng cố định",
          "Lắp thép đà kiềng: thép chủ trên/dưới, đai theo bản vẽ; nối chồng so le",
          "Lắp cốp pha thành móng, cổ móng, đà kiềng; gông, chống chắc; bịt kín khe",
          "Đặt sẵn ống chờ thoát nước, điện xuyên đà kiềng (nếu có)",
          "Vệ sinh sạch lòng cốp pha, tưới ẩm trước khi mời nghiệm thu",
        ],
        [
          c("Đường kính, số lượng thanh thép chủ", "Đúng bản vẽ KC; đếm từng cấu kiện"),
          c("Khoảng cách thép đai", "Đúng bản vẽ; vùng gần cột đai dày theo bản vẽ; sai lệch ≤ 10mm"),
          c("Nối thép, neo thép", "Chiều dài nối chồng / neo đúng bản vẽ; mối nối so le, không nối tại vị trí cấm"),
          c("Thép chờ cột", "Đúng vị trí, đủ số lượng, đủ chiều dài chờ"),
          c("Con kê lớp bê tông bảo vệ", "Kê đủ, đúng chiều dày bản vẽ; thép không chạm đất / cốp pha"),
          c("Cốp pha: kích thước, cao độ", "Đúng tiết diện (sai lệch ≤ 5mm); cao độ mặt đà kiềng đúng bản vẽ"),
          c("Cốp pha: độ kín, chắc chắn", "Kín khít không mất nước xi măng; cây chống, gông chắc chắn"),
          c("Vệ sinh trước khi đổ", "Sạch đất, rác, dăm gỗ; thép không dính bùn, dầu"),
        ],
        ["Không dùng gạch vỡ / đá làm con kê — dùng con kê bê tông đúng chiều dày"],
      ),
      t(
        "Đổ bê tông móng, cổ móng, đà kiềng",
        [
          "Kiểm tra thời tiết, chuẩn bị đủ vật tư, máy trộn, đầm dùi, đèn (nếu đổ muộn)",
          "Trộn đúng cấp phối (đong thùng, không ước lượng); thương phẩm kiểm phiếu xuất + độ sụt",
          "Đổ từ xa về gần, từng lớp dày 20–30cm; đầm dùi ngay sau khi đổ",
          "Cán mặt đúng cao độ, đánh nhám mặt tiếp giáp cột",
          "Che phủ, tưới ẩm bảo dưỡng ngay khi bê tông se mặt",
        ],
        [
          c("Mác / cấp phối bê tông", "Đúng HĐ; trộn tay đúng cấp phối, thương phẩm đúng phiếu xuất"),
          c("Đầm bê tông", "Đầm dùi kỹ từng lớp, không bỏ sót góc, không chạm làm xô thép"),
          c("Mặt bê tông", "Đúng cao độ, cán phẳng"),
          c("Bảo dưỡng", "Tưới ẩm liên tục tối thiểu 7 ngày"),
        ],
        ["Không tự ý thêm nước vào bê tông để dễ đổ", "Lấy mẫu lập phương nếu HĐ yêu cầu"],
      ),
      t(
        "Tháo cốp pha — kiểm tra bê tông móng, đà kiềng",
        [
          "Tháo cốp pha thành sau ≥ 1–2 ngày, nhẹ tay không làm sứt cạnh",
          "Kiểm tra bề mặt, chụp ảnh các vị trí rỗ / lỗi",
          "Xử lý rỗ theo hướng dẫn kỹ sư (đục, vệ sinh, trám vữa không co ngót)",
          "Lấp đất hố móng từng lớp 20–30cm, tưới ẩm, đầm chặt",
        ],
        [
          c("Bề mặt bê tông", "Không rỗ tổ ong, không lộ thép; rỗ nhẹ phải báo trước khi xử lý"),
          c("Kích thước, cao độ cấu kiện", "Đúng bản vẽ; cao độ mặt đà kiềng sai lệch ≤ 10mm"),
          c("Thép chờ cột", "Thẳng, đúng vị trí, không bị cong gãy"),
        ],
      ),
      t(
        "Xây tường bao nền / tường móng",
        [
          "Bắn mực tim tường trên mặt đà kiềng; tưới ẩm gạch trước khi xây",
          "Xây hàng gạch đầu căng dây, các hàng sau theo dây, so le mạch",
          "Chừa lỗ thoát nước / ống kỹ thuật theo bản vẽ",
          "Trát chống thấm mặt trong (nếu bản vẽ yêu cầu) trước khi lấp đất tôn nền",
        ],
        [
          c("Loại gạch, mác vữa", "Đúng HĐ (gạch ống cháy / gạch đặc theo HĐ)"),
          c("Mạch vữa", "Đầy vữa; mạch ngang ~12mm, mạch đứng ~10mm (8–15mm); so le ≥ 1/4 viên"),
          c("Độ thẳng đứng, ngang bằng", "Thả dọi, căng dây; sai lệch ≤ 10mm"),
          c("Chiều cao, chiều dày tường", "Đúng bản vẽ"),
        ],
        [],
        "tuong bao nen, tuong mong, xay mong",
      ),
      t(
        "Bể tự hoại (bể phốt)",
        [
          "Định vị, đào hố bể theo bản vẽ cấp thoát nước",
          "Đổ bê tông đáy bể (có thép nếu bản vẽ yêu cầu)",
          "Xây / đổ thành bể, vách ngăn ngăn chứa – lắng – lọc; đặt ống vào, ra, thông hơi đúng cao độ",
          "Trát trong 2 lớp vữa + chống thấm; đổ nắp bê tông có lỗ thăm",
          "Ngâm nước thử trước khi lấp đất",
        ],
        [
          c("Vị trí, kích thước, cao độ đáy bể", "Đúng bản vẽ cấp thoát nước"),
          c("Ống vào / ra / thông hơi", "Đúng vị trí, đúng cao độ, có độ dốc"),
          c("Trát thành bể, chống thấm", "Trát kín 2 lớp, không nứt"),
          c("Thử nước", "Ngâm nước ≥ 24 giờ, mực nước không tụt"),
        ],
        [],
        "be phot, tu hoai",
      ),
    ],
  },
  {
    code: "KHUNG",
    name: "Kết cấu khung BTCT (cột, dầm, sàn)",
    phase: "tho",
    matchKeywords: "ket cau, khung be tong, cot, dam",
    vtKeywords: "be tong, thep, xi mang, cat, da",
    standards: "TCVN 4453:1995; bản vẽ KC",
    note: "",
    tasks: [
      t(
        "Cốt thép + cốp pha cột (trước khi đổ)",
        [
          "Đục nhám, vệ sinh chân cột; kiểm tra thép chờ",
          "Nối thép chủ cột (chồng / hàn theo bản vẽ), lồng đai, buộc chặt; đai dày đầu và chân cột",
          "Buộc con kê 4 mặt",
          "Dựng cốp pha cột, chừa cửa vệ sinh chân; gông đều, chống 2 phương",
          "Căn chỉnh thẳng đứng bằng dọi, bịt kín chân cốp pha",
        ],
        [
          c("Thép chủ cột", "Đúng Ø, số lượng theo bản vẽ KC"),
          c("Thép đai cột", "Đúng Ø, khoảng cách; đai dày ở đầu và chân cột theo bản vẽ"),
          c("Nối thép cột", "Chiều dài nối chồng đúng bản vẽ, so le"),
          c("Con kê lớp bảo vệ", "Đủ con kê 4 mặt, đúng chiều dày bản vẽ"),
          c("Cốp pha cột: tiết diện, tim", "Sai lệch tiết diện ≤ 5mm; đúng tim trục"),
          c("Độ thẳng đứng cốp pha cột", "Thả dọi 2 phương; sai lệch ≤ 5mm/m, cả cột ≤ 10mm"),
          c("Chân cột", "Đục nhám, vệ sinh sạch mặt bê tông cũ; bịt kín chân cốp pha"),
        ],
      ),
      t(
        "Đổ bê tông cột",
        [
          "Tưới ẩm lòng cốp pha; đổ lớp vữa xi măng mỏng chân cột chống rỗ",
          "Đổ từng lớp 30–40cm, đầm dùi kết hợp gõ thành cốp pha",
          "Cột cao > 2,5m đổ qua cửa sổ / máng, không để bê tông rơi tự do",
          "Dừng đổ ở cao độ đáy dầm (mạch ngừng), bảo dưỡng",
        ],
        [
          c("Mác / cấp phối", "Đúng HĐ"),
          c("Đổ và đầm", "Đổ theo lớp, đầm kỹ; chiều cao rơi tự do lớn phải có máng/ống"),
          c("Bảo dưỡng", "Tưới ẩm tối thiểu 7 ngày"),
        ],
      ),
      t(
        "Cốp pha + cốt thép dầm, sàn (trước khi đổ)",
        [
          "Dựng hệ chống (cây chống / giáo), kê chân trên ván / nền chắc; giằng 2 phương",
          "Lắp cốp pha đáy dầm, thành dầm, sàn; chỉnh cao độ, khe hở bịt băng keo / mút",
          "Lắp thép dầm chính → dầm phụ → thép sàn lớp dưới → chân ghế → lớp trên, thép mũ",
          "Đặt ống chờ điện, nước, lỗ kỹ thuật; đánh dấu cao độ mặt sàn",
          "Kê con kê, vệ sinh, tưới ẩm, mời nghiệm thu",
        ],
        [
          c("Cao độ đáy dầm, đáy sàn", "Đúng bản vẽ; sai lệch ≤ 10mm"),
          c("Hệ chống đỡ", "Cây chống đủ, kê chân chắc, có giằng; không lún"),
          c("Thép chủ dầm (lớp trên, lớp dưới)", "Đúng Ø, số lượng, vị trí cắt thép theo bản vẽ"),
          c("Thép đai dầm", "Đúng Ø, khoảng cách; đai dày gần gối theo bản vẽ"),
          c("Thép sàn 2 lớp", "Đúng Ø, khoảng cách (sai lệch ≤ 20mm); thép mũ đủ chiều dài; có chân ghế giữ lớp trên"),
          c("Chiều dày sàn", "Đúng bản vẽ (VD sàn 100mm); đánh dấu cốt mặt sàn"),
          c("Ống chờ điện nước, lỗ chờ", "Đã đặt đủ trước khi đổ; đúng vị trí"),
          c("Con kê, vệ sinh", "Đủ con kê; sạch rác, tưới ẩm cốp pha trước khi đổ"),
        ],
        ["Không đi lại dẫm bẹp thép lớp trên — trải ván lối đi khi đổ"],
      ),
      t(
        "Đổ bê tông dầm, sàn",
        [
          "Đổ dầm trước, sàn sau; đổ liên tục từ xa về gần lối lên",
          "Đầm dùi dầm, đầm bàn sàn; người trực dưới sàn theo dõi cây chống",
          "Cán phẳng theo mốc cao độ, tạo dốc khu WC / sân thượng nếu bản vẽ có",
          "Mạch ngừng (nếu bắt buộc) đặt tại vị trí cho phép (1/3 nhịp giữa)",
          "Phủ bao tải / bạt, tưới ẩm bảo dưỡng",
        ],
        [
          c("Mác / cấp phối", "Đúng HĐ; đổ liên tục, mạch ngừng đúng vị trí cho phép"),
          c("Đầm, cán mặt", "Đầm dùi dầm, đầm bàn sàn; mặt sàn phẳng, đúng cao độ, đúng dốc"),
          c("Bảo dưỡng", "Tưới ẩm / phủ bao tối thiểu 7 ngày; không chất tải sớm"),
        ],
      ),
      t(
        "Tháo cốp pha — kiểm tra bê tông khung",
        [
          "Tháo cốp pha thành cột, thành dầm trước; đáy dầm, sàn khi đủ thời gian",
          "Tháo từng khoang, chống lại (chống lại / chống bổ sung) cho sàn tầng đang thi công phía trên",
          "Kiểm tra, chụp ảnh bề mặt; báo lỗi để xử lý",
        ],
        [
          c("Thời gian tháo", "Cột ≥ 2 ngày; đáy dầm, sàn khi bê tông đủ cường độ (thường ≥ 14–21 ngày, giữ chống lại)"),
          c("Bề mặt bê tông", "Không rỗ, không lộ thép, không nứt"),
          c("Kích thước, độ thẳng", "Cột thẳng đứng, dầm thẳng; sai lệch trong giới hạn bản vẽ"),
          c("Sàn: võng, nứt", "Không võng nhìn thấy bằng mắt, không nứt"),
        ],
      ),
    ],
  },
  {
    code: "XAY-TO",
    name: "Xây tô",
    phase: "tho",
    matchKeywords: "xay, to, to trat",
    vtKeywords: "gach, xi mang, cat, vua, luoi",
    standards: "TCVN 4085:2011; TCVN 9377-2:2012",
    note: "",
    tasks: [
      t(
        "Xây tường",
        [
          "Bắn mực tim, mép tường và vị trí cửa trên sàn; cắm râu thép vào cột (nếu chưa chờ)",
          "Tưới ẩm gạch; trộn vữa đúng mác, dùng hết trong ~2 giờ",
          "Xây hàng đầu theo mực, dựng thước cữ 2 đầu, căng dây xây từng hàng",
          "Đặt lanh tô ô cửa; mỗi ngày xây không quá ~1,5m chiều cao",
          "Hàng trên cùng xây nghiêng / chèn sát đáy dầm sau ≥ 2–3 ngày",
        ],
        [
          c("Vị trí, tim tường, chiều dày", "Đúng bản vẽ KT; tường 100/200 đúng loại"),
          c("Gạch, vữa", "Gạch tưới ẩm trước khi xây; vữa đúng mác, dùng trong ~2 giờ"),
          c("Mạch vữa", "Đầy vữa; mạch ngang ~12mm, mạch đứng ~10mm (8–15mm); so le ≥ 1/4 viên"),
          c("Độ thẳng đứng, ngang bằng, phẳng mặt", "Thả dọi, căng dây; sai lệch ≤ 10mm"),
          c("Liên kết tường – cột", "Râu thép / liên kết neo vào cột theo bản vẽ; khe tiếp giáp chèn kín"),
          c("Lanh tô, ô cửa", "Lanh tô đủ, gác mỗi bên ≥ 200mm; ô cửa đúng kích thước, vuông góc"),
          c("Xây chèn đỉnh tường", "Xây nghiêng / chèn kín sát đáy dầm"),
        ],
      ),
      t(
        "Trước khi tô (sau đi điện nước âm tường)",
        [
          "Cắt rãnh bằng máy, đi ống điện nước; trám rãnh bằng vữa",
          "Đóng lưới thép / lưới thuỷ tinh chống nứt tại giáp tường – cột – dầm và rãnh ống",
          "Gắn mốc tô (ghém) theo dây dọi, khoảng cách ≤ 1,5–2m",
          "Vệ sinh, tưới ẩm tường; mặt bê tông đánh nhám / quét hồ dầu",
        ],
        [
          c("Ống điện nước âm tường", "Đã nghiệm thu điện nước thô; rãnh cắt trám kín"),
          c("Lưới chống nứt", "Đóng lưới tại vị trí tiếp giáp tường – cột – dầm và rãnh đi ống"),
          c("Mốc tô", "Gắn mốc / ghém đủ để đảm bảo độ phẳng"),
          c("Bề mặt", "Vệ sinh sạch, tưới ẩm; mặt bê tông được đánh nhám / hồ dầu"),
        ],
      ),
      t(
        "Tô trát",
        [
          "Tô trần / dầm trước, tường sau; từ trên xuống",
          "Lớp lót mỏng tạo bám → lớp chính; tô dày > 15mm chia 2 lớp, lớp sau khi lớp trước se",
          "Cán thước theo mốc, xoa phẳng; vê góc, cạnh cửa bằng thước nhôm",
          "Tưới ẩm bảo dưỡng 2–3 ngày, tránh nắng gắt / gió lùa",
        ],
        [
          c("Độ phẳng", "Áp thước 2m: khe hở ≤ 3mm"),
          c("Độ thẳng đứng, góc cạnh", "Thẳng đứng; góc, cạnh cửa sắc, vuông"),
          c("Bám dính", "Gõ không bộp, không nứt chân chim, không phồng"),
          c("Chiều dày lớp tô", "Đúng HĐ (thường 15mm); tô dày phải chia lớp"),
          c("Bảo dưỡng", "Tưới ẩm 2–3 ngày sau tô"),
        ],
      ),
      t(
        "Cán vữa lót nền",
        [
          "Vệ sinh, tưới ẩm nền; bắn cốt hoàn thiện lên tường",
          "Làm mốc cao độ / dải mốc; khu ướt tạo dốc về phễu thu",
          "Rải vữa, cán thước theo mốc, xoa phẳng",
        ],
        [
          c("Nền trước khi cán", "Đầm chặt, sạch, tưới ẩm"),
          c("Cao độ, độ dốc", "Đúng cao độ hoàn thiện trừ chiều dày gạch; khu ướt dốc về phễu thu"),
          c("Độ phẳng", "Áp thước 2m: khe hở ≤ 5mm"),
        ],
        [],
        "lot nen, can nen",
      ),
    ],
  },
  {
    code: "MAI",
    name: "Mái tôn / khung kèo",
    phase: "tho",
    matchKeywords: "mai ton, mai",
    vtKeywords: "",
    standards: "Hướng dẫn nhà sản xuất tôn",
    note: "",
    tasks: [
      t(
        "Khung kèo, xà gồ",
        [
          "Gia công kèo theo bản vẽ, hàn tại xưởng / bãi; sơn chống rỉ mối hàn",
          "Định vị bản mã, bắt bulông / hàn kèo lên đỉnh tường, cột",
          "Lắp xà gồ theo khoảng cách bản vẽ, căng dây cho thẳng, đúng dốc",
          "Dặm sơn chống rỉ các vị trí hàn tại chỗ",
        ],
        [
          c("Chủng loại thép hộp", "Đúng quy cách HĐ (kích thước, độ dày li)"),
          c("Khoảng cách xà gồ, vì kèo", "Đúng bản vẽ"),
          c("Liên kết hàn / bu lông", "Mối hàn đầy, không rỗ, không nứt; bu lông đủ, siết chặt"),
          c("Sơn chống rỉ", "Sơn kín các mối hàn, vị trí trầy mạ kẽm"),
          c("Độ dốc mái", "Đúng bản vẽ; thoát về seno / máng xối"),
        ],
        ["Làm việc trên cao: dây an toàn, không thi công khi mưa / gió lớn"],
      ),
      t(
        "Lợp tôn, úp nóc, máng xối",
        [
          "Lắp máng xối / seno trước, kiểm tra dốc về ống thoát",
          "Lợp tôn từ cuối hướng gió ngược lên, chồng mí ≥ 1 sóng",
          "Bắn vít đỉnh sóng có long đen cao su, căng dây cho thẳng hàng vít",
          "Lắp úp nóc, diềm, tấm chắn; bơm keo các vị trí giáp tường",
        ],
        [
          c("Tôn", "Đúng hãng, độ dày, màu theo HĐ"),
          c("Chồng mí", "Chồng ≥ 1 sóng, xuôi chiều gió; hàng tôn thẳng"),
          c("Vít", "Đủ số vít, có long đen cao su, bắn vào đỉnh sóng"),
          c("Úp nóc, diềm, máng xối, seno", "Kín nước; máng có độ dốc về ống thoát"),
          c("Thử nước", "Xịt nước / sau cơn mưa: không dột, không đọng"),
        ],
        ["Quét sạch mạt sắt sau khi bắn vít — để lại sẽ rỉ loang tôn"],
      ),
    ],
  },
  {
    code: "CT-TUONG",
    name: "Chống thấm tường ngoài",
    phase: "tho",
    matchKeywords: "chong tham tuong, tuong ngoai",
    vtKeywords: "",
    standards: "Hướng dẫn nhà sản xuất vật liệu chống thấm",
    note: "",
    tasks: [
      t(
        "Chuẩn bị bề mặt",
        [
          "Xác định phạm vi mặt tường / trục theo HĐ",
          "Xử lý vết nứt (mở rộng, trám), lỗ ty, chân tường tiếp giáp nhà bên",
          "Vệ sinh bụi, rêu; để tường khô",
        ],
        [
          c("Phạm vi", "Đúng các mặt tường / trục theo HĐ"),
          c("Bề mặt tường", "Khô, sạch, đã xử lý vết nứt và lỗ ty; không bụi, không rêu"),
        ],
      ),
      t(
        "Thi công chống thấm tường ngoài",
        [
          "Trộn / khuấy vật liệu đúng tỉ lệ nhà sản xuất",
          "Quét / lăn lớp 1 kín đều, chú ý góc, chân tường, mép cửa",
          "Chờ khô theo thời gian nhà sản xuất rồi quét lớp 2 vuông góc lớp 1",
        ],
        [
          c("Vật liệu", "Đúng sản phẩm HĐ, còn hạn"),
          c("Số lớp, định mức", "Đủ số lớp theo hướng dẫn nhà sản xuất; lớp sau khi lớp trước khô"),
          c("Bề mặt sau thi công", "Phủ kín đều, không bỏ sót góc, chân tường, mép cửa"),
        ],
        ["Không thi công khi trời mưa hoặc tường còn ướt"],
      ),
    ],
  },
  {
    code: "CT-SAN",
    name: "Chống thấm sàn (WC, sân thượng, ban công)",
    phase: "tho",
    matchKeywords: "chong tham",
    vtKeywords: "",
    standards: "Hướng dẫn nhà sản xuất vật liệu chống thấm",
    note: "",
    tasks: [
      t(
        "Chuẩn bị bề mặt, cổ ống",
        [
          "Đục tẩy vữa thừa, mài phẳng; vệ sinh sạch bụi",
          "Đục rộng cổ ống xuyên sàn, quấn gioăng trương nở, đổ vữa không co ngót",
          "Bo góc tường – sàn bằng vữa (R ~ 3–5cm), gia cường lưới theo quy trình",
        ],
        [
          c("Bề mặt", "Phẳng, sạch, không đọng nước; vết nứt / rỗ đã xử lý"),
          c("Cổ ống xuyên sàn", "Đục rộng, đổ vữa không co ngót + gioăng trương nở"),
          c("Góc tường – sàn", "Bo góc vữa / gia cường lưới theo quy trình"),
        ],
      ),
      t(
        "Thi công lớp chống thấm",
        [
          "Làm ẩm bề mặt (vật liệu gốc xi măng), trộn đúng tỉ lệ",
          "Quét lớp 1; dán lưới gia cường tại góc, cổ ống",
          "Quét lớp 2 vuông góc lớp 1 khi lớp 1 khô; kéo lên tường đúng chiều cao HĐ",
        ],
        [
          c("Vật liệu", "Đúng sản phẩm HĐ, còn hạn, trộn đúng tỉ lệ"),
          c("Phạm vi", "Đủ diện tích; WC kéo lên chân tường và tường khu tắm đúng chiều cao HĐ"),
          c("Số lớp", "Đủ số lớp; lớp sau quét vuông góc lớp trước, khi lớp trước khô"),
        ],
      ),
      t(
        "Ngâm nước thử",
        [
          "Be bờ cửa, bịt phễu thu; ngâm nước cao ~5cm",
          "Đánh dấu mực nước; kiểm tra mặt dưới sàn, tường lân cận sau 24–48 giờ",
          "Đạt → cán vữa bảo vệ ngay, tránh đi lại làm rách lớp chống thấm",
        ],
        [
          c("Ngâm nước", "Ngâm ≥ 24–48 giờ, nước cao ~5cm"),
          c("Kiểm tra mặt dưới / tường lân cận", "Không thấm, không ẩm loang; mực nước không tụt"),
        ],
      ),
    ],
  },
  {
    code: "DIEN-NUOC",
    name: "Điện nước âm (thô)",
    phase: "tho",
    matchKeywords: "di am, dien nuoc, dien tho, nuoc tho",
    vtKeywords: "",
    standards: "TCVN 9206:2012 (điện); TCVN 4519:1988 (cấp thoát nước)",
    note: "",
    tasks: [
      t(
        "Điện âm tường / âm trần",
        [
          "Bắn mực tuyến ống, vị trí đế âm theo bản vẽ + chủ nhà xác nhận vị trí ổ, công tắc",
          "Cắt rãnh, đặt ống luồn, cố định bằng đinh / vữa; đầu ống bịt kín",
          "Đặt đế âm, hộp nối đúng cao độ, cân bằng",
          "Kéo dây đúng tiết diện từng nhánh, đúng màu; không nối dây trong ống",
          "Đo thông mạch, cách điện trước khi trám / tô",
        ],
        [
          c("Tuyến ống luồn", "Đúng sơ đồ; ống chạy thẳng, cố định chắc; đầu ống bịt kín"),
          c("Dây dẫn", "Đúng hãng, đúng tiết diện từng nhánh theo sơ đồ nguyên lý"),
          c("Màu dây", "Phân biệt pha / trung tính / tiếp địa"),
          c("Đế âm, hộp nối", "Đúng vị trí, cao độ, cân bằng; không nối dây trong ống"),
          c("Đo kiểm", "Thông mạch từng nhánh; đo cách điện trước khi tô"),
        ],
        ["Chụp ảnh / quay video tuyến ống trước khi tô để bàn giao chủ nhà"],
      ),
      t(
        "Cấp nước âm",
        [
          "Đi ống theo bản vẽ, nóng / lạnh tách riêng, cách nhau ≥ 5cm",
          "Hàn nhiệt PPR đúng nhiệt độ, thời gian; không xoay khi nguội",
          "Đặt đầu chờ thiết bị đúng vị trí, cao độ; bịt đầu",
          "Bơm thử áp trước khi trám rãnh",
        ],
        [
          c("Tuyến ống", "Đúng bản vẽ; nóng / lạnh tách riêng"),
          c("Mối hàn nhiệt PPR", "Đúng nhiệt, không bavia, không cong"),
          c("Đầu chờ thiết bị", "Đúng vị trí, cao độ; bịt đầu"),
          c("Thử áp", "Bơm thử áp (thường 1,5 lần áp làm việc, ~10 bar) giữ ≥ 30 phút không tụt, không rò"),
        ],
      ),
      t(
        "Thoát nước",
        [
          "Định vị phễu thu, ống xí, ống đứng theo bản vẽ",
          "Lắp ống đúng độ dốc; dùng co lơi / chếch, hạn chế co vuông",
          "Bôi keo đều, kín mối nối; ống xí đi riêng, có thông hơi",
          "Đổ nước thử thông từng nhánh trước khi đổ bê tông / lấp",
        ],
        [
          c("Tuyến ống, đường kính", "Đúng bản vẽ; ống xí riêng, có thông hơi"),
          c("Độ dốc", "Ống nhánh ≥ 2%, ống chính ≥ 1%; không võng"),
          c("Keo nối, phụ kiện", "Bôi keo kín; dùng co lơi / chếch, hạn chế co vuông"),
          c("Thử thông nước", "Đổ nước thử từng nhánh: thoát nhanh, không rò"),
        ],
      ),
    ],
  },
  {
    code: "TRAN",
    name: "Trần thạch cao",
    phase: "ht",
    matchKeywords: "thach cao, tran",
    vtKeywords: "",
    standards: "Hướng dẫn nhà sản xuất khung, tấm",
    note: "",
    tasks: [
      t(
        "Khung xương trần",
        [
          "Bắn mực cao độ trần quanh tường; lắp thanh viền tường",
          "Khoan bắt ty treo, lắp thanh chính, thanh phụ đúng khoảng cách nhà sản xuất",
          "Căng dây chỉnh phẳng khung; gia cường vị trí đèn, quạt, máy lạnh",
          "Hoàn tất điện, ống trên trần và nghiệm thu trước khi đóng tấm",
        ],
        [
          c("Cao độ trần", "Đúng bản vẽ; bắn mực cao độ quanh tường"),
          c("Khoảng cách thanh chính, thanh phụ, ty treo", "Đúng tiêu chuẩn nhà sản xuất khung"),
          c("Độ phẳng khung", "Căng dây kiểm tra, không võng"),
          c("Điện, ống trên trần", "Đi xong, đã nghiệm thu trước khi đóng tấm"),
        ],
      ),
      t(
        "Tấm trần, xử lý mối nối",
        [
          "Bắn tấm so le mối nối, mặt giấy xuống; khu WC / bếp dùng tấm chịu ẩm",
          "Vít cách đều, mũ vít chìm vừa phải không thủng giấy",
          "Dán băng lưới mối nối, bả bột 2–3 lớp, xả nhám",
          "Khoét lỗ đèn, lỗ thăm đúng vị trí",
        ],
        [
          c("Tấm", "Đúng loại, độ dày; khu WC / bếp dùng tấm chịu ẩm"),
          c("Vít", "Đủ vít, khoảng cách đều, mũ vít chìm không thủng giấy"),
          c("Mối nối", "Băng lưới + bột; không nứt sau khi bả"),
          c("Độ phẳng mặt trần", "Không võng, không gợn mối nối khi soi đèn"),
          c("Lỗ đèn, lỗ thăm", "Đúng vị trí, cắt gọn"),
        ],
      ),
    ],
  },
  {
    code: "SON",
    name: "Sơn bả",
    phase: "ht",
    matchKeywords: "son, bot ba",
    vtKeywords: "",
    standards: "TCVN 9377-3; hướng dẫn hãng sơn",
    note: "",
    tasks: [
      t(
        "Bả matit",
        [
          "Kiểm tra tường khô (thường ≥ 21–28 ngày sau tô), xử lý nứt, lỗ",
          "Bả lớp 1 mỏng đều; khô thì bả lớp 2",
          "Xả nhám, soi đèn sửa chỗ gợn; vệ sinh bụi",
        ],
        [
          c("Bề mặt trước khi bả", "Tường khô, sạch; đã xử lý nứt, lỗ"),
          c("Số lớp bả", "Đúng HĐ (thường 2 lớp)"),
          c("Độ phẳng sau xả nhám", "Soi đèn không gợn, không lượn sóng"),
        ],
      ),
      t(
        "Sơn lót, sơn phủ",
        [
          "Che chắn cửa, ổ điện, sàn; chủ nhà chốt mã màu bằng văn bản / tin nhắn",
          "Lăn sơn lót 1 lớp; khô theo thời gian hãng",
          "Lăn phủ lớp 1, lớp 2 cách nhau đủ thời gian khô; cắt mép bằng cọ",
        ],
        [
          c("Sơn", "Đúng hãng, dòng sản phẩm, mã màu HĐ / chủ nhà chốt"),
          c("Số lớp", "Lót 1 lớp + phủ đủ số lớp theo HĐ"),
          c("Bề mặt sơn", "Màu đều, không loang, không vệt chổi lăn, không bong"),
          c("Mép, góc giáp ranh", "Sắc gọn; không dính sơn sang trần, cửa, ổ điện"),
        ],
        ["Giữ lại vỏ thùng sơn để giám sát đối chiếu hãng / mã"],
      ),
    ],
  },
  {
    code: "OP-LAT",
    name: "Ốp lát gạch",
    phase: "ht",
    matchKeywords: "op lat, gach op, lat nen",
    vtKeywords: "",
    standards: "TCVN 9377-1",
    note: "",
    tasks: [
      t(
        "Lát nền",
        [
          "Kiểm gạch cùng lô, chọn mặt; trải thử, chia gạch (viên cắt dồn về góc khuất)",
          "Bắn cốt hoàn thiện, căng dây ô lưới; khu ướt tạo dốc về phễu thu",
          "Rải vữa / keo, lát theo dây, gõ búa cao su; ke mạch đều",
          "Sau 24 giờ chà ron, lau sạch",
        ],
        [
          c("Gạch", "Đúng mã, cùng lô; chọn mặt, chia gạch trước khi lát"),
          c("Cao độ, độ dốc", "Đúng cao độ hoàn thiện; khu ướt dốc về phễu thu, không đọng nước"),
          c("Độ phẳng", "Áp thước 2m: khe hở ≤ 2mm; chênh mép 2 viên ≤ 1mm"),
          c("Mạch gạch", "Thẳng, đều; đúng độ rộng mạch"),
          c("Bám dính", "Gõ không bộp"),
        ],
        ["Không đi lại trên nền mới lát trong 24 giờ"],
      ),
      t(
        "Ốp tường, len chân tường",
        [
          "Bắn mực hàng gạch đầu (thường bắt đầu từ hàng thứ 2, hàng chân ốp sau khi lát nền)",
          "Ốp từ dưới lên, keo đầy lưng gạch; ke mạch thẳng hàng với nền",
          "Khoét lỗ chờ thiết bị bằng mũi khoét; góc dùng nẹp / mài 45°",
          "Chà ron, lau sạch",
        ],
        [
          c("Chiều cao ốp", "Đúng HĐ (VD WC cao 2,7m)"),
          c("Độ thẳng đứng, phẳng", "Thả dọi, áp thước 2m: khe hở ≤ 2mm"),
          c("Mạch, góc", "Mạch đều thẳng hàng với nền; góc cắt gọn / nẹp"),
          c("Lỗ chờ thiết bị", "Khoét đúng vị trí, gọn"),
          c("Bám dính, chà ron", "Gõ không bộp; ron chà kín, sạch"),
        ],
      ),
    ],
  },
  {
    code: "CUA-NHOM",
    name: "Cửa nhôm kính",
    phase: "ht",
    matchKeywords: "cua nhom, nhom kinh, xingfa",
    vtKeywords: "",
    standards: "Hướng dẫn nhà sản xuất hệ nhôm",
    note: "",
    tasks: [
      t(
        "Lắp đặt cửa nhôm kính",
        [
          "Đo lại ô chờ thực tế trước khi đặt gia công; xác nhận bảng thống kê cửa với chủ nhà",
          "Đặt khung, căn thẳng đứng, vuông góc bằng nêm; bắt vít nở đủ",
          "Bơm foam / keo khe khung – tường; bắn silicon chống thấm mặt ngoài",
          "Lắp cánh, phụ kiện, chỉnh vận hành; giữ màng bảo vệ đến khi bàn giao",
        ],
        [
          c("Chủng loại", "Đúng hệ nhôm, màu, độ dày kính theo HĐ; có tem"),
          c("Kích thước, số lượng", "Đúng bảng thống kê cửa"),
          c("Khung", "Thẳng đứng, vuông góc; bắt vít nở đủ"),
          c("Khe khung – tường", "Bơm keo / foam kín, không thấm"),
          c("Vận hành", "Cánh đóng mở êm, khoá chốt hoạt động; không cạ"),
          c("Bề mặt", "Không trầy, móp; kính không vỡ mẻ"),
        ],
      ),
    ],
  },
  {
    code: "CUA-PHONG",
    name: "Cửa phòng (nhựa, gỗ, composite)",
    phase: "ht",
    matchKeywords: "cua phong, cua nhua, cua go, cua composite",
    vtKeywords: "",
    standards: "",
    note: "",
    tasks: [
      t(
        "Lắp đặt cửa phòng",
        [
          "Kiểm ô chờ sau sơn bả; xác nhận chiều mở cửa với chủ nhà",
          "Dựng khung bao, căn thẳng đứng, cố định vít / foam",
          "Treo cánh, lắp khoá, bản lề, chặn cửa; chỉnh khe hở đều",
        ],
        [
          c("Chủng loại, màu, kích thước", "Đúng HĐ và bảng thống kê cửa"),
          c("Khung bao", "Thẳng đứng, vuông góc, chắc chắn"),
          c("Phụ kiện", "Đủ khoá, bản lề, chặn cửa"),
          c("Vận hành", "Đóng mở êm, khe hở đều, khoá hoạt động"),
          c("Bề mặt", "Không nứt, trầy"),
        ],
      ),
    ],
  },
  {
    code: "LAN-CAN",
    name: "Lan can, tay vịn",
    phase: "ht",
    matchKeywords: "lan can, tay vin",
    vtKeywords: "",
    standards: "",
    note: "",
    tasks: [
      t(
        "Lắp đặt lan can, tay vịn",
        [
          "Đo thực tế cầu thang / ban công; chủ nhà chốt mẫu, vật liệu (sắt, inox, kính, gỗ)",
          "Gia công tại xưởng; sắt sơn chống rỉ + sơn phủ trước khi mang tới",
          "Định vị chân trụ, khoan bắt bulông nở / hoá chất vào bê tông (không bắt vào gạch, vữa)",
          "Lắp tay vịn, kính (nếu có), mài nhẵn mối hàn, dặm sơn",
        ],
        [
          c("Chủng loại, mẫu", "Đúng HĐ / mẫu chủ nhà chốt; đúng độ dày vật liệu"),
          c("Chiều cao lan can", "Đúng bản vẽ; tối thiểu ~900mm cầu thang, ~1.100mm ban công / sân thượng"),
          c("Khe hở song", "Khoảng hở giữa các song ≤ 100mm (an toàn trẻ em)"),
          c("Liên kết chân trụ", "Bắt chắc vào bê tông; lắc mạnh không rung, không lỏng"),
          c("Bề mặt, mối hàn", "Mối hàn mài nhẵn, không ba via sắc; sơn đều không rỉ; tay vịn liền mạch"),
        ],
        ["Lan can kính: dùng kính cường lực / dán an toàn đúng độ dày HĐ"],
      ),
    ],
  },
  {
    code: "TBVS",
    name: "Thiết bị vệ sinh",
    phase: "ht",
    matchKeywords: "thiet bi ve sinh",
    vtKeywords: "",
    standards: "Hướng dẫn lắp đặt của hãng",
    note: "",
    tasks: [
      t(
        "Lắp đặt thiết bị vệ sinh",
        [
          "Đối chiếu mẫu thiết bị với HĐ / chủ nhà chốt; kiểm đủ phụ kiện trong hộp",
          "Định vị theo đầu chờ; khoan bắt vít, cân bằng",
          "Lắp dây cấp, xi phông; bồn cầu trám kín chân bằng silicon",
          "Mở nước thử xả, kiểm rò rỉ",
        ],
        [
          c("Thiết bị", "Đúng mẫu đã chốt; đủ phụ kiện"),
          c("Vị trí, cao độ", "Đúng bản vẽ; cân bằng, chắc chắn"),
          c("Mối nối cấp / thoát", "Không rò rỉ; bồn cầu trám kín chân"),
          c("Vận hành", "Xả, cấp nước thử: thoát tốt, không rò"),
          c("Bề mặt", "Không nứt men, trầy"),
        ],
      ),
    ],
  },
  {
    code: "TB-DIEN",
    name: "Thiết bị điện (hoàn thiện)",
    phase: "ht",
    matchKeywords: "thiet bi dien, dien hoan thien",
    vtKeywords: "",
    standards: "TCVN 9206:2012",
    note: "",
    tasks: [
      t(
        "Lắp đặt thiết bị điện",
        [
          "Cắt điện tổng khi đấu nối",
          "Lắp mặt công tắc, ổ cắm ngay hàng; đèn, quạt đúng vị trí",
          "Đấu tủ điện, CB theo sơ đồ nhánh; dán nhãn từng CB",
          "Đóng điện thử từng nhánh",
        ],
        [
          c("Thiết bị", "Đúng hãng, mã, số lượng theo HĐ"),
          c("Đèn, công tắc, ổ cắm", "Đúng vị trí, ngay hàng, mặt áp sát tường"),
          c("Tủ điện, CB", "Đúng sơ đồ nhánh; dán nhãn từng CB"),
          c("Đấu nối", "Chắc chắn; ổ cắm có tiếp địa (nếu có)"),
          c("Thử vận hành", "Bật thử toàn bộ: đèn sáng, ổ có điện, CB không nhảy"),
        ],
      ),
    ],
  },
  {
    code: "CTN-HT",
    name: "Hoàn thiện cấp thoát nước",
    phase: "ht",
    matchKeywords: "cap thoat nuoc, hoan thien nuoc",
    vtKeywords: "",
    standards: "",
    note: "",
    tasks: [
      t(
        "Hoàn thiện cấp thoát nước",
        [
          "Đặt bồn nước trên chân / bệ chắc chắn; lắp phao, van, ống xả tràn",
          "Lắp máy bơm, rơ le áp / phao điện; đấu điện qua CB riêng",
          "Lắp van, dây cấp, xi phông, phễu thu",
          "Chạy thử bơm, mở thử từng điểm dùng nước",
        ],
        [
          c("Bồn nước, máy bơm", "Đúng hãng, dung tích; đặt chắc chắn, đúng vị trí"),
          c("Van, dây cấp, xi phông, phễu thu", "Đủ, đúng chủng loại; lắp kín"),
          c("Vận hành", "Bơm tự ngắt; mở thử các điểm dùng nước: đủ áp, không rò"),
          c("Thoát sàn", "Đổ nước: thoát nhanh, không đọng"),
        ],
      ),
    ],
  },
  {
    code: "GRANITE",
    name: "Đá granite",
    phase: "ht",
    matchKeywords: "granite, da tam cap, da op",
    vtKeywords: "",
    standards: "",
    note: "",
    tasks: [
      t(
        "Lắp đặt đá granite",
        [
          "Đo thực tế các vị trí, ra bản vẽ cắt đá; chủ nhà chốt màu đá",
          "Gia công cắt, mài cạnh tại xưởng",
          "Lắp bằng vữa / keo chuyên dụng; bậu cửa sổ tạo dốc ra ngoài + rãnh chống thấm nước",
          "Chà ron, đánh bóng mép",
        ],
        [
          c("Đá", "Đúng màu, độ dày; không nứt, mẻ"),
          c("Vị trí", "Đủ các vị trí theo HĐ (tam cấp, kệ, bậu cửa…)"),
          c("Độ phẳng, cao độ", "Phẳng, đúng cao độ; bậu cửa sổ dốc ra ngoài"),
          c("Mép, mạch", "Mài cạnh gọn; mạch kín, đều"),
          c("Bám dính", "Gõ không bộp"),
        ],
      ),
    ],
  },
  {
    code: "VS-CN",
    name: "Vệ sinh công nghiệp",
    phase: "ht",
    matchKeywords: "ve sinh",
    vtKeywords: "",
    standards: "",
    note: "",
    tasks: [
      t(
        "Vệ sinh công nghiệp trước bàn giao",
        [
          "Dọn rác, vật tư thừa từ trên xuống",
          "Cạo vết xi măng, sơn; lau kính, khung cửa",
          "Lau thiết bị vệ sinh, điện; bóc màng bảo vệ",
          "Lau sàn 2 lượt; vận chuyển rác khỏi công trình",
        ],
        [
          c("Phạm vi", "Toàn bộ diện tích theo HĐ"),
          c("Sàn, tường, kính", "Sạch vết xi măng, sơn; kính không ố"),
          c("Thiết bị", "Lau sạch thiết bị vệ sinh, điện; bóc màng bảo vệ"),
          c("Rác thải", "Dọn sạch, vận chuyển khỏi công trình"),
        ],
        ["Không dùng axit mạnh trên đá, men gạch bóng, inox"],
      ),
    ],
  },
];

export const DEFAULT_TECHNIQUES: CtTechnique[] = DEFS.map((d, i) => ({ ...d, sortOrder: (i + 1) * 10, isActive: true }));

// Hạng mục HĐ không khớp mẫu nào → điểm dừng chung
export const GENERIC_TASKS: CtTask[] = [
  t(
    "Nghiệm thu hoàn thành hạng mục",
    [],
    [
      c("Vật tư", "Đúng chủng loại, quy cách theo HĐ / phụ lục"),
      c("Phạm vi, khối lượng", "Đủ theo HĐ"),
      c("Kỹ thuật, thẩm mỹ", "Đúng bản vẽ; bề mặt hoàn thiện đạt yêu cầu"),
      c("Vận hành (nếu có)", "Chạy thử đạt"),
    ],
  ),
];
