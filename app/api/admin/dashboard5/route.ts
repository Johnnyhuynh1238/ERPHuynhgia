import { NextResponse } from "next/server";
import { PaymentStatus } from "@prisma/client";
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
const MAX_ROWS_PER_CARD = 5;

type CardRow = {
  id: string;
  level: "red" | "yellow";
  title: string;
  subtitle?: string;
  href?: string;
  amount?: number;
  daysOverdue?: number;
  dueLabel?: string;
};

function daysDiff(a: Date, b: Date) {
  return Math.floor((a.getTime() - b.getTime()) / DAY_MS);
}

function formatVnDate(d: Date) {
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + DAY_MS);
  const yesterday = new Date(today.getTime() - DAY_MS);
  const in3 = new Date(today.getTime() + 3 * DAY_MS);
  const in7 = new Date(today.getTime() + 7 * DAY_MS);

  // ===== Pipeline rows + meta =====
  const [leads, designContracts, projects, metas] = await Promise.all([
    prisma.baogiaLead.findMany({
      where: { status: { not: "spam" } },
      select: { id: true, name: true, phone: true, status: true, createdAt: true, updatedAt: true, contactedAt: true },
    }),
    prisma.designContract.findMany({ include: { steps: true } }),
    prisma.project.findMany({
      include: { paymentSchedules: { select: { status: true } } },
    }),
    prisma.customerPipelineMeta.findMany(),
  ]);

  type Row = {
    customerKey: string;
    customerName: string;
    customerPhone: string;
    stage: PipelineStage;
    leadId: string | null;
    designContractId: string | null;
    projectId: string | null;
  };
  const groups = new Map<string, Row>();
  function upsert(
    key: string,
    name: string,
    phone: string,
    stage: PipelineStage,
    leadId: string | null,
    designContractId: string | null,
    projectId: string | null,
  ) {
    const ex = groups.get(key);
    if (!ex || stage > ex.stage) {
      groups.set(key, { customerKey: key, customerName: name, customerPhone: phone, stage, leadId, designContractId, projectId });
    } else {
      if (leadId && !ex.leadId) ex.leadId = leadId;
      if (designContractId && !ex.designContractId) ex.designContractId = designContractId;
      if (projectId && !ex.projectId) ex.projectId = projectId;
    }
  }
  for (const l of leads) {
    const key = normalizePhone(l.phone);
    if (!key) continue;
    const meta = computeLeadStage(l as any, now);
    upsert(key, l.name, l.phone, meta.stage as PipelineStage, l.id, null, null);
  }
  for (const c of designContracts) {
    const key = normalizePhone(c.customerPhone);
    if (!key) continue;
    const meta = computeDesignContractStage(c, now);
    upsert(key, c.customerName, c.customerPhone, meta.stage, null, c.id, null);
  }
  for (const p of projects) {
    const key = normalizePhone(p.customerPhone);
    if (!key) continue;
    const meta = computeProjectStage(p as any, now);
    upsert(key, p.customerName, p.customerPhone, meta.stage, null, null, p.id);
  }

  const metaByKey = new Map(metas.map((m) => [m.customerKey, m] as const));

  // ===== Card 1: Sale =====
  // Active = stage 1..3 (lead → liên hệ → thiết kế)
  const saleRows: CardRow[] = [];
  const designStageCount = Array.from(groups.values()).filter((r) => r.stage === 3).length;
  for (const r of Array.from(groups.values())) {
    if (r.stage > 3) continue;
    const m = metaByKey.get(r.customerKey);
    const due = m?.nextActionDue ?? null;
    const action = m?.nextAction ?? null;
    const last = m?.lastContactAt ?? null;
    if (due && action) {
      if (due < today) {
        const d = daysDiff(today, due);
        saleRows.push({
          id: `sale-od-${r.customerKey}`,
          level: "red",
          title: `${r.customerName} — ${action}`,
          subtitle: `Quá hạn ${d} ngày`,
          href: `/customer-pipeline?q=${encodeURIComponent(r.customerPhone)}`,
          daysOverdue: d,
        });
        continue;
      }
      if (due <= in3) {
        saleRows.push({
          id: `sale-soon-${r.customerKey}`,
          level: "yellow",
          title: `${r.customerName} — ${action}`,
          subtitle: `Hạn ${formatVnDate(due)}`,
          href: `/customer-pipeline?q=${encodeURIComponent(r.customerPhone)}`,
          dueLabel: formatVnDate(due),
        });
        continue;
      }
    }
    if (!due && last && now.getTime() - last.getTime() > 14 * DAY_MS) {
      saleRows.push({
        id: `sale-silent-${r.customerKey}`,
        level: "yellow",
        title: `${r.customerName}`,
        subtitle: `Im lặng ${Math.floor((now.getTime() - last.getTime()) / DAY_MS)} ngày — cần follow-up`,
        href: `/customer-pipeline?q=${encodeURIComponent(r.customerPhone)}`,
      });
    }
  }
  saleRows.sort((a, b) => {
    if (a.level !== b.level) return a.level === "red" ? -1 : 1;
    return (b.daysOverdue ?? 0) - (a.daysOverdue ?? 0);
  });

  // ===== Card 2: Tiền =====
  const overdueSchedules = await prisma.paymentSchedule.findMany({
    where: {
      status: { in: [PaymentStatus.not_collected, PaymentStatus.request_sent, PaymentStatus.customer_late, PaymentStatus.pending] },
      expectedDate: { lt: today },
    },
    include: { project: { select: { id: true, customerName: true, code: true } } },
    orderBy: { expectedDate: "asc" },
  });
  const soonSchedules = await prisma.paymentSchedule.findMany({
    where: {
      status: { in: [PaymentStatus.not_collected, PaymentStatus.request_sent, PaymentStatus.pending] },
      expectedDate: { gte: today, lte: in7 },
    },
    include: { project: { select: { id: true, customerName: true, code: true } } },
    orderBy: { expectedDate: "asc" },
  });
  const moneyRows: CardRow[] = [];
  for (const s of overdueSchedules) {
    const d = daysDiff(today, new Date(s.expectedDate!));
    moneyRows.push({
      id: `pay-od-${s.id}`,
      level: "red",
      title: `${s.project.customerName} — ${s.milestoneDescription}`,
      subtitle: `Quá hạn ${d} ngày`,
      href: `/projects/${s.project.id}/payments`,
      amount: Number(s.amount),
      daysOverdue: d,
    });
  }
  for (const s of soonSchedules) {
    moneyRows.push({
      id: `pay-soon-${s.id}`,
      level: "yellow",
      title: `${s.project.customerName} — ${s.milestoneDescription}`,
      subtitle: `Hạn ${formatVnDate(new Date(s.expectedDate!))}`,
      href: `/projects/${s.project.id}/payments`,
      amount: Number(s.amount),
    });
  }

  // ===== Card 3: Thi công =====
  const activeProjects = await prisma.project.findMany({
    where: { status: { in: ["planning", "in_progress"] }, goLiveDate: { not: null, lte: today } },
    select: { id: true, code: true, customerName: true, mainEngineerId: true },
  });
  const activeIds = activeProjects.map((p) => p.id);
  let constructionRows: CardRow[] = [];
  if (activeIds.length) {
    const [restYesterday, eveningYesterday, qcPendingLogs] = await Promise.all([
      prisma.siteRestDay.findMany({
        where: { projectId: { in: activeIds }, restDate: yesterday },
        select: { projectId: true },
      }),
      prisma.eveningReport.findMany({
        where: { projectId: { in: activeIds }, reportDate: yesterday },
        select: { projectId: true },
      }),
      prisma.taskQcLog.findMany({
        where: { task: { projectId: { in: activeIds } } },
        select: {
          id: true,
          checkedAt: true,
          task: { select: { id: true, projectId: true, project: { select: { id: true, customerName: true, code: true } } } },
          qcItem: { select: { id: true, content: true } },
        },
        orderBy: { checkedAt: "desc" },
        take: 200,
      }),
    ]);
    const restSet = new Set(restYesterday.map((r) => r.projectId));
    const reportedSet = new Set(eveningYesterday.map((r) => r.projectId));
    for (const p of activeProjects) {
      if (restSet.has(p.id)) continue;
      if (reportedSet.has(p.id)) continue;
      constructionRows.push({
        id: `report-${p.id}`,
        level: "red",
        title: `${p.customerName} — chưa có báo cáo tối ${formatVnDate(yesterday)}`,
        subtitle: p.code ?? undefined,
        href: `/projects/${p.id}/construction-log`,
      });
    }
    // QC chờ duyệt: TaskQcLog không có QcReview sau khi tick
    const taskIds = Array.from(new Set(qcPendingLogs.map((l) => l.task.id)));
    const reviews = taskIds.length
      ? await prisma.qcReview.findMany({
          where: { taskId: { in: taskIds } },
          select: { taskId: true, reviewedAt: true },
        })
      : [];
    const lastReviewByTask = new Map<string, Date>();
    for (const r of reviews) {
      const prev = lastReviewByTask.get(r.taskId);
      if (!prev || r.reviewedAt > prev) lastReviewByTask.set(r.taskId, r.reviewedAt);
    }
    const seenQc = new Set<string>();
    for (const l of qcPendingLogs) {
      const lastRev = lastReviewByTask.get(l.task.id);
      if (lastRev && lastRev > l.checkedAt) continue; // đã duyệt sau khi tick
      const key = `${l.task.id}_${l.qcItem.id}`;
      if (seenQc.has(key)) continue;
      seenQc.add(key);
      const ageH = (now.getTime() - l.checkedAt.getTime()) / 3_600_000;
      constructionRows.push({
        id: `qc-${l.id}`,
        level: ageH >= 24 ? "red" : "yellow",
        title: `${l.task.project.customerName} — ${l.qcItem.content}`,
        subtitle: ageH >= 24 ? `Chờ duyệt ${Math.floor(ageH / 24)} ngày` : `Chờ duyệt ${Math.floor(ageH)} giờ`,
        href: `/tasks/${l.task.id}`,
      });
    }
  }
  constructionRows.sort((a, b) => (a.level !== b.level ? (a.level === "red" ? -1 : 1) : 0));

  // ===== Card 4: Thiết kế & Dự toán =====
  // Stage 3 (HĐ thiết kế) + stage 4 (CB TC). Reuse meta.nextAction
  const designRows: CardRow[] = [];
  for (const r of Array.from(groups.values())) {
    if (r.stage !== 3 && r.stage !== 4) continue;
    const m = metaByKey.get(r.customerKey);
    if (!m?.nextAction || !m.nextActionDue) continue;
    const due = m.nextActionDue;
    if (due < today) {
      const d = daysDiff(today, due);
      designRows.push({
        id: `design-od-${r.customerKey}`,
        level: "red",
        title: `${r.customerName} — ${m.nextAction}`,
        subtitle: `Quá hạn ${d} ngày`,
        href: `/customer-pipeline?q=${encodeURIComponent(r.customerPhone)}`,
        daysOverdue: d,
      });
    } else if (due <= in3) {
      designRows.push({
        id: `design-soon-${r.customerKey}`,
        level: "yellow",
        title: `${r.customerName} — ${m.nextAction}`,
        subtitle: `Hạn ${formatVnDate(due)}`,
        href: `/customer-pipeline?q=${encodeURIComponent(r.customerPhone)}`,
      });
    }
  }
  designRows.sort((a, b) => (a.level !== b.level ? (a.level === "red" ? -1 : 1) : (b.daysOverdue ?? 0) - (a.daysOverdue ?? 0)));

  // ===== Card 5: Inbox =====
  const inboxItems = await prisma.inboxItem.findMany({
    where: { status: "open" },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const inboxRows = inboxItems.map((it) => ({
    id: it.id,
    content: it.content,
    source: it.source,
    createdAt: it.createdAt.toISOString(),
  }));

  function trim(rows: CardRow[]): { rows: CardRow[]; more: number } {
    if (rows.length <= MAX_ROWS_PER_CARD) return { rows, more: 0 };
    return { rows: rows.slice(0, MAX_ROWS_PER_CARD), more: rows.length - MAX_ROWS_PER_CARD };
  }
  const sale = trim(saleRows);
  const money = trim(moneyRows);
  const construction = trim(constructionRows);
  const design = trim(designRows);

  return NextResponse.json({
    generatedAt: now.toISOString(),
    cards: {
      sale: {
        designStageCount,
        thin: designStageCount < 2,
        rows: sale.rows,
        more: sale.more,
      },
      money: {
        rows: money.rows,
        more: money.more,
      },
      construction: {
        rows: construction.rows,
        more: construction.more,
      },
      design: {
        rows: design.rows,
        more: design.more,
      },
      inbox: {
        rows: inboxRows,
      },
    },
  });
}
