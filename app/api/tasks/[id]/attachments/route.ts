import { NextResponse } from "next/server";
import { TechnicalAttachmentType } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { canReport } from "@/lib/task-centric";
import { prisma } from "@/lib/prisma";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const rows = await prisma.taskTechnicalAttachment.findMany({ where: { taskId: params.id }, orderBy: { uploadedAt: "desc" } });
  return NextResponse.json({ attachments: rows });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user?.id || !user.role) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    const task = await prisma.task.findUnique({ where: { id: params.id }, select: { projectId: true } });
    if (!task) return NextResponse.json({ message: "Task not found" }, { status: 404 });
    const allowed = await canReport(user.id, user.role as any, task.projectId, "technical");
    if (!allowed) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const attachment = await prisma.taskTechnicalAttachment.create({
      data: {
        taskId: params.id,
        fileName: body.fileName,
        fileUrl: body.fileUrl,
        fileType: body.fileType,
        fileSize: Number(body.fileSize || 0),
        type: (body.type as TechnicalAttachmentType) || TechnicalAttachmentType.drawing,
        description: body.description || null,
        uploadedBy: user.id,
      },
    });

    return NextResponse.json({ attachment });
  } catch {
    return NextResponse.json({ message: "Failed" }, { status: 500 });
  }
}
