import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getPortalExpiry } from "@/lib/customer-portal";

export async function POST(request: Request) {
  const providedKey = request.headers.get("x-cron-key") || "";
  const cronKey = process.env.CUSTOMER_PORTAL_CRON_KEY || "";

  if (cronKey && providedKey === cronKey) {
    // allow cron secret
  } else {
    try {
      await requireRole(["admin", "construction_manager"]);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "UNKNOWN";
      if (msg === "401_UNAUTHORIZED") return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
      if (msg === "403_FORBIDDEN") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
      return NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
    }
  }

  const projects = await prisma.project.findMany({
    where: { customerPortalEnabled: true, actualEndDate: { not: null } },
    select: { id: true, actualEndDate: true },
  });

  const now = new Date();
  const expiredIds = projects
    .filter((p) => {
      const expiry = getPortalExpiry(p.actualEndDate);
      return expiry && now > expiry;
    })
    .map((p) => p.id);

  if (expiredIds.length === 0) {
    return NextResponse.json({ updated: 0 });
  }

  const result = await prisma.project.updateMany({
    where: { id: { in: expiredIds } },
    data: { customerPortalEnabled: false },
  });

  await prisma.customerSession.deleteMany({ where: { projectId: { in: expiredIds } } });

  return NextResponse.json({ updated: result.count });
}
