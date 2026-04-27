import { NextResponse } from "next/server";
import { QcLogAction, QcItemStatus, UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { getTaskWithAccess } from "@/lib/task-permissions";

const createSchema = z.object({
  content: z.string().trim().min(1, "Nội dung mục QC là bắt buộc"),
  requirePhoto: z.boolean().optional(),
  requireNote: z.boolean().optional(),
});

function canManageQcItem(role: string) {
  return role === UserRole.admin || role === UserRole.construction_manager || role === UserRole.engineer;
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  const { task, allowed } = await getTaskWithAccess(params.id, { id: user.id, role: user.role });
  if (!task) return NextResponse.json({ message: "Không tìm thấy task" }, { status: 404 });
  if (!allowed) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const items = await prisma.qcItem.findMany({
    where: { taskId: params.id },
    orderBy: { orderIndex: "asc" },
    include: {
      progress: true,
      photos: {
        orderBy: { uploadedAt: "desc" },
      },
    },
  });

  return NextResponse.json({
    items,
    summary: {
      total: items.length,
      passed: items.filter((item) => item.progress?.status === QcItemStatus.passed).length,
      failed: items.filter((item) => item.progress?.status === QcItemStatus.failed).length,
      unchecked: items.filter((item) => !item.progress || item.progress.status === QcItemStatus.unchecked).length,
    },
  });
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  const { task, allowed } = await getTaskWithAccess(params.id, { id: user.id, role: user.role });
  if (!task) return NextResponse.json({ message: "Không tìm thấy task" }, { status: 404 });
  if (!allowed) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  if (!canManageQcItem(user.role)) {
    return NextResponse.json({ message: "Không có quyền thêm mục QC" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const maxRow = await prisma.qcItem.aggregate({
    where: { taskId: params.id },
    _max: { orderIndex: true },
  });
  const nextOrder = (maxRow._max.orderIndex ?? -1) + 1;

  const created = await prisma.$transaction(async (tx) => {
    const item = await tx.qcItem.create({
      data: {
        taskId: params.id,
        content: parsed.data.content,
        requirePhoto: parsed.data.requirePhoto ?? false,
        requireNote: parsed.data.requireNote ?? false,
        createdBy: user.id,
        orderIndex: nextOrder,
      },
    });

    const progress = await tx.qcProgress.create({
      data: {
        taskId: params.id,
        qcItemId: item.id,
        status: QcItemStatus.unchecked,
        updatedBy: user.id,
      },
    });

    await tx.qcLog.create({
      data: {
        taskId: params.id,
        qcItemId: item.id,
        action: QcLogAction.item_added,
        note: `Thêm mục QC: ${parsed.data.content}`,
        performedBy: user.id,
      },
    });

    return { item, progress };
  });

  return NextResponse.json(
    {
      item: {
        ...created.item,
        progress: created.progress,
      },
      message: "Đã thêm mục QC",
    },
    { status: 201 },
  );
}
