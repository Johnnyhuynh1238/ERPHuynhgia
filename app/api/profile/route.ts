import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const updateSchema = z.object({
  fullName: z.string().trim().min(2, "Họ tên tối thiểu 2 ký tự"),
  phone: z.string().trim().min(8, "Số điện thoại không hợp lệ").max(20, "Số điện thoại không hợp lệ"),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      fullName: true,
      phone: true,
      role: true,
      avatarUrl: true,
      createdAt: true,
    },
  });

  if (!user) {
    return NextResponse.json({ message: "Không tìm thấy user" }, { status: 404 });
  }

  return NextResponse.json({ user });
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  const formData = await request.formData();
  const fullName = String(formData.get("fullName") || "");
  const phone = String(formData.get("phone") || "");
  const avatarFile = formData.get("avatar");

  const parsed = updateSchema.safeParse({ fullName, phone });
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  let avatarUrl: string | undefined;

  if (avatarFile instanceof File && avatarFile.size > 0) {
    const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
    if (!allowed.has(avatarFile.type)) {
      return NextResponse.json({ message: "Avatar chỉ hỗ trợ JPG/PNG/WEBP" }, { status: 400 });
    }

    if (avatarFile.size > 5 * 1024 * 1024) {
      return NextResponse.json({ message: "Avatar tối đa 5MB" }, { status: 400 });
    }

    const ext = avatarFile.type === "image/png" ? "png" : avatarFile.type === "image/webp" ? "webp" : "jpg";
    const fileName = `${session.user.id}-${randomUUID()}.${ext}`;
    const avatarsDir = path.join(process.cwd(), "public", "avatars");
    await fs.mkdir(avatarsDir, { recursive: true });

    const filePath = path.join(avatarsDir, fileName);
    const bytes = Buffer.from(await avatarFile.arrayBuffer());
    await fs.writeFile(filePath, bytes);
    avatarUrl = `/avatars/${fileName}`;
  }

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      fullName: parsed.data.fullName,
      phone: parsed.data.phone,
      ...(avatarUrl ? { avatarUrl } : {}),
    },
    select: {
      id: true,
      email: true,
      fullName: true,
      phone: true,
      role: true,
      avatarUrl: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ user });
}
