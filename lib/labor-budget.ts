import { LaborPhase } from "@prisma/client";

export const LABOR_PHASE_LABEL: Record<LaborPhase, string> = {
  mong: "Móng",
  than: "Thân",
  mai: "Mái",
};

export const LABOR_PHASE_OPTIONS: { value: LaborPhase; label: string }[] = [
  { value: "mong", label: "Móng" },
  { value: "than", label: "Thân" },
  { value: "mai", label: "Mái" },
];

export function isValidPhase(p: unknown): p is LaborPhase {
  return p === "mong" || p === "than" || p === "mai";
}

export function canViewLaborBudget(role: string) {
  return ["admin", "construction_manager", "engineer", "accountant"].includes(role);
}

export function canEditLaborBudget(role: string) {
  return ["admin", "construction_manager", "engineer"].includes(role);
}

export function canLockLaborBudget(role: string) {
  return ["admin", "construction_manager"].includes(role);
}

export function canProposeAmendment(role: string) {
  return ["admin", "construction_manager", "engineer"].includes(role);
}

export function canApproveAmendment(role: string) {
  return role === "admin";
}

export function fmtVND(n: number | bigint | null | undefined) {
  if (n === null || n === undefined) return "—";
  const v = typeof n === "bigint" ? Number(n) : n;
  return v.toLocaleString("vi-VN") + " ₫";
}

export function computeItemAmount(quantity: number, unitPrice: number | bigint) {
  const up = typeof unitPrice === "bigint" ? Number(unitPrice) : unitPrice;
  return Math.round(quantity * up);
}
