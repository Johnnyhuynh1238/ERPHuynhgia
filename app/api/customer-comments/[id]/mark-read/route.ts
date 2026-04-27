import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export async function PATCH(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  if (!["admin", "construction_manager", "engineer"].includes(user.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const comment = await prisma.customerComment.findUnique({
    where: { id: params.id },
    select: { id: true, project: { select: { mainEngineerId: true } } },
  });

  if (!comment) return NextResponse.json({ message: "Không tìm thấy comment" }, { status: 404 });
  if (user.role === "engineer" && comment.project.mainEngineerId !== user.id) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const updated = await prisma.customerComment.update({
    where: { id: params.id },
    data: { readByStaff: true },
  });

  return NextResponse.json({ comment: updated, message: "Đã đánh dấu đã đọc" });
}
