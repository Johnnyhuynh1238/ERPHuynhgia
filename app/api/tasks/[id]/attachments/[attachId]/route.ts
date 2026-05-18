import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { canReport } from "@/lib/task-centric";
import { prisma } from "@/lib/prisma";
import { logProjectActivity } from "@/lib/project-activity-log";

export async function DELETE(_: Request, { params }: { params: { id: string; attachId: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user?.id || !user.role) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    const row = await prisma.taskTechnicalAttachment.findUnique({
      where: { id: params.attachId },
      include: { task: { select: { projectId: true, code: true, name: true } } },
    });
    if (!row || row.taskId !== params.id) return NextResponse.json({ message: "Not found" }, { status: 404 });

    const allowed = row.uploadedBy === user.id || (await canReport(user.id, user.role as any, row.task.projectId, "technical"));
    if (!allowed) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    await prisma.taskTechnicalAttachment.delete({ where: { id: params.attachId } });

    await logProjectActivity(prisma, {
      projectId: row.task.projectId,
      actorId: user.id,
      entity: "task_attachment",
      entityId: row.id,
      action: "delete",
      summary: `Xóa tài liệu kỹ thuật "${row.fileName}" khỏi task ${row.task.code} "${row.task.name}"`,
      snapshot: {
        taskId: params.id,
        fileName: row.fileName,
        fileUrl: row.fileUrl,
        fileType: row.fileType,
        fileSize: row.fileSize,
        type: row.type,
        description: row.description,
        uploadedBy: row.uploadedBy,
      },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ message: "Failed" }, { status: 500 });
  }
}
