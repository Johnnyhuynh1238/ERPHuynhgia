import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { parseMonthInput } from "@/lib/date";
import { calculateKpiForProjectEngineer } from "@/lib/kpi";
import { calculateSalary, toNumber } from "@/lib/kpi-salary";
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
  if (engineerProjectIds.length === 0) {
    return NextResponse.json({
      message: "Kỹ sư chưa được gán dự án",
      scores: null,
      salary: null,
    });
  }

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
      message: "Chưa có dự án đã go-live để tính KPI",
      scores: null,
      salary: null,
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

  const scoreSchedule = Number(kpi.scores.schedule.toFixed(2));
  const scoreQc = Number(kpi.scores.qc.toFixed(2));
  const scoreReport = Number(kpi.scores.report.toFixed(2));
  const scoreCustomer = Number(kpi.scores.customer.toFixed(2));
  const scoreContribution = Number(kpi.scores.contribution.toFixed(2));

  const hasData =
    !kpi.detail.schedule.defaultApplied ||
    !kpi.detail.qc.defaultApplied ||
    !kpi.detail.report.defaultApplied ||
    !kpi.detail.customer.defaultApplied ||
    !kpi.detail.contribution.defaultApplied;
  const totalScore = kpi.score;

  const salaryConfig = await prisma.engineerSalaryConfig.findUnique({
    where: { userId: user.id },
    select: {
      salaryMax: true,
      effectiveFrom: true,
      isActive: true,
    },
  });

  if (!salaryConfig || !salaryConfig.isActive) {
    return NextResponse.json({
      month: parsedMonth.month,
      project: selectedProject,
      isRealtime: true,
      hasData,
      message: "Chưa cấu hình lương",
      scores: {
        schedule: scoreSchedule,
        qc: scoreQc,
        report: scoreReport,
        customer: scoreCustomer,
        contribution: scoreContribution,
      },
      settings: kpi.settings,
      totalScore,
      salary: null,
    });
  }

  const salary = calculateSalary(toNumber(salaryConfig.salaryMax), totalScore);

  return NextResponse.json({
    userId: user.id,
    month: parsedMonth.month,
    isRealtime: true,
    hasData,
    project: selectedProject,
    scores: {
      schedule: scoreSchedule,
      qc: scoreQc,
      report: scoreReport,
      customer: scoreCustomer,
      contribution: scoreContribution,
    },
    settings: kpi.settings,
    totalScore,
    estimatedBonusRatio: salary.bonusRatio,
    salary: {
      salaryMax: salary.salaryMax,
      baseSalary: salary.baseSalary,
      bonusMax: salary.bonusMax,
      bonusAmount: salary.bonusAmount,
      totalSalary: salary.totalSalary,
    },
    config: {
      effectiveFrom: salaryConfig.effectiveFrom.toISOString().slice(0, 10),
      salaryMax: toNumber(salaryConfig.salaryMax),
    },
  });
}
