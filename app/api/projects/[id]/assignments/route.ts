import { NextResponse } from "next/server";
import { ProjectRoleType } from "@prisma/client";
import { getCurrentUser, requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { logProjectActivity } from "@/lib/project-activity-log";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user?.id) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const [hasAssignment, assignments] = await Promise.all([
      prisma.projectMemberAssignment.findFirst({ where: { projectId: params.id, userId: user.id }, select: { id: true } }),
      prisma.projectMemberAssignment.findMany({
        where: { projectId: params.id },
        include: { user: { select: { id: true, fullName: true, email: true } } },
        orderBy: [{ role: "asc" }, { assignedAt: "desc" }],
      }),
    ]);
    if (!hasAssignment && user.role !== "admin") return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    return NextResponse.json({ assignments });
  } catch (e) {
    return NextResponse.json({ message: "Failed" }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await requireRole(["admin"]);
    const body = await req.json();
    const role = body.role as ProjectRoleType;
    if (!body.userId || !role) return NextResponse.json({ message: "Invalid payload" }, { status: 400 });

    const assignment = await prisma.projectMemberAssignment.create({
      data: {
        projectId: params.id,
        userId: body.userId,
        role,
        isPrimary: Boolean(body.isPrimary),
        assignedBy: actor.id,
      },
      include: { user: { select: { id: true, fullName: true } } },
    });

    await logProjectActivity(prisma, {
      projectId: params.id,
      actorId: actor.id,
      entity: "project_member",
      entityId: assignment.id,
      action: "create",
      summary: `Phân công ${assignment.user.fullName} làm ${role}${assignment.isPrimary ? " (chính)" : ""}`,
      metadata: { userId: body.userId, role, isPrimary: Boolean(body.isPrimary) },
    });

    return NextResponse.json({ assignment });
  } catch (e: any) {
    return NextResponse.json({ message: e.message || "Failed" }, { status: 500 });
  }
}
