import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSubcontractorRead, requireSubcontractorWrite } from "@/lib/subcontractor-auth";

const createSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, "Mã tiêu chí tối thiểu 2 ký tự")
    .max(40, "Mã tiêu chí tối đa 40 ký tự")
    .regex(/^[a-z0-9_\-]+$/, "Mã chỉ gồm chữ thường, số, gạch dưới hoặc gạch ngang"),
  name: z.string().trim().min(2, "Tên tiêu chí tối thiểu 2 ký tự"),
  description: z.string().trim().max(500).optional().nullable(),
  weight: z.number().min(0.1, "Trọng số tối thiểu 0.1").max(9.99, "Trọng số tối đa 9.99"),
});

export async function GET(request: Request) {
  const { error } = await requireSubcontractorRead();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const includeInactive = searchParams.get("includeInactive") === "1";

  const criteria = await prisma.evaluationCriterion.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({ criteria });
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

  const existed = await prisma.evaluationCriterion.findUnique({
    where: { code },
    select: { id: true },
  });

  if (existed) {
    return NextResponse.json({ message: "Mã tiêu chí đã tồn tại" }, { status: 400 });
  }

  const last = await prisma.evaluationCriterion.findFirst({
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const criterion = await prisma.evaluationCriterion.create({
    data: {
      code,
      name: payload.name,
      description: payload.description || null,
      weight: payload.weight,
      sortOrder: (last?.sortOrder ?? 0) + 1,
      isActive: true,
      isDefault: false,
    },
  });

  return NextResponse.json({ criterion, message: "Đã tạo tiêu chí đánh giá" });
}
