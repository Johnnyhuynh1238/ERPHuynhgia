import { randomUUID } from "node:crypto";
import { Prisma, ProjectStatus, ProjectMemberRole, ProjectRoleType, TaskCategory, TaskPhase, TaskStatus, UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireRole } from "@/lib/auth-helpers";
import { getPhaseMeta } from "@/lib/task-template-csv";
import { fmtMoney, logProjectActivity } from "@/lib/project-activity-log";

const STATUS_PRIORITY: Record<ProjectStatus, number> = {
  in_progress: 0,
  planning: 1,
  paused: 2,
  completed: 3,
};

const phoneVNRegex = /^(0|\+84)(3|5|7|8|9)\d{8}$/;

const optionalPositiveNumber = z.preprocess(
  (value) => (value === "" || value === null || value === undefined || Number.isNaN(value) ? undefined : Number(value)),
  z.number().positive().optional(),
);

const optionalPercentNumber = z.preprocess(
  (value) => (value === "" || value === null || value === undefined || Number.isNaN(value) ? undefined : Number(value)),
  z.number().min(0).max(100).optional(),
);

const optionalDateString = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? undefined : value),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
);

const paymentScheduleInputSchema = z.object({
  type: z.enum(["contract", "addendum"]).optional().default("contract"),
  installmentNo: z.coerce.number().int().min(1),
  description: z.string().trim().min(1),
  percent: optionalPercentNumber,
  amount: optionalPositiveNumber,
  dueDate: optionalDateString,
  paymentNote: z.string().trim().optional().nullable(),
});

const MEMBER_ROLE_TO_PROJECT_ROLE: Record<ProjectMemberRole, ProjectRoleType> = {
  [ProjectMemberRole.engineer]: ProjectRoleType.pm_engineer,
  [ProjectMemberRole.foreman]: ProjectRoleType.pm_labor_manager,
  [ProjectMemberRole.accountant]: ProjectRoleType.pm_accountant,
  [ProjectMemberRole.construction_manager]: ProjectRoleType.pm_construction_manager,
};

const createProjectSchema = z.object({
  customerName: z.string().trim().min(2, "Tên chủ nhà tối thiểu 2 ký tự"),
  customerPhone: z.string().trim().regex(phoneVNRegex, "SĐT chủ nhà không hợp lệ"),
  customerIdNumber: z.string().trim().optional().nullable(),
  customerPermanentAddress: z.string().trim().optional().nullable(),
  address: z.string().trim().min(5, "Địa chỉ tối thiểu 5 ký tự"),
  name: z.string().trim().min(3, "Tên dự án tối thiểu 3 ký tự"),
  contractValue: z.number().min(1, "Giá trị HĐ phải > 0"),
  contractSignDate: optionalDateString,
  startDate: z.string().min(1, "Ngày khởi công là bắt buộc"),
  expectedEndDate: z.string().min(1, "Ngày bàn giao dự kiến là bắt buộc"),
  plannedDeadline: z.string().optional().nullable(),
  templateCategory: z.enum(["standard_catalog", "nha_pho_1t1l", "blank"]).default("standard_catalog"),
  projectManagerId: z.string().uuid("GĐ Thi Công không hợp lệ"),
  mainEngineerId: z.string().uuid("KS chính không hợp lệ"),
  warrantyTotalMonths: z.coerce.number().int().min(0).optional(),
  warrantyStructureYears: z.coerce.number().int().min(0).optional(),
  warrantyLeakYears: z.coerce.number().int().min(0).optional(),
  members: z
    .array(
      z.object({
        userId: z.string().uuid("User thành viên không hợp lệ"),
        roleInProject: z.nativeEnum(ProjectMemberRole),
      }),
    )
    .default([]),
  paymentSchedules: z.array(paymentScheduleInputSchema).default([]),
  notes: z.string().trim().optional().nullable(),
});

function mapAuthError(message: string) {
  if (message === "401_UNAUTHORIZED") {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }
  if (message === "403_FORBIDDEN") {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }
  return null;
}

