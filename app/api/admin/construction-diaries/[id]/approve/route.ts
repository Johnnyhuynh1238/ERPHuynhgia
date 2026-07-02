import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  let user;
  try {
    user = await requireRole(["admin"]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unauthorized";
    return NextResponse.json({ message: msg }, { status: msg === "403_FORBIDDEN" ? 403 : 401 });
  }

  const diary = await prisma.constructionDiary.findUnique({
    where: { id: params.id },
    select: { id: true, savedAt: true, approvedAt: true },
  });
  if (!diary) return NextResponse.json({ message: "Không tìm thấy nhật ký" }, { status: 404 });
  if (!diary.savedAt) {
    return NextResponse.json({ message: "Nhật ký chưa chốt, không duyệt được" }, { status: 400 });
  }
  if (diary.approvedAt) {
    return NextResponse.json({ message: "Đã duyệt trước đó" }, { status: 400 });
  }

  const updated = await prisma.constructionDiary.update({
    where: { id: params.id },
    data: { approvedAt: new Date(), approvedById: user.id },
    select: {
      id: true,
      approvedAt: true,
      approvedBy: { select: { id: true, fullName: true } },
    },
  });

  return NextResponse.json({
    ok: true,
    approvedAt: updated.approvedAt?.toISOString() ?? null,
    approvedByName: updated.approvedBy?.fullName ?? null,
  });
}
