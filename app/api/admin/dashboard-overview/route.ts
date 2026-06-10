import { NextResponse } from "next/server";
import { PaymentStatus, TaskStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import {
  computeDesignContractStage,
  computeLeadStage,
  computeProjectStage,
  normalizePhone,
  type PipelineStage,
} from "@/lib/customer-pipeline";

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + DAY_MS);
  const in7 = new Date(today.getTime() + 7 * DAY_MS);

  // === Pipeline (giống logic /api/admin/customer-pipeline nhưng chỉ count) ===
  const [leads, designContracts, projects] = await Promise.all([
    prisma.baogiaLead.findMany({
      where: { status: { not: "spam" } },
      select: { id: true, name: true, phone: true, status: true, createdAt: true, updatedAt: true, contactedAt: true },
    }),
    prisma.designContract.findMany({ include: { steps: true } }),
    prisma.project.findMany({
      include: {
        paymentSchedules: { select: { status: true } },
      },
    }),
  ]);

  type Row = {
    customerKey: string;
    stage: PipelineStage;
    hot: boolean;
  };
  const groups = new Map<string, Row>();
  function upsert(key: string, stage: PipelineStage, hot: boolean) {
    const ex = groups.get(key);
    if (!ex || stage > ex.stage) {
      groups.set(key, { customerKey: key, stage, hot });
    } else if (stage === ex.stage && hot) {
      groups.set(key, { ...ex, hot: true });
    }
  }
  for (const l of leads) {
    const key = normalizePhone(l.phone);
    if (!key) continue;
    const meta = computeLeadStage(l as any, now);
    upsert(key, meta.stage as PipelineStage, !!meta.hotFlag);
  }
  for (const c of designContracts) {
    const key = normalizePhone(c.customerPhone);
    if (!key) continue;
    const meta = computeDesignContractStage(c, now);
    upsert(key, meta.stage, !!meta.hotFlag);
  }
  for (const p of projects) {
    const key = normalizePhone(p.customerPhone);
    if (!key) continue;
    const meta = computeProjectStage(p as any, now);
    upsert(key, meta.stage, !!meta.hotFlag);
  }
  const pipelineCounts: Record<PipelineStage, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };
  const pipelineHot: Record<PipelineStage, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };
  groups.forEach((r) => {
    pipelineCounts[r.stage] = (pipelineCounts[r.stage] || 0) + 1;
    if (r.hot) pipelineHot[r.stage] = (pipelineHot[r.stage] || 0) + 1;
  });

  // === Construction (báo cáo hôm nay, task trễ) ===
  const activeProjects = await prisma.project.findMany({
    where: { status: { in: ["planning", "in_progress"] }, goLiveDate: { not: null, lte: today } },
    select: { id: true, mainEngineerId: true },
  });
  const activeIds = activeProjects.map((p) => p.id);
  const [siteRest, technicalToday, progressToday] = activeIds.length
    ? await Promise.all([
        prisma.siteRestDay.findMany({
          where: { projectId: { in: activeIds }, restDate: today },
          select: { projectId: true },
        }),
        prisma.taskTechnicalReport.findMany({
          where: { reportDate: today, task: { projectId: { in: activeIds } } },
          select: { createdBy: true, task: { select: { projectId: true } } },
        }),
        prisma.taskProgressHistory.findMany({
          where: {
            createdAt: { gte: today, lt: tomorrow },
            task: { projectId: { in: activeIds } },
          },
          select: { userId: true, task: { select: { projectId: true } } },
        }),
      ])
    : [[], [], []];
  const restSet = new Set(siteRest.map((r) => r.projectId));
  const activeReportable = activeProjects.filter((p) => !restSet.has(p.id));
  const techSet = new Set(technicalToday.map((r) => `${r.task.projectId}_${r.createdBy}`));
  const progSet = new Set(progressToday.map((r) => `${r.task.projectId}_${r.userId}`));
  const eveningSet = new Set<string>();
  techSet.forEach((v) => eveningSet.add(v));
  progSet.forEach((v) => eveningSet.add(v));
  const missingMorning = activeReportable.filter((p) => !techSet.has(`${p.id}_${p.mainEngineerId}`)).length;
  const missingEvening = activeReportable.filter((p) => !eveningSet.has(`${p.id}_${p.mainEngineerId}`)).length;

  const tasksDelayed = await prisma.task.count({
    where: {
      isActive: true,
      status: { notIn: [TaskStatus.done, TaskStatus.inspected] },
      plannedEndDate: { lt: today },
    },
  });

  // === Finance ===
  const [paymentsDue7, paymentsOverdue, materialPending, subPaymentsPending] = await Promise.all([
    prisma.paymentSchedule.aggregate({
      where: {
        status: PaymentStatus.not_collected,
        expectedDate: { gte: today, lte: in7 },
      },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.paymentSchedule.count({
      where: {
        status: { in: [PaymentStatus.not_collected, PaymentStatus.request_sent, PaymentStatus.customer_late] },
        expectedDate: { lt: today },
      },
    }),
    prisma.materialProposal.count({ where: { status: "pending" } }),
    prisma.subPayment.count({ where: { status: { in: ["pending", "requested"] } } }),
  ]);

  // === Customers detail ===
  const leadsNotContacted = leads.filter((l) => l.status === "new" && (now.getTime() - new Date(l.createdAt).getTime()) > DAY_MS).length;
  const designStuck = designContracts.filter((c) => {
    if (c.status !== "active") return false;
    const last = c.updatedAt;
    return (now.getTime() - new Date(last).getTime()) > 7 * DAY_MS;
  }).length;
  const handoverPending = pipelineCounts[6];

  // === KPI top/bottom (tháng hiện tại) ===
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const kpiRows = await prisma.engineerKpiMonthly.findMany({
    where: { year, month },
    include: { user: { select: { id: true, fullName: true } } },
    orderBy: { totalScore: "desc" },
  });
  const topKpi = kpiRows.slice(0, 3).map((r) => ({
    userId: r.user.id,
    name: r.user.fullName,
    score: Number(r.totalScore ?? 0),
  }));
  const bottomKpi = kpiRows.slice(-3).reverse().map((r) => ({
    userId: r.user.id,
    name: r.user.fullName,
    score: Number(r.totalScore ?? 0),
  }));

  // === Subcontractor ===
  const [subContractsAwaitingEval, subContractsNew] = await Promise.all([
    prisma.subContract.count({
      where: { status: { in: ["active", "completed"] }, evaluations: { none: {} } },
    }),
    prisma.subContract.count({ where: { status: "draft" } }),
  ]);

  // === Aggregate result ===
  const alertBar = {
    leadsNotContacted,
    tasksDelayed,
    paymentsOverdue,
    missingEvening,
  };

  const sections = {
    customers: {
      leadsNew: pipelineCounts[1],
      designStuck,
      handoverPending,
    },
    construction: {
      missingMorning,
      missingEvening,
      tasksDelayed,
    },
    finance: {
      dueIn7DaysCount: paymentsDue7._count._all,
      dueIn7DaysSum: paymentsDue7._sum.amount ? Number(paymentsDue7._sum.amount) : 0,
      paymentsOverdue,
      materialPending,
      subPaymentsPending,
    },
  };

  const smallCards = {
    kpi: { top: topKpi, bottom: bottomKpi },
    subcontractor: { contractsAwaitingEval: subContractsAwaitingEval, contractsNew: subContractsNew },
  };

  return NextResponse.json({
    alertBar,
    pipeline: { counts: pipelineCounts, hot: pipelineHot },
    sections,
    smallCards,
    generatedAt: now.toISOString(),
  });
}
