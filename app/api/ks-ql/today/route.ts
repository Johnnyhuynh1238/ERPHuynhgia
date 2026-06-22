import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

function todayDate() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

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

  const today = todayDate();

  const [
    attendanceTodayCount,
    workOrdersToday,
    materialPendingProcess,
    materialInTransit,
    qcPendingReview,
  ] = await Promise.all([
    prisma.workerAttendance.count({
      where: { projectId, date: today },
    }),
    prisma.workOrder.count({
      where: { projectId, date: today },
    }),
    prisma.materialProposal.count({
      where: { projectId, status: "pending" },
    }),
    prisma.materialProposal.count({
      where: {
        projectId,
        orderStatus: { in: ["ordered"] },
      },
    }),
    prisma.qcProgress.count({
      where: {
        status: "passed",
        task: { projectId },
      },
    }).catch(() => 0),
  ]);

  const alerts: { id: string; text: string; href?: string }[] = [];
  if (qcPendingReview > 0) {
    alerts.push({ id: "qc", text: `${qcPendingReview} hold-point chưa được TPTC duyệt` });
  }
  if (materialPendingProcess > 5) {
    alerts.push({ id: "mat-stack", text: `${materialPendingProcess} đề xuất VT đang chờ xử lý` });
  }

  const data = {
    alerts,
    morning: {
      attendanceDone: attendanceTodayCount > 0,
      teamPhotoDone: false,
      materialsIncoming: materialInTransit,
      machinesWaiting: 0,
    },
    midday: {
      qcHoldPoints: qcPendingReview,
      materialReceiveToday: materialInTransit,
    },
    evening: {
      workOrdersToday,
      assignDone: false,
      materialRequestForTomorrow: false,
    },
    kpi: {
      phaseLabel: null,
      progressPercent: 0,
      laborDelta: 0,
    },
  };

  return NextResponse.json(data);
}
