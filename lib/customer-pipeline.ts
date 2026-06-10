import type {
  BaogiaLead,
  DesignContract,
  DesignContractStep,
  PaymentSchedule,
  Project,
} from "@prisma/client";

export type PipelineStage = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const STAGE_LABEL: Record<PipelineStage, string> = {
  1: "Lead mới",
  2: "Đã liên hệ",
  3: "HĐ Thiết kế",
  4: "Chuẩn bị thi công",
  5: "Đang thi công",
  6: "Bàn giao",
  7: "Bảo hành",
};

export const STAGE_COLOR: Record<PipelineStage, string> = {
  1: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  2: "bg-blue-500/15 text-blue-300 border-blue-500/40",
  3: "bg-violet-500/15 text-violet-300 border-violet-500/40",
  4: "bg-cyan-500/15 text-cyan-300 border-cyan-500/40",
  5: "bg-orange-500/15 text-orange-300 border-orange-500/40",
  6: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  7: "bg-slate-500/15 text-slate-300 border-slate-500/40",
};

export const STEP_KIND_LABEL: Record<string, string> = {
  mat_bang: "Mặt bằng công năng",
  mat_tien_3d: "Phối cảnh 3D mặt tiền",
  noi_that: "Thiết kế nội thất",
  shop_drawing: "Bộ bản vẽ thi công",
};

export const STEP_STATUS_LABEL: Record<string, string> = {
  pending: "Chưa làm",
  in_progress: "Đang làm",
  customer_review: "Chờ KH duyệt",
  approved: "KH đã duyệt",
};

const DAY_MS = 86_400_000;
const WARRANTY_YEARS = 5;
const HANDOVER_WINDOW_DAYS = 30;

