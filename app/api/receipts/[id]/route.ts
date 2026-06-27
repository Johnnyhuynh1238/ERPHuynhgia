import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

const VIEW_ROLES = new Set<string>([UserRole.admin, UserRole.accountant]);

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!VIEW_ROLES.has(user.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const row = await prisma.receipt.findUnique({
    where: { id: params.id },
    include: {
      project: { select: { id: true, code: true, name: true } },
      creator: { select: { id: true, fullName: true } },
      receiver: { select: { id: true, fullName: true } },
      canceller: { select: { id: true, fullName: true } },
    },
  });
  if (!row) return NextResponse.json({ message: "Không tìm thấy lệnh thu" }, { status: 404 });

  return NextResponse.json({
    receipt: {
      ...row,
      amount: Number(row.amount),
      receivedAmount: row.receivedAmount != null ? Number(row.receivedAmount) : null,
    },
  });
}
