import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const status = body?.status === "done" ? "done" : null;
  if (!status) return NextResponse.json({ message: "Chỉ hỗ trợ status=done" }, { status: 400 });
  const convertedTo = body?.convertedTo ? String(body.convertedTo).slice(0, 200) : null;
  const item = await prisma.inboxItem.update({
    where: { id },
    data: {
      status: "done",
      processedAt: new Date(),
      processedBy: user.id,
      convertedTo: convertedTo ?? undefined,
    },
  });
  return NextResponse.json({ item });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const { id } = await params;
  await prisma.inboxItem.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
