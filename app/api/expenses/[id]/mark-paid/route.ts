import { NextResponse } from "next/server";
import { ExpenseStatus, Prisma, UserRole } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { recordCashTxn } from "@/lib/treasury";

const PAY_ROLES = new Set<string>([UserRole.admin, UserRole.accountant]);

const schema = z.object({
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày chi không hợp lệ"),
  paidAmount: z.coerce.number().positive("Số tiền đã chi phải > 0"),
  paidReceiptUrl: z.string().trim().max(500).optional().nullable(),
  paidNote: z.string().trim().max(2000).optional().nullable(),
});

function atUtcDate(s: string) {
  return new Date(`${s}T00:00:00.000Z`);
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!PAY_ROLES.has(user.role)) {
    return NextResponse.json({ message: "Không có quyền đánh dấu đã chi" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const data = parsed.data;
  const expense = await prisma.expense.findUnique({
    where: { id: params.id },
    include: { category: { select: { id: true, name: true } } },
  });
  if (!expense) return NextResponse.json({ message: "Không tìm thấy lệnh chi" }, { status: 404 });
  if (expense.status !== ExpenseStatus.pending) {
    return NextResponse.json({ message: "Lệnh chi không ở trạng thái chờ chi" }, { status: 400 });
  }

  const paidAt = atUtcDate(data.paidAt);

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const upd = await tx.expense.update({
        where: { id: expense.id },
        data: {
          status: ExpenseStatus.paid,
          paidBy: user.id,
          paidAt,
          paidAmount: new Prisma.Decimal(data.paidAmount),
          paidNote: data.paidNote?.trim() || null,
          paidReceiptUrl: data.paidReceiptUrl?.trim() || null,
        },
        include: {
          project: { select: { id: true, code: true, name: true } },
          category: { select: { id: true, code: true, name: true } },
        },
      });
      await recordCashTxn(tx, {
        direction: "out",
        amount: data.paidAmount,
        occurredAt: paidAt,
        refType: "expense",
        refId: expense.id,
        projectId: expense.projectId,
        categoryId: expense.categoryId,
        note: `${expense.code} — ${expense.category.name}${expense.payee ? ` / ${expense.payee}` : ""}${data.paidNote ? ` — ${data.paidNote}` : ""}`,
        createdBy: user.id,
      });
      return upd;
    });

    return NextResponse.json({
      expense: { ...updated, amount: Number(updated.amount), paidAmount: Number(updated.paidAmount) },
      message: "Đã đánh dấu đã chi và ghi sổ quỹ",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Lỗi không xác định";
    return NextResponse.json({ message: msg }, { status: 400 });
  }
}
