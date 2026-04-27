import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  if (!["admin", "construction_manager", "engineer"].includes(user.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  if (user.role === "engineer") {
    const project = await prisma.project.findUnique({ where: { id: params.id }, select: { mainEngineerId: true } });
    if (!project || project.mainEngineerId !== user.id) {
      return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    }
  }

  const comments = await prisma.customerComment.findMany({
    where: { projectId: params.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      task: { select: { id: true, code: true, name: true } },
      eveningReport: { select: { id: true, reportDate: true } },
      replies: {
        include: {
          author: { select: { id: true, fullName: true, email: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  return NextResponse.json({ comments });
}
