import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sổ tay Kỹ sư | ERP Huỳnh Gia",
  description: "Sổ tay sử dụng app ERP Huỳnh Gia cho kỹ sư công trường — theo flow 1 ngày và theo từng module.",
};

type Module = {
  id: string;
  flowTag: string;
  title: string;
  route: string;
  summary: string;
  steps: string[];
  notes?: string[];
};

const modules: Module[] = [
  {
    id: "chuan-bi",
    flowTag: "Trước giờ làm",
    title: "1. Chuẩn bị & Đăng nhập",
    route: "/login · /change-password · /me · /notifications",
    summary: "Đăng nhập, đổi mật khẩu lần đầu, đọc thông báo trước khi ra công trường.",
    steps: [
      "Mở app, đăng nhập bằng tài khoản kỹ sư được cấp.",
      "Lần đầu đăng nhập app yêu cầu đổi mật khẩu — đổi xong mới vào được các màn còn lại.",
      "Vào Thông báo (chuông) để đọc nhắc việc TPTC gửi, nhắc nghiệm thu, nhắc sản lượng bị trả về.",
      "Kiểm tra trang Cá nhân (/me) — nếu sai họ tên, SĐT, dự án được gán thì báo Admin sửa, không tự sửa được dự án.",
    ],
    notes: [
      "Quy tắc phân quyền: chỉ thấy dự án mình được gán làm thành viên. Không thấy dự án ⇒ báo Admin gán quyền.",
    ],
  },
  {
    id: "checkin",
    flowTag: "Sáng",
    title: "2. Check-in sáng",
    route: "/reports → Check-in",
    summary: "Xác nhận các nhiệm vụ sẽ xử lý trong ngày. Bắt buộc check-in trước khi mở Nhiệm Vụ.",
    steps: [
      "Vào menu Nhiệm Vụ — nếu chưa check-in, app tự mở màn Check-in.",
      "Màn check-in hiện sẵn các task đang ở trạng thái Đang làm thuộc dự án của mình.",
      "Tick các task sẽ làm hôm nay.",
      "Nếu cần thêm task chưa hiện: bấm Thêm task → chọn Dự án → chọn task → bấm Thêm.",
      "Kiểm tra tổng số việc đã chọn → bấm Check-in.",
    ],
    notes: [
      "Check-in muộn vẫn được trong ngày, nhưng KPI có thể bị trừ điểm đúng giờ.",
      "Sau check-in mới sang được màn Nhiệm Vụ và mở phiếu giao việc.",
    ],
  },
  {
    id: "work-orders",
    flowTag: "Đầu giờ làm",
    title: "3. Phiếu giao việc hàng ngày",
    route: "/projects/[id]/work-orders",
    summary: "Tạo phiếu giao đầu việc cho từng nhóm thợ trong ngày. KS được tạo/sửa/xoá phiếu.",
    steps: [
      "Vào dự án → tab Giao việc hàng ngày. Mặc định mở ngày hôm nay.",
      "Cách nhanh: bấm Nhân bản hôm qua — app sao chép toàn bộ phiếu của ngày trước sang ngày hôm nay (ngày đích phải chưa có phiếu).",
      "Cách thủ công: bấm Tạo phiếu mới → chọn Nhóm số (1, 2, 3…) → chọn Đầu việc từ dự toán NC (có sẵn phase Móng/Thân/Mái + đơn giá) → nhập Sản lượng giao → chọn các Thợ trong nhóm → ghi Chú kỹ thuật (VD: đầm chặt K95, mạch vữa 8mm) → bấm Tạo phiếu.",
      "Theo dõi cột trạng thái: Đang làm (open), Đã xong (done), Dở dang (carried).",
      "Phiếu dở dang cuối ngày sẽ được gợi ý nhân bản sang hôm sau.",
    ],
    notes: [
      "Đầu việc không có trong danh sách ⇒ chưa có trong dự toán NC. Báo TPTC bổ sung dự toán trước, không tự ý ghi sản lượng ngoài dự toán.",
      "Mỗi phiếu gắn 1 nhóm thợ + 1 đầu việc — không gộp 2 đầu việc vào 1 phiếu.",
    ],
  },
  {
    id: "budget",
    flowTag: "Tra cứu trong ngày",
    title: "4. Dự toán NC + VT + MM (chỉ xem)",
    route: "/projects/[id]/budget",
    summary: "Xem dự toán Nhân công + Vật tư + Máy móc để biết đầu việc nào còn, đơn giá, khối lượng đã giao.",
    steps: [
      "Vào dự án → tab Dự toán. KS chỉ XEM, không sửa được.",
      "Đọc theo 3 phase: Móng, Thân, Mái. Mỗi đầu việc gồm: tên, đơn vị, đơn giá, khối lượng dự toán, khối lượng đã giao.",
      "Khi đầu việc gần hết khối lượng dự toán mà thực tế còn dư việc ⇒ báo TPTC xét phát sinh.",
    ],
    notes: [
      "Sửa dự toán + khoá dự toán = TPTC. Đề xuất phát sinh = TPTC đề xuất, Admin duyệt. KS không thao tác các nút này.",
    ],
  },
  {
    id: "nhiem-vu",
    flowTag: "Trong ngày",
    title: "5. Xử lý nhiệm vụ trong ngày",
    route: "/reports/[projectId]",
    summary: "Cập nhật tiến độ task, ảnh minh chứng, hoàn thành hoặc N/A theo tình hình thực tế.",
    steps: [
      "Sau check-in, app chuyển sang danh sách nhiệm vụ hôm nay, sắp theo ưu tiên: cực khẩn → khẩn → quan trọng → thường.",
      "Mở task để xem hướng dẫn thi công (nếu có).",
      "Task yêu cầu ảnh: nhập link ảnh hoặc upload ảnh minh chứng TRƯỚC khi bấm Hoàn thành.",
      "Task cập nhật tiến độ: nhập % mới + ảnh + ghi chú. Nếu % thấp hơn trước ⇒ phải ghi lý do giảm.",
      "Đánh dấu N/A nếu việc không áp dụng trong ngày (VD: chờ vật tư, chờ mặt bằng).",
    ],
    notes: [
      "Không xoá ảnh sau khi đã đánh dấu Hoàn thành — TPTC sẽ dùng ảnh để nghiệm thu.",
    ],
  },
  {
    id: "eod-cham-cong",
    flowTag: "Cuối ngày",
    title: "6. EOD — Chấm công",
    route: "/projects/[id]/eod → khối Chấm công",
    summary: "Chấm công cho từng thợ trong ngày theo quy ước 1 / ½ / 0 và 4 lý do nghỉ.",
    steps: [
      "Vào dự án → tab Cuối ngày. Mặc định mở ngày hôm nay.",
      "Khối Chấm công hiện danh sách thợ thuộc các nhóm có phiếu giao việc trong ngày.",
      "Bấm số công cho từng thợ: 1 = công đủ, ½ = nửa công, 0 = vắng.",
      "Nếu chọn 0 hoặc ½ phải chọn 1 trong 4 lý do: P (có phép), KP (không phép), MUA (mưa — lỗi công ty), CHO (chờ việc — lỗi công ty).",
      "App tự gom tổng công theo tuần, hiển thị Tuần ở đầu trang.",
    ],
    notes: [
      "MUA và CHO là lỗi công ty — vẫn được tính tiền chờ theo chính sách. KP là không phép, không có lương ngày đó.",
      "Sửa lại chấm công ngày trước: vẫn được nếu phiếu chưa khoá tuần. Nếu đã khoá tuần phải nhờ TPTC mở lại.",
    ],
  },
  {
    id: "eod-san-luong",
    flowTag: "Cuối ngày",
    title: "7. EOD — Sản lượng theo phiếu",
    route: "/projects/[id]/eod → khối Sản lượng",
    summary: "Nhập khối lượng thực tế của từng phiếu giao việc + ảnh QC để chờ TPTC duyệt.",
    steps: [
      "Khối Sản lượng theo phiếu liệt kê các phiếu đã tạo trong ngày.",
      "Mỗi phiếu: nhập số lượng thực tế đã làm (≤ sản lượng giao), upload 1–3 ảnh QC hiện trường.",
      "Sau khi điền, trạng thái phiếu chuyển sang Chờ duyệt (pending).",
      "TPTC duyệt → trạng thái chuyển Đạt (passed), Không đạt (failed) hoặc Sửa lại (rework).",
      "Nếu bị rework: đọc ghi chú TPTC → khắc phục thực tế → quay lại EOD ngày đó cập nhật lại sản lượng + ảnh.",
    ],
    notes: [
      "Ảnh QC bắt buộc trước khi gửi duyệt — không gửi suông được.",
      "KS không tự duyệt sản lượng của mình. Quyền duyệt thuộc TPTC + Admin.",
    ],
  },
  {
    id: "eod-qc",
    flowTag: "Cuối ngày",
    title: "8. EOD — QC checklist & Ghi lỗi thợ",
    route: "/projects/[id]/eod → khối QC checklist + Ghi nhận lỗi QC",
    summary: "Tick checklist QC cho từng đầu việc và ghi lỗi cá nhân của thợ (ảnh hưởng rating).",
    steps: [
      "Trong từng phiếu sản lượng, mở khối QC checklist — TPTC đã cấu hình sẵn các mục cần kiểm cho đầu việc đó.",
      "Tick từng mục: mục nào yêu cầu ảnh phải đính kèm ảnh.",
      "Phát hiện lỗi do thợ cụ thể: vào khối Ghi nhận lỗi QC → chọn các thợ liên quan → chọn mức độ Nhẹ / Vừa / Nặng → ghi mô tả → bấm lưu.",
      "Lỗi QC ghi nhận sẽ vào hồ sơ thợ (WorkerQcIssue) và ảnh hưởng rating thợ.",
    ],
    notes: [
      "Mapping checklist cho từng đầu việc chỉ TPTC config (/qc-mapping) — KS không vào được màn đó.",
      "Ghi lỗi phải cụ thể tên thợ + mô tả; tránh ghi chung chung khó truy.",
    ],
  },
  {
    id: "nop-bao-cao",
    flowTag: "Cuối ngày",
    title: "9. Nộp báo cáo cuối ngày",
    route: "/reports",
    summary: "Rà soát toàn bộ task + chấm công + sản lượng + QC, xong bấm gửi báo cáo để khoá dữ liệu trong ngày.",
    steps: [
      "Quay lại /reports, kiểm tra: còn task pending nào không, ảnh minh chứng đủ chưa, ghi chú đã đầy đủ chưa.",
      "Hoàn tất hoặc chuyển N/A cho các task bắt buộc trước hạn nộp.",
      "Bấm Gửi báo cáo — dữ liệu khoá lại, không sửa được nữa (trừ khi TPTC mở lại).",
    ],
  },
  {
    id: "kpi",
    flowTag: "Định kỳ",
    title: "10. KPI cá nhân",
    route: "/my-kpi",
    summary: "Xem điểm KPI cá nhân theo kỳ, hiểu các chỉ số để cải thiện.",
    steps: [
      "Vào menu KPI/Lương.",
      "Đọc điểm tổng + các chỉ số con: đúng giờ check-in, hoàn thành task, ảnh minh chứng, sản lượng đạt, lỗi QC.",
      "Nếu thấy số liệu chưa đúng (VD: task đã làm nhưng không tính) — báo TPTC kiểm tra phân quyền + báo cáo.",
    ],
    notes: [
      "Tab Lương cá nhân hiện không công khai trên app — TPTC sẽ gửi phiếu lương qua Zalo theo từng kỳ.",
    ],
  },
  {
    id: "phu-tro",
    flowTag: "Khi cần",
    title: "11. Phụ trợ",
    route: "/notifications · /dao-tao · /change-password · /me",
    summary: "Các màn dùng không thường xuyên: thông báo, tài liệu đào tạo, đổi mật khẩu, sửa hồ sơ cá nhân.",
    steps: [
      "Thông báo: chuông trên thanh nav — đọc nhắc việc + nhắc nghiệm thu.",
      "Đào tạo: tài liệu thi công, tiêu chuẩn QC, hướng dẫn nội bộ.",
      "Đổi mật khẩu: ít nhất 6 tháng/lần hoặc khi nghi ngờ lộ.",
      "Cá nhân: cập nhật SĐT, ảnh đại diện (họ tên + dự án phải báo Admin).",
    ],
  },
];

