import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";

const patchSchema = z.object({
  title: z.string().trim().min(1).optional(),
  description: z.string().trim().nullable().optional(),
  guideContent: z.string().trim().nullable().optional(),
  requirePhoto: z.boolean().optional(),
  displayOrder: z.number().int().min(1).optional(),
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

function cleanText(value: string | null | undefined) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export async function PATCH(request: Request, { params }: { params: { itemId: string } }) {
  try {
    await requireRole(["admin"]);
  } catch (error) {
    return mapAuthError(error) || NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
  }

  const existing = await prisma.taskAssignmentTemplateItem.findUnique({
    where: { id: params.itemId },
    select: { id: true, taskTemplateId: true },
  });

  if (!existing) {
    return NextResponse.json({ message: "Không tìm thấy nhiệm vụ checklist" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  if (parsed.data.displayOrder !== undefined) {
    const duplicateOrder = await prisma.taskAssignmentTemplateItem.findFirst({
      where: {
        taskTemplateId: existing.taskTemplateId,
        displayOrder: parsed.data.displayOrder,
        NOT: { id: existing.id },
      },
      select: { id: true },
    });

    if (duplicateOrder) {
      return NextResponse.json({ message: "displayOrder đã tồn tại trong template" }, { status: 400 });
    }
  }

  const updated = await prisma.taskAssignmentTemplateItem.update({
    where: { id: existing.id },
    data: {
      title: parsed.data.title?.trim(),
      description: parsed.data.description !== undefined ? cleanText(parsed.data.description) : undefined,
      guideContent: parsed.data.guideContent !== undefined ? cleanText(parsed.data.guideContent) : undefined,
      requirePhoto: parsed.data.requirePhoto,
      displayOrder: parsed.data.displayOrder,
    },
  });

  return NextResponse.json({ item: updated, message: "Đã cập nhật nhiệm vụ checklist" });
}

export async function DELETE(_request: Request, { params }: { params: { itemId: string } }) {
  try {
    await requireRole(["admin"]);
  } catch (error) {
    return mapAuthError(error) || NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
  }

  const existing = await prisma.taskAssignmentTemplateItem.findUnique({
    where: { id: params.itemId },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ message: "Không tìm thấy nhiệm vụ checklist" }, { status: 404 });
  }

  await prisma.taskAssignmentTemplateItem.delete({ where: { id: existing.id } });

  return NextResponse.json({ message: "Đã xóa nhiệm vụ checklist" });
}
