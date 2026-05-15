import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const putSchema = z.object({
  userIds: z.array(z.string().uuid("UserId không hợp lệ")).max(200),
});

function authError(error: unknown) {
  const msg = error instanceof Error ? error.message : "UNKNOWN";
  if (msg === "401_UNAUTHORIZED") return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (msg === "403_FORBIDDEN") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  return NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
}

export async function PUT(request: Request, { params }: { params: { id: string; groupId: string } }) {
  let current;
  try {
    current = await requireRole(["admin"]);
  } catch (error) {
    return authError(error);
  }

  const body = await request.json().catch(() => null);
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const group = await prisma.designPhotoGroup.findFirst({
    where: { id: params.groupId, projectId: params.id },
    select: { id: true },
  });
  if (!group) return NextResponse.json({ message: "Không tìm thấy nhóm ảnh" }, { status: 404 });

  const userIds = Array.from(new Set(parsed.data.userIds));
  if (userIds.length > 0) {
    const validUsers = await prisma.user.findMany({
      where: { id: { in: userIds }, isActive: true },
      select: { id: true },
    });
    if (validUsers.length !== userIds.length) {
      return NextResponse.json({ message: "Có nhân sự không tồn tại hoặc đã khóa" }, { status: 400 });
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.designPhotoGroupAccess.deleteMany({ where: { groupId: params.groupId } });
    if (userIds.length > 0) {
      await tx.designPhotoGroupAccess.createMany({
        data: userIds.map((userId) => ({ groupId: params.groupId, userId, grantedBy: current.id })),
      });
    }
  });

  return NextResponse.json({ message: "Đã cập nhật phân quyền", grantedCount: userIds.length });
}
