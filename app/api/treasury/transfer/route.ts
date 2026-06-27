import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { recordCashTxn } from "@/lib/treasury";

const ROLES_TRANSFER = new Set<string>([UserRole.admin, UserRole.accountant]);

const schema = z.object({
  fromAccountId: z.string().uuid("Tài khoản nguồn không hợp lệ"),
  toAccountId: z.string().uuid("Tài khoản đích không hợp lệ"),
  amount: z.coerce.number().positive("Số tiền phải > 0"),
  occurredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày không hợp lệ"),
  note: z.string().trim().max(2000).optional().nullable(),
});

function atUtcDate(s: string) {
  return new Date(`${s}T00:00:00.000Z`);
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!ROLES_TRANSFER.has(user.role)) {
    return NextResponse.json({ message: "Không có quyền chuyển quỹ" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const data = parsed.data;
  if (data.fromAccountId === data.toAccountId) {
    return NextResponse.json({ message: "Tài khoản nguồn và đích phải khác nhau" }, { status: 400 });
  }

  const occurredAt = atUtcDate(data.occurredAt);
  const note = data.note?.trim() || null;

  try {
    await prisma.$transaction(async (tx) => {
      // Ghi 2 dòng: out ở account nguồn, in ở account đích, link nhau qua counterAccountId.
      await recordCashTxn(tx, {
        direction: "out",
        amount: data.amount,
        occurredAt,
        refType: "transfer",
        accountId: data.fromAccountId,
        counterAccountId: data.toAccountId,
        note: note ? `Chuyển quỹ → ${note}` : "Chuyển quỹ",
        createdBy: user.id,
      });
      await recordCashTxn(tx, {
        direction: "in",
        amount: data.amount,
        occurredAt,
        refType: "transfer",
        accountId: data.toAccountId,
        counterAccountId: data.fromAccountId,
        note: note ? `Nhận chuyển quỹ ← ${note}` : "Nhận chuyển quỹ",
        createdBy: user.id,
      });
    });
    return NextResponse.json({ message: "Đã chuyển quỹ" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Lỗi không xác định";
    return NextResponse.json({ message: msg }, { status: 400 });
  }
}
