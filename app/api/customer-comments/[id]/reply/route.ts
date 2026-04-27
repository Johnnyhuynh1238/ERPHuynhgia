import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({ content: z.string().trim().min(1) });

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  if (!["admin", "construction_manager", "engineer"].includes(user.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Nội dung không hợp lệ" }, { status: 400 });
  }

  const comment = await prisma.customerComment.findUnique({
    where: { id: params.id },
    select: { id: true, project: { select: { mainEngineerId: true } } },
  });
  if (!comment) return NextResponse.json({ message: "Không tìm thấy comment" }, { status: 404 });

  if (user.role === "engineer" && comment.project.mainEngineerId !== user.id) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const reply = await prisma.customerCommentReply.create({
    data: {
      commentId: comment.id,
      authorId: user.id,
      content: parsed.data.content,
    },
    include: {
      author: { select: { id: true, fullName: true, email: true } },
    },
  });

  await prisma.customerComment.update({
    where: { id: comment.id },
    data: { readByStaff: true },
  });

  return NextResponse.json({ reply, message: "Đã gửi phản hồi" });
}
