import {
  CommentTargetType,
  PaymentScheduleType,
  PaymentStatus,
  TaskStatus,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePortalPageAccess, type PortalAccessState } from "@/lib/customer-portal";

export type PortalApiAccessResult =
  | {
      ok: true;
      project: NonNullable<Awaited<ReturnType<typeof requirePortalPageAccess>>["project"]>;
      session: NonNullable<Awaited<ReturnType<typeof requirePortalPageAccess>>["session"]>;
    }
  | {
      ok: false;
      status: number;
      message: string;
      state: PortalAccessState | "login_required";
    };

type DbClient = Prisma.TransactionClient | typeof prisma;

const completedTaskStatuses: TaskStatus[] = [TaskStatus.done, TaskStatus.inspected, TaskStatus.internal_approved, TaskStatus.completed];

type PaymentRow = {
  id: string;
  type: PaymentScheduleType;
  installmentNo: number | null;
  phaseNumber: number;
  description: string | null;
  milestoneDescription: string;
  amount: Prisma.Decimal | number;
  dueDate: Date | null;
  expectedDate: Date | null;
  status: PaymentStatus;
  paidAt: Date | null;
  paidAmount: Prisma.Decimal | number | null;
  actualPaidDate: Date | null;
  actualPaidAmount: Prisma.Decimal | number | null;
  receiptUrl: string | null;
  paymentNote: string | null;
  notes: string | null;
};

export type NormalizedPaymentStatus = "pending" | "paid" | "overdue" | "cancelled";

export type NormalizedPaymentSchedule = {
  id: string;
  type: PaymentScheduleType;
  installmentNo: number;
  description: string;
  amount: number;
  dueDate: Date | null;
  status: NormalizedPaymentStatus;
  paidAt: Date | null;
  paidAmount: number | null;
  receiptUrl: string | null;
  paymentNote: string | null;
};

export type CustomerJournalEvent = {
  id: string;
  type: "report" | "photo" | "qc";
  date: Date;
  title: string;
  description: string | null;
  actor?: string | null;
  progressFrom?: number | null;
  progressTo?: number | null;
  taskId?: string;
  taskCode?: string;
  taskName?: string;
  phase?: string | null;
  phaseName?: string | null;
  photos?: Array<{ id?: string; url: string; thumbnailUrl?: string | null }>;
  targetType: CommentTargetType;
  targetId: string;
  commentCount?: number;
};

function toNumber(value: Prisma.Decimal | number | null | undefined) {
  if (value == null) return null;
  return typeof value === "number" ? value : Number(value);
}

export function mapPaymentStatus(status: PaymentStatus): NormalizedPaymentStatus {
  if (status === PaymentStatus.collected || status === PaymentStatus.paid) return "paid";
  if (status === PaymentStatus.customer_late || status === PaymentStatus.overdue) return "overdue";
  if (status === PaymentStatus.cancelled) return "cancelled";
  return "pending";
}

export function normalizePaymentSchedule(row: PaymentRow): NormalizedPaymentSchedule {
  return {
    id: row.id,
    type: row.type || PaymentScheduleType.contract,
    installmentNo: row.installmentNo ?? row.phaseNumber,
    description: row.description || row.milestoneDescription,
    amount: toNumber(row.amount) || 0,
    dueDate: row.dueDate || row.expectedDate || null,
    status: mapPaymentStatus(row.status),
    paidAt: row.paidAt || row.actualPaidDate,
    paidAmount: toNumber(row.paidAmount) ?? toNumber(row.actualPaidAmount),
    receiptUrl: row.receiptUrl,
    paymentNote: row.paymentNote || row.notes,
  };
}

