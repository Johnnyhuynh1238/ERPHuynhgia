import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { applyOverdueStatus } from "@/lib/task-status-auto";

function isInternalJobAllowed(request: Request, userRole: string | null | undefined) {
  if (userRole === UserRole.admin || userRole === UserRole.construction_manager) {
    return true;
  }

  const expectedSecret = process.env.INTERNAL_JOB_SECRET;
  if (!expectedSecret) return false;

  const providedSecret = request.headers.get("x-internal-job-secret");
  return Boolean(providedSecret && providedSecret === expectedSecret);
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!isInternalJobAllowed(request, user?.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const now = new Date();
  const actorUserId = user?.id || undefined;
  const result = await applyOverdueStatus(now, { actorUserId });

  return NextResponse.json({
    executedAt: now.toISOString(),
    scanned: result.scanned,
    changed: result.changed,
  });
}
