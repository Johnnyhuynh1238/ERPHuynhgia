"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Flow = "truoc" | "sang" | "ngay" | "cuoi" | "dinh-ky" | "khi-can";

const FLOW_LABEL: Record<Flow, string> = {
  "truoc": "Trước giờ làm",
  "sang": "Sáng",
  "ngay": "Trong ngày",
  "cuoi": "Cuối ngày",
  "dinh-ky": "Định kỳ",
  "khi-can": "Khi cần",
};

const FLOW_COLOR: Record<Flow, string> = {
  "truoc": "#7c83a8",
  "sang": "#fb923c",
  "ngay": "#22d3ee",
  "cuoi": "#a78bfa",
  "dinh-ky": "#34d399",
  "khi-can": "#9ca3af",
};

type Module = {
  id: string;
  flow: Flow;
  title: string;
  route: string;
  summary: string;
  steps: string[];
  notes?: string[];
};

const modules: Module[] = [
  {
    id: "chuan-bi",
    flow: "truoc",
    title: "Chuẩn bị & Đăng nhập",
    route: "/login · /change-password · /me · /notifications",
    summary: "Đăng nhập, đổi mật khẩu lần đầu, đọc thông báo trước khi ra công trường.",
    steps: [
      "Mở app, đăng nhập bằng tài khoản kỹ sư được cấp.",
      "Lần đầu đăng nhập app yêu cầu đổi mật khẩu — đổi xong mới vào được các màn còn lại.",
      "Vào Thông báo (chuông) để đọc nhắc việc TPTC gửi, nhắc nghiệm thu, nhắc sản lượng bị trả về.",
      "Kiểm tra trang Cá nhân (/me) — sai họ tên, SĐT, dự án được gán thì báo Admin sửa, không tự sửa được dự án.",
    ],
    notes: [
      "Chỉ thấy dự án mình được gán làm thành viên. Không thấy dự án ⇒ báo Admin gán quyền.",
    ],
  },
  {
    id: "checkin",
    flow: "sang",
    title: "Check-in sáng",
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
    flow: "sang",
    title: "Phiếu giao việc hàng ngày",
    route: "/projects/[id]/work-orders",
    summary: "Tạo phiếu giao đầu việc cho từng nhóm thợ. KS được tạo + sửa + xoá phiếu.",
    steps: [
      "Vào dự án → tab Giao việc hàng ngày. Mặc định mở ngày hôm nay.",
      "Cách nhanh: bấm Nhân bản hôm qua — app sao chép toàn bộ phiếu của ngày trước sang hôm nay (ngày đích phải chưa có phiếu).",
      "Cách thủ công: bấm Tạo phiếu mới → chọn Nhóm số → chọn Đầu việc từ dự toán NC (có sẵn phase Móng/Thân/Mái + đơn giá) → nhập Sản lượng giao → chọn các Thợ trong nhóm → ghi chú kỹ thuật (VD: đầm chặt K95, mạch vữa 8mm) → bấm Tạo phiếu.",
      "Theo dõi trạng thái: Đang làm (open), Đã xong (done), Dở dang (carried).",
      "Phiếu dở dang cuối ngày sẽ được gợi ý nhân bản sang hôm sau.",
    ],
    notes: [
      "Đầu việc không có trong danh sách ⇒ chưa có trong dự toán NC. Báo TPTC bổ sung trước, không tự ý ghi sản lượng ngoài dự toán.",
      "Mỗi phiếu gắn 1 nhóm thợ + 1 đầu việc — không gộp 2 đầu việc vào 1 phiếu.",
    ],
  },
  {
    id: "budget",
    flow: "ngay",
    title: "Dự toán NC + VT + MM (chỉ xem)",
    route: "/projects/[id]/budget",
    summary: "Xem dự toán Nhân công + Vật tư + Máy móc để biết đầu việc nào còn, đơn giá, khối lượng đã giao.",
    steps: [
      "Vào dự án → tab Dự toán. KS chỉ XEM, không sửa được.",
      "Đọc theo 3 phase: Móng, Thân, Mái. Mỗi đầu việc gồm: tên, đơn vị, đơn giá, khối lượng dự toán, khối lượng đã giao.",
      "Khi đầu việc gần hết khối lượng dự toán mà thực tế còn dư việc ⇒ báo TPTC xét phát sinh.",
    ],
    notes: [
      "Sửa dự toán + khoá dự toán = TPTC. Đề xuất phát sinh = TPTC, Admin duyệt. KS không thao tác các nút này.",
    ],
  },
  {
    id: "nhiem-vu",
    flow: "ngay",
    title: "Xử lý nhiệm vụ trong ngày",
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
      "Không xoá ảnh sau khi đã Hoàn thành — TPTC sẽ dùng ảnh để nghiệm thu.",
    ],
  },
  {
    id: "eod-cham-cong",
    flow: "cuoi",
    title: "EOD — Chấm công",
    route: "/projects/[id]/eod → khối Chấm công",
    summary: "Chấm công cho từng thợ theo quy ước 1 / ½ / 0 và 4 lý do nghỉ.",
    steps: [
      "Vào dự án → tab Cuối ngày. Mặc định mở ngày hôm nay.",
      "Khối Chấm công liệt kê thợ thuộc các nhóm có phiếu giao việc trong ngày.",
      "Bấm số công cho từng thợ: 1 = công đủ, ½ = nửa công, 0 = vắng.",
      "Nếu chọn 0 hoặc ½ phải chọn 1 trong 4 lý do: P (có phép), KP (không phép), MUA (mưa — lỗi công ty), CHO (chờ việc — lỗi công ty).",
      "App tự gom tổng công theo tuần, hiển thị Tuần ở đầu trang.",
    ],
    notes: [
      "MUA và CHO là lỗi công ty — thợ vẫn được tính tiền chờ theo chính sách. KP là không phép, không có lương ngày đó.",
      "Sửa chấm công ngày trước: vẫn được nếu tuần chưa khoá. Đã khoá phải nhờ TPTC mở lại.",
    ],
  },
  {
    id: "eod-san-luong",
    flow: "cuoi",
    title: "EOD — Sản lượng theo phiếu",
    route: "/projects/[id]/eod → khối Sản lượng",
    summary: "Nhập khối lượng thực tế của từng phiếu giao việc + ảnh QC để chờ TPTC duyệt.",
    steps: [
      "Khối Sản lượng liệt kê các phiếu đã tạo trong ngày.",
      "Mỗi phiếu: nhập số lượng thực tế đã làm (≤ sản lượng giao), upload 1–3 ảnh QC hiện trường.",
      "Sau khi điền, trạng thái phiếu chuyển sang Chờ duyệt (pending).",
      "TPTC duyệt → trạng thái chuyển Đạt / Không đạt / Sửa lại (rework).",
      "Nếu bị rework: đọc ghi chú TPTC → khắc phục thực tế → quay lại EOD ngày đó cập nhật lại sản lượng + ảnh.",
    ],
    notes: [
      "Ảnh QC bắt buộc trước khi gửi duyệt — không gửi suông được.",
      "KS không tự duyệt sản lượng của mình. Quyền duyệt thuộc TPTC + Admin.",
    ],
  },
  {
    id: "eod-qc",
    flow: "cuoi",
    title: "EOD — QC checklist & Ghi lỗi thợ",
    route: "/projects/[id]/eod → QC checklist + Ghi nhận lỗi QC",
    summary: "Tick checklist QC cho từng đầu việc và ghi lỗi cá nhân của thợ (ảnh hưởng rating).",
    steps: [
      "Trong từng phiếu sản lượng, mở khối QC checklist — TPTC đã cấu hình sẵn các mục cần kiểm cho đầu việc đó.",
      "Tick từng mục: mục nào yêu cầu ảnh phải đính kèm ảnh.",
      "Phát hiện lỗi do thợ cụ thể: vào khối Ghi nhận lỗi QC → chọn thợ liên quan → chọn mức Nhẹ / Vừa / Nặng → ghi mô tả → bấm lưu.",
      "Lỗi QC ghi nhận sẽ vào hồ sơ thợ (WorkerQcIssue) và ảnh hưởng rating thợ.",
    ],
    notes: [
      "Config mapping checklist cho đầu việc chỉ TPTC làm (/qc-mapping) — KS không vào được màn đó.",
      "Ghi lỗi cụ thể tên thợ + mô tả; tránh ghi chung chung khó truy.",
    ],
  },
  {
    id: "nop-bao-cao",
    flow: "cuoi",
    title: "Nộp báo cáo cuối ngày",
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
    flow: "dinh-ky",
    title: "KPI cá nhân",
    route: "/me/kpi",
    summary: "Xem điểm KPI cá nhân theo kỳ, hiểu các chỉ số để cải thiện.",
    steps: [
      "Vào menu KPI/Lương.",
      "Đọc điểm tổng + chỉ số con: đúng giờ check-in, hoàn thành task, ảnh minh chứng, sản lượng đạt, lỗi QC.",
      "Số liệu sai (VD: task đã làm nhưng không tính) — báo TPTC kiểm tra phân quyền + báo cáo.",
    ],
    notes: [
      "Tab Lương cá nhân hiện không công khai trên app — TPTC gửi phiếu lương qua Zalo theo từng kỳ.",
    ],
  },
  {
    id: "phu-tro",
    flow: "khi-can",
    title: "Phụ trợ",
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

const faqs = [
  {
    q: "Quên check-in sáng, đến trưa mới nhớ — làm thế nào?",
    a: "Vào /reports check-in muộn — vẫn được tính trong ngày nhưng KPI đúng giờ có thể bị trừ. Sau đó tiếp tục flow bình thường.",
  },
  {
    q: "Sản lượng bị TPTC trả về Sửa lại (rework) — quy trình?",
    a: "Đọc ghi chú TPTC → ra hiện trường khắc phục → quay lại EOD ngày đó cập nhật sản lượng + ảnh QC mới → trạng thái về Chờ duyệt, TPTC xét lại.",
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

const principles = [
  "Chỉ thấy dự án được Admin gán — không thấy ⇒ báo Admin.",
  "Bắt buộc check-in sáng trước khi xử lý nhiệm vụ.",
  "Mọi sản lượng phải gắn 1 phiếu giao việc + 1 đầu việc trong dự toán NC.",
  "Ảnh QC bắt buộc trước khi gửi sản lượng để TPTC duyệt.",
  "Sửa dự toán + duyệt sản lượng KHÔNG thuộc quyền KS.",
];

const FLOW_ORDER: Flow[] = ["truoc", "sang", "ngay", "cuoi", "dinh-ky", "khi-can"];

export default function KsGuidePage() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeId, setActiveId] = useState<string>(modules[0].id);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<Flow, Module[]>();
    for (const f of FLOW_ORDER) map.set(f, []);
    for (const m of modules) map.get(m.flow)!.push(m);
    return map;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => (a.target as HTMLElement).offsetTop - (b.target as HTMLElement).offsetTop);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-30% 0px -55% 0px", threshold: 0 }
    );
    observerRef.current = observer;
    for (const m of modules) {
      const el = document.getElementById(m.id);
      if (el) observer.observe(el);
    }
    const faqEl = document.getElementById("faq");
    if (faqEl) observer.observe(faqEl);
    return () => observer.disconnect();
  }, []);

  function jumpTo(id: string) {
    setDrawerOpen(false);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <main className="min-h-screen bg-[#0b0d14] text-[#f0f2ff]">
      <section className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
        <header className="rounded-3xl border border-[#252840] bg-gradient-to-br from-[#13151f] to-[#1a1d2e] p-6 shadow-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#f97316]/30 bg-[#f97316]/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-[#fb923c]">
            <span>Sổ tay</span>
            <span className="text-[#8892b0]">·</span>
            <span>Kỹ sư công trường</span>
          </div>
          <h1 className="mt-4 text-3xl font-black leading-tight tracking-tight text-white sm:text-4xl">
            Hướng dẫn dùng ERP
          </h1>
          <p className="mt-3 text-[15px] leading-7 text-[#b6bdd8]">
            Sắp theo flow 1 ngày của KS. Bấm nút <span className="inline-flex items-center gap-1 rounded-md bg-[#f97316]/15 px-1.5 py-0.5 font-semibold text-[#fb923c]">Mục lục</span> ở góc phải để nhảy thẳng đến mục cần xem.
          </p>
        </header>

        <div className="mt-5 rounded-2xl border border-[#252840] bg-[#13151f] p-4">
          <div className="text-[11px] font-bold uppercase tracking-wide text-[#fb923c]">Nguyên tắc KS</div>
          <ul className="mt-3 space-y-2">
            {principles.map((rule, idx) => (
              <li key={rule} className="flex gap-2.5 text-[14px] leading-6 text-[#d9def3]">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#f97316]/15 text-[10px] font-bold text-[#fb923c]">{idx + 1}</span>
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-8 space-y-8">
          {FLOW_ORDER.map((flow) => {
            const list = grouped.get(flow) || [];
            if (list.length === 0) return null;
            return (
              <div key={flow}>
                <div className="sticky top-0 z-10 -mx-4 mb-3 bg-[#0b0d14]/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: FLOW_COLOR[flow] }} />
                    <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-[#8892b0]">{FLOW_LABEL[flow]}</span>
                    <span className="h-px flex-1 bg-[#252840]" />
                  </div>
                </div>
                <div className="space-y-4">
                  {list.map((m) => {
                    const num = modules.indexOf(m) + 1;
                    return (
                      <article
                        key={m.id}
                        id={m.id}
                        className="scroll-mt-4 rounded-2xl border border-[#252840] bg-[#13151f] p-5 transition hover:border-[#3a3f5e]"
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-black"
                            style={{ background: `${FLOW_COLOR[flow]}22`, color: FLOW_COLOR[flow] }}
                          >
                            {num}
                          </span>
                          <div className="flex-1">
                            <h2 className="text-[17px] font-black leading-snug text-white sm:text-lg">{m.title}</h2>
                            <div className="mt-1 break-all font-mono text-[11px] text-[#8892b0]">{m.route}</div>
                          </div>
                        </div>

                        <p className="mt-3 text-[14px] leading-6 text-[#b6bdd8]">{m.summary}</p>

                        <div className="mt-4">
                          <div className="text-[11px] font-bold uppercase tracking-wide text-[#fb923c]">Các bước</div>
                          <ol className="mt-2 space-y-2.5">
                            {m.steps.map((step, i) => (
                              <li key={step} className="flex gap-3 text-[14px] leading-6 text-[#e5e9ff]">
                                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#252840] text-[10px] font-bold text-[#b6bdd8]">{i + 1}</span>
                                <span>{step}</span>
                              </li>
                            ))}
                          </ol>
                        </div>

                        {m.notes && m.notes.length > 0 ? (
                          <div className="mt-4 rounded-xl border border-[#f97316]/20 bg-[#f97316]/[0.06] p-3">
                            <div className="text-[11px] font-bold uppercase tracking-wide text-[#fb923c]">Lưu ý</div>
                            <ul className="mt-2 space-y-1.5">
                              {m.notes.map((n) => (
                                <li key={n} className="text-[13px] leading-6 text-[#ffd7bd]">• {n}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <section id="faq" className="mt-10 scroll-mt-4 rounded-3xl border border-[#252840] bg-[#13151f] p-5 sm:p-6">
          <div className="text-[11px] font-bold uppercase tracking-wide text-[#fb923c]">Hỏi đáp</div>
          <h2 className="mt-1 text-2xl font-black text-white">Tình huống thường gặp</h2>
          <div className="mt-5 space-y-3">
            {faqs.map((f) => (
              <details key={f.q} className="group rounded-xl border border-[#2f3555] bg-[#11182d] open:border-[#f97316]/40">
                <summary className="flex cursor-pointer list-none items-start gap-3 p-4 text-[14px] font-bold text-[#f0f2ff]">
                  <span className="mt-0.5 text-[#fb923c] transition group-open:rotate-90">▸</span>
                  <span className="flex-1">{f.q}</span>
                </summary>
                <p className="px-4 pb-4 pl-10 text-[14px] leading-6 text-[#d9def3]">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <div className="mt-8 rounded-2xl border border-[#f97316]/30 bg-[#f97316]/10 p-4 text-[13px] leading-6 text-[#ffd7bd]">
          Gặp tình huống chưa có trong sổ tay → ghi lại + báo TPTC. TPTC sẽ tổng hợp đề xuất Admin bổ sung.
        </div>

        <div className="h-24" aria-hidden />
      </section>

      {/* Floating Menu Button — sticky góc phải */}
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        aria-label="Mở mục lục"
        className="fixed bottom-24 right-4 z-30 flex items-center gap-2 rounded-full border border-[#f97316]/50 bg-[#f97316] px-4 py-3 text-sm font-bold text-black shadow-2xl shadow-[#f97316]/30 transition hover:bg-[#fb923c] active:scale-95 sm:bottom-8 sm:right-6"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
        <span>Mục lục</span>
      </button>

      {/* Drawer overlay */}
      {drawerOpen ? (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setDrawerOpen(false)}
          aria-hidden
        />
      ) : null}

      {/* Drawer panel */}
      <aside
        className={`fixed right-0 top-0 z-50 flex h-full w-[88%] max-w-sm flex-col border-l border-[#252840] bg-[#0f1015] shadow-2xl transition-transform duration-300 ${
          drawerOpen ? "translate-x-0" : "translate-x-full"
        }`}
        aria-hidden={!drawerOpen}
      >
        <div className="flex items-center justify-between border-b border-[#252840] p-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#fb923c]">Mục lục</div>
            <div className="mt-0.5 text-base font-black text-white">Sổ tay KS</div>
          </div>
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            aria-label="Đóng mục lục"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1a1d2e] text-[#d9def3] hover:bg-[#252840]"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3">
          {FLOW_ORDER.map((flow) => {
            const list = grouped.get(flow) || [];
            if (list.length === 0) return null;
            return (
              <div key={flow} className="mb-4">
                <div className="mb-2 flex items-center gap-2 px-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: FLOW_COLOR[flow] }} />
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#8892b0]">{FLOW_LABEL[flow]}</span>
                </div>
                <ul className="space-y-1">
                  {list.map((m) => {
                    const num = modules.indexOf(m) + 1;
                    const isActive = activeId === m.id;
                    return (
                      <li key={m.id}>
                        <button
                          type="button"
                          onClick={() => jumpTo(m.id)}
                          className={`flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] leading-5 transition ${
                            isActive
                              ? "bg-[#f97316]/15 text-[#fb923c]"
                              : "text-[#d9def3] hover:bg-[#1a1d2e]"
                          }`}
                        >
                          <span
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold"
                            style={{
                              background: isActive ? FLOW_COLOR[flow] : `${FLOW_COLOR[flow]}22`,
                              color: isActive ? "#0b0d14" : FLOW_COLOR[flow],
                            }}
                          >
                            {num}
                          </span>
                          <span className="flex-1">{m.title}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}

          <div className="mb-4">
            <div className="mb-2 flex items-center gap-2 px-2">
              <span className="h-2 w-2 rounded-full bg-[#fb923c]" />
              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#8892b0]">Hỏi đáp</span>
            </div>
            <button
              type="button"
              onClick={() => jumpTo("faq")}
              className={`flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] leading-5 transition ${
                activeId === "faq" ? "bg-[#f97316]/15 text-[#fb923c]" : "text-[#d9def3] hover:bg-[#1a1d2e]"
              }`}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#fb923c22] text-[12px] text-[#fb923c]">?</span>
              <span className="flex-1">Tình huống thường gặp</span>
            </button>
          </div>
        </nav>

        <div className="border-t border-[#252840] p-3">
          <button
            type="button"
            onClick={() => {
              setDrawerOpen(false);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="w-full rounded-xl bg-[#1a1d2e] py-2.5 text-[13px] font-semibold text-[#d9def3] hover:bg-[#252840]"
          >
            ↑ Lên đầu trang
          </button>
        </div>
      </aside>
    </main>
  );
}
