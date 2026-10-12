import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { overheadSchema } from "./schema";

export const dynamic = "force-dynamic";

// Thêm 1 khoản chi phí chung hàng tháng.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const parsed = overheadSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  const last = await prisma.companyOverheadItem.aggregate({ _max: { sortOrder: true } });
  const item = await prisma.companyOverheadItem.create({
    data: { ...parsed.data, note: parsed.data.note || null, sortOrder: (last._max.sortOrder ?? 0) + 10 },
  });
  return NextResponse.json({ id: item.id });
}
