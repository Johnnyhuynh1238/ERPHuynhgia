import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSubcontractorWrite } from "@/lib/subcontractor-auth";

const patchSchema = z.object({
  name: z.string().trim().min(2, "Tên tiêu chí tối thiểu 2 ký tự").optional(),
  description: z.string().trim().max(500).optional().nullable(),
  weight: z.number().min(0.1).max(9.99).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const { error } = await requireSubcontractorWrite();
  if (error) return error;

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const existed = await prisma.evaluationCriterion.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!existed) {
    return NextResponse.json({ message: "Không tìm thấy tiêu chí" }, { status: 404 });
  }

  const criterion = await prisma.evaluationCriterion.update({
    where: { id: params.id },
    data: parsed.data,
  });

  return NextResponse.json({ criterion, message: "Đã cập nhật tiêu chí" });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const { error } = await requireSubcontractorWrite();
  if (error) return error;

  const existed = await prisma.evaluationCriterion.findUnique({
    where: { id: params.id },
    select: { id: true, isDefault: true },
  });

  if (!existed) {
    return NextResponse.json({ message: "Không tìm thấy tiêu chí" }, { status: 404 });
  }

  if (existed.isDefault) {
    return NextResponse.json({ message: "Tiêu chí mặc định không được phép xóa" }, { status: 403 });
  }

  await prisma.evaluationCriterion.update({
    where: { id: params.id },
    data: { isActive: false },
  });

  return NextResponse.json({ message: "Đã xóa tiêu chí (soft delete)" });
}
