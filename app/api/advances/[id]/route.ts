import { NextResponse } from "next/server";
import { AdvanceStatus, ExpenseStatus, ReceiptStatus, UserRole } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { summarizeAdvance } from "@/lib/debts";

const VIEW_ROLES = new Set<string>([UserRole.admin, UserRole.accountant]);

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!VIEW_ROLES.has(user.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const advance = await prisma.advance.findUnique({
    where: { id: params.id },
    include: {
      expenses: {
        where: { status: { not: ExpenseStatus.cancelled } },
        orderBy: { createdAt: "desc" },
        select: { id: true, code: true, amount: true, status: true, payee: true, paidAt: true, createdAt: true, note: true },
      },
      receipts: {
        where: { status: { not: ReceiptStatus.cancelled } },
        orderBy: { createdAt: "desc" },
        select: { id: true, code: true, amount: true, status: true, payer: true, receivedAt: true, createdAt: true, note: true },
      },
    },
  });
  if (!advance) return NextResponse.json({ message: "Không tìm thấy phiếu tạm ứng" }, { status: 404 });

  return NextResponse.json({
    id: advance.id,
    code: advance.code,
    recipient: advance.recipient,
    advancedAt: advance.advancedAt,
    purpose: advance.purpose,
    status: advance.status,
    note: advance.note,
    createdAt: advance.createdAt,
    ...summarizeAdvance(advance),
    expenseTxns: advance.expenses.map((e) => ({ ...e, amount: Number(e.amount), kind: "advance" as const })),
    receiptTxns: advance.receipts.map((r) => ({ ...r, amount: Number(r.amount), kind: "return" as const })),
  });
}

const patchSchema = z.object({
  status: z.enum(["open", "settled"]).optional(),
  recipient: z.string().trim().min(1).max(255).optional(),
  purpose: z.string().trim().max(2000).nullable().optional(),
  note: z.string().trim().max(2000).nullable().optional(),
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== UserRole.admin) return NextResponse.json({ message: "Chỉ admin" }, { status: 403 });

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const d = parsed.data;
  const advance = await prisma.advance.update({
    where: { id: params.id },
    data: {
      ...(d.status ? { status: d.status as AdvanceStatus, settledAt: d.status === "settled" ? new Date() : null } : {}),
      ...(d.recipient !== undefined ? { recipient: d.recipient.trim() } : {}),
      ...(d.purpose !== undefined ? { purpose: d.purpose?.trim() || null } : {}),
      ...(d.note !== undefined ? { note: d.note?.trim() || null } : {}),
    },
  });
  return NextResponse.json({ id: advance.id, status: advance.status });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== UserRole.admin) return NextResponse.json({ message: "Chỉ admin" }, { status: 403 });

  const [exp, rec] = await Promise.all([
    prisma.expense.count({ where: { advanceId: params.id } }),
    prisma.receipt.count({ where: { advanceId: params.id } }),
  ]);
  if (exp + rec > 0) {
    return NextResponse.json({ message: "Phiếu tạm ứng đã có giao dịch, không thể xoá" }, { status: 409 });
  }
  await prisma.advance.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
