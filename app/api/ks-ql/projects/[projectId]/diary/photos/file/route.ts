import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { diaryPhoto } from "@/lib/ks-diary";

export const runtime = "nodejs";

const VIEWER_ROLES = new Set<string>([
  UserRole.engineer,
  UserRole.construction_manager,
  UserRole.admin,
]);

export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string } },
) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role)
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  if (!VIEWER_ROLES.has(user.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  // KS chỉ xem ảnh của project mình; CM/admin xem hết.
  if (user.role === UserRole.engineer) {
    const allowed = await prisma.project.findFirst({
      where: {
        id: params.projectId,
        memberAssignments: { some: { userId: user.id, role: "pm_engineer" } },
      },
      select: { id: true },
    });
    if (!allowed) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  return diaryPhoto(req, params.projectId);
}
