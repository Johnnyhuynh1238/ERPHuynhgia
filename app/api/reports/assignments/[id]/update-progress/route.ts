import { DailyAssignmentType, TaskActivityType, TaskLogType, TaskStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireEngineerForTodayAssignment } from "../../_helpers";

const photoUrlSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => value.startsWith("/") || /^https?:\/\//.test(value), "Ảnh tiến độ không hợp lệ");

const bodySchema = z.object({
  newPercent: z.number().int().min(0).max(100),
  photoUrl: photoUrlSchema.optional(),
  photoUrls: z.array(photoUrlSchema).optional(),
  note: z.string().trim().optional().nullable(),
  reason: z.string().trim().optional().nullable(),
});

const LOCKED_STATUSES = new Set<TaskStatus>([TaskStatus.done, TaskStatus.internal_approved, TaskStatus.completed]);

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireEngineerForTodayAssignment(params.id);
  if ("error" in auth) return auth.error;

  if (auth.assignment.type !== DailyAssignmentType.progress_update) {
    return NextResponse.json({ message: "Chỉ áp dụng cho nhiệm vụ cập nhật tiến độ" }, { status: 400 });
  }

  if (!auth.assignment.taskId || !auth.assignment.task) {
    return NextResponse.json({ message: "Không tìm thấy task cho nhiệm vụ này" }, { status: 400 });
  }

  if (LOCKED_STATUSES.has(auth.assignment.task.status)) {
    return NextResponse.json({ message: "Task đã hoàn tất, không thể cập nhật tiến độ" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const photoUrls = Array.from(new Set([...(parsed.data.photoUrls || []), parsed.data.photoUrl].filter((value): value is string => Boolean(value))));
  const primaryPhotoUrl = photoUrls[0];

  if (!primaryPhotoUrl) {
    return NextResponse.json({ message: "Cập nhật tiến độ bắt buộc có ảnh minh chứng" }, { status: 400 });
  }

  const reason = String(parsed.data.reason || "").trim();
  const note = String(parsed.data.note || "").trim();

  if (parsed.data.newPercent < auth.assignment.task.progressPercent && !reason) {
    return NextResponse.json({ message: "Giảm tiến độ bắt buộc nhập lý do" }, { status: 400 });
  }

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.task.update({
      where: { id: auth.assignment.taskId! },
      data: {
        progressPercent: parsed.data.newPercent,
        progressUpdatedAt: now,
      },
    });

    await tx.taskProgressHistory.create({
      data: {
        taskId: auth.assignment.taskId!,
        userId: auth.user.id,
        fromPercent: auth.assignment.task!.progressPercent,
        toPercent: parsed.data.newPercent,
        photoUrl: primaryPhotoUrl,
        reason: reason || null,
        note: note || null,
      },
    });

    await tx.taskActivityLog.create({
      data: {
        taskId: auth.assignment.taskId!,
        userId: auth.user.id,
        type: TaskActivityType.progress_updated,
        fromValue: String(auth.assignment.task!.progressPercent),
        toValue: String(parsed.data.newPercent),
        metadata: {
          photoUrl: primaryPhotoUrl,
          photoUrls,
          reason: reason || null,
          note: note || null,
        },
        description: `Cập nhật tiến độ ${auth.assignment.task!.progressPercent}% -> ${parsed.data.newPercent}%`,
      },
    });

    await tx.taskLog.create({
      data: {
        taskId: auth.assignment.taskId!,
        userId: auth.user.id,
        logType: TaskLogType.note,
        oldValue: String(auth.assignment.task!.progressPercent),
        newValue: String(parsed.data.newPercent),
        content: `PROGRESS_UPDATE: ${auth.assignment.task!.progressPercent}% -> ${parsed.data.newPercent}%`,
      },
    });

    await tx.taskDailyAssignment.update({
      where: { id: auth.assignment.id },
      data: {
        status: "done",
        photoUrl: primaryPhotoUrl,
        note: note || null,
        doneAt: now,
      },
    });
  });

  return NextResponse.json({
    message: "Đã cập nhật tiến độ",
    progress: {
      from: auth.assignment.task.progressPercent,
      to: parsed.data.newPercent,
      updatedAt: now,
      photoUrls,
    },
  });
}
