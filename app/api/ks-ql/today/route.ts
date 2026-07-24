import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { getWorkDateVn } from "@/lib/attendance";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "missing projectId" }, { status: 400 });

  const allowed = await prisma.project.findFirst({
    where: {
      id: projectId,
      OR: [
        { memberAssignments: { some: { userId: user.id } } },
        ...(user.role === "admin" ? [{}] : []),
      ],
    },
    select: { id: true },
  });
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const today = getWorkDateVn();
  const hour = new Date().getUTCHours() + 7;
  const currentSession = (hour % 24) < 13 ? "morning" : "afternoon";

  const [
    attendancePresentCount,
    workOrdersToday,
    workOrderOutputsToday,
    qcPendingReview,
  ] = await Promise.all([
    prisma.workerAttendance.count({
      where: { projectId, date: today, session: currentSession, present: true },
    }),
    prisma.workOrder.count({
      where: { projectId, date: today },
    }),
    prisma.workOrderOutput.count({
      where: { projectId, date: today },
    }),
    prisma.qcProgress.count({
      where: {
        status: "passed",
        task: { projectId },
      },
    }).catch(() => 0),
  ]);

  const allOrdersDistributed =
    workOrdersToday > 0 && workOrderOutputsToday >= workOrdersToday;

  const alerts: { id: string; text: string; href?: string }[] = [];
  if (qcPendingReview > 0) {
    alerts.push({ id: "qc", text: `${qcPendingReview} hold-point chưa được TPTC duyệt` });
  }

  const data = {
    alerts,
    morning: {
      attendanceDone: attendancePresentCount > 0,
      teamPhotoDone: false,
      machinesWaiting: 0,
    },
    midday: {
      qcHoldPoints: qcPendingReview,
    },
    evening: {
      workOrdersToday,
      workOrderOutputsToday,
      assignDone: allOrdersDistributed,
    },
    kpi: {
      phaseLabel: null,
      progressPercent: 0,
      laborDelta: 0,
    },
  };

  return NextResponse.json(data);
}
