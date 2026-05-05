import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { parseMonthInput } from "@/lib/date";
import { calculateKpiForProjectEngineer, calculateKpiHistoryForMonths } from "@/lib/kpi";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { prisma } from "@/lib/prisma";

type Params = { params: { userId: string } };

export async function GET(request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  if (user.role !== UserRole.admin && user.role !== UserRole.construction_manager) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const monthInput = searchParams.get("month");
  const projectId = searchParams.get("projectId");

  if (!projectId) {
    return NextResponse.json({ message: "Thiếu projectId" }, { status: 400 });
  }

  const parsedMonth = parseMonthInput(monthInput, { rejectInvalid: true });
  if (!parsedMonth) {
    return NextResponse.json({ message: "month không hợp lệ, định dạng đúng: YYYY-MM" }, { status: 400 });
  }

  const { month, start, end } = parsedMonth;

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      ...buildProjectAccessWhere({ id: user.id, role: user.role }),
      goLiveDate: { not: null },
    },
    select: {
      id: true,
      code: true,
      name: true,
      mainEngineerId: true,
      projectManagerId: true,
    },
  });

  if (!project) {
    return NextResponse.json({ message: "Không tìm thấy dự án hoặc không có quyền" }, { status: 404 });
  }

  const isReporterValid = params.userId === project.mainEngineerId || params.userId === project.projectManagerId;
  if (!isReporterValid) {
    return NextResponse.json({ message: "Người dùng không thuộc dự án trong kỳ lọc" }, { status: 400 });
  }

  const reporter = await prisma.user.findUnique({
    where: { id: params.userId },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      isActive: true,
    },
  });

  if (!reporter || !reporter.isActive) {
    return NextResponse.json({ message: "Không tìm thấy người dùng" }, { status: 404 });
  }

  const [kpi, history] = await Promise.all([
    calculateKpiForProjectEngineer({
      projectId: project.id,
      reporterId: reporter.id,
      from: start,
      to: end,
    }),
    calculateKpiHistoryForMonths({
      projectId: project.id,
      reporterId: reporter.id,
      monthStart: start,
      months: 6,
    }),
  ]);

  return NextResponse.json({
    month,
    user: {
      id: reporter.id,
      fullName: reporter.fullName,
      email: reporter.email,
      role: reporter.role,
    },
    project: {
      id: project.id,
      code: project.code,
      name: project.name,
    },
    totals: {
      score: kpi.score,
      rank: kpi.rank,
    },
    weights: kpi.weights,
    settings: kpi.settings,
    breakdown: kpi.scores,
    detail: kpi.detail,
    history,
  });
}
