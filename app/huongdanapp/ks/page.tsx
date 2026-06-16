"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Stage = "I" | "II" | "III" | "IV" | "V" | "VI";

type StageMeta = {
  num: Stage;
  label: string;
};

const STAGES: StageMeta[] = [
  { num: "I", label: "Trước giờ làm" },
  { num: "II", label: "Sáng — Mở việc" },
  { num: "III", label: "Trong ngày — Triển khai" },
  { num: "IV", label: "Cuối ngày — EOD" },
  { num: "V", label: "Định kỳ" },
  { num: "VI", label: "Khi cần tra cứu" },
];

type Module = {
  id: string;
  stage: Stage;
  title: string;
  route: string;
  summary: string;
  steps: string[];
  notes?: string[];
};

const modules: Module[] = [
  {
    id: "chuan-bi",
    stage: "I",
    title: "Chuẩn bị & Đăng nhập",
    route: "/login · /change-password · /me · /notifications",
    summary: "Đăng nhập, đổi mật khẩu lần đầu, đọc thông báo trước khi ra công trường.",
    steps: [
      "Mở app, đăng nhập bằng tài khoản kỹ sư được cấp.",
      "Lần đầu đăng nhập app yêu cầu đổi mật khẩu — đổi xong mới vào được các màn còn lại.",
      "Vào Thông báo (chuông) để đọc nhắc việc TPTC gửi, nhắc nghiệm thu, nhắc sản lượng bị trả về.",
      "Kiểm tra trang Cá nhân (/me) — sai họ tên, SĐT, dự án được gán thì báo Admin sửa.",
    ],
    notes: [
      "Chỉ thấy dự án mình được gán làm thành viên. Không thấy dự án — báo Admin gán quyền.",
    ],
  },
  {
    id: "checkin",
    stage: "II",
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
    stage: "II",
    title: "Phiếu giao việc hàng ngày",
    route: "/projects/[id]/work-orders",
    summary: "Tạo phiếu giao đầu việc cho từng nhóm thợ. KS được tạo, sửa, xoá phiếu.",
    steps: [
      "Vào dự án → tab Giao việc hàng ngày. Mặc định mở ngày hôm nay.",
      "Cách nhanh: bấm Nhân bản hôm qua — app sao chép toàn bộ phiếu của ngày trước sang hôm nay (ngày đích phải chưa có phiếu).",
      "Cách thủ công: bấm Tạo phiếu mới → chọn Nhóm số → chọn Đầu việc từ dự toán NC (có sẵn phase Móng/Thân/Mái + đơn giá) → nhập Sản lượng giao → chọn các Thợ trong nhóm → ghi chú kỹ thuật (VD: đầm chặt K95, mạch vữa 8mm) → bấm Tạo phiếu.",
      "Theo dõi trạng thái: Đang làm (open), Đã xong (done), Dở dang (carried).",
      "Phiếu dở dang cuối ngày sẽ được gợi ý nhân bản sang hôm sau.",
    ],
    notes: [
      "Đầu việc không có trong danh sách — chưa có trong dự toán NC. Báo TPTC bổ sung trước, không tự ý ghi sản lượng ngoài dự toán.",
      "Mỗi phiếu gắn một nhóm thợ và một đầu việc — không gộp hai đầu việc vào một phiếu.",
    ],
  },
  {
    id: "budget",
    stage: "III",
    title: "Dự toán NC + VT + MM (chỉ xem)",
    route: "/projects/[id]/budget",
    summary: "Xem dự toán Nhân công, Vật tư, Máy móc để biết đầu việc nào còn, đơn giá, khối lượng đã giao.",
    steps: [
      "Vào dự án → tab Dự toán. KS chỉ xem, không sửa được.",
      "Đọc theo ba phase: Móng, Thân, Mái. Mỗi đầu việc gồm tên, đơn vị, đơn giá, khối lượng dự toán, khối lượng đã giao.",
      "Khi đầu việc gần hết khối lượng dự toán mà thực tế còn dư việc — báo TPTC xét phát sinh.",
    ],
    notes: [
      "Sửa dự toán và khoá dự toán thuộc quyền TPTC. Đề xuất phát sinh do TPTC, Admin duyệt. KS không thao tác các nút này.",
    ],
  },
  {
    id: "nhiem-vu",
    stage: "III",
    title: "Xử lý nhiệm vụ trong ngày",
    route: "/reports/[projectId]",
    summary: "Cập nhật tiến độ task, ảnh minh chứng, hoàn thành hoặc N/A theo tình hình thực tế.",
    steps: [
      "Sau check-in, app chuyển sang danh sách nhiệm vụ hôm nay, sắp theo ưu tiên: cực khẩn — khẩn — quan trọng — thường.",
      "Mở task để xem hướng dẫn thi công (nếu có).",
      "Task yêu cầu ảnh: nhập link ảnh hoặc upload ảnh minh chứng trước khi bấm Hoàn thành.",
      "Task cập nhật tiến độ: nhập phần trăm mới, ảnh, ghi chú. Nếu phần trăm thấp hơn trước, phải ghi lý do giảm.",
      "Đánh dấu N/A nếu việc không áp dụng trong ngày (VD: chờ vật tư, chờ mặt bằng).",
    ],
    notes: [
      "Không xoá ảnh sau khi đã Hoàn thành — TPTC sẽ dùng ảnh để nghiệm thu.",
    ],
  },
  {
    id: "eod-cham-cong",
    stage: "IV",
    title: "EOD — Chấm công",
    route: "/projects/[id]/eod → khối Chấm công",
    summary: "Chấm công cho từng thợ theo quy ước 1 / ½ / 0 và bốn lý do nghỉ.",
    steps: [
      "Vào dự án → tab Cuối ngày. Mặc định mở ngày hôm nay.",
      "Khối Chấm công liệt kê thợ thuộc các nhóm có phiếu giao việc trong ngày.",
      "Bấm số công cho từng thợ: 1 là công đủ, ½ là nửa công, 0 là vắng.",
      "Nếu chọn 0 hoặc ½ phải chọn một trong bốn lý do: P (có phép), KP (không phép), MUA (mưa — lỗi công ty), CHO (chờ việc — lỗi công ty).",
      "App tự gom tổng công theo tuần, hiển thị Tuần ở đầu trang.",
    ],
    notes: [
      "MUA và CHO là lỗi công ty — thợ vẫn được tính tiền chờ theo chính sách. KP là không phép, không có lương ngày đó.",
      "Sửa chấm công ngày trước: vẫn được nếu tuần chưa khoá. Đã khoá phải nhờ TPTC mở lại.",
    ],
  },
  {
    id: "eod-san-luong",
    stage: "IV",
    title: "EOD — Sản lượng theo phiếu",
    route: "/projects/[id]/eod → khối Sản lượng",
    summary: "Nhập khối lượng thực tế của từng phiếu giao việc và ảnh QC để chờ TPTC duyệt.",
    steps: [
      "Khối Sản lượng liệt kê các phiếu đã tạo trong ngày.",
      "Mỗi phiếu: nhập số lượng thực tế đã làm (không quá sản lượng giao), upload 1 đến 3 ảnh QC hiện trường.",
      "Sau khi điền, trạng thái phiếu chuyển sang Chờ duyệt (pending).",
      "TPTC duyệt — trạng thái chuyển Đạt, Không đạt hoặc Sửa lại (rework).",
      "Nếu bị rework: đọc ghi chú TPTC → khắc phục thực tế → quay lại EOD ngày đó cập nhật sản lượng và ảnh.",
    ],
    notes: [
      "Ảnh QC bắt buộc trước khi gửi duyệt — không gửi suông được.",
      "KS không tự duyệt sản lượng của mình. Quyền duyệt thuộc TPTC và Admin.",
    ],
  },
  {
    id: "eod-qc",
    stage: "IV",
    title: "EOD — QC checklist & Ghi lỗi thợ",
    route: "/projects/[id]/eod → QC checklist + Ghi nhận lỗi QC",
    summary: "Tick checklist QC cho từng đầu việc và ghi lỗi cá nhân của thợ (ảnh hưởng rating).",
    steps: [
      "Trong từng phiếu sản lượng, mở khối QC checklist — TPTC đã cấu hình sẵn các mục cần kiểm cho đầu việc đó.",
      "Tick từng mục: mục nào yêu cầu ảnh phải đính kèm ảnh.",
      "Phát hiện lỗi do thợ cụ thể: vào khối Ghi nhận lỗi QC → chọn thợ liên quan → chọn mức Nhẹ, Vừa hoặc Nặng → ghi mô tả → bấm lưu.",
      "Lỗi QC ghi nhận sẽ vào hồ sơ thợ (WorkerQcIssue) và ảnh hưởng rating thợ.",
    ],
    notes: [
      "Cấu hình mapping checklist cho đầu việc chỉ TPTC làm (/qc-mapping) — KS không vào được màn đó.",
      "Ghi lỗi cụ thể tên thợ và mô tả; tránh ghi chung chung khó truy.",
    ],
  },
  {
    id: "nop-bao-cao",
    stage: "IV",
    title: "Nộp báo cáo cuối ngày",
    route: "/reports",
    summary: "Rà soát toàn bộ task, chấm công, sản lượng, QC, sau đó bấm gửi báo cáo để khoá dữ liệu.",
    steps: [
      "Quay lại /reports, kiểm tra: còn task pending nào không, ảnh minh chứng đủ chưa, ghi chú đầy đủ chưa.",
      "Hoàn tất hoặc chuyển N/A cho các task bắt buộc trước hạn nộp.",
      "Bấm Gửi báo cáo — dữ liệu khoá lại, không sửa được nữa (trừ khi TPTC mở lại).",
    ],
  },
  {
    id: "kpi",
    stage: "V",
    title: "KPI cá nhân",
    route: "/me/kpi",
    summary: "Xem điểm KPI cá nhân theo kỳ, hiểu các chỉ số để cải thiện.",
    steps: [
      "Vào menu KPI/Lương.",
      "Đọc điểm tổng và các chỉ số con: đúng giờ check-in, hoàn thành task, ảnh minh chứng, sản lượng đạt, lỗi QC.",
      "Số liệu sai (VD: task đã làm nhưng không tính) — báo TPTC kiểm tra phân quyền và báo cáo.",
    ],
    notes: [
      "Tab Lương cá nhân hiện không công khai trên app — TPTC gửi phiếu lương qua Zalo theo từng kỳ.",
    ],
  },
  {
    id: "phu-tro",
    stage: "VI",
    title: "Phụ trợ",
    route: "/notifications · /dao-tao · /change-password · /me",
    summary: "Các màn dùng không thường xuyên: thông báo, tài liệu đào tạo, đổi mật khẩu, sửa hồ sơ cá nhân.",
    steps: [
      "Thông báo: chuông trên thanh nav — đọc nhắc việc và nhắc nghiệm thu.",
      "Đào tạo: tài liệu thi công, tiêu chuẩn QC, hướng dẫn nội bộ.",
      "Đổi mật khẩu: ít nhất sáu tháng một lần hoặc khi nghi ngờ lộ.",
      "Cá nhân: cập nhật SĐT, ảnh đại diện (họ tên và dự án phải báo Admin).",
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
    a: "Đọc ghi chú TPTC, ra hiện trường khắc phục, quay lại EOD ngày đó cập nhật sản lượng và ảnh QC mới. Trạng thái về Chờ duyệt, TPTC xét lại.",
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
    a: "App chưa hỗ trợ upload offline. Cách tạm: chụp ảnh bằng máy ảnh điện thoại, có sóng quay lại EOD upload sau, miễn còn trong ngày và tuần chưa khoá.",
  },
  {
    q: "Đổi điện thoại / quên mật khẩu?",
    a: "Quên mật khẩu: báo Admin reset. Đổi điện thoại: chỉ cần đăng nhập lại, không cần đăng xuất máy cũ.",
  },
];

const principles = [
  "Chỉ thấy dự án được Admin gán. Không thấy dự án — báo Admin gán quyền.",
  "Bắt buộc check-in sáng trước khi xử lý nhiệm vụ trong ngày.",
  "Mọi sản lượng phải gắn một phiếu giao việc và một đầu việc trong dự toán NC.",
  "Ảnh QC bắt buộc trước khi gửi sản lượng để TPTC duyệt.",
  "Sửa dự toán và duyệt sản lượng không thuộc quyền KS.",
];

function pad2(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

export default function KsGuidePage() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeId, setActiveId] = useState<string>(modules[0].id);

  const grouped = useMemo(() => {
    const map = new Map<Stage, Module[]>();
    for (const s of STAGES) map.set(s.num, []);
    for (const m of modules) map.get(m.stage)!.push(m);
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
      { rootMargin: "-25% 0px -60% 0px", threshold: 0 }
    );
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
    <main className="min-h-screen bg-[#f7f6f3] text-[#1c1917]">
      <article className="mx-auto max-w-3xl px-4 py-8 sm:px-8 sm:py-12">
        <header className="border-b-2 border-[#1c1917] pb-6">
          <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.25em] text-[#78716c]">
            ERP Huỳnh Gia · Tài liệu nội bộ
          </div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-[#1c1917] sm:text-4xl">
            Sổ tay Kỹ sư
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-7 text-[#44403c]">
            Hướng dẫn vận hành ERP theo trình tự một ngày làm việc của kỹ sư công trường — từ check-in sáng đến nộp báo cáo cuối ngày.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-[12px] text-[#57534e] sm:grid-cols-3">
            <div><span className="text-[#a8a29e]">Phiên bản:</span> 2026-06</div>
            <div><span className="text-[#a8a29e]">Đối tượng:</span> Kỹ sư công trường</div>
            <div><span className="text-[#a8a29e]">Mục:</span> {modules.length} nghiệp vụ</div>
          </div>
        </header>

        <section className="mt-8 border border-[#d6d3d1] bg-white p-5">
          <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[#78716c]">
            §0. Nguyên tắc chung
          </div>
          <ol className="mt-3 space-y-2">
            {principles.map((rule, i) => (
              <li key={rule} className="flex gap-3 text-[14px] leading-6 text-[#1c1917]">
                <span className="w-6 shrink-0 font-mono text-[12px] text-[#a8a29e]">0.{i + 1}</span>
                <span>{rule}</span>
              </li>
            ))}
          </ol>
        </section>

        <div className="mt-10 space-y-12">
          {STAGES.map((stage, sIdx) => {
            const list = grouped.get(stage.num) || [];
            if (list.length === 0) return null;
            return (
              <section key={stage.num}>
                <div className="mb-6 border-b border-[#1c1917] pb-2">
                  <div className="flex items-baseline gap-3">
                    <span className="font-mono text-[13px] font-bold tracking-[0.2em] text-[#1c1917]">
                      § {stage.num}
                    </span>
                    <h2 className="text-[15px] font-bold uppercase tracking-[0.1em] text-[#1c1917]">
                      {stage.label}
                    </h2>
                  </div>
                </div>

                <div className="space-y-6">
                  {list.map((m) => {
                    const num = modules.indexOf(m) + 1;
                    return (
                      <article
                        key={m.id}
                        id={m.id}
                        className="scroll-mt-6 border border-[#d6d3d1] bg-white"
                      >
                        <div className="border-b border-[#e7e5e4] bg-[#fafaf9] px-5 py-3">
                          <div className="flex items-baseline gap-4">
                            <span className="font-mono text-[12px] font-bold text-[#57534e]">
                              {stage.num}.{pad2(list.indexOf(m) + 1)}
                            </span>
                            <h3 className="flex-1 text-[16px] font-bold text-[#1c1917] sm:text-[17px]">
                              <span className="font-mono text-[#a8a29e]">{pad2(num)}. </span>
                              {m.title}
                            </h3>
                          </div>
                          <div className="mt-1 break-all pl-9 font-mono text-[11px] text-[#78716c]">
                            {m.route}
                          </div>
                        </div>

                        <div className="px-5 py-4">
                          <p className="text-[14px] leading-7 text-[#44403c]">{m.summary}</p>

                          <div className="mt-5">
                            <div className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#78716c]">
                              Các bước thực hiện
                            </div>
                            <ol className="mt-2 space-y-2">
                              {m.steps.map((step, i) => (
                                <li key={step} className="flex gap-3 text-[14px] leading-7 text-[#1c1917]">
                                  <span className="w-8 shrink-0 font-mono text-[12px] text-[#a8a29e]">
                                    {pad2(num)}.{i + 1}
                                  </span>
                                  <span>{step}</span>
                                </li>
                              ))}
                            </ol>
                          </div>

                          {m.notes && m.notes.length > 0 ? (
                            <div className="mt-5 border-l-2 border-[#1c1917] bg-[#fafaf9] py-3 pl-4 pr-3">
                              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#57534e]">
                                Lưu ý
                              </div>
                              <ul className="mt-1.5 space-y-1">
                                {m.notes.map((n) => (
                                  <li key={n} className="text-[13px] leading-6 text-[#44403c]">
                                    — {n}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        <section id="faq" className="mt-12 scroll-mt-6">
          <div className="mb-6 border-b border-[#1c1917] pb-2">
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-[13px] font-bold tracking-[0.2em] text-[#1c1917]">§ VII</span>
              <h2 className="text-[15px] font-bold uppercase tracking-[0.1em] text-[#1c1917]">Hỏi đáp & Tình huống</h2>
            </div>
          </div>
          <div className="space-y-2">
            {faqs.map((f, i) => (
              <details key={f.q} className="group border border-[#d6d3d1] bg-white open:border-[#1c1917]">
                <summary className="flex cursor-pointer list-none items-baseline gap-3 px-5 py-3 text-[14px] font-semibold text-[#1c1917]">
                  <span className="font-mono text-[12px] text-[#a8a29e]">{pad2(i + 1)}</span>
                  <span className="flex-1">{f.q}</span>
                  <span className="text-[#78716c] transition group-open:rotate-90">›</span>
                </summary>
                <p className="border-t border-[#e7e5e4] bg-[#fafaf9] px-5 py-4 pl-11 text-[14px] leading-7 text-[#44403c]">
                  {f.a}
                </p>
              </details>
            ))}
          </div>
        </section>

        <footer className="mt-12 border-t border-[#d6d3d1] pt-6 text-[12px] text-[#78716c]">
          <p>Gặp tình huống chưa có trong sổ tay — ghi nhận lại và báo TPTC. TPTC sẽ tổng hợp đề xuất Admin bổ sung vào sổ tay phiên bản sau.</p>
          <p className="mt-2 font-mono text-[11px] text-[#a8a29e]">— Hết —</p>
        </footer>

        <div className="h-28" aria-hidden />
      </article>

      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        aria-label="Mở mục lục"
        className="fixed bottom-24 right-4 z-30 flex items-center gap-2 border border-[#1c1917] bg-[#1c1917] px-4 py-2.5 text-[12px] font-bold uppercase tracking-[0.15em] text-white shadow-lg transition hover:bg-[#292524] sm:bottom-8 sm:right-8"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
        <span>Mục lục</span>
      </button>

      {drawerOpen ? (
        <div
          className="fixed inset-0 z-40 bg-black/30"
          onClick={() => setDrawerOpen(false)}
          aria-hidden
        />
      ) : null}

      <aside
        className={`fixed right-0 top-0 z-50 flex h-full w-[88%] max-w-sm flex-col border-l border-[#1c1917] bg-white shadow-2xl transition-transform duration-300 ${
          drawerOpen ? "translate-x-0" : "translate-x-full"
        }`}
        aria-hidden={!drawerOpen}
      >
        <div className="flex items-center justify-between border-b border-[#d6d3d1] px-5 py-4">
          <div>
            <div className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-[#78716c]">Mục lục</div>
            <div className="mt-0.5 text-[16px] font-bold text-[#1c1917]">Sổ tay Kỹ sư</div>
          </div>
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            aria-label="Đóng mục lục"
            className="flex h-9 w-9 items-center justify-center border border-[#d6d3d1] text-[#57534e] hover:bg-[#fafaf9]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3">
          {STAGES.map((stage) => {
            const list = grouped.get(stage.num) || [];
            if (list.length === 0) return null;
            return (
              <div key={stage.num} className="mb-4">
                <div className="mb-1.5 px-2 pt-1">
                  <div className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#78716c]">
                    § {stage.num} — {stage.label}
                  </div>
                </div>
                <ul>
                  {list.map((m) => {
                    const num = modules.indexOf(m) + 1;
                    const isActive = activeId === m.id;
                    return (
                      <li key={m.id}>
                        <button
                          type="button"
                          onClick={() => jumpTo(m.id)}
                          className={`flex w-full items-baseline gap-3 border-l-2 px-3 py-2 text-left text-[13px] leading-5 transition ${
                            isActive
                              ? "border-[#1c1917] bg-[#fafaf9] font-semibold text-[#1c1917]"
                              : "border-transparent text-[#44403c] hover:border-[#a8a29e] hover:bg-[#fafaf9]"
                          }`}
                        >
                          <span className="font-mono text-[11px] text-[#a8a29e]">{pad2(num)}</span>
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
            <div className="mb-1.5 px-2 pt-1">
              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#78716c]">
                § VII — Hỏi đáp
              </div>
            </div>
            <button
              type="button"
              onClick={() => jumpTo("faq")}
              className={`flex w-full items-baseline gap-3 border-l-2 px-3 py-2 text-left text-[13px] leading-5 transition ${
                activeId === "faq"
                  ? "border-[#1c1917] bg-[#fafaf9] font-semibold text-[#1c1917]"
                  : "border-transparent text-[#44403c] hover:border-[#a8a29e] hover:bg-[#fafaf9]"
              }`}
            >
              <span className="font-mono text-[11px] text-[#a8a29e]">FAQ</span>
              <span className="flex-1">Tình huống thường gặp</span>
            </button>
          </div>
        </nav>

        <div className="border-t border-[#d6d3d1] px-3 py-3">
          <button
            type="button"
            onClick={() => {
              setDrawerOpen(false);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="w-full border border-[#d6d3d1] bg-white py-2 text-[12px] font-semibold uppercase tracking-[0.15em] text-[#1c1917] hover:bg-[#fafaf9]"
          >
            ↑ Đầu trang
          </button>
        </div>
      </aside>
    </main>
  );
}