function daysBetween(from: Date, to: Date) {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

type ContractWithSteps = DesignContract & { steps: DesignContractStep[] };
type ProjectWithPayments = Project & {
  paymentSchedules: Pick<PaymentSchedule, "status">[];
};

export type PipelineRow = {
  customerKey: string;
  customerName: string;
  customerPhone: string;
  stage: PipelineStage;
  stageLabel: string;
  subLabel: string | null;
  daysInStage: number;
  hotFlag: string | null;
  nextAction: string;
  contractValue: number | null;
  projectId: string | null;
  projectCode: string | null;
  designContractId: string | null;
  leadId: string | null;
  lastActivityAt: string;
};

export function computeProjectStage(
  project: ProjectWithPayments,
  now: Date,
): { stage: PipelineStage; subLabel: string | null; lastActivityAt: Date; hotFlag: string | null } {
  if (project.status === "completed" && project.actualEndDate) {
    const days = daysBetween(project.actualEndDate, now);
    if (days <= HANDOVER_WINDOW_DAYS) {
      const unpaid = project.paymentSchedules.find(
        (p) => p.status !== "paid" && p.status !== "collected" && p.status !== "cancelled",
      );
      return {
        stage: 6,
        subLabel: null,
        lastActivityAt: project.actualEndDate,
        hotFlag: unpaid ? "Còn công nợ chưa thu" : null,
      };
    }
    const warrantyEnd = new Date(project.actualEndDate);
    warrantyEnd.setFullYear(warrantyEnd.getFullYear() + WARRANTY_YEARS);
    if (now <= warrantyEnd) {
      const remainDays = daysBetween(now, warrantyEnd);
      let sub = "Đang BH";
      if (days < 180) sub = "Mới BH (< 6 tháng)";
      else if (remainDays < 180) sub = "Sắp hết BH (< 6 tháng)";
      return {
        stage: 7,
        subLabel: sub,
        lastActivityAt: project.actualEndDate,
        hotFlag: remainDays < 30 ? `BH hết sau ${remainDays} ngày` : null,
      };
    }
    return { stage: 7, subLabel: "Hết bảo hành", lastActivityAt: project.actualEndDate, hotFlag: null };
  }

  if (project.status === "in_progress") {
    const overduePayment = project.paymentSchedules.find(
      (p) => p.status === "overdue" || p.status === "customer_late",
    );
    return {
      stage: 5,
      subLabel: null,
      lastActivityAt: project.updatedAt,
      hotFlag: overduePayment ? "Khách trễ thanh toán" : null,
    };
  }

  // planning / paused
  const start = project.startDate;
  const late = start && start < now ? daysBetween(start, now) : 0;
  return {
    stage: 4,
    subLabel: project.status === "paused" ? "Đang tạm dừng" : null,
    lastActivityAt: project.updatedAt,
    hotFlag: late > 3 ? `Quá ngày khởi công ${late} ngày` : null,
  };
}

export function computeDesignContractStage(
  c: ContractWithSteps,
  now: Date,
): { stage: PipelineStage; subLabel: string | null; lastActivityAt: Date; hotFlag: string | null; nextAction: string } {
  const sorted = [...c.steps].sort((a, b) => stepOrder(a.kind) - stepOrder(b.kind));
  const allApproved = sorted.length === 4 && sorted.every((s) => s.status === "approved");
  if (c.status === "done" || allApproved) {
    return {
      stage: 4,
      subLabel: "Thiết kế xong, chờ ký HĐ thi công",
      lastActivityAt: c.updatedAt,
      hotFlag: null,
      nextAction: "Chốt HĐ thi công, tạo Project",
    };
  }
  const inProgress = sorted.find((s) => s.status !== "approved");
  const stale =
    inProgress && daysBetween(inProgress.updatedAt, now) > 7
      ? `${STEP_KIND_LABEL[inProgress.kind]} chưa duyệt > 7 ngày`
      : null;
  return {
    stage: 3,
    subLabel: inProgress ? STEP_KIND_LABEL[inProgress.kind] : null,
    lastActivityAt: inProgress?.updatedAt ?? c.updatedAt,
    hotFlag: stale,
    nextAction: inProgress
      ? `Hoàn tất: ${STEP_KIND_LABEL[inProgress.kind]} (${STEP_STATUS_LABEL[inProgress.status]})`
      : "Bổ sung sub-step",
  };
}

function stepOrder(kind: string) {
  return ["mat_bang", "mat_tien_3d", "noi_that", "shop_drawing"].indexOf(kind);
}

export function computeLeadStage(
  lead: BaogiaLead,
  now: Date,
): { stage: PipelineStage; lastActivityAt: Date; hotFlag: string | null; nextAction: string } {
  if (lead.status === "signed") {
    return {
      stage: 3,
      lastActivityAt: lead.updatedAt,
      hotFlag: "Đã ký nhưng chưa có HĐ Thiết kế trong hệ thống",
      nextAction: "Tạo HĐ Thiết kế cho khách",
    };
  }
  if (lead.status === "contacted") {
    const days = daysBetween(lead.contactedAt ?? lead.updatedAt, now);
    return {
      stage: 2,
      lastActivityAt: lead.contactedAt ?? lead.updatedAt,
      hotFlag: days > 7 ? `Đã liên hệ ${days} ngày không update` : null,
      nextAction: "Khảo sát hiện trạng, chốt báo giá",
    };
  }
  // new
  const days = daysBetween(lead.createdAt, now);
  return {
    stage: 1,
    lastActivityAt: lead.createdAt,
    hotFlag: days >= 1 ? `Chưa contact ${days} ngày` : null,
    nextAction: "Gọi/Zalo liên hệ ngay",
  };
}

const NEXT_ACTION_BY_STAGE: Record<PipelineStage, string> = {
  1: "Gọi/Zalo liên hệ ngay",
  2: "Khảo sát hiện trạng, chốt báo giá",
  3: "Hoàn tất 4 sub-step thiết kế",
  4: "Hoàn tất chuẩn bị, khởi công",
  5: "Theo dõi tiến độ, thu tiền theo đợt",
  6: "Hồ sơ hoàn công, ký BB bàn giao, thu nốt",
  7: "Theo dõi yêu cầu BH, kiểm tra định kỳ",
};

export function defaultNextAction(stage: PipelineStage) {
  return NEXT_ACTION_BY_STAGE[stage];
}

export function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "");
}
