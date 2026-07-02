import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    await requireRole(["admin"]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unauthorized";
    return NextResponse.json({ message: msg }, { status: msg === "403_FORBIDDEN" ? 403 : 401 });
  }

  const diary = await prisma.constructionDiary.findUnique({
    where: { id: params.id },
    select: { id: true, approvedAt: true },
  });
  if (!diary) return NextResponse.json({ message: "Không tìm thấy nhật ký" }, { status: 404 });
  if (!diary.approvedAt) {
    return NextResponse.json({ message: "Chưa duyệt, không cần bỏ duyệt" }, { status: 400 });
  }

  await prisma.constructionDiary.update({
    where: { id: params.id },
    data: { approvedAt: null, approvedById: null },
  });

  return NextResponse.json({ ok: true });
}
