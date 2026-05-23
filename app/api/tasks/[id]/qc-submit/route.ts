import { NextResponse } from "next/server";
import { QcItemStatus, TaskStatus, UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { getTaskWithAccess } from "@/lib/task-permissions";
import { logProjectActivity } from "@/lib/project-activity-log";
import { closeQcChecklistAssignment } from "@/lib/reports-v3";

const submitSchema = z.object({
  overallComment: z.string().trim().min(1, "Nhận xét tổng thể là bắt buộc"),
  issueNote: z.string().optional(),
  suggestion: z.string().optional(),
});

function canSubmitQc(role: string) {
  return role === UserRole.engineer || role === UserRole.admin;
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  const { task, allowed } = await getTaskWithAccess(params.id, { id: user.id, role: user.role });
  if (!task) return NextResponse.json({ message: "Không tìm thấy task" }, { status: 404 });
  if (!allowed) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  if (!canSubmitQc(user.role)) {
    return NextResponse.json({ message: "Không có quyền gửi báo cáo QC" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const items = await prisma.qcItem.findMany({
    where: { taskId: params.id },
    include: { progress: true },
    orderBy: { orderIndex: "asc" },
  });

  if (items.length === 0) {
    return NextResponse.json({ message: "Task chưa có mục QC" }, { status: 400 });
  }

  const unchecked = items.filter((item) => !item.progress || item.progress.status === QcItemStatus.unchecked);
  if (unchecked.length > 0) {
    return NextResponse.json(
      {
        message: "QC chưa đạt 100%",
        uncheckedItems: unchecked.map((item) => ({ id: item.id, content: item.content })),
      },
      { status: 400 },
    );
  }

  const summaryText = [
    `[QC_SUBMIT] ${parsed.data.overallComment.trim()}`,
    parsed.data.issueNote?.trim() ? `[QC_ISSUE] ${parsed.data.issueNote.trim()}` : null,
    parsed.data.suggestion?.trim() ? `[QC_SUGGESTION] ${parsed.data.suggestion.trim()}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const updatedTask = await prisma.task.update({
    where: { id: params.id },
    data: {
      status: TaskStatus.done,
      notes: [task.notes || "", summaryText].filter(Boolean).join("\n"),
    },
  });

  await prisma.qcLog.create({
    data: {
      taskId: params.id,
      qcItemId: null,
      action: "note_updated",
      note: `KS gửi báo cáo QC lên TPTC: ${parsed.data.overallComment.trim()}`,
      performedBy: user.id,
    },
  });

  const meta = await prisma.task.findUnique({ where: { id: params.id }, select: { code: true, name: true } });
  await logProjectActivity(prisma, {
    projectId: task.projectId,
    actorId: user.id,
    entity: "task",
    entityId: params.id,
    action: "qc_submit",
    summary: `Gửi báo cáo QC task ${meta?.code} "${meta?.name}"`,
    metadata: {
      taskId: params.id,
      itemCount: items.length,
      overallComment: parsed.data.overallComment.trim(),
      issueNote: parsed.data.issueNote?.trim() || null,
      suggestion: parsed.data.suggestion?.trim() || null,
    },
  });

  await closeQcChecklistAssignment(params.id);

  return NextResponse.json({ task: updatedTask, message: "Đã gửi báo cáo QC lên TPTC" });
}
