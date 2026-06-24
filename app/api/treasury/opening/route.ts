import { NextResponse } from "next/server";
import { Prisma, UserRole } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  openingBalance: z.coerce.number().min(0, "Số dư đầu kỳ ≥ 0"),
  openingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày không hợp lệ"),
  openingNote: z.string().trim().max(2000).optional().nullable(),
});

function atUtcDate(s: string) {
  return new Date(`${s}T00:00:00.000Z`);
}

/**
 * Một lần duy nhất. Admin nhập số dư hiện tại của công ty tại ngày khởi tạo.
 * Sau khi initialized=true thì endpoint này từ chối — không cho khởi tạo lại.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== UserRole.admin) {
    return NextResponse.json({ message: "Chỉ admin được khởi tạo sổ quỹ" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const cash = await prisma.companyCash.findFirst();
  if (!cash) return NextResponse.json({ message: "Sổ quỹ chưa có row khởi tạo (chạy migration)" }, { status: 500 });
  if (cash.initialized) {
    return NextResponse.json({ message: "Sổ quỹ đã khởi tạo. Mọi điều chỉnh phải qua giao dịch." }, { status: 400 });
  }

  const openingDate = atUtcDate(parsed.data.openingDate);
  const amount = new Prisma.Decimal(parsed.data.openingBalance);

  const updated = await prisma.$transaction(async (tx) => {
    const c = await tx.companyCash.update({
      where: { id: cash.id },
      data: {
        openingBalance: amount,
        openingDate,
        openingNote: parsed.data.openingNote?.trim() || null,
        openingSetBy: user.id,
        openingSetAt: new Date(),
        currentBalance: amount,
        lastTxnAt: new Date(),
        initialized: true,
      },
    });
    // Ghi 1 dòng cash_txn "opening" để bảng nhật ký luôn có dòng đầu (direction=in)
    if (amount.gt(0)) {
      await tx.cashTransaction.create({
        data: {
          direction: "in",
          amount,
          occurredAt: openingDate,
          balanceAfter: amount,
          refType: "opening",
          refId: null,
          projectId: null,
          categoryId: null,
          note: parsed.data.openingNote?.trim() || "Khởi tạo số dư đầu kỳ",
          createdBy: user.id,
        },
      });
    }
    return c;
  });

  return NextResponse.json({
    message: "Đã khởi tạo sổ quỹ",
    currentBalance: Number(updated.currentBalance),
  });
}
