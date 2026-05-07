import { CommentTargetType, type Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";

function commentWhereForRole(role: string): Prisma.CustomerCommentWhereInput {
  if (role === "accountant") return { targetType: CommentTargetType.payment_schedule };
  if (role === "engineer") {
    return { OR: [{ targetType: { in: [CommentTargetType.project, CommentTargetType.task, CommentTargetType.journal_entry] } }, { targetType: null }] };
  }
  return {};
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  if (!["admin", "construction_manager", "engineer", "accountant"].includes(user.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const project = await prisma.project.findFirst({
    where: { id: params.id, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const comments = await prisma.customerComment.findMany({
    where: { projectId: params.id, ...commentWhereForRole(user.role) },
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
