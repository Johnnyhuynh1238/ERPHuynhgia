import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole(["admin", "construction_manager"]);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "UNKNOWN";
    if (msg === "401_UNAUTHORIZED") return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
    if (msg === "403_FORBIDDEN") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    return NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
  }

  const token = randomUUID();
  const project = await prisma.project.update({
    where: { id: params.id },
    data: { customerPortalToken: token },
    select: { id: true, customerPortalToken: true },
  });

  await prisma.customerSession.deleteMany({ where: { projectId: params.id } });
  await prisma.customerLoginAttempt.deleteMany({ where: { projectId: params.id } });

  return NextResponse.json({ project, message: "Đã reset link chủ nhà" });
}
