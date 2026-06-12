type UserCtx = { id: string; role: string };

// TPTC config mapping + duyệt QC; engineer chỉ tick
const CONFIG_ROLES = ["admin", "construction_manager"];
const TICK_ROLES = ["admin", "construction_manager", "engineer"];

export function canConfigQcChecklist(user: UserCtx): boolean {
  return CONFIG_ROLES.includes(user.role);
}

export function canTickQcCheck(user: UserCtx): boolean {
  return TICK_ROLES.includes(user.role);
}

export function canCreateWorkerQcIssue(user: UserCtx): boolean {
  return TICK_ROLES.includes(user.role);
}

export type QcChecklistItem = {
  title: string;
  requirePhoto: boolean;
};

export const WORKER_QC_ISSUE_SEVERITY_LABEL: Record<"minor" | "major" | "critical", string> = {
  minor: "Nhẹ",
  major: "Vừa",
  critical: "Nặng",
};

// Parse + validate qcChecklist Json field (TPTC editable).
// Empty/null → không có hold-point → output qua flow cũ.
export function parseQcChecklist(value: unknown): QcChecklistItem[] {
  if (!Array.isArray(value)) return [];
  const items: QcChecklistItem[] = [];
  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) continue;
    const obj = raw as Record<string, unknown>;
    const title = typeof obj.title === "string" ? obj.title.trim() : "";
    if (!title) continue;
    items.push({
      title,
      requirePhoto: Boolean(obj.requirePhoto),
    });
  }
  return items;
}

// Output có thể chuyển sang qcStatus=passed?
// - Không có checklist → cho qua (giữ flow M4)
// - Có checklist → mọi item phải passed; item nào yêu cầu ảnh phải có photoKey
export function canMarkOutputPassed(
  checklist: QcChecklistItem[],
  checks: Array<{ itemIndex: number; status: string; photoKey: string | null }>,
): { ok: true } | { ok: false; reason: string } {
  if (checklist.length === 0) return { ok: true };
  const byIndex = new Map(checks.map((c) => [c.itemIndex, c]));
  for (let i = 0; i < checklist.length; i += 1) {
    const item = checklist[i];
    const c = byIndex.get(i);
    if (!c) return { ok: false, reason: `Mục "${item.title}" chưa kiểm` };
    if (c.status !== "passed") return { ok: false, reason: `Mục "${item.title}" chưa đạt` };
    if (item.requirePhoto && !c.photoKey) {
      return { ok: false, reason: `Mục "${item.title}" yêu cầu ảnh` };
    }
  }
  return { ok: true };
}
