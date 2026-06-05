import { DailyAssignmentType, DailyAssignmentStatus, AssignmentPriority } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Trả về danh sách nhiệm vụ chấm công thợ đã được seed cho ngày `reportDate`
 * (cron seed sáng từ 0h, chiều từ 13h). Status `done` khi đã có WorkerAttendance
 * lưu cho (project, date, session) bởi chính KS đó.
 */
export async function buildWorkerAttendanceAssignments(args: {
  ksUserId: string;
  reportDate: Date;
  now: Date;
}) {
  const { ksUserId, reportDate } = args;

  const rows = await prisma.taskDailyAssignment.findMany({
    where: {
      ksUserId,
      reportDate,
      type: { in: [DailyAssignmentType.worker_attendance_morning, DailyAssignmentType.worker_attendance_afternoon] },
      project: { status: { not: "completed" } },
    },
    select: {
      id: true,
      type: true,
      title: true,
      priority: true,
      requirePhoto: true,
      guideContent: true,
      photoUrl: true,
      note: true,
      doneAt: true,
      projectId: true,
      project: { select: { id: true, code: true, name: true } },
    },
    orderBy: [{ project: { code: "asc" } }, { type: "asc" }],
  });

  if (!rows.length) return [];

  const projectIds = Array.from(new Set(rows.map((r) => r.projectId).filter((v): v is string => Boolean(v))));
  const savedSessions = await prisma.workerAttendance.findMany({
    where: { projectId: { in: projectIds }, date: reportDate, markedById: ksUserId },
    select: { projectId: true, session: true },
  });
  const doneKey = new Set(savedSessions.map((s) => `${s.projectId}:${s.session}`));

  return rows
    .filter((r) => r.project)
    .map((r) => {
      const session: "morning" | "afternoon" =
        r.type === DailyAssignmentType.worker_attendance_morning ? "morning" : "afternoon";
      const project = r.project!;
      return {
        id: `worker-attendance-${project.id}-${session}`,
        type: r.type,
        title: r.title,
        status: doneKey.has(`${project.id}:${session}`) ? DailyAssignmentStatus.done : DailyAssignmentStatus.pending,
        priority: r.priority ?? AssignmentPriority.important,
        requirePhoto: r.requirePhoto,
        guideContent: r.guideContent,
        photoUrl: r.photoUrl,
        note: r.note,
        doneAt: r.doneAt,
        dueAt: null as Date | null,
        projectId: project.id,
        projectName: `${project.code} · ${project.name}`,
        workerAttendanceSession: session,
      };
    });
}
