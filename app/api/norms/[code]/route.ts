import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { canEditBudget, canViewBudget } from "@/lib/project-budget";

const patchSchema = z.object({
  kMaterial: z.coerce.number().min(0).max(10).optional(),
  kLabor: z.coerce.number().min(0).max(10).optional(),
  kMachine: z.coerce.number().min(0).max(10).optional(),
  note: z.string().trim().max(2000).optional().nullable(),
});

export async function GET(_request: Request, { params }: { params: { code: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canViewBudget({ id: user.id, role: user.role })) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const norm = await prisma.norm.findUnique({ where: { code: params.code } });
  if (!norm) return NextResponse.json({ message: "Không tìm thấy định mức" }, { status: 404 });

  return NextResponse.json({
    norm: {
      code: norm.code,
      name: norm.name,
      unit: norm.unit,
      category: norm.category,
      materialItems: norm.materialItems,
      laborItems: norm.laborItems,
      machineItems: norm.machineItems,
      kMaterial: Number(norm.kMaterial),
      kLabor: Number(norm.kLabor),
      kMachine: Number(norm.kMachine),
      source: norm.source,
      note: norm.note,
      retiredAt: norm.retiredAt?.toISOString() ?? null,
    },
  });
}

export async function PATCH(request: Request, { params }: { params: { code: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canEditBudget({ id: user.id, role: user.role })) {
    return NextResponse.json({ message: "Chỉ TPTC/admin được chỉnh hệ số K" }, { status: 403 });
  }

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const body = parsed.data;
  if (
    body.kMaterial === undefined &&
    body.kLabor === undefined &&
    body.kMachine === undefined &&
    body.note === undefined
  ) {
    return NextResponse.json({ message: "Không có thay đổi" }, { status: 400 });
  }

  const norm = await prisma.norm.findUnique({ where: { code: params.code } });
  if (!norm) return NextResponse.json({ message: "Không tìm thấy định mức" }, { status: 404 });

  const updated = await prisma.norm.update({
    where: { code: params.code },
    data: {
      ...(body.kMaterial !== undefined ? { kMaterial: new Prisma.Decimal(body.kMaterial) } : {}),
      ...(body.kLabor !== undefined ? { kLabor: new Prisma.Decimal(body.kLabor) } : {}),
      ...(body.kMachine !== undefined ? { kMachine: new Prisma.Decimal(body.kMachine) } : {}),
      ...(body.note !== undefined ? { note: body.note?.trim() ? body.note.trim() : null } : {}),
    },
  });

  return NextResponse.json({
    norm: {
      code: updated.code,
      name: updated.name,
      unit: updated.unit,
      category: updated.category,
      kMaterial: Number(updated.kMaterial),
      kLabor: Number(updated.kLabor),
      kMachine: Number(updated.kMachine),
      note: updated.note,
    },
  });
}
