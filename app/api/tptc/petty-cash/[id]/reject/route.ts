import { NextResponse } from "next/server";
import { ExpenseStatus, UserRole } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { fireAndForget, notifyExpenseTptcRejected } from "@/lib/notifications";

const rejectSchema = z.object({
  reason: z.string().trim().min(3, "Lý do từ chối tối thiểu 3 ký tự").max(500),
});

function canReject(role: string) {
  return role === UserRole.construction_manager || role === UserRole.admin;
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canReject(user.role)) {
    return NextResponse.json({ message: "Chỉ TPTC/admin được từ chối" }, { status: 403 });
  }

  const parsed = rejectSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const reason = parsed.data.reason.trim();

  const current = await prisma.expense.findUnique({
    where: { id: params.id },
    select: { id: true, code: true, status: true, createdBy: true },
  });
  if (!current) return NextResponse.json({ message: "Yêu cầu không tồn tại" }, { status: 404 });
  if (current.status !== ExpenseStatus.tptc_pending) {
    return NextResponse.json({ message: "Yêu cầu đã được xử lý trước đó" }, { status: 409 });
  }

  const updated = await prisma.expense.update({
    where: { id: current.id },
    data: {
      status: ExpenseStatus.cancelled,
      cancelledBy: user.id,
      cancelledAt: new Date(),
      cancelledReason: reason,
      tptcRejectedReason: reason,
      nextReminderAt: null,
    },
  });

  fireAndForget(
    notifyExpenseTptcRejected({
      expenseId: updated.id,
      code: updated.code,
      reason,
      ksUserId: current.createdBy,
      actorUserId: user.id,
      actorName: user.name || user.email || "TPTC",
    }),
  );

  return NextResponse.json({ message: "Đã từ chối yêu cầu." });
}
