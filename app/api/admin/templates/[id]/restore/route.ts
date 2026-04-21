import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";

function mapAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : "UNKNOWN";
  if (message === "401_UNAUTHORIZED") {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }
  if (message === "403_FORBIDDEN") {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }
  return null;
}

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole(["admin"]);
  } catch (error) {
    return mapAuthError(error) || NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
  }

  const exists = await prisma.taskTemplate.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!exists) {
    return NextResponse.json({ message: "Không tìm thấy template" }, { status: 404 });
  }

  const updated = await prisma.taskTemplate.update({
    where: { id: params.id },
    data: { isActive: true },
  });

  return NextResponse.json({ template: updated, message: "Đã khôi phục template" });
}
