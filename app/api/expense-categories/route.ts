import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

const ROLES_VIEW = new Set<string>([UserRole.admin, UserRole.accountant]);

const createSchema = z.object({
  code: z.string().trim().min(1).max(40).regex(/^[A-Z0-9_-]+$/i, "Code chỉ chứa A-Z, 0-9, _ -"),
  name: z.string().trim().min(1).max(120),
  scope: z.enum(["project", "company"]).nullable().optional(),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!ROLES_VIEW.has(user.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const rows = await prisma.expenseCategory.findMany({
    orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
  return NextResponse.json({ rows });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== UserRole.admin) {
    return NextResponse.json({ message: "Chỉ admin được quản lý danh mục chi" }, { status: 403 });
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  try {
    const row = await prisma.expenseCategory.create({
      data: {
        code: parsed.data.code.toUpperCase(),
        name: parsed.data.name,
        scope: parsed.data.scope ?? null,
        sortOrder: parsed.data.sortOrder,
      },
    });
    return NextResponse.json({ category: row });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unique")) {
      return NextResponse.json({ message: "Code danh mục đã tồn tại" }, { status: 400 });
    }
    throw err;
  }
}
