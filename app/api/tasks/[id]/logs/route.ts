import { NextResponse } from "next/server";
import { TaskLogType } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { getTaskWithAccess } from "@/lib/task-permissions";

const noteSchema = z.object({
  content: z.string().trim().min(1, "Nội dung không được để trống"),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  const { task, allowed } = await getTaskWithAccess(params.id, { id: user.id, role: user.role });
  if (!task) return NextResponse.json({ message: "Không tìm thấy task" }, { status: 404 });
  if (!allowed) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = noteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Nội dung không hợp lệ" }, { status: 400 });
  }

  const log = await prisma.taskLog.create({
    data: {
      taskId: params.id,
      userId: user.id,
      logType: TaskLogType.note,
      content: parsed.data.content,
    },
    include: {
      user: {
        select: { id: true, fullName: true, email: true, avatarUrl: true },
      },
    },
  });

  return NextResponse.json({ log, message: "Đã ghi nhật ký" });
}
