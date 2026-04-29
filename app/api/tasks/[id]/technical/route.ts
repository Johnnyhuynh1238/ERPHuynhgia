import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { canReport } from "@/lib/task-centric";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user?.id || !user.role) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    const task = await prisma.task.findUnique({ where: { id: params.id }, select: { id: true, projectId: true } });
    if (!task) return NextResponse.json({ message: "Task not found" }, { status: 404 });

    const allowed = await canReport(user.id, user.role as any, task.projectId, "technical");
    if (!allowed) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const updated = await prisma.task.update({
      where: { id: params.id },
      data: {
        technicalRequirements: body.technicalRequirements ?? undefined,
        constructionMethod: body.constructionMethod ?? undefined,
      },
    });
    return NextResponse.json({ task: updated });
  } catch {
    return NextResponse.json({ message: "Failed" }, { status: 500 });
  }
}