const principles = [
  "Chỉ thấy dự án được Admin gán — không thấy ⇒ báo Admin gán quyền, không cố tự sửa.",
  "Bắt buộc check-in sáng trước khi xử lý nhiệm vụ trong ngày.",
  "Mọi sản lượng phải gắn với 1 phiếu giao việc + 1 đầu việc có trong dự toán NC.",
  "Ảnh QC là bắt buộc trước khi gửi sản lượng cho TPTC duyệt.",
  "Sửa dự toán + duyệt sản lượng KHÔNG thuộc quyền KS — đừng tìm nút đó.",
];

const faqs = [
  {
    q: "Quên check-in sáng, đến trưa mới nhớ — làm thế nào?",
    a: "Vào /reports check-in muộn — vẫn được tính trong ngày nhưng KPI đúng giờ có thể bị trừ. Sau đó tiếp tục flow bình thường.",
  },
  {
    q: "Sản lượng bị TPTC trả về Sửa lại (rework) — quy trình?",
    a: "Đọc ghi chú TPTC trên phiếu → ra hiện trường khắc phục → quay lại EOD ngày đó cập nhật sản lượng + ảnh QC mới → trạng thái về Chờ duyệt, TPTC xét lại.",
  },
  {
    q: "Nhập nhầm chấm công ngày trước — còn sửa được không?",
    a: "Còn sửa nếu tuần đó chưa khoá. Tuần đã khoá phải nhờ TPTC mở lại, sửa xong khoá lại.",
  },
  {
    q: "Đầu việc thực tế không có trong dự toán NC?",
    a: "Báo TPTC bổ sung dự toán (TPTC đề xuất phát sinh, Admin duyệt). KS không tạo phiếu giao việc ngoài dự toán.",
  },
  {
    q: "Ngoài công trường mất mạng — chụp ảnh QC offline được không?",
    a: "App chưa hỗ trợ upload offline. Cách tạm: chụp ảnh bằng máy ảnh điện thoại, có sóng quay lại EOD upload sau, miễn còn trong ngày + tuần chưa khoá.",
  },
  {
    q: "Đổi điện thoại / quên mật khẩu?",
    a: "Quên mật khẩu: báo Admin reset. Đổi điện thoại: chỉ cần đăng nhập lại — không cần đăng xuất máy cũ.",
  },
];

