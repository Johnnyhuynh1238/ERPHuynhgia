import { BudgetStage } from "@prisma/client";

export type SuggestedComponent = {
  stage: BudgetStage;
  name: string;
  hasFloor: boolean;
  optional?: boolean;
};

export const SUGGESTED_COMPONENTS: SuggestedComponent[] = [
  { stage: "CB", name: "Lán trại + dọn dẹp + điện nước tạm", hasFloor: false },
  { stage: "CB", name: "Phá dỡ công trình cũ", hasFloor: false, optional: true },
  { stage: "CB", name: "Định vị + giác móng", hasFloor: false },

  { stage: "N", name: "Móng (M-1, M-2, giằng, đào, đắp cát)", hasFloor: false },
  { stage: "N", name: "Bể tự hoại", hasFloor: false },
  { stage: "N", name: "Bể nước ngầm", hasFloor: false, optional: true },
  { stage: "N", name: "Nền tầng trệt", hasFloor: false },

  { stage: "T", name: "Cột", hasFloor: true },
  { stage: "T", name: "Xây tường bao", hasFloor: true },
  { stage: "T", name: "Dầm – sàn", hasFloor: true },
  { stage: "T", name: "Cầu thang BTCT", hasFloor: true },
  { stage: "T", name: "Lanh tô + lam", hasFloor: true },
  { stage: "T", name: "Xây tường ngăn", hasFloor: true },
  { stage: "T", name: "MEP âm (sàn + tường + nước)", hasFloor: true },
  { stage: "T", name: "Tô trát", hasFloor: true },
  { stage: "T", name: "Cán nền", hasFloor: true },
  { stage: "T", name: "Sàn mái + tạo dốc + sê nô", hasFloor: false },
  { stage: "T", name: "Chống thấm (WC + ban công + mái + sân thượng + xuyên sàn)", hasFloor: false },
  { stage: "T", name: "Mái dốc", hasFloor: false, optional: true },

  { stage: "HT", name: "Ốp lát (nền + WC + bếp)", hasFloor: true },
  { stage: "HT", name: "Ốp lát chung (cầu thang + tam cấp + đá ngoài)", hasFloor: false },
  { stage: "HT", name: "Trần thạch cao + sơn", hasFloor: true },
  { stage: "HT", name: "Cửa + cơ khí + lan can", hasFloor: true },
  { stage: "HT", name: "MEP nổi + thiết bị", hasFloor: true },
  { stage: "HT", name: "Mặt tiền + ngoại thất", hasFloor: false },
  { stage: "HT", name: "MEP nóc (bơm + bồn + lọc)", hasFloor: false },
  { stage: "HT", name: "Vệ sinh + nghiệm thu", hasFloor: false },
  { stage: "HT", name: "Bàn giao + hồ sơ", hasFloor: false },
];

export const STAGE_LABEL: Record<BudgetStage, string> = {
  CB: "Chuẩn bị",
  N: "Ngầm",
  T: "Thô",
  HT: "Hoàn thiện",
};

export const STAGE_ORDER: BudgetStage[] = ["CB", "N", "T", "HT"];
