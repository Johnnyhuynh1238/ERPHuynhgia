import { NextResponse } from "next/server";
import { ProjectRoleType } from "@prisma/client";
import { getCurrentUser, requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user?.id) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const [member, assignments] = await Promise.all([
      prisma.projectMember.findFirst({ where: { projectId: params.id, userId: user.id } }),
      prisma.projectMemberAssignment.findMany({
        where: { projectId: params.id },
        include: { user: { select: { id: true, fullName: true, email: true } } },
        orderBy: [{ role: "asc" }, { assignedAt: "desc" }],
      }),
    ]);
    if (!member && user.role !== "admin") return NextResponse.json({ message: "Forbidden" }, { status: 403 });

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
    });
    return NextResponse.json({ assignment });
  } catch (e: any) {
    return NextResponse.json({ message: e.message || "Failed" }, { status: 500 });
  }
}
