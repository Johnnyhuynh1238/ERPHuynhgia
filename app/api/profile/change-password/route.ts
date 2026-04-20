import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const passwordRule = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

const schema = z
  .object({
    currentPassword: z.string().min(1, "Vui lòng nhập mật khẩu cũ"),
    newPassword: z.string().regex(passwordRule, "Mật khẩu mới không đúng chuẩn"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Xác nhận mật khẩu không khớp",
  });

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, passwordHash: true },
  });

  if (!currentUser) {
    return NextResponse.json({ message: "Không tìm thấy user" }, { status: 404 });
  }

  const oldMatched = await bcrypt.compare(parsed.data.currentPassword, currentUser.passwordHash);
  if (!oldMatched) {
    return NextResponse.json({ message: "Mật khẩu cũ không đúng" }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);

  await prisma.user.update({
    where: { id: currentUser.id },
    data: {
      passwordHash,
      mustChangePassword: false,
    },
  });

  return NextResponse.json({ ok: true });
}
