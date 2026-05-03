import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { recalcProjectPhasesTimeline } from "@/lib/project-phase";

const reorderSchema = z.object({
  phaseIds: z.array(z.string().uuid()).min(1, "Danh sách phase không hợp lệ"),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  if (user.role !== UserRole.admin && user.role !== UserRole.construction_manager) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const project = await prisma.project.findFirst({
    where: {
      id: params.id,
      ...buildProjectAccessWhere({ id: user.id, role: user.role }),
    },
    select: { id: true },
  });

  if (!project) {
    return NextResponse.json({ message: "Không có quyền hoặc dự án không tồn tại" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = reorderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const { phaseIds } = parsed.data;

  await prisma.$transaction(async (tx) => {
    const phases = await tx.projectPhase.findMany({
      where: { projectId: params.id },
      select: { id: true },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    });

    if (phases.length !== phaseIds.length) {
      throw new Error("Thiếu phase trong danh sách sắp xếp");
    }

    const existingIds = new Set(phases.map((phase) => phase.id));
    for (const phaseId of phaseIds) {
      if (!existingIds.has(phaseId)) {
        throw new Error("Danh sách phase không thuộc dự án");
      }
    }

    for (let index = 0; index < phaseIds.length; index += 1) {
      await tx.projectPhase.update({
        where: { id: phaseIds[index] },
        data: {
          displayOrder: index + 1,
          code: `P${index + 1}`,
        },
      });
    }

    await recalcProjectPhasesTimeline(tx, params.id);
  });

  return NextResponse.json({ message: "Đã cập nhật thứ tự phase" });
}
