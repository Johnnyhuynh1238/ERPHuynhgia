import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  password: z
    .string()
    .trim()
    .min(6, "Mật khẩu tối thiểu 6 ký tự")
    .max(32, "Mật khẩu tối đa 32 ký tự")
    .regex(/^[A-Za-z0-9!@#$%^&*_-]+$/, "Mật khẩu chỉ chứa chữ, số và ký tự ! @ # $ % ^ & * _ -"),
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole(["admin", "construction_manager"]);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "UNKNOWN";
    if (msg === "401_UNAUTHORIZED") return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
    if (msg === "403_FORBIDDEN") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    return NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Mật khẩu không hợp lệ" }, { status: 400 });
  }

  const hashed = await bcrypt.hash(parsed.data.password, 10);
  const project = await prisma.project.update({
    where: { id: params.id },
    data: { customerPortalPassword: hashed },
    select: { id: true },
  });

  await prisma.customerSession.deleteMany({ where: { projectId: params.id } });

  return NextResponse.json({ project, message: "Đã đổi mật khẩu cổng chủ nhà" });
}
