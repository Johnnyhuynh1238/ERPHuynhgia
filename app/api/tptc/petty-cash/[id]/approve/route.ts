import { NextResponse } from "next/server";
import { ExpenseStatus, UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { fireAndForget, notifyExpenseTptcApproved } from "@/lib/notifications";
import { nextReminderForPriority } from "@/lib/expense-reminder";

function canApprove(role: string) {
  return role === UserRole.construction_manager || role === UserRole.admin;
}

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canApprove(user.role)) {
    return NextResponse.json({ message: "Chỉ TPTC/admin được duyệt" }, { status: 403 });
  }

  const current = await prisma.expense.findUnique({
    where: { id: params.id },
    include: {
      project: { select: { id: true, code: true, name: true } },
      creator: { select: { id: true, fullName: true } },
    },
  });
  if (!current) return NextResponse.json({ message: "Yêu cầu không tồn tại" }, { status: 404 });
  if (current.status !== ExpenseStatus.tptc_pending) {
    return NextResponse.json({ message: "Yêu cầu đã được xử lý trước đó" }, { status: 409 });
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
    notifyExpenseTptcApproved({
      expenseId: updated.id,
      code: updated.code,
      amount: Number(updated.amount),
      note: updated.note,
      projectLabel: current.project ? `${current.project.code} — ${current.project.name}` : null,
      ksUserId: current.createdBy,
      actorUserId: user.id,
      actorName: user.name || user.email || "TPTC",
    }),
  );

  return NextResponse.json({ message: "Đã duyệt. Yêu cầu đã chuyển sang kế toán." });
}
