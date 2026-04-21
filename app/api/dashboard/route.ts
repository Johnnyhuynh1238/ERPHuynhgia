import { NextResponse } from "next/server";
import { PaymentStatus, TaskStatus, UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

function startOfTodayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
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
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59));
}

export const revalidate = 60;

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  const today = startOfTodayUtc();
  const in7Days = addDays(today, 7);
  const in3Days = addDays(today, 3);

  if (user.role === UserRole.admin) {
    const [projectInProgress, totalDelayed, inProgressToday, paymentDue7, delayedTasks, recentProjects] = await Promise.all([
      prisma.project.count({ where: { status: "in_progress" } }),
      prisma.task.count({
        where: {
          status: { notIn: [TaskStatus.done, TaskStatus.inspected] },
          plannedEndDate: { lt: today },
        },
      }),
      prisma.task.count({ where: { status: TaskStatus.in_progress } }),
      prisma.paymentSchedule.count({
        where: {
          status: PaymentStatus.not_collected,
          expectedDate: { gte: today, lte: in7Days },
        },
      }),
      prisma.task.findMany({
        where: {
          status: { notIn: [TaskStatus.done, TaskStatus.inspected] },
          plannedEndDate: { lt: today },
        },
        include: {
          project: { select: { id: true, code: true, name: true } },
          assignedEngineer: { select: { id: true, fullName: true } },
        },
        orderBy: { plannedEndDate: "desc" },
        take: 10,
      }),
      prisma.project.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, code: true, name: true, createdAt: true },
      }),
    ]);

    return NextResponse.json({
      role: user.role,
      cards: [
        { key: "admin_projects", label: "Dự án đang thi công", value: projectInProgress, tone: "good" },
        { key: "admin_delayed", label: "Task trễ toàn hệ thống", value: totalDelayed, tone: totalDelayed > 0 ? "danger" : "good" },
        { key: "admin_in_progress", label: "Task đang làm", value: inProgressToday, tone: "info" },
        { key: "admin_payment_due", label: "Đợt thanh toán 7 ngày tới", value: paymentDue7, tone: paymentDue7 > 0 ? "warn" : "info" },
      ],
      admin: {
        delayedTasks,
        recentProjects,
      },
    });
  }

  if (user.role === UserRole.engineer) {
    const [todayTasks, delayedTasks, next3Tasks, projectsCount, upcomingMilestones] = await Promise.all([
      prisma.task.findMany({
        where: {
          assignedEngineerId: user.id,
          plannedStartDate: { lte: today },
          plannedEndDate: { gte: today },
        },
        include: { project: { select: { id: true, code: true, name: true } } },
        orderBy: { plannedEndDate: "asc" },
      }),
      prisma.task.findMany({
        where: {
          assignedEngineerId: user.id,
          plannedEndDate: { lt: today },
          status: { notIn: [TaskStatus.done, TaskStatus.inspected] },
        },
        include: { project: { select: { id: true, code: true, name: true } } },
      }),
      prisma.task.findMany({
        where: {
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
          assignedEngineerId: user.id,
          isMilestone: true,
          plannedStartDate: { gte: today, lte: in7Days },
        },
        include: { project: { select: { id: true, code: true, name: true } } },
        orderBy: { plannedStartDate: "asc" },
        take: 3,
      }),
    ]);

    return NextResponse.json({
      role: user.role,
      cards: [
        { key: "engineer_today", label: "Task hôm nay", value: todayTasks.length, tone: "good" },
        { key: "engineer_delayed", label: "Task trễ của bạn", value: delayedTasks.length, tone: delayedTasks.length > 0 ? "danger" : "good" },
        { key: "engineer_next3", label: "Task 3 ngày tới", value: next3Tasks.length, tone: "warn" },
        { key: "engineer_projects", label: "Dự án tham gia", value: projectsCount, tone: "info" },
      ],
      engineer: {
        todayTasks,
        upcomingMilestones,
      },
    });
  }

  if (user.role === UserRole.foreman) {
    const [weekTasks, milestoneSoon] = await Promise.all([
      prisma.task.findMany({
        where: {
          assignedForemanId: user.id,
          plannedStartDate: { gte: today, lte: in7Days },
        },
        include: { project: { select: { id: true, code: true, name: true } } },
        orderBy: { plannedStartDate: "asc" },
      }),
      prisma.task.findMany({
        where: {
          assignedForemanId: user.id,
          isMilestone: true,
          plannedStartDate: { gte: today, lte: in7Days },
        },
        include: { project: { select: { id: true, code: true, name: true } } },
        orderBy: { plannedStartDate: "asc" },
      }),
    ]);

    const materialsSet = new Set<string>();
    weekTasks.forEach((t) => {
      (t.materialsNeeded || "")
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean)
        .forEach((x) => materialsSet.add(x));
    });

    return NextResponse.json({
      role: user.role,
      cards: [
        { key: "foreman_week", label: "Task tuần này", value: weekTasks.length, tone: "info" },
        { key: "foreman_materials", label: "Vật tư cần chuẩn bị", value: materialsSet.size, tone: materialsSet.size > 0 ? "warn" : "good" },
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

    const [upcoming, late, collectedMonthAgg, expectedMonthAgg] = await Promise.all([
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
    ]);

    const collectedMonth = Number(collectedMonthAgg._sum.actualPaidAmount || 0);
    const expectedMonth = Number(expectedMonthAgg._sum.amount || 0);

    return NextResponse.json({
      role: user.role,
      cards: [
        { key: "accountant_due7", label: "Đợt thu 7 ngày tới", value: upcoming.length, tone: upcoming.length ? "warn" : "good" },
        { key: "accountant_late", label: "Đợt thanh toán trễ", value: late.length, tone: late.length ? "danger" : "good" },
        { key: "accountant_collected_month", label: "Đã thu tháng này", value: Math.round(collectedMonth), tone: "good" },
        { key: "accountant_expected_month", label: "Dự kiến thu tháng này", value: Math.round(expectedMonth), tone: "info" },
      ],
      accountant: {
        upcomingPayments: upcoming.map((p) => ({ ...p, amount: Number(p.amount) })),
        latePayments: late.map((p) => ({ ...p, amount: Number(p.amount) })),
      },
    });
  }

  return NextResponse.json({ message: "Role không hỗ trợ" }, { status: 400 });
}
