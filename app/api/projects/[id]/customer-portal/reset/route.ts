import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser, requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { logProjectActivity } from "@/lib/project-activity-log";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  let actor;
  try {
    await requireRole(["admin", "construction_manager"]);
    actor = await getCurrentUser();
  } catch (error) {
    const msg = error instanceof Error ? error.message : "UNKNOWN";
    if (msg === "401_UNAUTHORIZED") return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
    if (msg === "403_FORBIDDEN") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    return NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
  }

  const token = randomUUID();
  const project = await prisma.project.update({
    where: { id: params.id },
    data: { customerPortalToken: token },
    select: { id: true, customerPortalToken: true },
  });

  const sessions = await prisma.customerSession.deleteMany({ where: { projectId: params.id } });
  const attempts = await prisma.customerLoginAttempt.deleteMany({ where: { projectId: params.id } });

  if (actor?.id) {
    await logProjectActivity(prisma, {
      projectId: params.id,
      actorId: actor.id,
      entity: "customer_portal",
      entityId: params.id,
      action: "reset_token",
      summary: `Reset link cổng chủ nhà (huỷ ${sessions.count} session, xoá ${attempts.count} login attempt)`,
      metadata: { clearedSessions: sessions.count, clearedAttempts: attempts.count },
    });
  }

  return NextResponse.json({ project, message: "Đã reset link chủ nhà" });
}
