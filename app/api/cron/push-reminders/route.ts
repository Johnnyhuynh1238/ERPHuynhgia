import { NextResponse } from "next/server";
import { AssignmentPriority, DailyAssignmentType, Prisma, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push-server";
import { getTodayDateVn } from "@/lib/task-centric";
import { isDefaultRestDay } from "@/lib/reporting";

type Stage = "r30" | "r15" | "overdue";

function stageForMinutes(minutesToDeadline: number): Stage | null {
  if (minutesToDeadline >= 29.5 && minutesToDeadline <= 30.5) return "r30";
  if (minutesToDeadline >= 14.5 && minutesToDeadline <= 15.5) return "r15";
  if (minutesToDeadline >= -1 && minutesToDeadline <= 0) return "overdue";
  return null;
}

async function tryDedupAndSend(args: {
  userId: string;
  refType: string;
  refId: string;
  stage: Stage;
  title: string;
  body?: string;
  url: string;
  tag?: string;
}) {
  try {
    await prisma.pushSendLog.create({
      data: { userId: args.userId, refType: args.refType, refId: args.refId, stage: args.stage },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return { sent: 0, dedup: true };
    }
    throw err;
  }
  const res = await sendPushToUser(args.userId, {
    title: args.title,
    body: args.body,
    url: args.url,
    tag: args.tag,
    requireInteraction: args.stage === "overdue",
  });
  return { sent: res.sent, dedup: false };
}

export async function POST(request: Request) {
  const key = request.headers.get("x-cron-key");
  if (!key || key !== process.env.PUSH_CRON_KEY) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const today = getTodayDateVn();
  const refDateStr = today.toISOString().slice(0, 10);

  const results = {
    morning: { fired: 0, dedup: 0 },
    tptc: { fired: 0, dedup: 0 },
    eod: { fired: 0, dedup: 0 },
    worker_attendance_pm: { fired: 0, dedup: 0 },
  };

  const isSundayDefaultRest = isDefaultRestDay(today);

  // 1) Morning check-in deadline: 08:00 VN = 01:00 UTC of reportDate.
  // Chủ Nhật mặc định công trường nghỉ → bỏ qua push check-in sáng.
  if (!isSundayDefaultRest) {
    const deadline = new Date(today);
    deadline.setUTCHours(1, 0, 0, 0);
    const minutes = (deadline.getTime() - now.getTime()) / 60000;
    const stage = stageForMinutes(minutes);
    if (stage) {
      const ksUsers = await prisma.user.findMany({
        where: { role: UserRole.engineer, isActive: true },
        select: { id: true },
      });
      for (const ks of ksUsers) {
        // Morning check-in lives in MorningCheckin (created when KS picks
        // today's tasks). DailyReportSubmission is the EOD submission and
        // is irrelevant for the morning reminder.
        const checkedIn = await prisma.morningCheckin.findFirst({
          where: { userId: ks.id, reportDate: today },
          select: { id: true },
        });
        if (checkedIn) continue;
        const title =
          stage === "overdue"
            ? "⚠️ Đã quá 8:00 — chưa check-in sáng"
            : `Còn ${stage === "r30" ? "30" : "15"} phút để check-in sáng`;
        const body =
          stage === "overdue"
            ? "Hãy vào /reports để báo cáo. KS sẽ bị trừ KPI do trễ."
            : "Hạn 8:00. Vào /reports để chốt nhiệm vụ buổi sáng.";
        const r = await tryDedupAndSend({
          userId: ks.id,
          refType: "morning_checkin",
          refId: refDateStr,
          stage,
          title,
          body,
          url: "/reports",
          tag: `morning-${refDateStr}`,
        });
        if (r.dedup) results.morning.dedup += 1;
        else results.morning.fired += 1;
      }
    }
  }

  // 2) TPTC dueAt (timestamp): for each pending assignment in a ±35-minute window.
  {
    const windowStart = new Date(now.getTime() - 5 * 60000);
    const windowEnd = new Date(now.getTime() + 35 * 60000);
    const upcoming = await prisma.tptcAssignment.findMany({
      where: {
        status: "pending",
        dueAt: { gte: windowStart, lte: windowEnd },
      },
      select: { id: true, dueAt: true, title: true, assignedToUserId: true },
    });
    for (const a of upcoming) {
      const minutes = (a.dueAt.getTime() - now.getTime()) / 60000;
      const stage = stageForMinutes(minutes);
      if (!stage) continue;
      const dueLabel = new Intl.DateTimeFormat("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        hour: "2-digit",
        minute: "2-digit",
      }).format(a.dueAt);
      const title =
        stage === "overdue"
          ? `⚠️ Quá hạn: ${a.title}`
          : `Còn ${stage === "r30" ? "30" : "15"} phút: ${a.title}`;
      const body = stage === "overdue" ? `Đã qua ${dueLabel}. Vào /reports để báo cáo.` : `Hạn ${dueLabel}. Vào /reports.`;
      const r = await tryDedupAndSend({
        userId: a.assignedToUserId,
        refType: "tptc_assignment",
        refId: a.id,
        stage,
        title,
        body,
        url: "/reports",
        tag: `tptc-${a.id}`,
      });
      if (r.dedup) results.tptc.dedup += 1;
      else results.tptc.fired += 1;
    }
  }

  // 3) Task daily EOD: 17:00 VN = 10:00 UTC of reportDate. Recipients: KS still have pending TaskDailyAssignment.
  // Chủ Nhật mặc định công trường nghỉ → bỏ qua push nhắc EOD nhiệm vụ ngày.
  if (!isSundayDefaultRest) {
    const deadline = new Date(today);
    deadline.setUTCHours(10, 0, 0, 0);
    const minutes = (deadline.getTime() - now.getTime()) / 60000;
    const stage = stageForMinutes(minutes);
    if (stage) {
      const pendingByKs = await prisma.taskDailyAssignment.groupBy({
        by: ["ksUserId"],
        where: { reportDate: today, status: "pending" },
        _count: { _all: true },
      });
      for (const row of pendingByKs) {
        const remaining = row._count._all;
        const title =
          stage === "overdue"
            ? `⚠️ 17:00 — còn ${remaining} nhiệm vụ chưa hoàn thành`
            : `Còn ${stage === "r30" ? "30" : "15"} phút trước 17:00`;
        const body =
          stage === "overdue"
            ? "Vào /reports để báo cáo trễ. Sẽ bị trừ KPI."
            : `Bạn còn ${remaining} nhiệm vụ. Vào /reports để hoàn thành.`;
        const r = await tryDedupAndSend({
          userId: row.ksUserId,
          refType: "task_daily_eod",
          refId: refDateStr,
          stage,
          title,
          body,
          url: "/reports",
          tag: `eod-${refDateStr}`,
        });
        if (r.dedup) results.eod.dedup += 1;
        else results.eod.fired += 1;
      }
    }
  }

  // 4) Seed nhiệm vụ chấm công thợ vào TaskDailyAssignment (sáng & chiều).
  // Sáng: từ 0h VN trở đi, không push. Chiều: từ 13h VN trở đi, push bell cho KS.
  // Chủ Nhật mặc định công trường nghỉ → bỏ qua cả 2.
  if (!isSundayDefaultRest) {
    const hourVn = Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Ho_Chi_Minh",
        hour: "2-digit",
        hour12: false,
      }).format(now),
    );

    type SeedSession = "morning" | "afternoon";
    const seedRoutes: Array<{ session: SeedSession; type: DailyAssignmentType; gateHour: number; push: boolean }> = [
      { session: "morning", type: DailyAssignmentType.worker_attendance_morning, gateHour: 0, push: false },
      { session: "afternoon", type: DailyAssignmentType.worker_attendance_afternoon, gateHour: 13, push: true },
    ];

    for (const route of seedRoutes) {
      if (hourVn < route.gateHour) continue;

      const alreadySeeded = await prisma.taskDailyAssignment.findFirst({
        where: { reportDate: today, type: route.type },
        select: { id: true },
      });
      if (alreadySeeded) continue;

      const ksUsers = await prisma.user.findMany({
        where: { role: UserRole.engineer, isActive: true },
        select: { id: true },
      });

      for (const ks of ksUsers) {
        const projects = await prisma.project.findMany({
          where: {
            memberAssignments: { some: { userId: ks.id } },
            status: { not: "completed" },
          },
          select: { id: true, code: true, name: true },
        });
        if (!projects.length) continue;

        const sessionLabel = route.session === "morning" ? "buổi sáng" : "buổi chiều";
        await prisma.taskDailyAssignment.createMany({
          data: projects.map((p) => ({
            ksUserId: ks.id,
            reportDate: today,
            type: route.type,
            projectId: p.id,
            title: `Chấm công thợ ${sessionLabel} — ${p.name}`,
            priority: AssignmentPriority.important,
            requirePhoto: false,
          })),
          skipDuplicates: true,
        });

        // Nếu KS đã kịp chấm trước seed → đánh dấu done luôn cho khớp UI
        const savedByKsBeforeSeed = await prisma.workerAttendance.findMany({
          where: {
            projectId: { in: projects.map((p) => p.id) },
            date: today,
            session: route.session,
            markedById: ks.id,
          },
          select: { projectId: true },
        });
        const seededDoneProjectIds = Array.from(new Set(savedByKsBeforeSeed.map((s) => s.projectId)));
        if (seededDoneProjectIds.length) {
          await prisma.taskDailyAssignment.updateMany({
            where: {
              ksUserId: ks.id,
              reportDate: today,
              type: route.type,
              projectId: { in: seededDoneProjectIds },
            },
            data: { status: "done", doneAt: new Date() },
          });
        }

        if (!route.push) continue;

        // Loại các project KS đã kịp chấm trước thời điểm seed
        const saved = await prisma.workerAttendance.findMany({
          where: {
            projectId: { in: projects.map((p) => p.id) },
            date: today,
            session: route.session,
            markedById: ks.id,
          },
          select: { projectId: true },
        });
        const doneSet = new Set(saved.map((s) => s.projectId));
        const pending = projects.filter((p) => !doneSet.has(p.id));
        if (!pending.length) continue;

        const sample = pending.slice(0, 2).map((p) => `${p.code} · ${p.name}`).join(", ");
        const extra = pending.length > 2 ? `, +${pending.length - 2}` : "";
        const title = `🕐 13:00 — chấm công thợ buổi chiều (${pending.length} dự án)`;
        const body = `${sample}${extra}`;
        const r = await tryDedupAndSend({
          userId: ks.id,
          refType: "worker_attendance_pm_due",
          refId: refDateStr,
          stage: "overdue",
          title,
          body,
          url: "/reports",
          tag: `wa-pm-${refDateStr}`,
        });
        if (r.dedup) results.worker_attendance_pm.dedup += 1;
        else results.worker_attendance_pm.fired += 1;
      }
    }
  }

  return NextResponse.json({ ok: true, now: now.toISOString(), isSundayDefaultRest, results });
}
