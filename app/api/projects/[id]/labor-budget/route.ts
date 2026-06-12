import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import {
  canEditLaborBudget,
  canViewLaborBudget,
  computeItemAmount,
  isValidPhase,
} from "@/lib/labor-budget";

const itemSchema = z.object({
  phase: z.enum(["mong", "than", "mai"]),
  workItem: z.string().trim().min(1, "Đầu việc là bắt buộc").max(200),
  unit: z.string().trim().min(1, "Đơn vị là bắt buộc").max(20),
  quantity: z.number().positive("Khối lượng phải > 0"),
  unitPrice: z.number().int().nonnegative("Đơn giá phải >= 0"),
  note: z.string().trim().max(500).optional().nullable(),
});

const putSchema = z.object({
  note: z.string().trim().max(500).optional().nullable(),
  items: z.array(itemSchema),
});

type RouteCtx = { params: { id: string } };

async function ensureProjectAccess(userId: string, role: string, projectId: string) {
  const accessWhere = buildProjectAccessWhere({ id: userId, role });
  const project = await prisma.project.findFirst({
    where: { id: projectId, ...accessWhere },
    select: { id: true },
  });
  return project;
}

function serializeBudget(b: any) {
  return {
    id: b.id,
    projectId: b.projectId,
    status: b.status,
    totalAmount: Number(b.totalAmount),
    note: b.note,
    lockedAt: b.lockedAt,
    lockedBy: b.lockedBy ? { id: b.lockedBy.id, fullName: b.lockedBy.fullName } : null,
    createdBy: b.createdBy ? { id: b.createdBy.id, fullName: b.createdBy.fullName } : null,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
    items: (b.items ?? []).map((it: any) => ({
      id: it.id,
      phase: it.phase,
      workItem: it.workItem,
      unit: it.unit,
      quantity: Number(it.quantity),
      unitPrice: Number(it.unitPrice),
      amount: Number(it.amount),
      note: it.note,
      sortRank: it.sortRank,
    })),
    amendments: (b.amendments ?? []).map((a: any) => ({
      id: a.id,
      reason: a.reason,
      deltaAmount: Number(a.deltaAmount),
      status: a.status,
      proposedBy: a.proposedBy ? { id: a.proposedBy.id, fullName: a.proposedBy.fullName } : null,
      approvedBy: a.approvedBy ? { id: a.approvedBy.id, fullName: a.approvedBy.fullName } : null,
      approvedAt: a.approvedAt,
      rejectReason: a.rejectReason,
      createdAt: a.createdAt,
      items: (a.items ?? []).map((it: any) => ({
        id: it.id,
        phase: it.phase,
        workItem: it.workItem,
        unit: it.unit,
        quantity: Number(it.quantity),
        unitPrice: Number(it.unitPrice),
        amount: Number(it.amount),
        note: it.note,
      })),
    })),
  };
}

export async function GET(_req: Request, ctx: RouteCtx) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }
  if (!canViewLaborBudget(user.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }
  const project = await ensureProjectAccess(user.id, user.role, ctx.params.id);
  if (!project) {
    return NextResponse.json({ message: "Dự án không tồn tại hoặc không có quyền" }, { status: 404 });
  }

  const budget = await prisma.laborBudget.findUnique({
    where: { projectId: project.id },
    include: {
      createdBy: { select: { id: true, fullName: true } },
      lockedBy: { select: { id: true, fullName: true } },
      items: { orderBy: [{ phase: "asc" }, { sortRank: "asc" }, { createdAt: "asc" }] },
      amendments: {
        orderBy: { createdAt: "desc" },
        include: {
          proposedBy: { select: { id: true, fullName: true } },
          approvedBy: { select: { id: true, fullName: true } },
          items: true,
        },
      },
    },
  });

  return NextResponse.json({ budget: budget ? serializeBudget(budget) : null });
}

export async function PUT(req: Request, ctx: RouteCtx) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }
  if (!canEditLaborBudget(user.role)) {
    return NextResponse.json({ message: "Không có quyền sửa dự toán" }, { status: 403 });
  }
  const project = await ensureProjectAccess(user.id, user.role, ctx.params.id);
  if (!project) {
    return NextResponse.json({ message: "Dự án không tồn tại hoặc không có quyền" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Body không hợp lệ" }, { status: 400 });
  }
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  for (const it of parsed.data.items) {
    if (!isValidPhase(it.phase)) {
      return NextResponse.json({ message: `Giai đoạn không hợp lệ: ${it.phase}` }, { status: 400 });
    }
  }

  const existing = await prisma.laborBudget.findUnique({ where: { projectId: project.id } });
  if (existing && existing.status === "locked") {
    return NextResponse.json({ message: "Dự toán đã chốt — phải tạo điều chỉnh thay vì sửa trực tiếp" }, { status: 409 });
  }

  const enriched = parsed.data.items.map((it, idx) => ({
    ...it,
    amount: computeItemAmount(it.quantity, it.unitPrice),
    sortRank: idx,
  }));
  const total = enriched.reduce((sum, it) => sum + it.amount, 0);

  const saved = await prisma.$transaction(async (tx) => {
    const budget = existing
      ? await tx.laborBudget.update({
          where: { id: existing.id },
          data: { note: parsed.data.note ?? null, totalAmount: BigInt(total) },
        })
      : await tx.laborBudget.create({
          data: {
            projectId: project.id,
            status: "draft",
            note: parsed.data.note ?? null,
            totalAmount: BigInt(total),
            createdById: user.id,
          },
        });

    if (existing) {
      await tx.laborBudgetItem.deleteMany({ where: { budgetId: budget.id } });
    }
    if (enriched.length > 0) {
      await tx.laborBudgetItem.createMany({
        data: enriched.map((it) => ({
          budgetId: budget.id,
          phase: it.phase,
          workItem: it.workItem,
          unit: it.unit,
          quantity: it.quantity,
          unitPrice: BigInt(it.unitPrice),
          amount: BigInt(it.amount),
          note: it.note ?? null,
          sortRank: it.sortRank,
        })),
      });
    }

    return tx.laborBudget.findUnique({
      where: { id: budget.id },
      include: {
        createdBy: { select: { id: true, fullName: true } },
        lockedBy: { select: { id: true, fullName: true } },
        items: { orderBy: [{ phase: "asc" }, { sortRank: "asc" }] },
        amendments: {
          orderBy: { createdAt: "desc" },
          include: {
            proposedBy: { select: { id: true, fullName: true } },
            approvedBy: { select: { id: true, fullName: true } },
            items: true,
          },
        },
      },
    });
  });

  return NextResponse.json({ ok: true, budget: saved ? serializeBudget(saved) : null });
}
