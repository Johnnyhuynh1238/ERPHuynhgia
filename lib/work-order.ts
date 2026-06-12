type UserCtx = { id: string; role: string };

// KS = creator/editor cho công trình họ thuộc; TPTC + admin = full; KT = view only.
const CREATE_ROLES = ["admin", "construction_manager", "engineer"];
const VIEW_ROLES = ["admin", "construction_manager", "engineer", "accountant"];

export function canViewWorkOrders(user: UserCtx): boolean {
  return VIEW_ROLES.includes(user.role);
}

export function canCreateWorkOrder(user: UserCtx): boolean {
  return CREATE_ROLES.includes(user.role);
}

export function canEditWorkOrder(user: UserCtx): boolean {
  return CREATE_ROLES.includes(user.role);
}

export function canDeleteWorkOrder(user: UserCtx): boolean {
  return CREATE_ROLES.includes(user.role);
}

export const WORK_ORDER_STATUS_LABEL: Record<"open" | "done" | "carried", string> = {
  open: "Đang làm",
  done: "Đã xong",
  carried: "Dở dang",
};
