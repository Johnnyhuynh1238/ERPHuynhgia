import { SubcontractorStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSubcontractorWrite } from "@/lib/subcontractor-auth";

const bodySchema = z.object({
  notes: z.string().trim().max(5000).optional().nullable(),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const { error } = await requireSubcontractorWrite();
  if (error) return error;

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body || {});

  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const existed = await prisma.subcontractor.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!existed) {
    return NextResponse.json({ message: "Không tìm thấy thầu phụ" }, { status: 404 });
  }

  await prisma.subcontractor.update({
    where: { id: params.id },
    data: {
      status: SubcontractorStatus.blacklisted,
      isActive: false,
      ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes || null } : {}),
    },
  });

  return NextResponse.json({ message: "Đã đưa thầu phụ vào blacklist" });
}
