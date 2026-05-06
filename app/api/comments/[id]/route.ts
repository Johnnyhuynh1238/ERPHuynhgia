import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";

function canManageComments(role: UserRole) {
  return role === UserRole.admin || role === UserRole.accountant || role === UserRole.construction_manager || role === UserRole.engineer;
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canManageComments(user.role as UserRole)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const comment = await prisma.customerComment.findUnique({
    where: { id: params.id },
    select: { id: true, projectId: true, authorId: true },
  });
  if (!comment) return NextResponse.json({ message: "Không tìm thấy bình luận" }, { status: 404 });

  const project = await prisma.project.findFirst({
    where: { id: comment.projectId, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  if (user.role !== UserRole.admin && comment.authorId !== user.id) {
    return NextResponse.json({ message: "Chỉ admin hoặc người tạo được xóa bình luận" }, { status: 403 });
  }

  await prisma.$transaction([
    prisma.customerCommentReply.deleteMany({ where: { commentId: comment.id } }),
    prisma.customerComment.deleteMany({ where: { parentId: comment.id } }),
    prisma.customerComment.delete({ where: { id: comment.id } }),
  ]);

  return NextResponse.json({ message: "Đã xóa bình luận" });
}
