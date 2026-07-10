import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { canEditBudget, canViewBudget } from "@/lib/project-budget";

const NORM_CATEGORIES = [
  "be_tong", "cot_thep", "cop_pha", "xay", "to_trat",
  "op_lat", "son", "tran", "chong_tham", "cua", "mep", "khac",
] as const;

const materialItemSchema = z.object({
  name: z.string().trim().min(1).max(255),
  unit: z.string().trim().min(1).max(20),
  qtyPerUnit: z.coerce.number().positive(),
});
const laborItemSchema = z.object({
  grade: z.string().trim().min(1).max(64),
  qtyPerUnit: z.coerce.number().positive(),
});
const machineItemSchema = z.object({
  name: z.string().trim().min(1).max(255),
  qtyPerUnit: z.coerce.number().positive(),
});

const createSchema = z.object({
  code: z.string().trim().regex(/^[A-Z]{2,4}\.[A-Z0-9]{2,8}$/, "Mã ĐM: 2-4 chữ + dấu chấm + 2-8 ký tự (VD: BT.1140)").max(32),
  name: z.string().trim().min(1, "Tên ĐM bắt buộc").max(255),
  unit: z.string().trim().min(1, "Đơn vị bắt buộc").max(20),
  category: z.enum(NORM_CATEGORIES).optional().nullable(),
  source: z.string().trim().max(255).optional().nullable(),
  materialItems: z.array(materialItemSchema).max(50).optional(),
  laborItems: z.array(laborItemSchema).max(50).optional(),
  machineItems: z.array(machineItemSchema).max(50).optional(),
  kMaterial: z.coerce.number().min(0).max(10).optional(),
  kLabor: z.coerce.number().min(0).max(10).optional(),
  kMachine: z.coerce.number().min(0).max(10).optional(),
});

type NormSerialized = {
  code: string;
  name: string;
  unit: string;
  category: string | null;
  materialItems: unknown;
  laborItems: unknown;
  machineItems: unknown;
  kMaterial: number;
  kLabor: number;
  kMachine: number;
  source: string | null;
  note: string | null;
  usageCount: number;
};

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canViewBudget({ id: user.id, role: user.role })) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const category = url.searchParams.get("category")?.trim() ?? "";
  const includeUsage = url.searchParams.get("usage") === "1";
  const projectId = url.searchParams.get("projectId") ?? null;

  const where: Prisma.NormWhereInput = {
    retiredAt: null,
    ...(category ? { category } : {}),
    ...(q
      ? {
          OR: [
            { code: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const norms = await prisma.norm.findMany({
    where,
    orderBy: [{ category: "asc" }, { code: "asc" }],
  });

  let usageByCode = new Map<string, number>();
  if (includeUsage) {
    const grouped = await prisma.projectBudgetItem.groupBy({
      by: ["normCode"],
      _count: { _all: true },
      where: {
        normCode: { not: null },
        ...(projectId ? { budget: { projectId } } : {}),
      },
    });
    usageByCode = new Map(grouped.map((g) => [g.normCode as string, g._count._all]));
  }

  const categories = await prisma.norm.findMany({
    where: { retiredAt: null, category: { not: null } },
    select: { category: true },
    distinct: ["category"],
    orderBy: { category: "asc" },
  });

  const data: NormSerialized[] = norms.map((n) => ({
    code: n.code,
    name: n.name,
    unit: n.unit,
    category: n.category,
    materialItems: n.materialItems,
    laborItems: n.laborItems,
    machineItems: n.machineItems,
    kMaterial: Number(n.kMaterial),
    kLabor: Number(n.kLabor),
    kMachine: Number(n.kMachine),
    source: n.source,
    note: n.note,
    usageCount: usageByCode.get(n.code) ?? 0,
  }));

  return NextResponse.json({
    norms: data,
    categories: categories.map((c) => c.category).filter((c): c is string => c != null),
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canEditBudget({ id: user.id, role: user.role })) {
    return NextResponse.json({ message: "Chỉ TPTC/admin được tạo ĐM" }, { status: 403 });
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const body = parsed.data;

  const exists = await prisma.norm.findUnique({ where: { code: body.code } });
  if (exists) {
    return NextResponse.json({ message: `Mã ĐM "${body.code}" đã tồn tại` }, { status: 409 });
  }

  const norm = await prisma.norm.create({
    data: {
      code: body.code,
      name: body.name,
      unit: body.unit,
      category: body.category ?? null,
      source: body.source?.trim() ? body.source.trim() : null,
      materialItems: body.materialItems ?? [],
      laborItems: body.laborItems ?? [],
      machineItems: body.machineItems ?? [],
      ...(body.kMaterial !== undefined ? { kMaterial: new Prisma.Decimal(body.kMaterial) } : {}),
      ...(body.kLabor !== undefined ? { kLabor: new Prisma.Decimal(body.kLabor) } : {}),
      ...(body.kMachine !== undefined ? { kMachine: new Prisma.Decimal(body.kMachine) } : {}),
    },
  });

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
      usageCount: 0,
    },
  });
}
