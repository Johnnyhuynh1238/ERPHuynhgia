import { DailyAssignmentType, DailyAssignmentStatus, AssignmentPriority } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Sinh "virtual" nhiệm vụ chấm công thợ cho mỗi dự án KS là thành viên.
 * Sáng: luôn hiện. Chiều: chỉ hiện sau 13:00 (giờ VN).
 * Status `done` khi đã có WorkerAttendance lưu cho (project, date, session).
 */
export async function buildWorkerAttendanceAssignments(args: {
  ksUserId: string;
  reportDate: Date;
  now: Date;
}) {
  const { ksUserId, reportDate, now } = args;

  const projects = await prisma.project.findMany({
    where: {
      memberAssignments: {
        some: { userId: ksUserId },
      },
      status: { not: "completed" },
    },
    select: { id: true, code: true, name: true },
  });

  if (!projects.length) return [];

  const projectIds = projects.map((p) => p.id);
  const savedSessions = await prisma.workerAttendance.findMany({
    where: {
      projectId: { in: projectIds },
      date: reportDate,
      markedById: ksUserId,
    },
    select: { projectId: true, session: true },
  });

  const doneKey = new Set(savedSessions.map((s) => `${s.projectId}:${s.session}`));

  const hourVn = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour: "2-digit",
      hour12: false,
    }).format(now),
  );
  const showAfternoon = hourVn >= 13;

  const items: Array<{
    id: string;
    type: DailyAssignmentType;
    title: string;
    status: DailyAssignmentStatus;
    priority: AssignmentPriority;
    requirePhoto: boolean;
    guideContent: string | null;
    photoUrl: string | null;
    note: string | null;
    doneAt: Date | null;
    dueAt: Date | null;
    projectId: string;
    projectName: string;
    workerAttendanceSession: "morning" | "afternoon";
  }> = [];

  for (const p of projects) {
    const projectLabel = `${p.code} · ${p.name}`;
    items.push({
      id: `worker-attendance-${p.id}-morning`,
      type: DailyAssignmentType.worker_attendance_morning,
      title: `Chấm công thợ buổi sáng — ${p.name}`,
      status: doneKey.has(`${p.id}:morning`) ? DailyAssignmentStatus.done : DailyAssignmentStatus.pending,
      priority: AssignmentPriority.important,
      requirePhoto: false,
      guideContent: null,
      photoUrl: null,
      note: null,
      doneAt: null,
      dueAt: null,
      projectId: p.id,
      projectName: projectLabel,
      workerAttendanceSession: "morning",
    });

    if (showAfternoon) {
      items.push({
        id: `worker-attendance-${p.id}-afternoon`,
        type: DailyAssignmentType.worker_attendance_afternoon,
        title: `Chấm công thợ buổi chiều — ${p.name}`,
        status: doneKey.has(`${p.id}:afternoon`) ? DailyAssignmentStatus.done : DailyAssignmentStatus.pending,
        priority: AssignmentPriority.important,
        requirePhoto: false,
        guideContent: null,
        photoUrl: null,
        note: null,
        doneAt: null,
        dueAt: null,
        projectId: p.id,
        projectName: projectLabel,
        workerAttendanceSession: "afternoon",
      });
    }
  }

  return items;
}
