import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const ROLES_EDIT = new Set<string>([UserRole.admin, UserRole.accountant]);

// PATCH: sửa danh mục cho 1 lệnh chi trong sổ quỹ.
// Cập nhật đồng thời cash_transactions.category_id và expenses.category_id.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!ROLES_EDIT.has(user.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { categoryId?: string | null };
  const categoryId = body?.categoryId;
  if (!categoryId || typeof categoryId !== "string") {
    return NextResponse.json({ message: "Thiếu danh mục" }, { status: 400 });
  }

  const txn = await prisma.cashTransaction.findUnique({
    where: { id: params.id },
    select: { id: true, refType: true, refId: true },
  });
  if (!txn) return NextResponse.json({ message: "Không tìm thấy giao dịch" }, { status: 404 });
  if (txn.refType !== "expense") {
    return NextResponse.json({ message: "Chỉ sửa danh mục cho lệnh chi" }, { status: 400 });
  }

  const cat = await prisma.expenseCategory.findUnique({
    where: { id: categoryId },
    select: { id: true, code: true, name: true, scope: true },
  });
  if (!cat) return NextResponse.json({ message: "Danh mục không tồn tại" }, { status: 400 });

  await prisma.$transaction([
    prisma.cashTransaction.update({ where: { id: txn.id }, data: { categoryId } }),
    ...(txn.refId
      ? [prisma.expense.update({ where: { id: txn.refId }, data: { categoryId } })]
      : []),
  ]);

  return NextResponse.json({ ok: true, category: cat });
}
