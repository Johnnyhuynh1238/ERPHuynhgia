import { NextResponse } from "next/server";
import { z } from "zod";
import { BudgetStage } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { canEditBudget, canViewBudget } from "@/lib/project-budget";
import { logProjectActivity } from "@/lib/project-activity-log";

const createSchema = z.object({
  stage: z.nativeEnum(BudgetStage),
  name: z.string().trim().min(1, "Tên cấu kiện là bắt buộc").max(255),
  floor: z.string().trim().max(8).optional().nullable(),
  sortOrder: z.coerce.number().int().optional(),
  note: z.string().trim().max(500).optional().nullable(),
});

type SerializedComponent = {
  id: string;
  stage: BudgetStage;
  name: string;
  floor: string | null;
  sortOrder: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

function serialize(c: {
  id: string;
  stage: BudgetStage;
  name: string;
  floor: string | null;
  sortOrder: number;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}): SerializedComponent {
  return {
    id: c.id,
    stage: c.stage,
    name: c.name,
    floor: c.floor,
    sortOrder: c.sortOrder,
    note: c.note,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

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
  if (!project) return NextResponse.json({ message: "Không có quyền hoặc dự án không tồn tại" }, { status: 403 });

  const components = await prisma.projectComponent.findMany({
    where: { projectId: params.id },
    orderBy: [{ stage: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({ components: components.map(serialize) });
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canEditBudget({ id: user.id, role: user.role })) {
    return NextResponse.json({ message: "Chỉ TPTC/admin được tạo cấu kiện" }, { status: 403 });
  }

  const project = await prisma.project.findFirst({
    where: { id: params.id, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ message: "Không có quyền hoặc dự án không tồn tại" }, { status: 403 });

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const { stage, name, floor, sortOrder, note } = parsed.data;

  let nextOrder = sortOrder;
  if (nextOrder == null) {
    const maxRow = await prisma.projectComponent.findFirst({
      where: { projectId: params.id, stage },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    nextOrder = (maxRow?.sortOrder ?? -1) + 1;
  }

  const component = await prisma.projectComponent.create({
    data: {
      projectId: params.id,
      stage,
      name,
      floor: floor?.trim() ? floor.trim() : null,
      sortOrder: nextOrder,
      note: note?.trim() ? note.trim() : null,
    },
  });

  await logProjectActivity(prisma, {
    projectId: params.id,
    actorId: user.id,
    entity: "project_component",
    entityId: component.id,
    action: "create",
    summary: `Thêm cấu kiện ${stage} — ${name}${floor ? ` (${floor})` : ""}`,
    metadata: { stage, name, floor: component.floor },
  });

  return NextResponse.json({ component: serialize(component) }, { status: 201 });
}
