import { NextResponse } from "next/server";
import { TaskPhase, UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";

const patchSchema = z.object({
  phase: z.nativeEnum(TaskPhase),
  name: z.string().trim().min(1),
  defaultOffsetDays: z.number().int(),
  defaultDurationDays: z.number().int().min(1),
  defaultTeam: z.string().trim().min(1),
  defaultInspector: z.string().trim().min(1),
  materialsNeeded: z.string().trim().min(1),
  proposerRole: z.string().trim().min(1),
  ordererRole: z.string().trim().min(1),
  receiverRole: z.string().trim().min(1),
  qcChecklist: z.string().trim().min(1),
  isMilestone: z.boolean(),
  displayOrder: z.number().int().min(1),
  isActive: z.boolean().optional(),
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

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole([UserRole.admin]);
  } catch (error) {
    return mapAuthError(error) || NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const exists = await prisma.taskTemplate.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!exists) {
    return NextResponse.json({ message: "Không tìm thấy template" }, { status: 404 });
  }

  const updated = await prisma.taskTemplate.update({
    where: { id: params.id },
    data: parsed.data,
  });

  return NextResponse.json({ template: updated, message: "Đã cập nhật template" });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole([UserRole.admin]);
  } catch (error) {
    return mapAuthError(error) || NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
  }

  const exists = await prisma.taskTemplate.findUnique({ where: { id: params.id }, select: { id: true, isActive: true } });
  if (!exists) {
    return NextResponse.json({ message: "Không tìm thấy template" }, { status: 404 });
  }

  if (!exists.isActive) {
    return NextResponse.json({ message: "Template đã bị xóa mềm trước đó" }, { status: 400 });
  }

  await prisma.taskTemplate.update({
    where: { id: params.id },
    data: { isActive: false },
  });

  return NextResponse.json({ message: "Đã xóa template (soft delete)" });
}
