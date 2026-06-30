import { NextResponse } from "next/server";
import { ExpenseStatus, UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { fireAndForget, notifyExpenseKtApproved } from "@/lib/notifications";
import { nextReminderForPriority } from "@/lib/expense-reminder";

function canApprove(role: string) {
  return role === UserRole.admin;
}

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canApprove(user.role)) {
    return NextResponse.json({ message: "Chỉ admin được duyệt" }, { status: 403 });
  }

  const current = await prisma.expense.findUnique({
    where: { id: params.id },
    include: {
      creator: { select: { id: true, role: true } },
    },
  });
  if (!current) return NextResponse.json({ message: "Lệnh chi không tồn tại" }, { status: 404 });
  if (current.status !== ExpenseStatus.tptc_pending) {
    return NextResponse.json({ message: "Lệnh chi đã được xử lý trước đó" }, { status: 409 });
  }
  if (current.creator.role !== UserRole.accountant) {
    return NextResponse.json({ message: "Lệnh chi này không phải do KT tạo" }, { status: 400 });
  }

  const updated = await prisma.expense.update({
    where: { id: current.id },
    data: {
      status: ExpenseStatus.pending,
      tptcApprovedBy: user.id,
      tptcApprovedAt: new Date(),
      nextReminderAt: nextReminderForPriority(current.priority),
    },
  });

  fireAndForget(
    notifyExpenseKtApproved({
      expenseId: updated.id,
      code: updated.code,
      amount: Number(updated.amount),
      ktUserId: current.createdBy,
      actorUserId: user.id,
      actorName: user.name || user.email || "Admin",
    }),
  );

  return NextResponse.json({ message: "Đã duyệt. KT có thể thanh toán." });
}
