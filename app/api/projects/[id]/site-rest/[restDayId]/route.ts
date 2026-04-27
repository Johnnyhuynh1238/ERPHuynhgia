import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { toUtcStartOfDay } from "@/lib/date";
import { buildProjectAccessWhere } from "@/lib/project-permissions";

export async function DELETE(_request: Request, { params }: { params: { id: string; restDayId: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  const canManage = user.role === UserRole.admin || user.role === UserRole.construction_manager;
  if (!canManage) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const accessProject = await prisma.project.findFirst({
    where: {
      id: params.id,
      ...buildProjectAccessWhere({ id: user.id, role: user.role }),
    },
    select: { id: true },
  });

  if (!accessProject) {
    return NextResponse.json({ message: "Không có quyền hoặc dự án không tồn tại" }, { status: 403 });
  }

  const row = await prisma.siteRestDay.findFirst({
    where: {
      id: params.restDayId,
      projectId: params.id,
    },
    select: {
      id: true,
      createdAt: true,
    },
  });

  if (!row) {
    return NextResponse.json({ message: "Không tìm thấy bản ghi nghỉ" }, { status: 404 });
  }

  const now = new Date();
  const hourDiff = (now.getTime() - row.createdAt.getTime()) / 3600000;
  if (hourDiff > 24) {
    return NextResponse.json({ message: "Chỉ được hủy đánh dấu nghỉ trong vòng 24h" }, { status: 400 });
  }

  await prisma.siteRestDay.delete({ where: { id: row.id } });

  return NextResponse.json({ message: "Đã hủy đánh dấu công trường nghỉ" });
}
