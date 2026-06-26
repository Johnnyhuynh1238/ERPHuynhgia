export const BUDGET_CATEGORIES = ["labor", "material", "equipment"] as const;
export const BUDGET_PHASES = ["mong", "than", "mai"] as const;

export const CATEGORY_LABEL: Record<(typeof BUDGET_CATEGORIES)[number], string> = {
  labor: "Nhân công",
  material: "Vật tư",
  equipment: "Máy móc thiết bị",
};

export const PHASE_LABEL: Record<(typeof BUDGET_PHASES)[number], string> = {
  mong: "Móng",
  than: "Thân",
  mai: "Mái",
};

// 9 giai đoạn khớp StandardTaskCatalog + SOP 09/10/47
export const PHASE_CODES = [
  "01",
  "02",
  "03",
  "04",
  "05",
  "06",
  "07",
  "08",
  "09",
] as const;

export type PhaseCode = (typeof PHASE_CODES)[number];

export const PHASE_CODE_LABEL: Record<PhaseCode, string> = {
  "01": "01 · Chuẩn bị & khởi công",
  "02": "02 · Phần ngầm – Móng",
  "03": "03 · Kết cấu BTCT phần thân",
  "04": "04 · Phần mái",
  "05": "05 · Xây tường – Tô trát – Cán nền",
  "06": "06 · Chống thấm",
  "07": "07 · Cơ điện (MEP)",
  "08": "08 · Hoàn thiện",
  "09": "09 · Vệ sinh – Nghiệm thu – Bàn giao",
};

export const PHASE_CODE_SHORT: Record<PhaseCode, string> = {
  "01": "Chuẩn bị",
  "02": "Móng",
  "03": "Kết cấu",
  "04": "Mái",
  "05": "Xây – Tô – Cán",
  "06": "Chống thấm",
  "07": "MEP",
  "08": "Hoàn thiện",
  "09": "Nghiệm thu",
};

export function isPhaseCode(value: unknown): value is PhaseCode {
  return typeof value === "string" && (PHASE_CODES as readonly string[]).includes(value);
}

// Map legacy BudgetPhase enum → phaseCode mặc định (cho code đọc bản ghi cũ)
export const LEGACY_PHASE_TO_CODE: Record<(typeof BUDGET_PHASES)[number], PhaseCode> = {
  mong: "02",
  than: "03",
  mai: "04",
};

// Ngược lại: phaseCode → BudgetPhase enum, để ghi tương thích cột `phase` cũ (NOT NULL).
// Sau khi tất cả reader chuyển sang phaseCode, có thể drop cột này.
export function phaseCodeToLegacyPhase(code: PhaseCode): (typeof BUDGET_PHASES)[number] {
  if (code === "01" || code === "02") return "mong";
  if (code === "04") return "mai";
  return "than"; // 03, 05, 06, 07, 08, 09
}

export type BudgetBreakdownItem = {
  name: string;
  quantity: number;
  note?: string;
};

export function isBreakdownArray(value: unknown): value is BudgetBreakdownItem[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (b) =>
      b &&
      typeof b === "object" &&
      typeof (b as { name?: unknown }).name === "string" &&
      typeof (b as { quantity?: unknown }).quantity === "number",
  );
}

export function sumBreakdownQuantity(items: BudgetBreakdownItem[] | null | undefined): number {
  if (!items || items.length === 0) return 0;
  return items.reduce((acc, b) => acc + (Number.isFinite(b.quantity) ? b.quantity : 0), 0);
}

type UserCtx = { id: string; role: string };

// KS (engineer) = view + oversight only; KT (accountant) = view only.
// TPTC (construction_manager) = creator + editor + locker + proposer.
// Admin = full.
const EDITOR_ROLES = ["admin", "construction_manager"];
const VIEWER_ROLES = ["admin", "construction_manager", "engineer", "accountant"];

export function canViewBudget(user: UserCtx): boolean {
  return VIEWER_ROLES.includes(user.role);
}

export function canEditBudget(user: UserCtx): boolean {
  return EDITOR_ROLES.includes(user.role);
}

export function canLockBudget(user: UserCtx): boolean {
  return EDITOR_ROLES.includes(user.role);
}

export function canProposeAmendment(user: UserCtx): boolean {
  return EDITOR_ROLES.includes(user.role);
}

export function canApproveAmendment(user: UserCtx): boolean {
  return user.role === "admin";
}
