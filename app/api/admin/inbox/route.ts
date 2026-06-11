import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const items = await prisma.inboxItem.findMany({
    where: { status: "open" },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const content = (body?.content || "").toString().trim();
  if (!content) return NextResponse.json({ message: "Nội dung rỗng" }, { status: 400 });
  if (content.length > 500) return NextResponse.json({ message: "Quá 500 ký tự" }, { status: 400 });
  const item = await prisma.inboxItem.create({
    data: { content, source: "manual" },
  });
  return NextResponse.json({ item }, { status: 201 });
}
