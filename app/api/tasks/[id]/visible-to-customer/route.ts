import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

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

  const task = await prisma.task.update({
    where: { id: params.id },
    data: { visibleToCustomer: parsed.data.visibleToCustomer },
  });

  return NextResponse.json({ task, message: "Đã cập nhật hiển thị cổng chủ nhà" });
}
