import { NextResponse } from "next/server";
import { KpiSnapshotType, UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { formatUtcYmd } from "@/lib/date";
import type { KpiResult } from "@/lib/kpi";
import { calculateKpiForProjectEngineer } from "@/lib/kpi";
import {
  getReminderTargetProjects,
  monthStringOfDate,
  normalizeKpiSnapshotDateFromInput,
  resolveMonthlyFinalRange,
  upsertKpiSnapshot,
} from "@/lib/reporting";
import { prisma } from "@/lib/prisma";

function isInternalJobAllowed(request: Request, userRole: string | null | undefined) {
  if (userRole === UserRole.admin || userRole === UserRole.construction_manager) {
    return true;
  }

  const expectedSecret = process.env.INTERNAL_JOB_SECRET;
  if (!expectedSecret) return false;

  const providedSecret = request.headers.get("x-internal-job-secret");
  return Boolean(providedSecret && providedSecret === expectedSecret);
}

function toSnapshotPayload(kpi: KpiResult) {
  return {
    score: kpi.score,
    rank: kpi.rank,
    weights: kpi.weights,
    breakdown: kpi.breakdown,
    detail: kpi.detail,
  };
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!isInternalJobAllowed(request, user?.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const targetDate = normalizeKpiSnapshotDateFromInput(typeof body?.date === "string" ? body.date : null);
  const targetDateYmd = formatUtcYmd(targetDate);

  const projects = await getReminderTargetProjects();
  if (!projects.length) {
    return NextResponse.json({ date: targetDateYmd, snapshots: 0, monthlyFinalSnapshots: 0, skippedRest: 0 });
  }

  const projectIds = projects.map((project) => project.id);
  const restRows = await prisma.siteRestDay.findMany({
    where: {
      projectId: { in: projectIds },
      restDate: targetDate,
    },
    select: { projectId: true },
  });

  const restSet = new Set(restRows.map((row) => row.projectId));

  let snapshots = 0;
  let skippedRest = 0;

  for (const project of projects) {
    if (restSet.has(project.id)) {
      skippedRest += 1;
      continue;
    }

    const kpi = await calculateKpiForProjectEngineer({
      projectId: project.id,
      reporterId: project.mainEngineerId,
      from: targetDate,
      to: targetDate,
    });

    await upsertKpiSnapshot({
      projectId: project.id,
      reporterId: project.mainEngineerId,
      date: targetDate,
      month: monthStringOfDate(targetDate),
      type: KpiSnapshotType.DAILY,
      score: kpi.score,
      rank: kpi.rank,
      payload: toSnapshotPayload(kpi),
    });

    snapshots += 1;
  }

  const monthlyFinalRange = resolveMonthlyFinalRange(targetDate);

  let monthlyFinalSnapshots = 0;
  if (monthlyFinalRange) {
    for (const project of projects) {
      const monthlyKpi = await calculateKpiForProjectEngineer({
        projectId: project.id,
        reporterId: project.mainEngineerId,
        from: monthlyFinalRange.start,
        to: monthlyFinalRange.end,
      });

      await upsertKpiSnapshot({
        projectId: project.id,
        reporterId: project.mainEngineerId,
        date: monthlyFinalRange.end,
        month: monthlyFinalRange.month,
        type: KpiSnapshotType.MONTHLY_FINAL,
        score: monthlyKpi.score,
        rank: monthlyKpi.rank,
        payload: toSnapshotPayload(monthlyKpi),
      });

      monthlyFinalSnapshots += 1;
    }
  }

  return NextResponse.json({
    date: targetDateYmd,
    snapshots,
    monthlyFinalSnapshots,
    skippedRest,
    monthResetTriggered: Boolean(monthlyFinalRange),
    monthFinalized: monthlyFinalRange?.month ?? null,
  });
}
