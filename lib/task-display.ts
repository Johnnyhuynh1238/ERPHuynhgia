import { TaskPhase, TaskStatus } from "@prisma/client";

export const PHASE_LABEL: Record<TaskPhase, string> = {
  P1_CHUAN_BI: "P1 Chuẩn bị",
  P2_MONG: "P2 Móng",
  P3_KHUNG_TRET: "P3 Khung trệt",
  P4_KHUNG_LAU: "P4 Khung lầu",
  P5_ME_XAY_TO: "P5 M&E + xây tô",
  P6_OP_LAT: "P6 Ốp lát",
  P7_SON_BA: "P7 Sơn bả",
  P8_LAP_TB: "P8 Lắp thiết bị",
  P9_BAN_GIAO: "P9 Bàn giao",
};

export const PHASE_COLOR: Record<TaskPhase, string> = {
  P1_CHUAN_BI: "#E7E6E6",
  P2_MONG: "#FCE4D6",
  P3_KHUNG_TRET: "#FFF2CC",
  P4_KHUNG_LAU: "#DAEEF3",
  P5_ME_XAY_TO: "#E2EFDA",
  P6_OP_LAT: "#FCE4E4",
  P7_SON_BA: "#E4DCF0",
  P8_LAP_TB: "#FFE699",
  P9_BAN_GIAO: "#C6E0B4",
};

export const STATUS_LABEL: Record<TaskStatus, string> = {
  not_started: "Chưa bắt đầu",
  in_progress: "Đang làm",
  done: "KS hoàn thành",
  internal_approved: "Đã duyệt nội bộ",
  completed: "Hoàn tất",
  inspected: "Đã nghiệm thu",
  delayed: "Trễ",
  na: "Không áp dụng",
};

export const STATUS_CLASS: Record<TaskStatus, string> = {
  not_started: "bg-zinc-700/50 text-zinc-200",
  in_progress: "bg-orange-500/20 text-orange-200",
  done: "bg-blue-500/20 text-blue-200",
  internal_approved: "bg-indigo-500/20 text-indigo-200",
  completed: "bg-emerald-500/20 text-emerald-200",
  inspected: "bg-emerald-500/20 text-emerald-200",
  delayed: "bg-red-500/20 text-red-200",
  na: "bg-zinc-800 text-zinc-400",
};
