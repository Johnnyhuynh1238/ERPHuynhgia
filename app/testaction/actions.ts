export type ActionFanout = {
  role: string;
  expect: string;
};

export type TestAction = {
  id: string;
  title: string;
  actor: string;
  fanout: ActionFanout[];
};

export type ActionGroup = {
  key: string;
  title: string;
  description?: string;
  items: TestAction[];
};

export const ACTION_GROUPS: ActionGroup[] = [
  {
    key: "setup",
    title: "A. Setup dự án",
    items: [
      {
        id: "A1",
        title: "Admin tạo dự án mới",
        actor: "Admin",
        fanout: [
          { role: "Admin", expect: "Thấy dự án mới trong dashboard" },
          { role: "CM", expect: "Thấy dự án nếu được gán quản lý" },
          { role: "KS / Foreman", expect: "KHÔNG thấy (chưa được gán)" },
          { role: "Customer", expect: "Chưa có token, chưa truy cập được" },
        ],
      },
      {
        id: "A2",
        title: "Admin/CM gán KS chính vào dự án",
        actor: "Admin / CM",
        fanout: [
          { role: "KS được gán", expect: "Bell 'Bạn được giao dự án X'; dashboard hiện dự án" },
          { role: "KS khác", expect: "KHÔNG thấy dự án này" },
          { role: "Foreman", expect: "Chưa thấy (chưa gán riêng)" },
        ],
      },
      {
        id: "A3",
        title: "Admin/CM gán Foreman vào dự án",
        actor: "Admin / CM",
        fanout: [
          { role: "Foreman được gán", expect: "Bell + dashboard hiện dự án" },
          { role: "KS chính", expect: "Thấy foreman trong tab Đội ngũ" },
        ],
      },
      {
        id: "A4",
        title: "Admin/CM tạo token cho chủ nhà",
        actor: "Admin / CM",
        fanout: [
          { role: "Customer", expect: "Mở link → vào portal, thấy 4 tab" },
          { role: "KS / Foreman / CM", expect: "Thấy 'Đã gửi link' trong nhật ký dự án" },
          { role: "Customer khác", expect: "KHÔNG mở được link này" },
        ],
      },
      {
        id: "A5",
        title: "CM thêm member phụ (KS phụ / kế toán)",
        actor: "CM",
        fanout: [
          { role: "Member mới", expect: "Bell + dashboard hiện dự án" },
          { role: "Member cũ", expect: "Tab Đội ngũ có người mới" },
          { role: "Customer", expect: "Tab Tổng quan cập nhật Đội ngũ" },
        ],
      },
    ],
  },
  {
    key: "assign",
    title: "B. Phân công công việc",
    items: [
      {
        id: "A6",
        title: "CM tạo task + gán KS phụ trách",
        actor: "CM",
        fanout: [
          { role: "KS được gán", expect: "Bell + task hiện /reports" },
          { role: "KS khác", expect: "Vào dự án thấy task nhưng không nhận bell" },
          { role: "Foreman", expect: "Thấy task để chuẩn bị QC" },
          { role: "Customer", expect: "Thấy ở tab Tiến độ (nếu visibleToCustomer=true)" },
        ],
      },
      {
        id: "A7",
        title: "CM đổi người phụ trách task (KS A → KS B)",
        actor: "CM",
        fanout: [
          { role: "KS A (cũ)", expect: "Mất task khỏi /reports; vẫn thấy lịch sử" },
          { role: "KS B (mới)", expect: "Bell + task xuất hiện" },
          { role: "Foreman", expect: "Thấy đổi tên KS phụ trách" },
          { role: "Customer", expect: "Tab Tiến độ cập nhật tên KS mới" },
        ],
      },
      {
        id: "A8",
        title: "CM dời deadline task",
        actor: "CM",
        fanout: [
          { role: "KS phụ trách", expect: "Bell 'Deadline dời sang ngày Z'" },
          { role: "Foreman", expect: "Thấy ngày mới" },
          { role: "Customer", expect: "Tab Tiến độ ngày mới + log 'Dời hạn'" },
        ],
      },
    ],
  },
  {
    key: "ks-day",
    title: "C. Một ngày làm việc của KS",
    items: [
      {
        id: "A9",
        title: "KS check-in sáng (chọn task hôm nay)",
        actor: "KS",
        fanout: [
          { role: "KS", expect: "Tạo MorningCheckin; task → đang làm" },
          { role: "CM", expect: "Dashboard hiện 'KS X đã check-in HH:MM'" },
          { role: "Foreman", expect: "Thấy task chuyển 'đang làm' → chuẩn bị QC" },
          { role: "Customer", expect: "Tab Nhật ký entry 'KS bắt đầu thi công task Y'" },
        ],
      },
      {
        id: "A10",
        title: "KS tick xong nhiệm vụ + upload ảnh",
        actor: "KS",
        fanout: [
          { role: "KS", expect: "Status → done, ảnh lưu" },
          { role: "CM", expect: "% progress dự án cập nhật" },
          { role: "Foreman", expect: "Bell 'Task Y xong, mời kiểm QC'" },
          { role: "Customer", expect: "Tab Tiến độ có ảnh + có thể bình luận" },
        ],
      },
      {
        id: "A11",
        title: "KS submit báo cáo cuối ngày (EOD)",
        actor: "KS",
        fanout: [
          { role: "KS", expect: "Ghi nhận đã nộp, isLate nếu >17:00" },
          { role: "CM", expect: "Dashboard hiện 'đã nộp HH:MM' + KPI" },
          { role: "Foreman", expect: "Thấy KS đã nộp" },
          { role: "Customer", expect: "Tab Nhật ký entry 'hoàn thành báo cáo ngày'" },
        ],
      },
    ],
  },
  {
    key: "qc",
    title: "D. QC + nghiệm thu",
    items: [
      {
        id: "A12",
        title: "Foreman tick QC pass cho task",
        actor: "Foreman",
        fanout: [
          { role: "KS", expect: "Bell 'Task Y đạt QC'" },
          { role: "CM", expect: "Dashboard QC cập nhật" },
          { role: "Customer", expect: "Tab Tiến độ có badge 'Đạt QC'" },
        ],
      },
      {
        id: "A13",
        title: "Foreman ký nghiệm thu task",
        actor: "Foreman",
        fanout: [
          { role: "Foreman", expect: "Ghi chữ ký + thời gian" },
          { role: "KS", expect: "Bell 'Task Y đã nghiệm thu'" },
          { role: "CM", expect: "Dashboard cập nhật" },
          { role: "Customer", expect: "Bell 'Mời chủ nhà ký xác nhận'" },
        ],
      },
      {
        id: "A14",
        title: "Customer ký nghiệm thu task",
        actor: "Customer",
        fanout: [
          { role: "Customer", expect: "Lưu chữ ký, không cho ký lại" },
          { role: "KS / Foreman / CM", expect: "Bell 'Chủ nhà đã xác nhận'" },
          { role: "Task", expect: "Status → đã nghiệm thu, đóng" },
        ],
      },
      {
        id: "A19",
        title: "Foreman tạo lỗi QC (qcItem) cho task",
        actor: "Foreman",
        fanout: [
          { role: "KS phụ trách", expect: "Bell 'Có lỗi QC cần sửa'" },
          { role: "Customer", expect: "Tab Tiến độ task có badge 'Đang xử lý lỗi'" },
        ],
      },
      {
        id: "A20",
        title: "KS sửa xong lỗi QC + báo lại",
        actor: "KS",
        fanout: [
          { role: "Foreman", expect: "Bell 'KS đã sửa, mời kiểm lại'" },
          { role: "Customer", expect: "Badge đổi sang 'Đã sửa'" },
        ],
      },
    ],
  },
  {
    key: "finance",
    title: "E. Tài chính",
    items: [
      {
        id: "A15",
        title: "CM tạo đợt thanh toán",
        actor: "CM",
        fanout: [
          { role: "Customer", expect: "Bell + tab Tài chính hiện đợt mới" },
          { role: "KS / Foreman", expect: "KHÔNG nhận" },
          { role: "Admin", expect: "Thấy trong báo cáo tài chính" },
        ],
      },
      {
        id: "A16",
        title: "Customer upload biên lai thanh toán",
        actor: "Customer",
        fanout: [
          { role: "Customer", expect: "Trạng thái đợt → chờ duyệt" },
          { role: "CM / Admin", expect: "Bell 'Chủ nhà gửi biên lai, mời duyệt'" },
        ],
      },
      {
        id: "A28",
        title: "Customer bình luận đợt thanh toán",
        actor: "Customer",
        fanout: [
          { role: "CM / Admin", expect: "Bell có nội dung bình luận" },
          { role: "Other customer", expect: "KHÔNG thấy" },
        ],
      },
    ],
  },
  {
    key: "comment-log",
    title: "F. Bình luận + nhật ký",
    items: [
      {
        id: "A17",
        title: "Customer bình luận task",
        actor: "Customer",
        fanout: [
          { role: "KS phụ trách", expect: "Bell có nội dung bình luận" },
          { role: "Foreman", expect: "Bell (nếu có gán)" },
          { role: "CM", expect: "Bell" },
          { role: "Customer khác", expect: "KHÔNG thấy" },
        ],
      },
      {
        id: "A21",
        title: "KS đăng nhật ký công trường (riêng, không gắn task)",
        actor: "KS",
        fanout: [
          { role: "CM", expect: "Thấy trong tab Nhật ký dự án" },
          { role: "Customer", expect: "Thấy ở tab Nhật ký portal" },
          { role: "Foreman", expect: "Thấy" },
        ],
      },
      {
        id: "A22",
        title: "CM tạo phase timeline (móng/thân/hoàn thiện)",
        actor: "CM",
        fanout: [
          { role: "KS / Foreman", expect: "Tasks gom theo phase trong dự án" },
          { role: "Customer", expect: "Tab Tiến độ hiện timeline phase" },
        ],
      },
      {
        id: "A23",
        title: "Báo ngày nghỉ công trình (mưa/bão)",
        actor: "CM",
        fanout: [
          { role: "KS", expect: "Không bị trừ KPI ngày đó, không nhận bell sáng" },
          { role: "Customer", expect: "Thấy 'Nghỉ do thời tiết DD/MM'" },
          { role: "Cron 8:00", expect: "Skip KS của dự án nghỉ" },
        ],
      },
    ],
  },
  {
    key: "cron-admin",
    title: "G. Hệ thống + admin",
    items: [
      {
        id: "A18",
        title: "Cron 8:00 / 17:00 / TPTC dueAt",
        actor: "System cron",
        fanout: [
          { role: "KS chưa check-in", expect: "Bell sáng 7:30 / 7:45 / 8:00" },
          { role: "KS đã check-in", expect: "KHÔNG nhận bell sáng (regression bug đã fix)" },
          { role: "KS còn task pending", expect: "Bell EOD 16:30 / 16:45 / 17:00" },
          { role: "KS hết task pending", expect: "KHÔNG nhận bell EOD" },
          { role: "Người được giao TPTC", expect: "Bell trước dueAt 30/15/0 phút" },
          { role: "Cùng KS lần 2 trong window", expect: "Dedup, không gửi trùng" },
        ],
      },
      {
        id: "A24",
        title: "CM hủy / từ chối TPTC",
        actor: "CM",
        fanout: [
          { role: "KS được giao", expect: "Task biến mất khỏi /reports + bell 'Đã hủy'" },
          { role: "Cron TPTC", expect: "Không fire bell nữa cho task này" },
        ],
      },
      {
        id: "A25",
        title: "Admin vô hiệu hóa user",
        actor: "Admin",
        fanout: [
          { role: "User bị vô hiệu", expect: "Không login được" },
          { role: "Dự án của user", expect: "Hiện cảnh báo 'Cần gán lại' hoặc auto reassign" },
          { role: "Cron", expect: "Không gửi bell cho user inactive" },
        ],
      },
      {
        id: "A26",
        title: "Admin đổi role user (KS → CM)",
        actor: "Admin",
        fanout: [
          { role: "User đổi role", expect: "Đăng nhập lại thấy layout/quyền mới" },
          { role: "Dashboard", expect: "Hiện đúng role mới" },
        ],
      },
      {
        id: "A27",
        title: "First login bắt đổi mật khẩu",
        actor: "User mới",
        fanout: [
          { role: "User", expect: "Bị chặn vào app cho đến khi đổi mật khẩu" },
          { role: "Admin", expect: "Thấy trạng thái 'Đã đổi mật khẩu' sau khi user đổi xong" },
        ],
      },
      {
        id: "A29",
        title: "PWA subscribe push notification",
        actor: "User bất kỳ",
        fanout: [
          { role: "User", expect: "Sau khi đồng ý, bell hệ thống tới máy này" },
          { role: "User unsubscribe", expect: "Bell ngừng trên máy này" },
          { role: "Server", expect: "Lưu PushSubscription endpoint riêng cho máy" },
        ],
      },
      {
        id: "A30",
        title: "CM / Admin xuất báo cáo PDF",
        actor: "CM / Admin",
        fanout: [
          { role: "File PDF", expect: "Generate đúng dữ liệu đang hiển thị" },
          { role: "Lịch sử export", expect: "Lưu ai export, lúc nào" },
        ],
      },
    ],
  },
];

export const ALL_ACTIONS = ACTION_GROUPS.flatMap((g) => g.items);