export default function KsGuidePage() {
  return (
    <main className="min-h-screen bg-[#0f1015] text-[#f0f2ff]">
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <div className="rounded-3xl border border-[#252840] bg-[#13151f] p-5 shadow-2xl sm:p-8">
          <div className="inline-flex rounded-full border border-[#f97316]/30 bg-[#f97316]/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#fb923c]">
            Sổ tay Kỹ sư
          </div>
          <h1 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-5xl">Sổ tay sử dụng ERP cho Kỹ sư</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[#b6bdd8] sm:text-base">
            Hướng dẫn đầy đủ theo flow 1 ngày + theo từng module. Đọc một lượt khi mới nhận tài khoản, dùng làm sổ tra cứu khi gặp tình huống lạ.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <a href="/huongdanapp" className="rounded-full border border-[#2f3555] bg-[#1a1d2e] px-4 py-2 text-sm font-semibold text-[#d9def3] transition hover:border-[#f97316]/60 hover:text-[#fb923c]">
              ← Hướng dẫn chung
            </a>
            <a href="#faq" className="rounded-full border border-[#2f3555] bg-[#1a1d2e] px-4 py-2 text-sm font-semibold text-[#d9def3] transition hover:border-[#f97316]/60 hover:text-[#fb923c]">
              Hỏi đáp
            </a>
            <a href="/reports" className="rounded-full border border-[#f97316]/40 bg-[#f97316] px-4 py-2 text-sm font-bold text-black transition hover:bg-[#fb923c]">
              Mở Nhiệm Vụ
            </a>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-[#252840] bg-[#1a1d2e] p-5">
          <h2 className="text-lg font-bold text-[#fb923c]">Nguyên tắc KS cần nhớ</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {principles.map((rule) => (
              <div key={rule} className="rounded-xl border border-[#2f3555] bg-[#11182d] p-4 text-sm leading-6 text-[#d9def3]">
                {rule}
              </div>
            ))}
          </div>
        </div>

        <nav className="mt-6 rounded-2xl border border-[#252840] bg-[#13151f] p-5">
          <div className="text-xs font-bold uppercase tracking-wide text-[#fb923c]">Mục lục</div>
          <ol className="mt-3 grid gap-1.5 text-sm text-[#d9def3] sm:grid-cols-2">
            {modules.map((m) => (
              <li key={m.id}>
                <a href={`#${m.id}`} className="hover:text-[#fb923c]">
                  {m.title} <span className="text-xs text-[#8892b0]">· {m.flowTag}</span>
                </a>
              </li>
            ))}
            <li><a href="#faq" className="hover:text-[#fb923c]">Hỏi đáp & Tình huống</a></li>
          </ol>
        </nav>

        <div className="mt-8 space-y-6">
          {modules.map((m) => (
            <section key={m.id} id={m.id} className="scroll-mt-6 rounded-3xl border border-[#252840] bg-[#13151f] p-5 sm:p-7">
              <div className="flex flex-col gap-2 border-b border-[#252840] pb-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="inline-flex rounded-full border border-[#f97316]/30 bg-[#f97316]/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[#fb923c]">
                    {m.flowTag}
                  </div>
                  <h2 className="mt-2 text-xl font-black text-white sm:text-2xl">{m.title}</h2>
                  <div className="mt-1 font-mono text-xs text-[#8892b0]">{m.route}</div>
                </div>
              </div>

              <p className="mt-4 text-sm leading-6 text-[#b6bdd8]">{m.summary}</p>

              <div className="mt-4 text-xs font-bold uppercase tracking-wide text-[#fb923c]">Các bước</div>
              <ol className="mt-2 space-y-2">
                {m.steps.map((step, index) => (
                  <li key={step} className="flex gap-3 text-sm leading-6 text-[#d9def3]">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#f97316]/15 text-xs font-bold text-[#fb923c]">{index + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>

              {m.notes && m.notes.length > 0 ? (
                <div className="mt-4 rounded-xl border border-[#f97316]/20 bg-[#f97316]/5 p-3">
                  <div className="text-xs font-bold uppercase tracking-wide text-[#fb923c]">Lưu ý</div>
                  <ul className="mt-2 space-y-1.5">
                    {m.notes.map((n) => (
                      <li key={n} className="text-sm leading-6 text-[#ffd7bd]">• {n}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          ))}
        </div>

        <section id="faq" className="mt-8 rounded-3xl border border-[#252840] bg-[#13151f] p-5 sm:p-7">
          <div className="text-xs font-bold uppercase tracking-wide text-[#fb923c]">Hỏi đáp</div>
          <h2 className="mt-1 text-2xl font-black text-white">Tình huống thường gặp</h2>
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {faqs.map((f) => (
              <article key={f.q} className="rounded-2xl border border-[#2f3555] bg-[#1a1d2e] p-4">
                <h3 className="text-sm font-bold text-[#f0f2ff]">{f.q}</h3>
                <p className="mt-2 text-sm leading-6 text-[#d9def3]">{f.a}</p>
              </article>
            ))}
          </div>
        </section>

        <div className="mt-8 rounded-2xl border border-[#f97316]/30 bg-[#f97316]/10 p-5 text-sm leading-6 text-[#ffd7bd]">
          Khi gặp tình huống chưa có trong sổ tay, ghi nhận lại + báo TPTC. TPTC sẽ tổng hợp và đề xuất Admin bổ sung vào sổ tay.
        </div>
      </section>
    </main>
  );
}
