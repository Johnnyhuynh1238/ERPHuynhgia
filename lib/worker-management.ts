import { UserRole, WorkerStatus, GradeHistoryStatus } from "@prisma/client";

export function canViewWorkers(role: string | null | undefined) {
  return (
    role === UserRole.admin ||
    role === UserRole.construction_manager ||
    role === UserRole.engineer ||
    role === UserRole.accountant
  );
}

export function canManageWorkers(role: string | null | undefined) {
  return role === UserRole.admin || role === UserRole.construction_manager;
}

export function canProposeGrade(role: string | null | undefined) {
  return (
    role === UserRole.admin ||
    role === UserRole.construction_manager ||
    role === UserRole.engineer
  );
}

export function canApproveGrade(role: string | null | undefined) {
  return role === UserRole.admin || role === UserRole.construction_manager;
}

export const WORKER_STATUS_LABEL: Record<WorkerStatus, string> = {
  trial: "Thử việc",
  active: "Đang làm",
  standby: "Gọi lại",
  inactive: "Tạm nghỉ",
  blacklist: "Đen",
};

export const WORKER_STATUS_OPTIONS: { value: WorkerStatus; label: string }[] = [
  { value: "trial", label: WORKER_STATUS_LABEL.trial },
  { value: "active", label: WORKER_STATUS_LABEL.active },
  { value: "standby", label: WORKER_STATUS_LABEL.standby },
  { value: "inactive", label: WORKER_STATUS_LABEL.inactive },
  { value: "blacklist", label: WORKER_STATUS_LABEL.blacklist },
];

export const GRADE_LABEL: Record<number, string> = {
  1: "B1 - Phụ hồ",
  2: "B2 - Thợ phụ",
  3: "B3 - Thợ trung bình",
  4: "B4 - Thợ cứng",
  5: "B5 - Thợ giỏi",
};

export const GRADE_HISTORY_STATUS_LABEL: Record<GradeHistoryStatus, string> = {
  pending: "Chờ duyệt",
  approved: "Đã duyệt",
  rejected: "Từ chối",
};

export function isValidGrade(g: unknown): g is number {
  return typeof g === "number" && Number.isInteger(g) && g >= 1 && g <= 5;
}
