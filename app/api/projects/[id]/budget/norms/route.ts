import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { canEditBudget, canViewBudget } from "@/lib/project-budget";

const materialItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  unit: z.string().trim().min(1).max(20),
  qty: z.coerce.number().min(0),
  note: z.string().trim().max(120).optional().nullable(),
});

const machineItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  hours: z.coerce.number().min(0),
  note: z.string().trim().max(120).optional().nullable(),
});

const upsertSchema = z.object({
  standardTaskId: z.string().uuid(),
  unit: z.string().trim().min(1).max(20),
  materialItems: z.array(materialItemSchema).max(50).default([]),
  laborHours: z.coerce.number().min(0).default(0),
  laborGrade: z.string().trim().max(20).nullable().optional(),
  machineItems: z.array(machineItemSchema).max(20).default([]),
  note: z.string().trim().max(500).nullable().optional(),
});

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canViewBudget({ id: user.id, role: user.role })) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const project = await prisma.project.findFirst({
    where: { id: params.id, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ message: "Không tìm thấy dự án" }, { status: 404 });

  const [catalog, norms] = await Promise.all([
    prisma.standardTaskCatalog.findMany({
      where: { retiredAt: null },
      orderBy: [{ phaseCode: "asc" }, { displayOrder: "asc" }],
      select: {
        id: true,
        phaseCode: true,
        phaseName: true,
        taskCode: true,
        taskName: true,
        groupLabel: true,
      },
    }),
    prisma.projectBudgetNorm.findMany({
      where: { projectId: params.id },
      select: {
        id: true,
        standardTaskId: true,
        unit: true,
        materialItems: true,
        laborHours: true,
        laborGrade: true,
        machineItems: true,
        note: true,
      },
    }),
  ]);

  return NextResponse.json({
    catalog,
    norms: norms.map((n) => ({
      ...n,
      laborHours: Number(n.laborHours),
    })),
  });
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canEditBudget({ id: user.id, role: user.role })) {
    return NextResponse.json({ message: "Chỉ TPTC/admin được nhập dự toán" }, { status: 403 });
  }

  const project = await prisma.project.findFirst({
    where: { id: params.id, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ message: "Không có quyền hoặc dự án không tồn tại" }, { status: 403 });

  const parsed = upsertSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const body = parsed.data;

  const task = await prisma.standardTaskCatalog.findUnique({
    where: { id: body.standardTaskId },
    select: { id: true, retiredAt: true },
  });
  if (!task || task.retiredAt) {
    return NextResponse.json({ message: "Đầu việc không tồn tại" }, { status: 404 });
  }

  const isEmpty =
    body.materialItems.length === 0 &&
    body.laborHours === 0 &&
    body.machineItems.length === 0 &&
    !body.note &&
    !body.laborGrade;

  const existing = await prisma.projectBudgetNorm.findUnique({
    where: { projectId_standardTaskId: { projectId: params.id, standardTaskId: body.standardTaskId } },
    select: { id: true },
  });

  if (isEmpty) {
    if (existing) {
      await prisma.projectBudgetNorm.delete({ where: { id: existing.id } });
    }
    return NextResponse.json({ deleted: true });
  }

  const saved = await prisma.projectBudgetNorm.upsert({
    where: { projectId_standardTaskId: { projectId: params.id, standardTaskId: body.standardTaskId } },
    update: {
      unit: body.unit,
      materialItems: body.materialItems,
      laborHours: body.laborHours,
      laborGrade: body.laborGrade ?? null,
      machineItems: body.machineItems,
      note: body.note ?? null,
    },
    create: {
      projectId: params.id,
      standardTaskId: body.standardTaskId,
      unit: body.unit,
      materialItems: body.materialItems,
      laborHours: body.laborHours,
      laborGrade: body.laborGrade ?? null,
      machineItems: body.machineItems,
      note: body.note ?? null,
    },
  });

  return NextResponse.json({
    id: saved.id,
    standardTaskId: saved.standardTaskId,
    unit: saved.unit,
    materialItems: saved.materialItems,
    laborHours: Number(saved.laborHours),
    laborGrade: saved.laborGrade,
    machineItems: saved.machineItems,
    note: saved.note,
  });
}
