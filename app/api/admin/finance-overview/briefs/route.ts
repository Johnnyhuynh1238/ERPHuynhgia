import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Các bản nhận định tài chính gần nhất (AI ghi thẳng DB khi anh hỏi cập nhật tình hình).
export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const rows = await prisma.financeBrief.findMany({ orderBy: { createdAt: "desc" }, take: 12 });
  return NextResponse.json(
    rows.map((r) => ({ id: r.id, asOf: r.asOf.toISOString().slice(0, 10), headline: r.headline, items: r.items, createdAt: r.createdAt.toISOString() })),
  );
}
