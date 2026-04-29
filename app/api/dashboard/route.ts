import { NextResponse } from "next/server";
import { PaymentStatus, TaskStatus, UserRole } from "@prisma/client";
import { localDeadlineForDate } from "@/lib/date";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { getReportProjectsForUser } from "@/lib/reporting";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

function startOfTodayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
}

function endOfTodayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function startOfMonthUtc(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0));
}

function endOfMonthUtc(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}

function formatHhMm(date: Date) {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function formatRemainingMinutes(diffMinutes: number) {
  const abs = Math.abs(diffMinutes);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  return `${hours}h ${minutes}p`;
}

function buildReportStatusLabel(submittedAt: Date | null, isOnTime: boolean, deadline: Date, now: Date) {
  if (submittedAt) {
    if (isOnTime) {
      return {
        label: `Đã nộp ${formatHhMm(submittedAt)} ✓`,
        tone: "good" as const,
        submitted: true,
      };
    }

    return {
      label: `Nộp trễ lúc ${formatHhMm(submittedAt)}`,
      tone: "warn" as const,
      submitted: true,
    };
  }

  const diffMinutes = Math.floor((deadline.getTime() - now.getTime()) / 60000);
  if (diffMinutes >= 0) {
    return {
      label: `Chưa nộp - còn ${formatRemainingMinutes(diffMinutes)}`,
      tone: "warn" as const,
      submitted: false,
    };
  }

  return {
    label: `Chưa nộp - trễ ${formatRemainingMinutes(diffMinutes)}`,
    tone: "danger" as const,
    submitted: false,
  };
}

function siteRestReasonLabel(reason: "SUNDAY" | "HOLIDAY" | "STORM" | "OTHER") {
  if (reason === "SUNDAY") return "Nghỉ Chủ nhật";
  if (reason === "HOLIDAY") return "Nghỉ lễ";
  if (reason === "STORM") return "Mưa bão";
  return "Khác";
}

export const revalidate = 60;

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  const now = new Date();
  const today = startOfTodayUtc();
  const todayEnd = endOfTodayUtc();
  const in7Days = addDays(today, 7);
  const in3Days = addDays(today, 3);

  if (user.role === UserRole.admin || user.role === UserRole.construction_manager) {
    const projectAccess = buildProjectAccessWhere({ id: user.id, role: user.role });

    const [
      projectInProgress,
      totalDelayed,
      inProgressToday,
      paymentDue7,
      delayedTasks,
      recentProjects,
      reportProjectsRaw,
      subPaymentRequestsNeedingApproval,
      subPendingRequests,
      subDuePayments7,
      contractsWithoutEvaluation,
    ] = await Promise.all([
      prisma.project.count({ where: { ...projectAccess, status: "in_progress" } }),
      prisma.task.count({
        where: {
          isActive: true,
          status: { notIn: [TaskStatus.done, TaskStatus.inspected] },
          plannedEndDate: { lt: today },
          project: projectAccess,
        },
      }),
      prisma.task.count({
        where: {
          isActive: true,
          status: TaskStatus.in_progress,
          project: projectAccess,
        },
      }),
      user.role === UserRole.admin
        ? prisma.paymentSchedule.count({
            where: {
              status: PaymentStatus.not_collected,
              expectedDate: { gte: today, lte: in7Days },
            },
          })
        : Promise.resolve(0),
      prisma.task.findMany({
        where: {
          isActive: true,
          status: { notIn: [TaskStatus.done, TaskStatus.inspected] },
          plannedEndDate: { lt: today },
          project: projectAccess,
        },
        include: {
          project: { select: { id: true, code: true, name: true } },
          assignedEngineer: { select: { id: true, fullName: true } },
        },
        orderBy: { plannedEndDate: "desc" },
        take: 10,
      }),
      prisma.project.findMany({
        where: projectAccess,
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, code: true, name: true, createdAt: true },
      }),
      prisma.project.findMany({
        where: {
          ...projectAccess,
          status: { in: ["planning", "in_progress", "paused"] },
          goLiveDate: { not: null, lte: today },
        },
        select: {
          id: true,
          code: true,
          name: true,
          mainEngineerId: true,
          mainEngineer: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
        },
      }),
      prisma.subPayment.count({
        where: {
          status: "requested",
          subContract: {
            project: projectAccess,
          },
        },
      }),
      prisma.subPayment.count({
        where: {
          status: "pending",
          subContract: {
            project: projectAccess,
          },
        },
      }),
      prisma.subPayment.count({
        where: {
          status: { in: ["pending", "requested", "approved"] },
          expectedDate: { gte: today, lte: in7Days },
          subContract: {
            project: projectAccess,
          },
        },
      }),
      prisma.subContract.count({
        where: {
          status: { in: ["active", "completed"] },
          project: projectAccess,
          evaluations: {
            none: {},
          },
        },
      }),
    ]);

    const reportProjectIds = reportProjectsRaw.map((project) => project.id);

    const [siteRestRows, technicalSubmittedRows] = reportProjectIds.length
      ? await Promise.all([
          prisma.siteRestDay.findMany({
            where: {
              projectId: { in: reportProjectIds },
              restDate: today,
            },
            select: {
              projectId: true,
            },
          }),
          prisma.taskTechnicalReport.findMany({
            where: {
              reportDate: today,
              task: {
                projectId: { in: reportProjectIds },
              },
            },
            select: {
              createdBy: true,
              task: { select: { projectId: true } },
            },
          }),
        ])
      : [[], []];

    const restProjectSet = new Set(siteRestRows.map((row) => row.projectId));
    const activeReportProjects = reportProjectsRaw.filter((project) => !restProjectSet.has(project.id));

    const technicalSet = new Set(technicalSubmittedRows.map((row) => `${row.task.projectId}_${row.createdBy}`));

    const missingMorning = activeReportProjects
      .filter((project) => !technicalSet.has(`${project.id}_${project.mainEngineerId}`))
      .map((project) => ({
        projectId: project.id,
        projectCode: project.code,
        projectName: project.name,
        engineerId: project.mainEngineerId,
        engineerName: project.mainEngineer.fullName,
      }));

    // Legacy evening/morning report đã bỏ; tạm dùng cùng nguồn technical report hôm nay.
    const missingEvening = [...missingMorning];

    const issueProjects: Array<{
      projectId: string;
      projectCode: string;
      projectName: string;
      underCount: number;
    }> = [];

    const topKpi: Array<{
      userId: string;
      fullName: string;
      email: string;
      projectCount: number;
      score: number;
      rank: string;
    }> = [];
    const bottomKpi: typeof topKpi = [];

    const commonCards = [
      {
        key: user.role === UserRole.admin ? "admin_projects" : "cm_projects",
        label: "Dự án đang thi công",
        value: projectInProgress,
        tone: "good" as const,
      },
      {
        key: user.role === UserRole.admin ? "admin_delayed" : "cm_delayed",
        label: "Task trễ toàn hệ thống",
        value: totalDelayed,
        tone: totalDelayed > 0 ? ("danger" as const) : ("good" as const),
      },
      {
        key: user.role === UserRole.admin ? "admin_in_progress" : "cm_in_progress",
        label: "Task đang làm",
        value: inProgressToday,
        tone: "info" as const,
      },
      {
        key: user.role === UserRole.admin ? "admin_missing_morning" : "cm_missing_morning",
        label: "KS chưa báo cáo sáng hôm nay",
        value: missingMorning.length,
        tone: missingMorning.length > 0 ? ("warn" as const) : ("good" as const),
      },
      {
        key: user.role === UserRole.admin ? "admin_missing_evening" : "cm_missing_evening",
        label: "KS chưa báo cáo chiều hôm nay",
        value: missingEvening.length,
        tone: missingEvening.length > 0 ? ("warn" as const) : ("good" as const),
      },
      {
        key: user.role === UserRole.admin ? "admin_issue_projects" : "cm_issue_projects",
        label: "Dự án có vấn đề hôm nay",
        value: issueProjects.length,
        tone: issueProjects.length > 0 ? ("danger" as const) : ("good" as const),
      },
      {
        key: user.role === UserRole.admin ? "admin_sub_requests" : "cm_sub_requests",
        label: "Yêu cầu chi thầu phụ chờ duyệt",
        value: subPaymentRequestsNeedingApproval,
        tone: subPaymentRequestsNeedingApproval > 0 ? ("warn" as const) : ("good" as const),
      },
      {
        key: user.role === UserRole.admin ? "admin_sub_without_eval" : "cm_sub_without_eval",
        label: "HĐ thầu phụ chưa đánh giá",
        value: contractsWithoutEvaluation,
        tone: contractsWithoutEvaluation > 0 ? ("warn" as const) : ("good" as const),
      },
    ];

    const cards =
      user.role === UserRole.admin
        ? [
            ...commonCards,
            {
              key: "admin_payment_due",
              label: "Đợt thanh toán 7 ngày tới",
              value: paymentDue7,
              tone: paymentDue7 > 0 ? ("warn" as const) : ("info" as const),
            },
          ]
        : [
            ...commonCards,
            {
              key: "cm_sub_due7",
              label: "Đợt chi thầu phụ 7 ngày tới",
              value: subDuePayments7,
              tone: subDuePayments7 > 0 ? ("warn" as const) : ("info" as const),
            },
            {
              key: "cm_sub_pending",
              label: "Đề xuất chi thầu phụ mới",
              value: subPendingRequests,
              tone: subPendingRequests > 0 ? ("warn" as const) : ("good" as const),
            },
          ];

    return NextResponse.json({
      role: user.role,
      cards,
      admin: {
        delayedTasks,
        recentProjects,
        missingMorning,
        missingEvening,
        issueProjects,
        topKpi,
        bottomKpi,
      },
    });
  }

  if (user.role === UserRole.engineer) {
    const [taskCandidates, delayedTasks, next3Tasks, projectsCount, upcomingMilestones, reportProjects] = await Promise.all([
      prisma.task.findMany({
        where: {
          isActive: true,
          assignedEngineerId: user.id,
          status: { notIn: [TaskStatus.done, TaskStatus.inspected, TaskStatus.na] },
          OR: [
            { plannedEndDate: { lt: today } },
            {
              plannedStartDate: { lte: todayEnd },
              plannedEndDate: { gte: today },
            },
            {
              plannedStartDate: { gte: today, lte: todayEnd },
              status: TaskStatus.not_started,
            },
          ],
        },
        include: { project: { select: { id: true, code: true, name: true } } },
        orderBy: { plannedEndDate: "asc" },
      }),
      prisma.task.findMany({
        where: {
          assignedEngineerId: user.id,
          plannedEndDate: { lt: today },
          isActive: true,
          status: { notIn: [TaskStatus.done, TaskStatus.inspected] },
        },
      }),
      prisma.task.findMany({
        where: {
          isActive: true,
          assignedEngineerId: user.id,
          plannedStartDate: { gt: today, lte: in3Days },
        },
        include: { project: { select: { id: true, code: true, name: true } } },
      }),
      prisma.project.count({
        where: {
          OR: [{ mainEngineerId: user.id }, { projectMembers: { some: { userId: user.id } } }],
        },
      }),
      prisma.task.findMany({
        where: {
          isActive: true,
          assignedEngineerId: user.id,
          isMilestone: true,
          plannedStartDate: { gte: today, lte: in7Days },
        },
        include: { project: { select: { id: true, code: true, name: true } } },
        orderBy: { plannedStartDate: "asc" },
        take: 3,
      }),
      getReportProjectsForUser({ id: user.id, role: user.role }),
    ]);

    const taskIds = taskCandidates.map((task) => task.id);
    const technicalTodayRows = taskIds.length
      ? await prisma.taskTechnicalReport.findMany({
          where: {
            taskId: { in: taskIds },
            reportDate: today,
            createdBy: user.id,
          },
          select: {
            taskId: true,
            status: true,
          },
        })
      : [];

    const morningDecisionMap = new Map(
      technicalTodayRows.map((row) => [row.taskId, row.status === "paused" ? "PAUSE" : "WORK"] as const),
    );

    type EngineerTodayTask = (typeof taskCandidates)[number] & {
      reportGroup: "overdue" | "running" | "starting";
      morningDecision: "WORK" | "PAUSE" | null;
    };

    const groupedTasks: {
      overdue: EngineerTodayTask[];
      running: EngineerTodayTask[];
      starting: EngineerTodayTask[];
    } = {
      overdue: [],
      running: [],
      starting: [],
    };

    for (const task of taskCandidates) {
      const reportGroup: EngineerTodayTask["reportGroup"] =
        task.plannedEndDate < today
          ? "overdue"
          : task.plannedStartDate >= today && task.plannedStartDate <= todayEnd && task.status === TaskStatus.not_started
            ? "starting"
            : "running";

      const row: EngineerTodayTask = {
        ...task,
        reportGroup,
        morningDecision: (morningDecisionMap.get(task.id) ?? null) as EngineerTodayTask["morningDecision"],
      };

      if (reportGroup === "overdue") groupedTasks.overdue.push(row);
      else if (reportGroup === "starting") groupedTasks.starting.push(row);
      else groupedTasks.running.push(row);
    }

    const reportProjectIds = reportProjects.map((project) => project.id);
    const [siteRestRows, technicalRows] = reportProjectIds.length
      ? await Promise.all([
          prisma.siteRestDay.findMany({
            where: {
              projectId: { in: reportProjectIds },
              restDate: today,
            },
            select: {
              projectId: true,
              reason: true,
            },
          }),
          prisma.taskTechnicalReport.findMany({
            where: {
              reportDate: today,
              createdBy: user.id,
              task: {
                projectId: { in: reportProjectIds },
              },
            },
            select: {
              createdAt: true,
              task: { select: { projectId: true } },
            },
          }),
        ])
      : [[], []];

    const restMap = new Map(siteRestRows.map((row) => [row.projectId, row]));
    const technicalMap = new Map<string, Date>();
    for (const row of technicalRows) {
      const pid = row.task.projectId;
      const prev = technicalMap.get(pid);
      if (!prev || prev < row.createdAt) technicalMap.set(pid, row.createdAt);
    }

    const technicalDeadline = localDeadlineForDate(today, 19);

    const reportStatus = reportProjects.map((project) => {
      const goLiveActive = Boolean(project.goLiveDate && project.goLiveDate <= today);
      const rest = restMap.get(project.id);

      if (!goLiveActive) {
        return {
          projectId: project.id,
          projectCode: project.code,
          projectName: project.name,
          isActive: false,
          isRestDay: false,
          restReason: null,
          morningLabel: "Dự án chưa go-live",
          morningTone: "info" as const,
          eveningLabel: "Dự án chưa go-live",
          eveningTone: "info" as const,
          morningSubmitted: false,
          eveningSubmitted: false,
        };
      }

      if (rest) {
        const reason = siteRestReasonLabel(rest.reason);
        return {
          projectId: project.id,
          projectCode: project.code,
          projectName: project.name,
          isActive: true,
          isRestDay: true,
          restReason: reason,
          morningLabel: `🏖️ Công trường nghỉ hôm nay - ${reason}`,
          morningTone: "good" as const,
          eveningLabel: `🏖️ Công trường nghỉ hôm nay - ${reason}`,
          eveningTone: "good" as const,
          morningSubmitted: false,
          eveningSubmitted: false,
        };
      }

      const submittedAt = technicalMap.get(project.id) ?? null;
      const technicalStatus = buildReportStatusLabel(submittedAt, Boolean(submittedAt && submittedAt <= technicalDeadline), technicalDeadline, now);

      return {
        projectId: project.id,
        projectCode: project.code,
        projectName: project.name,
        isActive: true,
        isRestDay: false,
        restReason: null,
        morningLabel: technicalStatus.label,
        morningTone: technicalStatus.tone,
        eveningLabel: technicalStatus.label,
        eveningTone: technicalStatus.tone,
        morningSubmitted: technicalStatus.submitted,
        eveningSubmitted: technicalStatus.submitted,
      };
    });

    const activeReportRows = reportStatus.filter((row) => row.isActive && !row.isRestDay);
    const pendingReportCount = activeReportRows.filter((row) => !row.morningSubmitted || !row.eveningSubmitted).length;

    const kpiTargetProject = reportProjects.find((project) => project.goLiveDate && project.goLiveDate <= today);
    const kpiMonth: { score: number; rank: string } | null = null;

    return NextResponse.json({
      role: user.role,
      cards: [
        { key: "engineer_today", label: "Task hôm nay", value: taskCandidates.length, tone: "good" },
        {
          key: "engineer_delayed",
          label: "Task trễ của bạn",
          value: delayedTasks.length,
          tone: delayedTasks.length > 0 ? "danger" : "good",
        },
        { key: "engineer_next3", label: "Task 3 ngày tới", value: next3Tasks.length, tone: "warn" },
        { key: "engineer_projects", label: "Dự án tham gia", value: projectsCount, tone: "info" },
        {
          key: "engineer_report_today",
          label: "Báo cáo hôm nay",
          value: pendingReportCount,
          tone: pendingReportCount > 0 ? "warn" : "good",
        },
        {
          key: "engineer_kpi_month",
          label: "KPI tháng này",
          value: "-",
          tone: "info",
        },
      ],
      engineer: {
        todayTasks: [...groupedTasks.overdue, ...groupedTasks.running, ...groupedTasks.starting],
        taskGroups: groupedTasks,
        reportStatus,
        kpiMonth: null,
        upcomingMilestones,
      },
    });
  }

  if (user.role === UserRole.foreman) {
    const [weekTasks, milestoneSoon] = await Promise.all([
      prisma.task.findMany({
        where: {
          isActive: true,
          assignedForemanId: user.id,
          plannedStartDate: { gte: today, lte: in7Days },
        },
        include: { project: { select: { id: true, code: true, name: true } } },
        orderBy: { plannedStartDate: "asc" },
      }),
      prisma.task.findMany({
        where: {
          isActive: true,
          assignedForemanId: user.id,
          isMilestone: true,
          plannedStartDate: { gte: today, lte: in7Days },
        },
        include: { project: { select: { id: true, code: true, name: true } } },
        orderBy: { plannedStartDate: "asc" },
      }),
    ]);

    const materialsSet = new Set<string>();
    weekTasks.forEach((task) => {
      (task.materialsNeeded || "")
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean)
        .forEach((x) => materialsSet.add(x));
    });

    return NextResponse.json({
      role: user.role,
      cards: [
        { key: "foreman_week", label: "Task tuần này", value: weekTasks.length, tone: "info" },
        {
          key: "foreman_materials",
          label: "Vật tư cần chuẩn bị",
          value: materialsSet.size,
          tone: materialsSet.size > 0 ? "warn" : "good",
        },
      ],
      foreman: {
        weekTasks,
        upcomingMilestones: milestoneSoon,
        materialsCount: materialsSet.size,
      },
    });
  }

  if (user.role === UserRole.accountant) {
    const monthStart = startOfMonthUtc(today);
    const monthEnd = endOfMonthUtc(today);

    const [upcoming, late, collectedMonthAgg, expectedMonthAgg, approvedSubPayments] = await Promise.all([
      prisma.paymentSchedule.findMany({
        where: {
          status: PaymentStatus.not_collected,
          expectedDate: { gte: today, lte: in7Days },
        },
        include: { project: { select: { id: true, code: true, name: true } } },
        orderBy: { expectedDate: "asc" },
      }),
      prisma.paymentSchedule.findMany({
        where: {
          OR: [{ status: PaymentStatus.not_collected }, { status: PaymentStatus.customer_late }],
          expectedDate: { lt: today },
        },
        include: { project: { select: { id: true, code: true, name: true } } },
        orderBy: { expectedDate: "asc" },
      }),
      prisma.paymentSchedule.aggregate({
        _sum: { actualPaidAmount: true },
        where: {
          status: PaymentStatus.collected,
          actualPaidDate: { gte: monthStart, lte: monthEnd },
        },
      }),
      prisma.paymentSchedule.aggregate({
        _sum: { amount: true },
        where: {
          expectedDate: { gte: monthStart, lte: monthEnd },
        },
      }),
      prisma.subPayment.count({
        where: {
          status: "approved",
        },
      }),
    ]);

    const collectedMonth = Number(collectedMonthAgg._sum.actualPaidAmount || 0);
    const expectedMonth = Number(expectedMonthAgg._sum.amount || 0);

    return NextResponse.json({
      role: user.role,
      cards: [
        {
          key: "accountant_due7",
          label: "Đợt thu 7 ngày tới",
          value: upcoming.length,
          tone: upcoming.length ? "warn" : "good",
        },
        {
          key: "accountant_late",
          label: "Đợt thanh toán trễ",
          value: late.length,
          tone: late.length ? "danger" : "good",
        },
        {
          key: "accountant_collected_month",
          label: "Đã thu tháng này",
          value: Math.round(collectedMonth),
          tone: "good",
        },
        {
          key: "accountant_expected_month",
          label: "Dự kiến thu tháng này",
          value: Math.round(expectedMonth),
          tone: "info",
        },
        {
          key: "accountant_sub_approved_pending_payout",
          label: "Chi thầu phụ đã duyệt chờ payout",
          value: approvedSubPayments,
          tone: approvedSubPayments > 0 ? "warn" : "good",
        },
      ],
      accountant: {
        upcomingPayments: upcoming.map((payment) => ({ ...payment, amount: Number(payment.amount) })),
        latePayments: late.map((payment) => ({ ...payment, amount: Number(payment.amount) })),
      },
    });
  }

  return NextResponse.json({ message: "Role không hỗ trợ" }, { status: 400 });
}