function extractTaskPhotoId(value: string | null | undefined) {
  if (!value) return undefined;
  return value.match(/\/photos\/([^/?#]+)(?:\/file)?/)?.[1];
}

function parseProgressPhotos(value: string) {
  if (!value) return [] as Array<{ id?: string; url: string; thumbnailUrl?: string | null }>;

  try {
    const parsed = JSON.parse(value) as { photos?: Array<{ id?: string; photoUrl?: string; thumbnailUrl?: string }> };
    if (Array.isArray(parsed.photos)) {
      return parsed.photos
        .map((photo) => {
          const url = typeof photo.photoUrl === "string" ? photo.photoUrl : "";
          return {
            id: typeof photo.id === "string" ? photo.id : extractTaskPhotoId(url),
            url,
            thumbnailUrl: typeof photo.thumbnailUrl === "string" ? photo.thumbnailUrl : null,
          };
        })
        .filter((photo) => Boolean(photo.url));
    }
  } catch {}

  return [{ url: value, id: extractTaskPhotoId(value) }];
}

export async function requireCustomerPortalApiAccess(token: string): Promise<PortalApiAccessResult> {
  const access = await requirePortalPageAccess(token);
  if (!access.project) {
    return { ok: false, status: 404, message: "Không tìm thấy cổng chủ nhà", state: "not_found" };
  }

  if (access.state === "disabled") {
    return { ok: false, status: 403, message: "Cổng chủ nhà đã tắt", state: access.state };
  }

  if (access.state === "expired") {
    return { ok: false, status: 410, message: "Cổng chủ nhà đã hết hạn", state: access.state };
  }

  if (!access.session) {
    return { ok: false, status: 401, message: "Chưa đăng nhập cổng chủ nhà", state: "login_required" };
  }

  return { ok: true, project: access.project, session: access.session };
}

export async function getCustomerPortalOverview(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      code: true,
      name: true,
      customerName: true,
      address: true,
      areaM2: true,
      contractValue: true,
      startDate: true,
      expectedEndDate: true,
      actualEndDate: true,
      projectManager: { select: { id: true, fullName: true, phone: true, avatarUrl: true, role: true } },
      mainEngineer: { select: { id: true, fullName: true, phone: true, avatarUrl: true, role: true } },
      phases: {
        orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, code: true, name: true, status: true, plannedStartDate: true, plannedEndDate: true },
      },
      tasks: {
        where: { isActive: true, visibleToCustomer: true },
        select: { id: true, status: true },
      },
    },
  });

  if (!project) return null;

  const doneCount = project.tasks.filter((task) => completedTaskStatuses.includes(task.status)).length;
  const totalCount = project.tasks.length;
  const overallProgress = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;
  const currentPhase =
    project.phases.find((phase) => phase.status === "in_progress") ||
    project.phases.find((phase) => phase.status === "not_started") ||
    project.phases[project.phases.length - 1] ||
    null;

  return {
    project: {
      id: project.id,
      code: project.code,
      name: project.name,
      customerName: project.customerName,
      address: project.address,
      areaM2: toNumber(project.areaM2),
      contractValue: toNumber(project.contractValue),
      startDate: project.startDate,
      expectedEndDate: project.expectedEndDate,
      actualEndDate: project.actualEndDate,
      currentPhase,
      overallProgress,
      doneCount,
      totalCount,
    },
    team: [
      { ...project.mainEngineer, role: "Kỹ sư" },
    ],
  };
}

