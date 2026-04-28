import { NextResponse } from "next/server";
import { QcItemStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getTaskWithAccess } from "@/lib/task-permissions";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });

  const { task, allowed } = await getTaskWithAccess(params.id, { id: user.id, role: user.role });
  if (!task) return NextResponse.json({ message: "Không tìm thấy task" }, { status: 404 });
  if (!allowed) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const items = await prisma.qcItem.findMany({
    where: { taskId: params.id },
    orderBy: { orderIndex: "asc" },
    include: {
      progress: true,
      taskQcLogs: {
        orderBy: { checkedAt: "desc" },
        include: {
          checker: { select: { id: true, fullName: true, email: true } },
        },
      },
    },
  });

  const mappedItems = items.map((item) => {
    const st = item.progress?.status ?? QcItemStatus.unchecked;
    const status = st === QcItemStatus.passed ? "pass" : st === QcItemStatus.failed ? "fail" : "pending";
    return {
      qcItemId: item.id,
      name: item.content,
      status,
      logs: item.taskQcLogs,
    };
  });

  const total = mappedItems.length;
  const passed = mappedItems.filter((x) => x.status === "pass").length;
  const allPassed = total > 0 && passed === total;

  return NextResponse.json({
    items: mappedItems,
    allPassed,
    canComplete: allPassed,
    remaining: Math.max(total - passed, 0),
  });
}
