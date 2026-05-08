import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";

const reorderSchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1),
});

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

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole(["admin"]);
  } catch (error) {
    return mapAuthError(error) || NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  const parsed = reorderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const existing = await prisma.taskAssignmentTemplateItem.findMany({
    where: {
      taskTemplateId: params.id,
      id: { in: parsed.data.itemIds },
    },
    select: { id: true },
  });

  if (existing.length !== parsed.data.itemIds.length) {
    return NextResponse.json({ message: "Danh sách item không hợp lệ cho template này" }, { status: 400 });
  }

  await prisma.$transaction(
    parsed.data.itemIds.map((itemId, index) =>
      prisma.taskAssignmentTemplateItem.update({
        where: { id: itemId },
        data: { displayOrder: index + 1 },
      }),
    ),
  );

  const items = await prisma.taskAssignmentTemplateItem.findMany({
    where: { taskTemplateId: params.id },
    orderBy: [{ displayOrder: "asc" }, { title: "asc" }],
  });

  return NextResponse.json({ items, message: "Đã cập nhật thứ tự nhiệm vụ checklist" });
}
