import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Hướng dẫn dùng app | ERP Huỳnh Gia",
  description: "Hướng dẫn sử dụng app ERP Huỳnh Gia cho Admin, TPTC và Kỹ sư.",
};

type GuideSection = {
  title: string;
  description: string;
  steps: string[];
};

type RoleGuide = {
  id: string;
  label: string;
  title: string;
  summary: string;
  sections: GuideSection[];
};

const roleGuides: RoleGuide[] = [
  {
    id: "admin",
    label: "Admin",
    title: "Admin",
    summary: "Quản trị dữ liệu gốc, phân quyền, cấu hình dự án, theo dõi báo cáo và KPI toàn hệ thống.",
    sections: [
      {
        title: "1. Đăng nhập và kiểm tra tổng quan",
        description: "Vào app bằng tài khoản Admin để xem tình hình chung của công ty.",
        steps: [
          "Mở app, đăng nhập bằng tài khoản được cấp.",
          "Vào Dashboard để xem số dự án, nhiệm vụ, báo cáo và cảnh báo cần xử lý.",
          "Nếu app yêu cầu đổi mật khẩu, đổi mật khẩu trước rồi tiếp tục sử dụng.",
        ],
      },
      {
        title: "2. Tạo và quản lý dự án",
        description: "Dự án là trung tâm của mọi phân công, báo cáo và theo dõi tiến độ.",
        steps: [
          "Vào Dự án, tạo dự án mới với mã, tên, thông tin chủ nhà, ngày bắt đầu và ngày dự kiến hoàn thành.",
          "Cập nhật thông tin đội ngũ phụ trách: TPTC, kỹ sư, đội trưởng và các vai trò liên quan.",
          "Theo dõi trạng thái dự án để biết dự án đang chuẩn bị, đang thi công hay đã hoàn thành.",
        ],
      },
      {
        title: "3. Phân quyền thành viên dự án",
        description: "Ai được gán vào dự án thì mới thấy dữ liệu dự án đó trên app.",
        steps: [
          "Mở chi tiết dự án và vào phần thành viên/phân quyền.",
          "Thêm đúng nhân sự vào dự án: TPTC, kỹ sư, đội trưởng, kế toán nếu cần.",
          "Khi đổi người phụ trách, cập nhật lại danh sách thành viên để người cũ không còn thấy dự án.",
        ],
      },
      {
        title: "4. Quản lý task, template và tiêu chí",
        description: "Admin chuẩn hóa cách giao việc và cách đánh giá để đội thi công dùng thống nhất.",
        steps: [
          "Dùng Template để tạo bộ công việc mẫu theo hạng mục thi công.",
          "Vào dự án hoặc task để kiểm tra người phụ trách, trạng thái, tiến độ và yêu cầu ảnh.",
          "Cấu hình chuyên môn, tiêu chí đánh giá và KPI khi cần điều chỉnh cách chấm điểm.",
        ],
      },
      {
        title: "5. Theo dõi báo cáo và KPI",
        description: "Admin xem được bức tranh tổng thể để phát hiện việc trễ, thiếu báo cáo hoặc KPI bất thường.",
        steps: [
          "Vào Nhiệm vụ/Báo cáo để kiểm tra tình trạng báo cáo trong ngày.",
          "Vào KPI tổng để xem điểm tổng hợp theo nhân sự và theo tháng.",
          "Khi phát hiện dữ liệu sai, kiểm tra lại phân quyền dự án, task được giao và báo cáo của từng người.",
        ],
      },
    ],
  },
  {
    id: "tptc",
    label: "TPTC",
    title: "TPTC",
    summary: "Theo dõi dự án được phân công, giao việc cho kỹ sư, kiểm tra tiến độ và chấm đóng góp.",
    sections: [
      {
        title: "1. Xem các dự án được phân công",
        description: "TPTC chỉ tập trung vào những dự án mình được gán quyền.",
        steps: [
          "Đăng nhập app và vào Dashboard để xem các việc cần chú ý.",
          "Vào Dự án để xem danh sách dự án thuộc phạm vi phụ trách.",
          "Mở từng dự án để xem tiến độ, task, đội ngũ và các thông tin liên quan.",
        ],
      },
      {
        title: "2. Giao việc cho kỹ sư",
        description: "TPTC tạo việc rõ người, rõ hạn và rõ mức độ ưu tiên.",
        steps: [
          "Vào mục Việc TPTC để tạo hoặc theo dõi việc đã giao.",
          "Chọn dự án, chọn kỹ sư phụ trách, nhập nội dung việc, hạn hoàn thành và mức độ ưu tiên.",
          "Kỹ sư sẽ thấy việc TPTC giao trong màn Nhiệm Vụ khi check-in hoặc xử lý công việc trong ngày.",
        ],
      },
      {
        title: "3. Theo dõi báo cáo ngày",
        description: "Báo cáo ngày giúp TPTC biết kỹ sư đang làm gì và còn tồn việc nào.",
        steps: [
          "Vào Nhiệm Vụ/Báo cáo để xem tình hình hoàn thành việc trong ngày.",
          "Kiểm tra các việc đang chờ, đã hoàn thành, không áp dụng và việc có ảnh minh chứng.",
          "Nhắc kỹ sư cập nhật tiến độ hoặc bổ sung ảnh nếu dữ liệu chưa đủ để nghiệm thu nội bộ.",
        ],
      },
      {
        title: "4. Kiểm soát tiến độ và chất lượng",
        description: "TPTC dùng app để bám tiến độ thực tế thay vì chỉ trao đổi miệng.",
        steps: [
          "Mở task để xem trạng thái, tiến độ phần trăm, ảnh thi công và ghi chú.",
          "Kiểm tra các task quan trọng trước các mốc nghiệm thu hoặc bàn giao.",
          "Phối hợp với Admin/Kỹ sư để cập nhật lại phân công nếu người phụ trách thay đổi.",
        ],
      },
      {
        title: "5. Chấm đóng góp và theo dõi KPI",
        description: "Phần chấm đóng góp dùng để phản ánh mức độ phối hợp và hiệu quả của kỹ sư.",
        steps: [
          "Vào Chấm Đóng góp theo kỳ đánh giá.",
          "Chọn đúng kỹ sư, dự án hoặc tiêu chí cần chấm.",
          "Chấm khách quan dựa trên tiến độ, chất lượng cập nhật, tinh thần phối hợp và kết quả thực tế.",
        ],
      },
    ],
  },
  {
    id: "ks",
    label: "KS",
    title: "Kỹ sư",
    summary: "Check-in công việc trong ngày, cập nhật tiến độ, gửi ảnh minh chứng và nộp báo cáo cuối ngày.",
    sections: [
      {
        title: "1. Vào màn Nhiệm Vụ",
        description: "Đây là màn làm việc chính hằng ngày của kỹ sư.",
        steps: [
          "Đăng nhập app bằng tài khoản kỹ sư.",
          "Chọn menu Nhiệm Vụ ở thanh điều hướng dưới cùng.",
          "Nếu chưa check-in trong ngày, app sẽ hiện màn Check-in sáng trước.",
        ],
      },
      {
        title: "2. Check-in sáng",
        description: "Check-in để xác nhận các việc kỹ sư sẽ xử lý trong ngày.",
        steps: [
          "Màn chính chỉ hiện sẵn các task đang làm.",
          "Tick các task đang làm cần đưa vào việc hôm nay.",
          "Nếu cần thêm task khác, bấm Thêm task, chọn dự án, chọn task, rồi bấm Thêm.",
          "Kiểm tra lại tổng số việc đã chọn rồi bấm Check-in.",
        ],
      },
      {
        title: "3. Xử lý nhiệm vụ trong ngày",
        description: "Sau check-in, app chuyển sang danh sách nhiệm vụ hôm nay.",
        steps: [
          "Xem việc theo mức độ ưu tiên: cực khẩn, khẩn, quan trọng và thường.",
          "Mở hướng dẫn nếu task có nội dung hướng dẫn thi công.",
          "Đánh dấu Hoàn thành khi đã làm xong hoặc N/A khi việc không áp dụng trong ngày.",
        ],
      },
      {
        title: "4. Cập nhật tiến độ và ảnh",
        description: "Ảnh và ghi chú là bằng chứng để TPTC/Admin kiểm tra thực tế.",
        steps: [
          "Với việc yêu cầu ảnh, phải nhập link ảnh hoặc cập nhật ảnh minh chứng trước khi hoàn thành.",
          "Với task cập nhật tiến độ, nhập phần trăm mới, ảnh minh chứng và ghi chú nếu cần.",
          "Nếu giảm tiến độ so với trước đó, nhập lý do để quản lý nắm được nguyên nhân.",
        ],
      },
      {
        title: "5. Nộp báo cáo cuối ngày",
        description: "Cuối ngày, kỹ sư kiểm tra lại toàn bộ việc trước khi gửi báo cáo.",
        steps: [
          "Kiểm tra các task còn pending, ảnh minh chứng và ghi chú.",
          "Hoàn tất các việc bắt buộc trước hạn nộp báo cáo.",
          "Bấm gửi báo cáo để khóa dữ liệu trong ngày và chuyển sang trạng thái đã nộp.",
        ],
      },
      {
        title: "6. Xem KPI/Lương",
        description: "Kỹ sư có thể theo dõi kết quả cá nhân trên app.",
        steps: [
          "Bấm menu KPI/Lương ở thanh điều hướng.",
          "Xem điểm KPI, thông tin lương và các kỳ đánh giá liên quan.",
          "Nếu thấy dữ liệu chưa đúng, báo lại TPTC/Admin để kiểm tra task, báo cáo và phân quyền dự án.",
        ],
      },
    ],
  },
];

