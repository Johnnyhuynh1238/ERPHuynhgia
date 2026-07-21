import { NextResponse } from "next/server";
import { ExpenseStatus, Prisma, SubPaymentStatus, UserRole } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { recordCashTxn } from "@/lib/treasury";
import { fireAndForget, notifyExpensePaid } from "@/lib/notifications";

const PAY_ROLES = new Set<string>([UserRole.admin, UserRole.accountant]);

const schema = z.object({
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày chi không hợp lệ"),
  paidAmount: z.coerce.number().positive("Số tiền đã chi phải > 0"),
  paidReceiptUrl: z.string().trim().max(500).optional().nullable(),
  paidReceiptUrls: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
  paidNote: z.string().trim().max(2000).optional().nullable(),
  accountId: z.string().uuid("Tài khoản quỹ không hợp lệ"),
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

  const receiptUrls = (data.paidReceiptUrls ?? []).map((u) => u.trim()).filter(Boolean);
  const legacyReceipt = data.paidReceiptUrl?.trim() || null;
  if (legacyReceipt && !receiptUrls.includes(legacyReceipt)) receiptUrls.unshift(legacyReceipt);

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
          paidReceiptUrl: receiptUrls[0] ?? null,
          paidReceiptUrls: receiptUrls,
          nextReminderAt: null,
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
        accountId: data.accountId,
        projectId: expense.projectId,
        categoryId: expense.categoryId,
        note: `${expense.code} — ${expense.category.name}${expense.payee ? ` / ${expense.payee}` : ""}${data.paidNote ? ` — ${data.paidNote}` : ""}`,
        createdBy: user.id,
      });

      // Cập nhật ngược nguồn phát sinh (nếu lệnh chi gắn nguồn từ Mua hàng / Công nợ NCC).
      // Dùng paidAmount thực chi (admin có thể sửa) chứ không phải số dự kiến.
      if (expense.sourceType === "mua_hang_order" && expense.sourceId) {
        // Đơn mua trả ngay: chi xong → đánh dấu đã thanh toán.
        await tx.mhOrder.updateMany({
          where: { id: expense.sourceId, status: "received" },
          data: { status: "paid" },
        });
      } else if (expense.sourceType === "ncc_congno" && expense.sourceId && expense.projectId) {
        // Trả công nợ NCC: chi xong → ghi 1 dòng thanh toán NCC (giảm công nợ đúng số đã chi).
        await tx.$executeRaw`
          INSERT INTO ncc_thanh_toan (supplier_id, so_tien, ngay, ghi_chu, created_by, project_id)
          VALUES (${expense.sourceId}::uuid, ${data.paidAmount}, ${paidAt}, ${
            data.paidNote?.trim() || `Trả qua ${expense.code}`
          }, ${user.id}::uuid, ${expense.projectId}::uuid)`;
      }

      // Lệnh chi gắn với đợt thanh toán thầu phụ → tự đánh dấu đợt đã chi.
      if (expense.subPaymentId) {
        await tx.subPayment.update({
          where: { id: expense.subPaymentId },
          data: {
            status: SubPaymentStatus.paid,
            actualAmount: new Prisma.Decimal(data.paidAmount),
            actualPaidDate: paidAt,
            paidBy: user.id,
            paidAt,
          },
        });
      }
      return upd;
    });

    fireAndForget(
      notifyExpensePaid({
        expenseId: updated.id,
        code: updated.code,
        paidAmount: Number(data.paidAmount),
        categoryName: updated.category.name,
        projectLabel: updated.project ? `${updated.project.code} — ${updated.project.name}` : null,
        actorUserId: user.id,
        actorName: user.name || user.email || "Kế toán",
      }),
    );

    return NextResponse.json({
      expense: { ...updated, amount: Number(updated.amount), paidAmount: Number(updated.paidAmount) },
      message: "Đã đánh dấu đã chi và ghi sổ quỹ",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Lỗi không xác định";
    return NextResponse.json({ message: msg }, { status: 400 });
  }
}
