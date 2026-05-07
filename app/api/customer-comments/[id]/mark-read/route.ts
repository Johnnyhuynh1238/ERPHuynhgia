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

export async function PATCH(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  if (!["admin", "construction_manager", "engineer", "accountant"].includes(user.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const comment = await prisma.customerComment.findFirst({
    where: { id: params.id, ...commentWhereForRole(user.role) },
    select: { id: true, projectId: true },
  });

  if (!comment) return NextResponse.json({ message: "Không tìm thấy comment" }, { status: 404 });

  const project = await prisma.project.findFirst({
    where: { id: comment.projectId, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const updated = await prisma.customerComment.update({
    where: { id: params.id },
    data: { readByStaff: true },
  });

  return NextResponse.json({ comment: updated, message: "Đã đánh dấu đã đọc" });
}
