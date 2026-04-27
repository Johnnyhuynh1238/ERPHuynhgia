import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSubcontractorWrite } from "@/lib/subcontractor-auth";

const patchSchema = z.object({
  name: z.string().trim().min(2, "Tên chuyên môn tối thiểu 2 ký tự").optional(),
  description: z.string().trim().max(500).optional().nullable(),
  icon: z.string().trim().max(20).optional().nullable(),
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

  const existed = await prisma.subcontractorSpecialty.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!existed) {
    return NextResponse.json({ message: "Không tìm thấy chuyên môn" }, { status: 404 });
  }

  const specialty = await prisma.subcontractorSpecialty.update({
    where: { id: params.id },
    data: parsed.data,
  });

  return NextResponse.json({ specialty, message: "Đã cập nhật chuyên môn" });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const { error } = await requireSubcontractorWrite();
  if (error) return error;

  const existed = await prisma.subcontractorSpecialty.findUnique({
    where: { id: params.id },
    select: { id: true, isActive: true },
  });

  if (!existed) {
    return NextResponse.json({ message: "Không tìm thấy chuyên môn" }, { status: 404 });
  }

  const inUse = await prisma.subcontractorSpecialtyMap.count({ where: { specialtyId: params.id } });

  if (inUse > 0) {
    await prisma.subcontractorSpecialty.update({
      where: { id: params.id },
      data: { isActive: false },
    });

    return NextResponse.json({ message: "Chuyên môn đang được sử dụng, đã chuyển sang trạng thái ngưng hoạt động" });
  }

  await prisma.subcontractorSpecialty.delete({ where: { id: params.id } });

  return NextResponse.json({ message: "Đã xóa chuyên môn" });
}
