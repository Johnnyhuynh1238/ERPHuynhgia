import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSubcontractorRead, requireSubcontractorWrite } from "@/lib/subcontractor-auth";

const createSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, "Mã chuyên môn tối thiểu 2 ký tự")
    .max(40, "Mã chuyên môn tối đa 40 ký tự")
    .regex(/^[a-z0-9_\-]+$/, "Mã chỉ gồm chữ thường, số, gạch dưới hoặc gạch ngang"),
  name: z.string().trim().min(2, "Tên chuyên môn tối thiểu 2 ký tự"),
  description: z.string().trim().max(500).optional().nullable(),
  icon: z.string().trim().max(20).optional().nullable(),
});

export async function GET(request: Request) {
  const { error } = await requireSubcontractorRead();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const includeInactive = searchParams.get("includeInactive") === "1";

  const specialties = await prisma.subcontractorSpecialty.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({ specialties });
}

export async function POST(request: Request) {
  const { error } = await requireSubcontractorWrite();
  if (error) return error;

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const payload = parsed.data;
  const code = payload.code.toLowerCase();

  const existed = await prisma.subcontractorSpecialty.findUnique({
    where: { code },
    select: { id: true },
  });

  if (existed) {
    return NextResponse.json({ message: "Mã chuyên môn đã tồn tại" }, { status: 400 });
  }

  const last = await prisma.subcontractorSpecialty.findFirst({
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const specialty = await prisma.subcontractorSpecialty.create({
    data: {
      code,
      name: payload.name,
      description: payload.description || null,
      icon: payload.icon || null,
      sortOrder: (last?.sortOrder ?? 0) + 1,
      isActive: true,
    },
  });

  return NextResponse.json({ specialty, message: "Đã tạo chuyên môn" });
}
