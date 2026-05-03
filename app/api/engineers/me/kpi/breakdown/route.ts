import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { parseMonthInput } from "@/lib/date";
import { getCurrentUser } from "@/lib/auth-helpers";
import { calculateKpiForProjectEngineer } from "@/lib/kpi";
import { getReportProjectIdsForEngineer } from "@/lib/reporting";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id || user.role !== UserRole.engineer) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const monthInput = searchParams.get("month");
  const projectIdInput = searchParams.get("projectId");

  const parsedMonth = parseMonthInput(monthInput, { rejectInvalid: true });
  if (!parsedMonth) {
    return NextResponse.json({ message: "month không hợp lệ, định dạng đúng: YYYY-MM" }, { status: 400 });
  }

  const engineerProjectIds = await getReportProjectIdsForEngineer(user.id);
  const projects = await prisma.project.findMany({
    where: {
      id: { in: engineerProjectIds },
      goLiveDate: { not: null },
    },
    select: {
      id: true,
      code: true,
      name: true,
    },
    orderBy: { code: "asc" },
  });

  if (!projects.length) {
    return NextResponse.json({
      month: parsedMonth.month,
      projects: [],
      selectedProjectId: null,
      breakdown: null,
      detail: null,
    });
  }

  const selectedProject =
    (projectIdInput ? projects.find((item) => item.id === projectIdInput) : null) ?? projects[0];

  const kpi = await calculateKpiForProjectEngineer({
    projectId: selectedProject.id,
    reporterId: user.id,
    from: parsedMonth.start,
    to: parsedMonth.end,
  });

  return NextResponse.json({
    month: parsedMonth.month,
    projects,
    selectedProjectId: selectedProject.id,
    score: kpi.score,
    rank: kpi.rank,
    weights: kpi.weights,
    breakdown: kpi.breakdown,
    detail: kpi.detail,
  });
}
