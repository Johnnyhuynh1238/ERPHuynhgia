import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { canReport } from "@/lib/task-centric";
import { prisma } from "@/lib/prisma";
import { buildDiff, joinSummary, logProjectActivity } from "@/lib/project-activity-log";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user?.id || !user.role) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    const task = await prisma.task.findUnique({
      where: { id: params.id },
      select: { id: true, projectId: true, code: true, name: true, technicalRequirements: true, constructionMethod: true },
    });
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

    const { diff, lines } = buildDiff(task as any, updated as any, [
      ["technicalRequirements", "Yêu cầu kỹ thuật"],
      ["constructionMethod", "Phương pháp thi công"],
    ]);
    if (lines.length > 0) {
      await logProjectActivity(prisma, {
        projectId: task.projectId,
        actorId: user.id,
        entity: "task",
        entityId: task.id,
        action: "update_technical",
        summary: joinSummary(`Sửa hồ sơ kỹ thuật task ${task.code} "${task.name}"`, lines, "Sửa hồ sơ kỹ thuật task"),
        diff,
      });
    }

    return NextResponse.json({ task: updated });
  } catch {
    return NextResponse.json({ message: "Failed" }, { status: 500 });
  }
}
