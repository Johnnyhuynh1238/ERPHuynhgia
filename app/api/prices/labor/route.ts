import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { canEditBudget } from "@/lib/project-budget";

const schema = z.object({
  grade: z.string().trim().regex(/^[1-7](\.[0-9])?$/, "Bậc: 1.0-7.0").max(16),
  price: z.coerce.number().int().min(0).max(10_000_000),
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

  const dup = await prisma.laborPrice.findUnique({ where: { grade: body.grade } });
  if (dup) return NextResponse.json({ message: `Đã có bậc ${body.grade}` }, { status: 409 });

  const row = await prisma.laborPrice.create({
    data: {
      grade: body.grade,
      price: BigInt(body.price),
      source: body.source?.trim() || null,
      note: body.note?.trim() || null,
    },
  });
  return NextResponse.json({
    item: { id: row.id, grade: row.grade, price: Number(row.price), source: row.source, note: row.note },
  }, { status: 201 });
}
