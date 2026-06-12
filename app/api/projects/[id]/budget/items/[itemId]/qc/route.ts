import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { canConfigQcChecklist, parseQcChecklist } from "@/lib/qc-mapping";
import { logProjectActivity } from "@/lib/project-activity-log";

const bodySchema = z.object({
  qcChecklist: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(120),
        requirePhoto: z.boolean().optional(),
      }),
    )
    .max(20)
    .nullable(),
});

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; itemId: string } },
) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canConfigQcChecklist({ id: user.id, role: user.role })) {
    return NextResponse.json({ message: "Chỉ TPTC/admin được config QC" }, { status: 403 });
  }

  const project = await prisma.project.findFirst({
    where: { id: params.id, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ message: "Không có quyền hoặc dự án không tồn tại" }, { status: 403 });

  const item = await prisma.projectBudgetItem.findFirst({
    where: { id: params.itemId, budget: { projectId: params.id } },
    select: { id: true, name: true },
  });
  if (!item) return NextResponse.json({ message: "Không tìm thấy đầu việc" }, { status: 404 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const cleaned = parsed.data.qcChecklist == null ? null : parseQcChecklist(parsed.data.qcChecklist);

  await prisma.projectBudgetItem.update({
    where: { id: params.itemId },
    data: {
      qcChecklist:
        cleaned == null || cleaned.length === 0
          ? Prisma.JsonNull
          : (cleaned as unknown as Prisma.InputJsonValue),
    },
  });

  await logProjectActivity(prisma, {
    projectId: params.id,
    actorId: user.id,
    entity: "budget_item_qc",
    entityId: params.itemId,
    action: "update",
    summary: `Cập nhật QC checklist cho "${item.name}": ${cleaned?.length ?? 0} mục`,
    metadata: { itemCount: cleaned?.length ?? 0 },
  });

  return NextResponse.json({ ok: true, qcChecklist: cleaned ?? [] });
}
