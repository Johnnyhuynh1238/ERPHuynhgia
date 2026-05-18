import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { logProjectActivity } from "@/lib/project-activity-log";

const schema = z.object({ visibleToCustomer: z.boolean() });

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  if (!["admin", "construction_manager"].includes(user.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const before = await prisma.task.findUnique({
    where: { id: params.id },
    select: { id: true, projectId: true, code: true, name: true, visibleToCustomer: true },
  });
  if (!before) return NextResponse.json({ message: "Không tìm thấy task" }, { status: 404 });

  const task = await prisma.task.update({
    where: { id: params.id },
    data: { visibleToCustomer: parsed.data.visibleToCustomer },
  });

  if (before.visibleToCustomer !== parsed.data.visibleToCustomer) {
    await logProjectActivity(prisma, {
      projectId: before.projectId,
      actorId: user.id,
      entity: "task",
      entityId: before.id,
      action: "update_customer_visibility",
      summary: `${parsed.data.visibleToCustomer ? "Bật" : "Ẩn"} hiển thị cổng chủ nhà cho task ${before.code} "${before.name}"`,
      diff: { visibleToCustomer: { from: before.visibleToCustomer, to: parsed.data.visibleToCustomer } },
    });
  }

  return NextResponse.json({ task, message: "Đã cập nhật hiển thị cổng chủ nhà" });
}
