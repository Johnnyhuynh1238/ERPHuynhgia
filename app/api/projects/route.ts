import { randomUUID } from "node:crypto";
import { Prisma, ProjectStatus, ProjectMemberRole, TaskStatus, UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireRole } from "@/lib/auth-helpers";

const STATUS_PRIORITY: Record<ProjectStatus, number> = {
  in_progress: 0,
  planning: 1,
  paused: 2,
  completed: 3,
};

const phoneVNRegex = /^(0|\+84)(3|5|7|8|9)\d{8}$/;

const createProjectSchema = z.object({
  customerName: z.string().trim().min(2, "Tên chủ nhà tối thiểu 2 ký tự"),
  customerPhone: z.string().trim().regex(phoneVNRegex, "SĐT chủ nhà không hợp lệ"),
  customerIdNumber: z.string().trim().optional().nullable(),
  address: z.string().trim().min(5, "Địa chỉ tối thiểu 5 ký tự"),
  name: z.string().trim().min(3, "Tên dự án tối thiểu 3 ký tự"),
  areaM2: z.number().min(1, "Diện tích phải > 0"),
  unitPrice: z.number().min(1_000_000, "Đơn giá tối thiểu 1.000.000"),
  startDate: z.string().min(1, "Ngày khởi công là bắt buộc"),
  templateCategory: z.literal("nha_pho_1t1l"),
  projectManagerId: z.string().uuid("GĐ quản lý không hợp lệ"),
  mainEngineerId: z.string().uuid("KS chính không hợp lệ"),
  members: z
    .array(
      z.object({
        userId: z.string().uuid("User thành viên không hợp lệ"),
        roleInProject: z.nativeEnum(ProjectMemberRole),
      }),
    )
    .default([]),
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

function normalizeDateStart(raw: string) {
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

  const canViewAllProjects =
    user.role === UserRole.admin ||
    user.role === UserRole.accountant ||
    user.role === UserRole.construction_manager;
  const canViewFinancial = user.role === UserRole.admin || user.role === UserRole.accountant;

  const andClauses: Prisma.ProjectWhereInput[] = [];

  if (!canViewAllProjects) {
    andClauses.push({
      OR: [
        { projectManagerId: user.id },
        { mainEngineerId: user.id },
        {
          projectMembers: {
            some: {
              userId: user.id,
            },
          },
        },
      ],
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
      contractValue: canViewFinancial ? Number(p.contractValue) : null,
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
  let actorUser;
  try {
    actorUser = await requireRole(["admin", "construction_manager"]);
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
  const expectedEndDate = addDays(startDate, 120);
  const contractValue = Math.round(parsed.data.areaM2 * parsed.data.unitPrice);
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
            in: [parsed.data.projectManagerId, parsed.data.mainEngineerId, ...parsed.data.members.map((x) => x.userId)],
          },
          isActive: true,
        },
        select: { id: true },
      });

      const userSet = new Set(users.map((u) => u.id));
      if (!userSet.has(parsed.data.projectManagerId)) {
        throw new Error("GĐ quản lý không hợp lệ hoặc đã bị vô hiệu");
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
          areaM2: parsed.data.areaM2,
          unitPrice: parsed.data.unitPrice,
          contractValue,
          startDate,
          expectedEndDate,
          projectManagerId: parsed.data.projectManagerId,
          mainEngineerId: parsed.data.mainEngineerId,
          status: ProjectStatus.planning,
          notes: null,
        },
      });

      const taskTemplates = await tx.taskTemplate.findMany({
        where: {
          templateCategory: parsed.data.templateCategory,
        },
        orderBy: [{ displayOrder: "asc" }, { code: "asc" }],
      });

      if (taskTemplates.length !== 69) {
        throw new Error("Template chưa được seed, liên hệ admin hệ thống");
      }

      await tx.task.createMany({
        data: taskTemplates.map((template) => {
          const plannedStartDate = addDays(startDate, template.defaultOffsetDays);
          const plannedEndDate = addDays(plannedStartDate, template.defaultDurationDays - 1);

          return {
            projectId: project.id,
            templateId: template.id,
            code: template.code,
            phase: template.phase,
            name: template.name,
            offsetDays: template.defaultOffsetDays,
            durationDays: template.defaultDurationDays,
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

      const paymentAmounts = paymentTemplate.map((item) => Math.round(contractValue * item.percent));
      const partialSum = paymentAmounts.slice(0, 5).reduce((sum, v) => sum + v, 0);
      paymentAmounts[5] = contractValue - partialSum;

      await tx.paymentSchedule.createMany({
        data: paymentTemplate.map((item, index) => ({
          projectId: project.id,
          phaseNumber: item.phaseNumber,
          milestoneDescription: item.milestoneDescription,
          percent: item.percent,
          amount: paymentAmounts[index],
          expectedDate: addDays(startDate, item.dayOffset),
          dayOffset: item.dayOffset,
          status: "not_collected",
          actualPaidDate: null,
          actualPaidAmount: null,
          notes: null,
        })),
      });

      const memberRows = parsed.data.members.filter(
        (member) => member.userId !== parsed.data.projectManagerId && member.userId !== parsed.data.mainEngineerId,
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

      return project;
    });

    const elapsed = Date.now() - startedAt;
    console.log(`Created project ${createdProject.code} with 69 tasks, 6 payments in ${elapsed}ms`);

    return NextResponse.json({
      id: createdProject.id,
      code: createdProject.code,
      message: `Đã tạo dự án ${createdProject.code}. Tự động sinh 69 task + 6 đợt thanh toán.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể tạo dự án";
    return NextResponse.json({ message }, { status: 400 });
  }
}