export async function validateCustomerCommentTarget(
  db: DbClient,
  projectId: string,
  targetType: CommentTargetType,
  targetId: string,
) {
  if (targetType === CommentTargetType.project) {
    return targetId === projectId
      ? { ok: true as const, taskId: null as string | null, eveningReportId: null as string | null }
      : { ok: false as const, message: "Dự án không hợp lệ" };
  }

  if (targetType === CommentTargetType.task) {
    const task = await db.task.findFirst({
      where: { id: targetId, projectId, isActive: true, visibleToCustomer: true },
      select: { id: true, status: true },
    });
    if (!task) return { ok: false as const, message: "Task không hợp lệ" };
    if (task.status === TaskStatus.internal_approved || task.status === TaskStatus.completed) {
      return { ok: false as const, message: "Task đã nghiệm thu nên không thể bình luận thêm" };
    }
    return { ok: true as const, taskId: task.id, eveningReportId: null as string | null };
  }

  if (targetType === CommentTargetType.payment_schedule) {
    const payment = await db.paymentSchedule.findFirst({ where: { id: targetId, projectId }, select: { id: true } });
    if (!payment) return { ok: false as const, message: "Đợt thanh toán không hợp lệ" };
    return { ok: true as const, taskId: null as string | null, eveningReportId: null as string | null };
  }

  const report = await db.eveningReport.findFirst({ where: { id: targetId, projectId }, select: { id: true } });
  if (report) return { ok: true as const, taskId: null as string | null, eveningReportId: report.id };

  const activity = await db.taskActivityLog.findFirst({
    where: { id: targetId, task: { projectId } },
    select: { id: true },
  });
  if (activity) return { ok: true as const, taskId: null as string | null, eveningReportId: null as string | null };

  const progressHistory = await db.taskProgressHistory.findFirst({
    where: { id: targetId, task: { projectId } },
    select: { id: true },
  });
  if (!progressHistory) return { ok: false as const, message: "Nhật ký không hợp lệ" };
  return { ok: true as const, taskId: null as string | null, eveningReportId: null as string | null };
}

