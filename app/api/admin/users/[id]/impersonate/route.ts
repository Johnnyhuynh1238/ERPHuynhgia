import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getRealSessionUser } from "@/lib/auth-helpers";
import { buildImpersonationCookieValue, IMPERSONATE_COOKIE, IMPERSONATE_TTL_MS } from "@/lib/impersonation";

export const dynamic = "force-dynamic";

// Admin bắt đầu đóng vai user (hỗ trợ / xem UI). Cookie hết hạn 60 phút.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const admin = await getRealSessionUser();
  if (!admin?.id || admin.role !== UserRole.admin) {
    return NextResponse.json({ message: "Chỉ admin được đóng vai" }, { status: 403 });
  }

  const target = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, email: true, fullName: true, role: true, isActive: true },
  });
  if (!target) return NextResponse.json({ message: "User không tồn tại" }, { status: 404 });
  if (!target.isActive) return NextResponse.json({ message: "User đã bị vô hiệu hoá" }, { status: 400 });
  if (target.role === UserRole.admin) {
    return NextResponse.json({ message: "Không đóng vai admin khác" }, { status: 400 });
  }

  cookies().set(IMPERSONATE_COOKIE, buildImpersonationCookieValue(target.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(IMPERSONATE_TTL_MS / 1000),
  });

  await prisma.adminAuditLog.create({
    data: {
      actorId: admin.id,
      entity: "user",
      entityId: target.id,
      action: "impersonate_start",
      summary: `Admin ${admin.name ?? admin.email} đóng vai ${target.fullName} (${target.email})`,
      metadata: { targetRole: target.role },
    },
  });

  return NextResponse.json({ ok: true, message: `Đang đóng vai ${target.fullName}` });
}