const quickRules = [
  "Mỗi người chỉ thấy dự án và task trong phạm vi được phân quyền.",
  "Kỹ sư nên check-in đầu ngày và nộp báo cáo cuối ngày đúng hạn.",
  "Task yêu cầu ảnh cần có ảnh minh chứng trước khi đánh dấu hoàn thành.",
  "Khi thay đổi nhân sự dự án, Admin cần cập nhật lại phân quyền ngay.",
];

export default function AppGuidePage() {
  return (
    <main className="min-h-screen bg-[#0f1015] text-[#f0f2ff]">
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <div className="rounded-3xl border border-[#252840] bg-[#13151f] p-5 shadow-2xl sm:p-8">
          <div className="inline-flex rounded-full border border-[#f97316]/30 bg-[#f97316]/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#fb923c]">
            ERP Huỳnh Gia
          </div>
          <h1 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-5xl">Hướng dẫn dùng app</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[#b6bdd8] sm:text-base">
            Tài liệu hướng dẫn nhanh cho ba vị trí chính: Admin, TPTC và Kỹ sư. Dùng trang này để nắm đúng flow làm việc hằng ngày trên app ERP Huỳnh Gia.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {roleGuides.map((role) => (
              <a key={role.id} href={`#${role.id}`} className="rounded-full border border-[#2f3555] bg-[#1a1d2e] px-4 py-2 text-sm font-semibold text-[#d9def3] transition hover:border-[#f97316]/60 hover:text-[#fb923c]">
                {role.label}
              </a>
            ))}
            <a href="/huongdanapp/ks" className="rounded-full border border-[#f97316]/40 bg-[#1a1d2e] px-4 py-2 text-sm font-semibold text-[#fb923c] transition hover:bg-[#f97316]/10">
              Sổ tay Kỹ sư (chi tiết)
            </a>
            <a href="/login" className="rounded-full border border-[#f97316]/40 bg-[#f97316] px-4 py-2 text-sm font-bold text-black transition hover:bg-[#fb923c]">
              Mở app
            </a>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-[#252840] bg-[#1a1d2e] p-5">
          <h2 className="text-lg font-bold text-[#fb923c]">Nguyên tắc chung</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {quickRules.map((rule) => (
              <div key={rule} className="rounded-xl border border-[#2f3555] bg-[#11182d] p-4 text-sm leading-6 text-[#d9def3]">
                {rule}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 space-y-8">
          {roleGuides.map((role) => (
            <section key={role.id} id={role.id} className="scroll-mt-6 rounded-3xl border border-[#252840] bg-[#13151f] p-5 sm:p-7">
              <div className="flex flex-col gap-3 border-b border-[#252840] pb-5 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wide text-[#fb923c]">Vai trò</div>
                  <h2 className="mt-1 text-2xl font-black text-white">{role.title}</h2>
                </div>
                <p className="max-w-2xl text-sm leading-6 text-[#b6bdd8]">{role.summary}</p>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                {role.sections.map((section) => (
                  <article key={section.title} className="rounded-2xl border border-[#2f3555] bg-[#1a1d2e] p-4">
                    <h3 className="text-base font-bold text-[#f0f2ff]">{section.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-[#98a0c2]">{section.description}</p>
                    <ol className="mt-4 space-y-2">
                      {section.steps.map((step, index) => (
                        <li key={step} className="flex gap-3 text-sm leading-6 text-[#d9def3]">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#f97316]/15 text-xs font-bold text-[#fb923c]">{index + 1}</span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-8 rounded-2xl border border-[#f97316]/30 bg-[#f97316]/10 p-5 text-sm leading-6 text-[#ffd7bd]">
          Khi thao tác trên dữ liệu thật, hãy kiểm tra đúng dự án, đúng người phụ trách và đúng ngày báo cáo trước khi lưu hoặc gửi báo cáo.
        </div>
      </section>
    </main>
  );
}