export async function buildCustomerJournalEvents(
  projectId: string,
  filters: { phase?: string | null; type?: string | null } = {},
): Promise<CustomerJournalEvent[]> {
  const phaseFilter = filters.phase && filters.phase !== "all" ? filters.phase : null;
  const typeFilter = filters.type && filters.type !== "all" ? filters.type : null;
  const taskWhere = {
    projectId,
    isActive: true,
    visibleToCustomer: true,
    ...(phaseFilter ? { phaseId: phaseFilter } : {}),
  };

  const [reports, progressUpdates, qcLogs, commentCounts] = await Promise.all([
    typeFilter && typeFilter !== "report"
      ? Promise.resolve([])
      : prisma.eveningReport.findMany({
          where: {
            projectId,
            submittedAt: { not: null },
            overallNote: { not: null },
            taskReports: { some: { task: taskWhere } },
          },
          orderBy: { reportDate: "desc" },
          take: 80,
          select: {
            id: true,
            reportDate: true,
            overallNote: true,
            reporter: { select: { fullName: true } },
          },
        }),
    typeFilter && typeFilter !== "photo"
      ? Promise.resolve([])
      : prisma.taskProgressHistory.findMany({
          where: { task: taskWhere },
          orderBy: { createdAt: "desc" },
          take: 120,
          select: {
            id: true,
            fromPercent: true,
            toPercent: true,
            note: true,
            createdAt: true,
            photoUrl: true,
            user: { select: { fullName: true } },
            task: { select: { id: true, code: true, name: true, phase: true, projectPhase: { select: { name: true } } } },
          },
        }),
    typeFilter && typeFilter !== "qc"
      ? Promise.resolve([])
      : prisma.taskQcLog.findMany({
          where: { task: taskWhere, NOT: { photos: { equals: [] } } },
          orderBy: { checkedAt: "desc" },
          take: 120,
          select: {
            id: true,
            checkedAt: true,
            photos: true,
            qcItem: { select: { content: true } },
            task: { select: { id: true, code: true, name: true, phase: true, projectPhase: { select: { name: true } } } },
          },
        }),
    prisma.customerComment.groupBy({
      by: ["targetType", "targetId"],
      where: { projectId, targetType: { not: null }, targetId: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const commentCountByTarget = new Map(
    commentCounts.map((row) => [`${row.targetType}:${row.targetId}`, row._count._all]),
  );
  const withCommentCount = (targetType: CommentTargetType, targetId: string) =>
    commentCountByTarget.get(`${targetType}:${targetId}`) || 0;

  const events: CustomerJournalEvent[] = [
    ...reports.map((report) => ({
      id: `report:${report.id}`,
      type: "report" as const,
      date: report.reportDate,
      title: "Nhật ký công trình",
      description: report.overallNote,
      actor: report.reporter.fullName,
      targetType: CommentTargetType.journal_entry,
      targetId: report.id,
      commentCount: withCommentCount(CommentTargetType.journal_entry, report.id),
    })),
    ...progressUpdates.flatMap((update) => {
      const photos = parseProgressPhotos(update.photoUrl);
      if (!photos.length) return [];

      return [
        {
          id: `photo:${update.id}`,
          type: "photo" as const,
          date: update.createdAt,
          title: `${update.task.code} - ${update.task.name}`,
          description: update.note || null,
          actor: update.user.fullName,
          progressFrom: update.fromPercent,
          progressTo: update.toPercent,
          taskId: update.task.id,
          taskCode: update.task.code,
          taskName: update.task.name,
          phase: update.task.phase,
          phaseName: update.task.projectPhase?.name || null,
          photos,
          targetType: CommentTargetType.journal_entry,
          targetId: update.id,
          commentCount: withCommentCount(CommentTargetType.journal_entry, update.id),
        },
      ];
    }),
    ...qcLogs.map((log) => ({
      id: `qc:${log.id}`,
      type: "qc" as const,
      date: log.checkedAt,
      title: `${log.task.code} - Ảnh QC: ${log.qcItem.content}`,
      description: null,
      taskId: log.task.id,
      taskCode: log.task.code,
      taskName: log.task.name,
      phase: log.task.phase,
      phaseName: log.task.projectPhase?.name || null,
      photos: log.photos.map((url) => ({ url })),
      targetType: CommentTargetType.journal_entry,
      targetId: log.id,
      commentCount: withCommentCount(CommentTargetType.journal_entry, log.id),
    })),
  ];

  return events.sort((a, b) => b.date.getTime() - a.date.getTime());
}

export type CustomerDiaryPhoto = { key: string; contentType?: string | null };

export type CustomerDiaryEntry = {
  id: string;
  entryDate: Date;
  savedAt: Date | null;
  tasksDone: string | null;
  photos: CustomerDiaryPhoto[];
  reporter: string | null;
};

export async function hasProjectConstructionDiary(projectId: string): Promise<boolean> {
  const row = await prisma.constructionDiary.findFirst({
    where: { projectId, savedAt: { not: null } },
    select: { id: true },
  });
  return Boolean(row);
}

function normalizeDiaryPhotos(value: unknown): CustomerDiaryPhoto[] {
  if (!Array.isArray(value)) return [];
  const out: CustomerDiaryPhoto[] = [];
  for (const item of value) {
    if (item && typeof item === "object" && typeof (item as { key?: unknown }).key === "string") {
      out.push({
        key: (item as { key: string }).key,
        contentType: typeof (item as { contentType?: unknown }).contentType === "string"
          ? (item as { contentType: string }).contentType
          : null,
      });
    }
  }
  return out;
}

export async function getCustomerConstructionDiaryEntries(
  projectId: string,
  filter: { entryDate?: string | null } = {},
): Promise<CustomerDiaryEntry[]> {
  const where: Prisma.ConstructionDiaryWhereInput = {
    projectId,
    savedAt: { not: null },
  };
  if (filter.entryDate) {
    const parsed = new Date(`${filter.entryDate}T00:00:00.000Z`);
    if (!Number.isNaN(parsed.getTime())) {
      where.entryDate = parsed;
    }
  }

  const rows = await prisma.constructionDiary.findMany({
    where,
    orderBy: { entryDate: "desc" },
    select: {
      id: true,
      entryDate: true,
      savedAt: true,
      tasksDone: true,
      taskPhotos: true,
      sitePhotos: true,
      ks: { select: { fullName: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    entryDate: row.entryDate,
    savedAt: row.savedAt,
    tasksDone: row.tasksDone && row.tasksDone.trim().length > 0 ? row.tasksDone : null,
    photos: [
      ...normalizeDiaryPhotos(row.taskPhotos),
      ...normalizeDiaryPhotos(row.sitePhotos),
    ],
    reporter: row.ks?.fullName || null,
  }));
}
