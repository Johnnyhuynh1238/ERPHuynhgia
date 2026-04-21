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
  done: "Đã xong",
  inspected: "Đã nghiệm thu",
  delayed: "Trễ",
  na: "Không áp dụng",
};

export const STATUS_CLASS: Record<TaskStatus, string> = {
  not_started: "bg-slate-200 text-slate-700",
  in_progress: "bg-blue-100 text-blue-700",
  done: "bg-slate-400 text-white",
  inspected: "bg-emerald-100 text-emerald-700",
  delayed: "bg-red-100 text-red-700",
  na: "bg-slate-100 text-slate-500",
};
