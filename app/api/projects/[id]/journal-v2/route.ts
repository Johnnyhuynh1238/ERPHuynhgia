import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { formatUtcYmd } from "@/lib/date";
import { canAccessProjectReports } from "@/lib/reports-v2";
import { prisma } from "@/lib/prisma";

type Params = { params: { id: string } };

type TimelineEvent = {
  timestamp: string;
  type: string;
  title: string;
  description: string;
  userName: string | null;
};

export async function GET(_: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const hasAccess = await canAccessProjectReports({
    userId: user.id,
    role: user.role,
    projectId: params.id,
  });

  if (!hasAccess) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const [checkins, technicalReports, qcLogs] = await Promise.all([
    prisma.morningCheckin.findMany({
      where: { projectId: params.id },
      orderBy: { submittedAt: "desc" },
      include: {
        user: {
          select: {
            fullName: true,
          },
        },
        tasks: {
          include: {
            task: {
              select: {
                code: true,
                name: true,
              },
            },
          },
        },
      },
    }),
    prisma.taskTechnicalReport.findMany({
      where: {
        task: {
          projectId: params.id,
        },
      },
      orderBy: { updatedAt: "desc" },
      include: {
        task: {
          select: {
            code: true,
            name: true,
          },
        },
        creator: {
          select: {
            fullName: true,
          },
        },
        photos: {
          select: { id: true },
        },
      },
    }),
    prisma.taskQcLog.findMany({
      where: {
        task: {
          projectId: params.id,
        },
      },
      orderBy: { checkedAt: "desc" },
      include: {
        task: {
          select: {
            code: true,
            name: true,
          },
        },
        checker: {
          select: {
            fullName: true,
          },
        },
      },
    }),
  ]);

  const events: TimelineEvent[] = [];

  for (const checkin of checkins) {
    events.push({
      timestamp: checkin.submittedAt.toISOString(),
      type: "morning_checkin",
      title: "Check-in sáng",
      description: `Chọn ${checkin.tasks.length} task: ${checkin.tasks.map((item) => item.task.code).join(", ") || "(0 task)"}`,
      userName: checkin.user.fullName,
    });

    if (checkin.lastUpdatedAt.getTime() > checkin.submittedAt.getTime()) {
      events.push({
        timestamp: checkin.lastUpdatedAt.toISOString(),
        type: "morning_checkin_updated",
        title: "Cập nhật check-in sáng",
        description: `Danh sách task được cập nhật (${checkin.tasks.length} task hiện tại)`,
        userName: checkin.user.fullName,
      });
    }
  }

  for (const report of technicalReports) {
    events.push({
      timestamp: report.updatedAt.toISOString(),
      type: "task_report",
      title: `${report.task.code} - ${report.task.name}`,
      description: `Báo cáo kỹ thuật · ${report.status} · ${report.photos.length} ảnh`,
      userName: report.creator.fullName,
    });
  }

  for (const qcLog of qcLogs) {
    events.push({
      timestamp: qcLog.checkedAt.toISOString(),
      type: "qc_check",
      title: `QC ${qcLog.task.code} - ${qcLog.task.name}`,
      description: qcLog.note?.trim() || "Cập nhật QC",
      userName: qcLog.checker.fullName,
    });
  }

  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const groupedMap = new Map<string, TimelineEvent[]>();
  for (const event of events) {
    const key = formatUtcYmd(new Date(event.timestamp));
    const bucket = groupedMap.get(key) || [];
    bucket.push(event);
    groupedMap.set(key, bucket);
  }

  const days = Array.from(groupedMap.entries())
    .sort((a, b) => (a[0] > b[0] ? -1 : 1))
    .map(([date, dayEvents]) => ({ date, events: dayEvents }));

  return NextResponse.json({
    projectId: params.id,
    days,
  });
}
