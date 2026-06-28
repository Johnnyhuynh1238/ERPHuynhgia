import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { canEditBudget, canViewBudget } from "@/lib/project-budget";

const upsertSchema = z.object({
  standardTaskId: z.string().uuid(),
  componentId: z.string().uuid().nullable().optional(),
  unit: z.string().trim().min(1).max(20),
  quantity: z.coerce.number().min(0),
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

  const [catalog, quantities] = await Promise.all([
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
    prisma.projectBudgetQuantity.findMany({
      where: { projectId: params.id },
      select: {
        id: true,
        standardTaskId: true,
        componentId: true,
        unit: true,
        quantity: true,
        note: true,
      },
    }),
  ]);

  return NextResponse.json({
    catalog,
    quantities: quantities.map((q) => ({
      ...q,
      quantity: Number(q.quantity),
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
  const componentId = body.componentId ?? null;

  const task = await prisma.standardTaskCatalog.findUnique({
    where: { id: body.standardTaskId },
    select: { id: true, retiredAt: true },
  });
  if (!task || task.retiredAt) {
    return NextResponse.json({ message: "Đầu việc không tồn tại" }, { status: 404 });
  }

  if (componentId) {
    const comp = await prisma.projectComponent.findFirst({
      where: { id: componentId, projectId: params.id },
      select: { id: true },
    });
    if (!comp) return NextResponse.json({ message: "Cấu kiện không thuộc dự án" }, { status: 400 });
  }

  // Upsert: tìm row hiện có rồi update/create. Postgres unique không enforce với componentId=null,
  // nên dùng findFirst thay vì upsert nguyên thuỷ.
  const existing = await prisma.projectBudgetQuantity.findFirst({
    where: { projectId: params.id, standardTaskId: body.standardTaskId, componentId },
    select: { id: true },
  });

  if (body.quantity === 0 && !body.note) {
    if (existing) {
      await prisma.projectBudgetQuantity.delete({ where: { id: existing.id } });
    }
    return NextResponse.json({ deleted: true });
  }

  const saved = existing
    ? await prisma.projectBudgetQuantity.update({
        where: { id: existing.id },
        data: { unit: body.unit, quantity: body.quantity, note: body.note ?? null },
      })
    : await prisma.projectBudgetQuantity.create({
        data: {
          projectId: params.id,
          componentId,
          standardTaskId: body.standardTaskId,
          unit: body.unit,
          quantity: body.quantity,
          note: body.note ?? null,
        },
      });

  return NextResponse.json({
    id: saved.id,
    standardTaskId: saved.standardTaskId,
    componentId: saved.componentId,
    unit: saved.unit,
    quantity: Number(saved.quantity),
    note: saved.note,
  });
}
