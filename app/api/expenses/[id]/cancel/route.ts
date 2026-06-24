import { NextResponse } from "next/server";
import { ExpenseStatus, UserRole } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  reason: z.string().trim().min(1, "Lý do huỷ bắt buộc").max(2000),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== UserRole.admin) {
    return NextResponse.json({ message: "Chỉ admin được huỷ lệnh chi" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const row = await prisma.expense.findUnique({ where: { id: params.id }, select: { id: true, status: true } });
  if (!row) return NextResponse.json({ message: "Không tìm thấy lệnh chi" }, { status: 404 });
  if (row.status !== ExpenseStatus.pending) {
    return NextResponse.json({ message: "Chỉ huỷ được lệnh đang chờ chi" }, { status: 400 });
  }

  await prisma.expense.update({
    where: { id: row.id },
    data: {
      status: ExpenseStatus.cancelled,
      cancelledBy: user.id,
      cancelledAt: new Date(),
      cancelledReason: parsed.data.reason.trim(),
    },
  });
  return NextResponse.json({ message: "Đã huỷ lệnh chi" });
}
