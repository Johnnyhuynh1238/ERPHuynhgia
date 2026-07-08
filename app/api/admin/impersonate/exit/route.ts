import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getRealSessionUser } from "@/lib/auth-helpers";
import { IMPERSONATE_COOKIE, readImpersonationTarget } from "@/lib/impersonation";

export const dynamic = "force-dynamic";

// Thoát đóng vai: xoá cookie + ghi audit, redirect về trang chủ.
export async function POST(request: Request) {
  const admin = await getRealSessionUser();
  const targetId = readImpersonationTarget();

  cookies().delete(IMPERSONATE_COOKIE);

  if (admin?.id && admin.role === UserRole.admin && targetId) {
    const target = await prisma.user.findUnique({
      where: { id: targetId },
      select: { fullName: true, email: true },
    });
    await prisma.adminAuditLog.create({
      data: {
        actorId: admin.id,
        entity: "user",
        entityId: targetId,
        action: "impersonate_stop",
        summary: `Admin ${admin.name ?? admin.email} thoát đóng vai ${target?.fullName ?? targetId}`,
      },
    });
  }

  return NextResponse.redirect(new URL("/", request.url));
}
