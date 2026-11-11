import { NextResponse } from "next/server";
import { ProjectStatus, SubPaymentStatus, PaymentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeSchedule, setWorkPlanDates, syncTienDoDates } from "@/lib/tien-do-thuc-te";

export const runtime = "nodejs";

/**
 * Cổng nội bộ Văn phòng AI — tiến độ thực tế (sếp 11/11/2026). Header x-cron-key (PUSH_CRON_KEY).
 *   GET              → dự án đang thi công: chậm/nhanh N ngày, % thực tế vs kế hoạch, ngày bàn giao dự báo,
 *                      công tác trễ / xong 7 ngày qua / sắp tới 7 ngày, đợt chi/thu gắn tiến độ (bin/tien-do-tuan).
 *   GET ?code=DA-…   → thêm chi tiết từng công tác (ngày KH / dự báo / xong) cho Kỹ sư Dự toán (bin/ngay-cong-tac).
 *   POST {projectId?} → tính lại ngày đợt chi/thu + dự báo dòng tiền theo tiến độ (1 hoặc mọi dự án thi công).
 *   POST {op:"ngay", projectId, works:[{id, planStart, planEnd}]} → Kỹ sư Dự toán đặt ngày riêng công tác.
 */
function ok(req: Request) {
  const key = req.headers.get("x-cron-key");
  return !!key && !!process.env.PUSH_CRON_KEY && key === process.env.PUSH_CRON_KEY;
}

const add = (s: string, k: number) => new Date(Date.parse(`${s}T00:00:00Z`) + k * 86_400_000).toISOString().slice(0, 10);
const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

async function thiCongProjects() {
  const ps = await prisma.project.findMany({
    where: { status: { not: ProjectStatus.completed }, estimateWorks: { some: {} } },
    select: { id: true, code: true, name: true, status: true, pipeline: { select: { stage: true } } },
    orderBy: { code: "asc" },
  });
  // Giống dòng tiền: chưa sang GĐ6 Thi công → bỏ.
  return ps.filter((p) => (p.pipeline ? p.pipeline.stage >= 6 : p.status !== ProjectStatus.planning));
}

export async function GET(req: Request) {
  if (!ok(req)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const code = new URL(req.url).searchParams.get("code");
  try {
    if (code) {
      const p = await prisma.project.findFirst({ where: { code }, select: { id: true, code: true, name: true } });
      if (!p) return NextResponse.json({ message: "Không thấy dự án" }, { status: 404 });
      const s = await computeSchedule(p.id);
      return NextResponse.json({ project: p, ...s });
    }
    const projects = await thiCongProjects();
    const out = [];
    for (const p of projects) {
      const s = await computeSchedule(p.id);
      const t = s.today;
      const secName = new Map(s.sections.map((x) => [x.id, x.name]));
      const w = (x: (typeof s.works)[number]) => ({
        id: x.id,
        name: x.name,
        section: x.sectionId ? secName.get(x.sectionId) ?? null : null,
        own: x.own,
        planStart: x.planStart,
        planEnd: x.planEnd,
        fEnd: x.fEnd,
        doneAt: x.doneAt,
      });
      const [subs, thu] = await Promise.all([
        prisma.subPayment.findMany({
          where: {
            subContract: { projectId: p.id },
            workIds: { isEmpty: false },
            status: { in: [SubPaymentStatus.pending, SubPaymentStatus.requested, SubPaymentStatus.approved] },
          },
          orderBy: { expectedDate: "asc" },
          select: { id: true, stage: true, description: true, expectedAmount: true, actualAmount: true, expectedDate: true, subContract: { select: { subcontractor: { select: { name: true } } } } },
        }),
        prisma.paymentSchedule.findMany({
          where: { projectId: p.id, workIds: { isEmpty: false }, status: { notIn: [PaymentStatus.collected, PaymentStatus.paid] } },
          orderBy: { expectedDate: "asc" },
          select: { id: true, phaseNumber: true, milestoneDescription: true, amount: true, expectedDate: true, dueDate: true },
        }),
      ]);
      out.push({
        id: p.id,
        code: p.code,
        name: p.name,
        today: t,
        hasPlan: s.hasPlan,
        slip: s.slip,
        actualPct: s.actualPct,
        plannedPct: s.plannedPct,
        planFinish: s.planFinish,
        forecastFinish: s.forecastFinish,
        works: s.works.length,
        ownDates: s.works.filter((x) => x.own).length,
        done: s.works.filter((x) => x.done).length,
        overdue: s.works.filter((x) => !x.done && x.planEnd && x.planEnd < t).map(w),
        doneLastWeek: s.works.filter((x) => x.doneAt && x.doneAt >= add(t, -7)).map(w),
        nextWeek: s.works.filter((x) => !x.done && x.fStart && x.fStart <= add(t, 7)).map(w),
        subPayments: subs.map((x) => ({
          id: x.id,
          label: `${x.subContract.subcontractor.name} · Đợt ${x.stage} · ${x.description}`,
          amount: Math.max(0, Number(x.expectedAmount) - Number(x.actualAmount ?? 0)),
          date: iso(x.expectedDate),
        })),
        receipts: thu.map((x) => ({
          id: x.id,
          label: `Thu HĐ · Đợt ${x.phaseNumber} · ${x.milestoneDescription}`,
          amount: Number(x.amount),
          date: iso(x.expectedDate ?? x.dueDate),
        })),
      });
    }
    return NextResponse.json({ projects: out });
  } catch (err) {
    console.error("[cron tien-do GET]", err);
    return NextResponse.json({ message: err instanceof Error ? err.message : "lỗi" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!ok(req)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as {
    op?: string;
    projectId?: string;
    works?: { id?: string; planStart?: unknown; planEnd?: unknown }[];
  };
  try {
    if (b.op === "ngay") {
      if (!b.projectId) return NextResponse.json({ message: "Thiếu projectId" }, { status: 400 });
      const loi = await setWorkPlanDates(b.projectId, Array.isArray(b.works) ? b.works : []);
      if (loi) return NextResponse.json({ message: loi }, { status: 400 });
      return NextResponse.json({ ok: true });
    }
    const ids = b.projectId ? [b.projectId] : (await thiCongProjects()).map((p) => p.id);
    const res = [];
    for (const id of ids) {
      const s = await syncTienDoDates(id);
      res.push({ projectId: id, slip: s.slip, forecastFinish: s.forecastFinish });
    }
    return NextResponse.json({ ok: true, projects: res });
  } catch (err) {
    console.error("[cron tien-do POST]", err);
    return NextResponse.json({ message: err instanceof Error ? err.message : "lỗi" }, { status: 500 });
  }
}
