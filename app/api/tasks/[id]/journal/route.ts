import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { getTaskWithAccess } from "@/lib/task-permissions";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });

  const { task, allowed } = await getTaskWithAccess(params.id, { id: user.id, role: user.role });
  if (!task) return NextResponse.json({ message: "Không tìm thấy task" }, { status: 404 });
  if (!allowed) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const entries = await prisma.eveningReportTask.findMany({
    where: { taskId: params.id },
    orderBy: { eveningReport: { reportDate: "desc" } },
    include: {
      taskPhotos: { orderBy: { createdAt: "desc" }, include: { user: { select: { id: true, fullName: true, email: true } } } },
      eveningReport: {
        include: {
          reporter: { select: { id: true, fullName: true, email: true } },
          sitePhotos: { orderBy: { uploadedAt: "desc" } },
        },
      },
    },
  });

  return NextResponse.json({ entries });
}