function addDays(baseDate: Date, offsetDays: number) {
  const d = new Date(baseDate);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d;
}

function dayDiff(from: Date, to: Date) {
  const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.max(0, Math.round((end - start) / 86400000));
}

function normalizeDateStart(raw: string) {
  const [year, month, day] = raw.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
}

function normalizeDate(raw: string) {
  const [year, month, day] = raw.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
}

function parseProjectStatus(input: string | null) {
  if (!input || input === "all") return null;
  if (["planning", "in_progress", "completed", "paused"].includes(input)) {
    return input as ProjectStatus;
  }
  return null;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const pageSize = 10;
  const search = (searchParams.get("search") || "").trim();
  const statusFilter = parseProjectStatus(searchParams.get("status"));
  const managerFilter = searchParams.get("projectManagerId") || "";
  const engineerFilter = searchParams.get("mainEngineerId") || "";

  const canViewAllProjects = user.role === UserRole.admin;
  const canViewFinancial = user.role === UserRole.admin || user.role === UserRole.accountant;

  const andClauses: Prisma.ProjectWhereInput[] = [];

  if (!canViewAllProjects) {
    andClauses.push({
      memberAssignments: {
        some: {
          userId: user.id,
        },
      },
    });
  }

  if (search) {
    andClauses.push({
      OR: [
        { code: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
        { customerName: { contains: search, mode: "insensitive" } },
        { address: { contains: search, mode: "insensitive" } },
      ],
    });
  }

  if (statusFilter) {
    andClauses.push({ status: statusFilter });
  }

  if (canViewAllProjects && managerFilter) {
    andClauses.push({ projectManagerId: managerFilter });
  }

  if (canViewAllProjects && engineerFilter) {
    andClauses.push({ mainEngineerId: engineerFilter });
  }

  const where: Prisma.ProjectWhereInput = andClauses.length > 0 ? { AND: andClauses } : {};

  const projectsRaw = await prisma.project.findMany({
    where,
    include: {
      projectManager: {
        select: { id: true, fullName: true },
      },
      mainEngineer: {
        select: { id: true, fullName: true },
      },
    },
  });

  const projectsSorted = projectsRaw.sort((a, b) => {
    const p = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
    if (p !== 0) return p;
    return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
  });

  const total = projectsSorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  const projectsPage = projectsSorted.slice(start, start + pageSize);

  const ids = projectsPage.map((p) => p.id);

  const [inspectedCounts, validCounts] = await Promise.all([
    prisma.task.groupBy({
      by: ["projectId"],
      where: {
        projectId: { in: ids },
        isActive: true,
        status: TaskStatus.inspected,
      },
      _count: { projectId: true },
    }),
    prisma.task.groupBy({
      by: ["projectId"],
      where: {
        projectId: { in: ids },
        isActive: true,
        NOT: { status: TaskStatus.na },
      },
      _count: { projectId: true },
    }),
  ]);

  const inspectedMap = new Map(inspectedCounts.map((x) => [x.projectId, x._count.projectId]));
  const validMap = new Map(validCounts.map((x) => [x.projectId, x._count.projectId]));

  const projects = projectsPage.map((p) => {
    const inspected = inspectedMap.get(p.id) || 0;
    const totalTasks = validMap.get(p.id) || 0;
    const progressPercent = totalTasks > 0 ? Math.round((inspected / totalTasks) * 100) : 0;

    return {
      id: p.id,
      code: p.code,
      name: p.name,
      customerName: p.customerName,
      customerPhone: p.customerPhone,
      address: p.address,
      contractValue: canViewFinancial ? (p.contractValue === null ? null : Number(p.contractValue)) : null,
      startDate: p.startDate,
      expectedEndDate: p.expectedEndDate,
      status: p.status,
      projectManager: p.projectManager,
      mainEngineer: p.mainEngineer,
      progressPercent,
    };
  });

  const filters = {
    projectManagers: [] as { id: string; fullName: string }[],
    mainEngineers: [] as { id: string; fullName: string }[],
  };

  if (canViewAllProjects) {
    const [projectManagers, mainEngineers] = await Promise.all([
      prisma.user.findMany({
        where: { role: UserRole.admin, isActive: true },
        select: { id: true, fullName: true },
        orderBy: { fullName: "asc" },
      }),
      prisma.user.findMany({
        where: { role: UserRole.engineer, isActive: true },
        select: { id: true, fullName: true },
        orderBy: { fullName: "asc" },
      }),
    ]);

    filters.projectManagers = projectManagers;
    filters.mainEngineers = mainEngineers;
  }

  return NextResponse.json({
    projects,
    page,
    pageSize,
    total,
    totalPages,
    filters,
    role: user.role,
  });
}

export async function POST(request: Request) {
  let actorUser: Awaited<ReturnType<typeof requireRole>>;
  try {
    actorUser = await requireRole(["admin"]);
  } catch (error) {
    const mapped = mapAuthError(error instanceof Error ? error.message : "UNKNOWN");
    return mapped || NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createProjectSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const hasDuplicateMembers = new Set(parsed.data.members.map((x) => x.userId)).size !== parsed.data.members.length;
  if (hasDuplicateMembers) {
    return NextResponse.json({ message: "Không được chọn trùng thành viên dự án" }, { status: 400 });
  }

  const startedAt = Date.now();
  const startDate = normalizeDateStart(parsed.data.startDate);
  const expectedEndDate = normalizeDate(parsed.data.expectedEndDate);
  const plannedDeadline = parsed.data.plannedDeadline ? normalizeDate(parsed.data.plannedDeadline) : null;

  const areaM2 = 0;
  const unitPrice = 0;
  const contractValue = Math.round(Number(parsed.data.contractValue));
  const contractValueForCreate = new Prisma.Decimal(contractValue);
  const projectManagerId = parsed.data.projectManagerId;

  const year = startDate.getFullYear();
  const codePrefix = `DA-${year}-`;

  const paymentTemplate = [
    { phaseNumber: 1, milestoneDescription: "Ký HĐ, tạm ứng khởi công", percent: 0.15, dayOffset: -3 },
    { phaseNumber: 2, milestoneDescription: "Xong móng, nghiệm thu giai đoạn 1", percent: 0.2, dayOffset: 21 },
    { phaseNumber: 3, milestoneDescription: "Xong sàn tầng 1, nghiệm thu giai đoạn 2", percent: 0.2, dayOffset: 42 },
    { phaseNumber: 4, milestoneDescription: "Xong sàn mái (cất nóc), nghiệm thu giai đoạn 3", percent: 0.2, dayOffset: 63 },
    { phaseNumber: 5, milestoneDescription: "Xong tô trát + chống thấm, nghiệm thu giai đoạn 4", percent: 0.15, dayOffset: 87 },
    { phaseNumber: 6, milestoneDescription: "Bàn giao, nghiệm thu tổng thể", percent: 0.1, dayOffset: 120 },
  ];

  try {
    const createdProject = await prisma.$transaction(async (tx) => {
      const users = await tx.user.findMany({
        where: {
          id: {
            in: [projectManagerId, parsed.data.mainEngineerId, ...parsed.data.members.map((x) => x.userId)],
          },
          isActive: true,
        },
        select: { id: true },
      });

      const userSet = new Set(users.map((u) => u.id));
      if (!userSet.has(projectManagerId)) {
        throw new Error("GĐ Thi Công không hợp lệ hoặc đã bị vô hiệu");
      }
      if (!userSet.has(parsed.data.mainEngineerId)) {
        throw new Error("KS chính không hợp lệ hoặc đã bị vô hiệu");
      }

      const countThisYear = await tx.project.count({
        where: {
          code: {
            startsWith: codePrefix,
          },
        },
      });

      const nextCode = `${codePrefix}${String(countThisYear + 1).padStart(3, "0")}`;

      const contractMetaPayload: Record<string, unknown> = {};
      if (parsed.data.customerPermanentAddress) {
        contractMetaPayload.customerPermanentAddress = parsed.data.customerPermanentAddress;
      }
      if (parsed.data.contractSignDate) {
        contractMetaPayload.contractSignDate = parsed.data.contractSignDate;
      }
      if (parsed.data.warrantyTotalMonths !== undefined) {
        contractMetaPayload.warrantyTotalMonths = parsed.data.warrantyTotalMonths;
      }
      if (parsed.data.warrantyStructureYears !== undefined) {
        contractMetaPayload.warrantyStructureYears = parsed.data.warrantyStructureYears;
      }
      if (parsed.data.warrantyLeakYears !== undefined) {
        contractMetaPayload.warrantyLeakYears = parsed.data.warrantyLeakYears;
      }

      const project = await tx.project.create({
        data: {
          code: nextCode,
          name: parsed.data.name,
          customerName: parsed.data.customerName,
          customerPhone: parsed.data.customerPhone,
          customerIdNumber: parsed.data.customerIdNumber || null,
          customerPortalToken: randomUUID(),
          customerPortalEnabled: true,
          address: parsed.data.address,
          areaM2,
          unitPrice,
          contractValue: contractValueForCreate ?? new Prisma.Decimal(0),
          startDate,
          expectedEndDate,
          plannedDeadline,
          projectManagerId,
          mainEngineerId: parsed.data.mainEngineerId,
          status: ProjectStatus.planning,
          notes: parsed.data.notes || null,
          contractMeta:
            Object.keys(contractMetaPayload).length > 0
              ? (contractMetaPayload as Prisma.InputJsonValue)
              : Prisma.JsonNull,
        },
      });

      // Catalog path (mặc định mới): seed task từ StandardTaskCatalog. Bỏ qua nhánh TaskTemplate legacy bên dưới.
      if (parsed.data.templateCategory === "standard_catalog") {
        const catalog = await tx.standardTaskCatalog.findMany({
          where: { retiredAt: null },
          orderBy: [{ phaseCode: "asc" }, { displayOrder: "asc" }],
        });
        if (catalog.length === 0) {
          throw new Error("Catalog chuẩn rỗng — chưa seed");
        }

        // Group → ProjectPhase. catalog.phaseCode = "01".."09", giữ nguyên làm ProjectPhase.code mới.
        type PhaseInfo = { code: string; name: string; displayOrder: number; duration: number };
        const phaseInfoMap = new Map<string, PhaseInfo>();
        catalog.forEach((row, idx) => {
          const dur = Math.max(1, row.defaultDurationDays ?? 1);
          const existing = phaseInfoMap.get(row.phaseCode);
          if (!existing) {
            phaseInfoMap.set(row.phaseCode, {
              code: row.phaseCode,
              name: row.phaseName,
              displayOrder: parseInt(row.phaseCode, 10) || idx + 1,
              duration: dur,
            });
          } else if (dur > existing.duration) {
            existing.duration = dur;
          }
        });
        const orderedPhases = Array.from(phaseInfoMap.values()).sort((a, b) => a.displayOrder - b.displayOrder);

        let phaseCursor = startDate;
        await tx.projectPhase.createMany({
          data: orderedPhases.map((p) => {
            const plannedStartDate = phaseCursor;
            const plannedEndDate = addDays(plannedStartDate, p.duration - 1);
            phaseCursor = addDays(plannedEndDate, 1);
            return {
              projectId: project.id,
              code: p.code,
              name: p.name,
              description: null,
              displayOrder: p.displayOrder,
              duration: p.duration,
              plannedStartDate,
              plannedEndDate,
              actualStartDate: null,
              actualEndDate: null,
              status: "not_started" as const,
              createdBy: actorUser.id,
            };
          }),
        });

        const createdPhases = await tx.projectPhase.findMany({
          where: { projectId: project.id },
          select: { id: true, code: true },
        });
        const phaseIdByCode = new Map(createdPhases.map((p) => [p.code, p.id]));

        // Map catalog phaseCode "01..09" → legacy TaskPhase enum (vẫn required trên Task cho đến P5 cleanup).
        const LEGACY_PHASE_MAP: Record<string, TaskPhase> = {
          "01": TaskPhase.P1_CHUAN_BI,
          "02": TaskPhase.P2_MONG,
          "03": TaskPhase.P3_KHUNG_TRET,
          "04": TaskPhase.P4_KHUNG_LAU,
          "05": TaskPhase.P5_ME_XAY_TO,
          "06": TaskPhase.P5_ME_XAY_TO,
          "07": TaskPhase.P8_LAP_TB,
          "08": TaskPhase.P6_OP_LAT,
          "09": TaskPhase.P9_BAN_GIAO,
        };

        await tx.task.createMany({
          data: catalog.map((row) => {
            const offsetDays = row.defaultOffsetDays ?? 0;
            const durationDays = Math.max(1, row.defaultDurationDays ?? 1);
            const plannedStartDate = addDays(startDate, offsetDays);
            const plannedEndDate = addDays(plannedStartDate, durationDays - 1);
            return {
              projectId: project.id,
              templateId: null,
              stdCatalogId: row.id,
              stdPhaseCode: row.phaseCode,
              stdTaskCode: row.taskCode,
              phaseId: phaseIdByCode.get(row.phaseCode) || null,
              code: `${row.phaseCode}-${row.taskCode}`,
              phase: LEGACY_PHASE_MAP[row.phaseCode] ?? TaskPhase.P1_CHUAN_BI,
              name: row.taskName,
              origin: "template" as const,
              category: row.category as TaskCategory,
              offsetDays,
              durationDays,
              duration: durationDays,
              plannedStartDate,
              plannedEndDate,
              actualStartDate: null,
              actualEndDate: null,
              assignedEngineerId: parsed.data.mainEngineerId,
              assignedForemanId: null,
              team: row.defaultTeam,
              inspectorName: row.defaultInspector ?? "",
              materialsNeeded: row.materialsNeeded ?? "",
              proposerRole: row.proposerRole ?? "",
              ordererRole: row.ordererRole ?? "",
              receiverRole: row.receiverRole ?? "",
              qcChecklist: row.qcChecklist ?? "",
              isMilestone: row.isMilestone,
              visibleToCustomer: row.isMilestone,
              status: TaskStatus.not_started,
              isActive: true,
              displayOrder: row.displayOrder,
              notes: row.note,
            };
          }),
        });
      }

      const taskTemplates = parsed.data.templateCategory === "blank" || parsed.data.templateCategory === "standard_catalog"
        ? []
        : await tx.taskTemplate.findMany({
            where: {
              templateCategory: parsed.data.templateCategory,
            },
            orderBy: [{ displayOrder: "asc" }, { code: "asc" }],
          });

      if (parsed.data.templateCategory !== "blank" && parsed.data.templateCategory !== "standard_catalog" && taskTemplates.length === 0) {
        throw new Error("Chưa có template để tạo dự án");
      }

      const phaseTemplateMap = new Map<
        string,
        { code: string; name: string; displayOrder: number; duration: number }
      >();

      taskTemplates.forEach((template) => {
        const fallback = getPhaseMeta(template.phase);
        const phaseCode = template.phaseCode || fallback.code;
        const phaseName = template.phaseName || fallback.name;
        const phaseOrder = template.phaseOrder || fallback.order;
        const nextDuration = Math.max(1, Number(template.phaseDuration || template.duration || template.defaultDurationDays || 1));

        const current = phaseTemplateMap.get(phaseCode);

        if (!current) {
          phaseTemplateMap.set(phaseCode, {
            code: phaseCode,
            name: phaseName,
            displayOrder: phaseOrder,
            duration: nextDuration,
          });
          return;
        }

        if (nextDuration > current.duration) {
          current.duration = nextDuration;
        }
      });

      const phaseTemplates = Array.from(phaseTemplateMap.values()).sort((a, b) => a.displayOrder - b.displayOrder);
      let phaseStartDateCursor = startDate;

      if (phaseTemplates.length > 0) {
        await tx.projectPhase.createMany({
          data: phaseTemplates.map((phaseTemplate) => {
            const plannedStartDate = phaseStartDateCursor;
            const plannedEndDate = addDays(plannedStartDate, phaseTemplate.duration - 1);
            phaseStartDateCursor = addDays(plannedEndDate, 1);

            return {
              projectId: project.id,
              code: phaseTemplate.code,
              name: phaseTemplate.name,
              description: null,
              displayOrder: phaseTemplate.displayOrder,
              duration: phaseTemplate.duration,
              plannedStartDate,
              plannedEndDate,
              actualStartDate: null,
              actualEndDate: null,
              status: "not_started",
              createdBy: actorUser.id,
            };
          }),
        });
      }

      const projectPhases = await tx.projectPhase.findMany({
        where: { projectId: project.id },
        select: { id: true, code: true },
      });

      const phaseIdByCode = new Map(projectPhases.map((phase) => [phase.code, phase.id]));

      if (taskTemplates.length > 0) {
        await tx.task.createMany({
          data: taskTemplates.map((template) => {
          const phaseMeta = getPhaseMeta(template.phase);
          const phaseCode = template.phaseCode || phaseMeta.code;

          const plannedStartDate = addDays(startDate, template.defaultOffsetDays);
          const durationDays = Math.max(1, Number(template.defaultDurationDays || template.duration || 1));
          const plannedEndDate = addDays(plannedStartDate, durationDays - 1);

          return {
            projectId: project.id,
            templateId: template.id,
            phaseId: phaseIdByCode.get(phaseCode) || null,
            code: template.code,
            phase: template.phase,
            name: template.name,
            offsetDays: template.defaultOffsetDays,
            durationDays,
            duration: Math.max(1, Number(template.duration || durationDays)),
            plannedStartDate,
            plannedEndDate,
            actualStartDate: null,
            actualEndDate: null,
            assignedEngineerId: parsed.data.mainEngineerId,
            assignedForemanId: null,
            team: template.defaultTeam,
            inspectorName: template.defaultInspector,
            materialsNeeded: template.materialsNeeded,
            proposerRole: template.proposerRole,
            ordererRole: template.ordererRole,
            receiverRole: template.receiverRole,
            qcChecklist: template.qcChecklist,
            isMilestone: template.isMilestone,
            visibleToCustomer: template.isMilestone,
            status: TaskStatus.not_started,
            isActive: true,
            displayOrder: template.displayOrder,
            notes: null,
          };
          }),
        });
      }

      const paymentBaseValue = contractValue ?? 0;
      const paymentScheduleInputs = parsed.data.paymentSchedules;
      const paymentRows = paymentScheduleInputs.length > 0
        ? paymentScheduleInputs.map((item, index) => {
            const installmentNo = item.installmentNo || index + 1;
            const amount = item.amount ?? (paymentBaseValue > 0 && item.percent !== undefined ? Math.round(paymentBaseValue * (item.percent / 100)) : 0);
            if (amount <= 0) throw new Error(`Đợt thanh toán ${installmentNo} thiếu số tiền hoặc % hợp lệ`);
            const dueDate = item.dueDate ? normalizeDate(item.dueDate) : null;
            const percent = item.percent !== undefined ? item.percent : paymentBaseValue > 0 ? Math.round((amount / paymentBaseValue) * 10000) / 100 : 0;

            return {
              projectId: project.id,
              phaseNumber: installmentNo,
              milestoneDescription: item.description,
              percent,
              amount,
              expectedDate: dueDate,
              dayOffset: dueDate ? dayDiff(startDate, dueDate) : null,
              status: "not_collected" as const,
              actualPaidDate: null,
              actualPaidAmount: null,
              notes: item.paymentNote || null,
              type: item.type,
              installmentNo,
              description: item.description,
              dueDate,
              paymentNote: item.paymentNote || null,
              createdBy: actorUser.id,
            };
          })
        : (() => {
            const paymentAmounts = paymentTemplate.map((item) => Math.round(paymentBaseValue * item.percent));
            const partialSum = paymentAmounts.slice(0, 5).reduce((sum, v) => sum + v, 0);
            paymentAmounts[5] = paymentBaseValue - partialSum;

            return paymentTemplate.map((item, index) => ({
              projectId: project.id,
              phaseNumber: item.phaseNumber,
              milestoneDescription: item.milestoneDescription,
              percent: item.percent,
              amount: paymentAmounts[index],
              expectedDate: addDays(startDate, item.dayOffset),
              dayOffset: item.dayOffset,
              status: "not_collected" as const,
              actualPaidDate: null,
              actualPaidAmount: null,
              notes: null,
            }));
          })();

      await tx.paymentSchedule.createMany({ data: paymentRows });

      const memberRows = parsed.data.members.filter(
        (member) => member.userId !== projectManagerId && member.userId !== parsed.data.mainEngineerId,
      );

      const dedup = new Map<string, ProjectMemberRole>();
      memberRows.forEach((m) => {
        if (!dedup.has(m.userId)) {
          dedup.set(m.userId, m.roleInProject);
        }
      });

      if (dedup.size > 0) {
        await tx.projectMember.createMany({
          data: Array.from(dedup.entries()).map(([userId, roleInProject]) => ({
            projectId: project.id,
            userId,
            roleInProject,
            addedBy: actorUser.id,
          })),
        });
      }

      const assignmentRows = new Map<
        string,
        { projectId: string; userId: string; role: ProjectRoleType; isPrimary: boolean; assignedBy: string }
      >();

      function queueAssignment(userId: string, role: ProjectRoleType, isPrimary: boolean) {
        assignmentRows.set(`${userId}:${role}`, {
          projectId: project.id,
          userId,
          role,
          isPrimary,
          assignedBy: actorUser.id,
        });
      }

      queueAssignment(projectManagerId, ProjectRoleType.pm_construction_manager, true);
      queueAssignment(parsed.data.mainEngineerId, ProjectRoleType.pm_engineer, true);
      dedup.forEach((roleInProject, userId) => {
        queueAssignment(userId, MEMBER_ROLE_TO_PROJECT_ROLE[roleInProject], false);
      });

      await tx.projectMemberAssignment.createMany({
        data: Array.from(assignmentRows.values()),
        skipDuplicates: true,
      });

      await logProjectActivity(tx, {
        projectId: project.id,
        actorId: actorUser.id,
        entity: "project",
        entityId: project.id,
        action: "create",
        summary: `Tạo dự án ${project.code} "${project.name}" — chủ nhà: ${project.customerName}, giá HĐ: ${fmtMoney(project.contractValue)}`,
        metadata: {
          code: project.code,
          contractValue: project.contractValue?.toString() ?? null,
          templateCategory: parsed.data.templateCategory,
          memberCount: dedup.size,
          paymentScheduleCount: paymentRows.length,
        },
      });

      return project;
    });

    const elapsed = Date.now() - startedAt;
    const [createdTaskCount, createdPaymentCount] = await Promise.all([
      prisma.task.count({ where: { projectId: createdProject.id } }),
      prisma.paymentSchedule.count({ where: { projectId: createdProject.id } }),
    ]);
    console.log(`Created project ${createdProject.code} with ${createdTaskCount} tasks, ${createdPaymentCount} payments in ${elapsed}ms`);

    return NextResponse.json({
      id: createdProject.id,
      code: createdProject.code,
      message: `Đã tạo dự án ${createdProject.code}. Tự động sinh ${createdTaskCount} task + ${createdPaymentCount} đợt thanh toán.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể tạo dự án";
    return NextResponse.json({ message }, { status: 400 });
  }
}
