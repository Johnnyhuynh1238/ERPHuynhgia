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
