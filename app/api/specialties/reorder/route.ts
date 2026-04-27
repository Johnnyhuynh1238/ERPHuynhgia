import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSubcontractorWrite } from "@/lib/subcontractor-auth";

const reorderSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, "Danh sách sắp xếp không hợp lệ"),
});

export async function POST(request: Request) {
  const { error } = await requireSubcontractorWrite();
  if (error) return error;

  const body = await request.json().catch(() => null);
  const parsed = reorderSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const ids = parsed.data.ids;

  const existed = await prisma.subcontractorSpecialty.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });

  if (existed.length !== ids.length) {
    return NextResponse.json({ message: "Danh sách chuyên môn không đầy đủ" }, { status: 400 });
  }

  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.subcontractorSpecialty.update({
        where: { id },
        data: { sortOrder: index + 1 },
      }),
    ),
  );

  return NextResponse.json({ message: "Đã cập nhật thứ tự chuyên môn" });
}
