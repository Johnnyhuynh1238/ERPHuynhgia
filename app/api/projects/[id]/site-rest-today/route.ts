import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { toUtcStartOfDay } from "@/lib/date";
import { buildProjectAccessWhere } from "@/lib/project-permissions";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
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

  const today = toUtcStartOfDay(new Date());
  const siteRestDay = await prisma.siteRestDay.findUnique({
    where: {
      projectId_restDate: {
        projectId: params.id,
        restDate: today,
      },
    },
    include: {
      declaredByUser: {
        select: {
          id: true,
          fullName: true,
        },
      },
    },
  });

  return NextResponse.json({ siteRestDay });
}
