import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { canEditBudget } from "@/lib/project-budget";

const schema = z.object({
  name: z.string().trim().min(1, "Tên VT bắt buộc").max(255),
  unit: z.string().trim().min(1, "ĐV bắt buộc").max(20),
  price: z.coerce.number().int().min(0).max(10_000_000_000),
  source: z.string().trim().max(255).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canEditBudget({ id: user.id, role: user.role })) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const body = parsed.data;

  const dup = await prisma.materialPrice.findUnique({
    where: { name_unit: { name: body.name, unit: body.unit } },
  });
  if (dup) {
    return NextResponse.json({ message: `Đã có VT "${body.name}" (${body.unit})` }, { status: 409 });
  }

  const row = await prisma.materialPrice.create({
    data: {
      name: body.name,
      unit: body.unit,
      price: BigInt(body.price),
      source: body.source?.trim() || null,
      note: body.note?.trim() || null,
    },
  });

  return NextResponse.json({
    item: {
      id: row.id,
      name: row.name,
      unit: row.unit,
      price: Number(row.price),
      source: row.source,
      note: row.note,
    },
  }, { status: 201 });
}
