import { NextResponse } from "next/server";
import { ExpenseStatus, UserRole } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

// KT/admin bổ sung hoặc sửa tài khoản nhận (STK) cho lệnh chi chưa chi,
// để bật nút "Chuyển khoản" nhanh. Chỉ sửa khi lệnh còn chờ (pending / tptc_pending).
const EDIT_ROLES = new Set<string>([UserRole.admin, UserRole.accountant]);

const schema = z.object({
  payeeBankBin: z.string().trim().max(20).optional().nullable(),
  payeeAccountNumber: z.string().trim().max(40).optional().nullable(),
  payeeAccountName: z.string().trim().max(200).optional().nullable(),
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!EDIT_ROLES.has(user.role)) {
    return NextResponse.json({ message: "Không có quyền sửa tài khoản nhận" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const bin = parsed.data.payeeBankBin?.trim() || null;
  const acc = parsed.data.payeeAccountNumber?.trim() || null;
  const name = parsed.data.payeeAccountName?.trim() || null;
  if ((bin && !acc) || (!bin && acc)) {
    return NextResponse.json({ message: "Chọn ngân hàng và nhập STK hoặc bỏ trống cả 2" }, { status: 400 });
  }

  const expense = await prisma.expense.findUnique({ where: { id: params.id }, select: { status: true } });
  if (!expense) return NextResponse.json({ message: "Không tìm thấy lệnh chi" }, { status: 404 });
  if (expense.status !== ExpenseStatus.pending && expense.status !== ExpenseStatus.tptc_pending) {
    return NextResponse.json({ message: "Chỉ sửa STK khi lệnh chi còn chờ chi" }, { status: 400 });
  }

  const updated = await prisma.expense.update({
    where: { id: params.id },
    data: {
      payeeBankBin: bin,
      payeeAccountNumber: acc,
      payeeAccountName: name,
    },
    select: { id: true, payeeBankBin: true, payeeAccountNumber: true, payeeAccountName: true },
  });

  return NextResponse.json({ message: "Đã cập nhật tài khoản nhận", expense: updated });
}
