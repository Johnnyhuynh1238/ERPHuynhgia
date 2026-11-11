import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { queueTienDoSync } from "@/lib/tien-do-thuc-te";
import {
  loadGmWorks,
  milestoneReadiness,
  paymentReadiness,
  suggestMilestoneWorks,
  suggestPayment,
} from "@/lib/gan-moc";

export const dynamic = "force-dynamic";

// Gán mốc (GĐ5): công tác tiến độ → mốc nghiệm thu + đợt thu. Chỉ admin (Phòng Dự án soạn, sếp duyệt).
async function requireAdmin(projectId: string) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return { user: null, error: NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 }) };
  if (user.role !== "admin") return { user: null, error: NextResponse.json({ message: "Không có quyền" }, { status: 403 }) };
  const p = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!p) return { user: null, error: NextResponse.json({ message: "Không thấy dự án" }, { status: 404 }) };
  return { user, error: null };
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAdmin(params.id);
  if (error) return error;

  const [worksByProject, ms, ps, sp] = await Promise.all([
    loadGmWorks([params.id]),
    prisma.acceptanceMilestone.findMany({
      where: { projectId: params.id },
      orderBy: [{ kind: "asc" }, { seq: "asc" }],
      select: { id: true, kind: true, seq: true, title: true, description: true, status: true, signedAt: true, workIds: true },
    }),
    prisma.paymentSchedule.findMany({
      where: { projectId: params.id },
      orderBy: [{ type: "asc" }, { installmentNo: "asc" }, { phaseNumber: "asc" }],
      select: {
        id: true,
        phaseNumber: true,
        milestoneDescription: true,
        amount: true,
        expectedDate: true,
        dueDate: true,
        status: true,
        workIds: true,
        milestoneIds: true,
        workPctRequired: true,
      },
    }),
    prisma.subPayment.findMany({
      where: { subContract: { projectId: params.id }, status: { not: "cancelled" } },
      orderBy: [{ subContract: { createdAt: "asc" } }, { stage: "asc" }],
      select: {
        id: true,
        stage: true,
        description: true,
        expectedAmount: true,
        expectedDate: true,
        status: true,
        workIds: true,
        subContract: { select: { title: true, subcontractor: { select: { name: true } } } },
      },
    }),
  ]);
  const works = worksByProject.get(params.id) ?? [];
  const worksById = new Map(works.map((w) => [w.id, w]));
  const msById = new Map(ms.map((m) => [m.id, m]));
  const chuNha = ms.filter((m) => m.kind === "chu_nha");

  return NextResponse.json({
    works,
    milestones: ms.map((m) => ({
      id: m.id,
      kind: m.kind,
      seq: m.seq,
      title: m.title,
      group: (m.description ?? "").split("|")[0].trim(),
      status: m.status,
      workIds: m.workIds,
      readiness: milestoneReadiness(m, worksById),
      suggest: suggestMilestoneWorks(m, works),
    })),
    payments: ps.map((p) => ({
      id: p.id,
      phaseNumber: p.phaseNumber,
      milestoneDescription: p.milestoneDescription,
      amount: Number(p.amount),
      date: (p.dueDate ?? p.expectedDate)?.toISOString().slice(0, 10) ?? null,
      status: p.status,
      workIds: p.workIds,
      milestoneIds: p.milestoneIds,
      workPctRequired: p.workPctRequired,
      readiness: paymentReadiness(p, worksById, msById),
      suggest: suggestPayment(p, works, chuNha),
    })),
    // Đợt khoán NC (thầu phụ): gắn công tác → ngày chi = ngày công tác xong trễ nhất theo tiến độ thực tế.
    subPayments: sp.map((p) => ({
      id: p.id,
      stage: p.stage,
      description: p.description,
      contract: p.subContract.subcontractor?.name ?? p.subContract.title,
      amount: Number(p.expectedAmount),
      date: p.expectedDate.toISOString().slice(0, 10),
      status: p.status,
      workIds: p.workIds,
    })),
  });
}

const putSchema = z.object({
  target: z.enum(["milestone", "payment", "sub_payment"]),
  id: z.string().uuid(),
  workIds: z.array(z.string().uuid()).max(500),
  milestoneIds: z.array(z.string().uuid()).max(100).optional(),
  workPctRequired: z.number().int().min(1).max(100).optional(),
});

// PUT: lưu gán của 1 mốc / 1 đợt thu (ghi đè danh sách).
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAdmin(params.id);
  if (error) return error;
  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  const b = parsed.data;

  // Công tác + mốc phải thuộc dự án.
  const workIds = Array.from(new Set(b.workIds));
  const okWorks = await prisma.estimateWork.count({ where: { projectId: params.id, id: { in: workIds } } });
  if (okWorks !== workIds.length) return NextResponse.json({ message: "Có công tác không thuộc dự án" }, { status: 400 });

  if (b.target === "sub_payment") {
    const r = await prisma.subPayment.updateMany({
      where: { id: b.id, subContract: { projectId: params.id } },
      data: { workIds },
    });
    if (!r.count) return NextResponse.json({ message: "Không thấy đợt khoán" }, { status: 404 });
    queueTienDoSync(params.id);
    return NextResponse.json({ ok: true });
  }

  if (b.target === "milestone") {
    const r = await prisma.acceptanceMilestone.updateMany({
      where: { id: b.id, projectId: params.id },
      data: { workIds },
    });
    if (!r.count) return NextResponse.json({ message: "Không thấy mốc" }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  const milestoneIds = Array.from(new Set(b.milestoneIds ?? []));
  const okMs = await prisma.acceptanceMilestone.count({
    where: { projectId: params.id, kind: "chu_nha", id: { in: milestoneIds } },
  });
  if (okMs !== milestoneIds.length) return NextResponse.json({ message: "Mốc NT chủ nhà không hợp lệ" }, { status: 400 });
  const r = await prisma.paymentSchedule.updateMany({
    where: { id: b.id, projectId: params.id },
    data: { workIds, milestoneIds, workPctRequired: b.workPctRequired ?? 100 },
  });
  if (!r.count) return NextResponse.json({ message: "Không thấy đợt thu" }, { status: 404 });
  queueTienDoSync(params.id);
  return NextResponse.json({ ok: true });
}
