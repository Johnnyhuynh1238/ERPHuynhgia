import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getTaskWithAccess } from "@/lib/task-permissions";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  const { task, allowed } = await getTaskWithAccess(params.id, { id: user.id, role: user.role });
  if (!task) {
    return NextResponse.json({ message: "Không tìm thấy task" }, { status: 404 });
  }
  if (!allowed) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(Number(searchParams.get("limit") || 100), 1), 500);

  const [activityLogs, taskLogs] = await Promise.all([
    prisma.taskActivityLog.findMany({
      where: { taskId: params.id },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
    }),
    prisma.taskLog.findMany({
      where: { taskId: params.id },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
    }),
  ]);

  const merged = [
    ...activityLogs.map((log) => ({
      source: "v2" as const,
      id: log.id,
      type: log.type,
      fromValue: log.fromValue,
      toValue: log.toValue,
      metadata: log.metadata,
      description: log.description,
      createdAt: log.createdAt,
      actor: log.user,
    })),
    ...taskLogs.map((log) => ({
      source: "legacy" as const,
      id: log.id,
      type: log.logType,
      fromValue: log.oldValue,
      toValue: log.newValue,
      metadata: null,
      description: log.content,
      createdAt: log.createdAt,
      actor: log.user,
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return NextResponse.json({
    logs: merged.slice(0, limit),
    total: merged.length,
  });
}
