type UserCtx = { id: string; role: string };

// Cuối ngày = quyền giống chấm công + giao việc
const EDIT_ROLES = ["admin", "construction_manager", "engineer"];
const VIEW_ROLES = ["admin", "construction_manager", "engineer", "accountant"];
// TPTC duyệt sản lượng
const APPROVE_ROLES = ["admin", "construction_manager"];

export function canViewEod(user: UserCtx): boolean {
  return VIEW_ROLES.includes(user.role);
}

export function canEditEod(user: UserCtx): boolean {
  return EDIT_ROLES.includes(user.role);
}

export function canApproveOutput(user: UserCtx): boolean {
  return APPROVE_ROLES.includes(user.role);
}

export const TIMESHEET_ABSENT_REASON_LABEL: Record<"P" | "KP" | "MUA" | "CHO", string> = {
  P: "Có phép",
  KP: "Không phép",
  MUA: "Mưa (lỗi cty)",
  CHO: "Chờ việc (lỗi cty)",
};

export const OUTPUT_QC_STATUS_LABEL: Record<"pending" | "passed" | "failed" | "rework", string> = {
  pending: "Chờ duyệt",
  passed: "Đạt",
  failed: "Không đạt",
  rework: "Làm lại",
};

// ISO week key: YYYY-Www (UTC). Dùng để gom tính lương theo tuần ở M6.
export function weekKeyForDate(d: Date): string {
  // ISO 8601 week-numbering year + week. Source: shifted Thursday.
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

// dayValue suy từ chấm công sáng/chiều của ERP cũ.
// Cả 2 buổi có mặt = 1.0; 1 buổi = 0.5; không buổi nào = 0.
export function deriveDayValue(morningPresent: boolean, afternoonPresent: boolean): number {
  return (morningPresent ? 0.5 : 0) + (afternoonPresent ? 0.5 : 0);
}
