import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { parseMonthInput } from "@/lib/date";
import { calculateKpiForProjectEngineer } from "@/lib/kpi";
import { calculateSalary, calculateTotalScore, toNumber } from "@/lib/kpi-salary";
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

  const scoreSchedule = Number(kpi.breakdown.taskOnSchedule.toFixed(2));
  const scoreQc = Number(kpi.breakdown.inspectionQuality.toFixed(2));
  const scoreReport = Number(kpi.breakdown.reportProactivity.toFixed(2));
  const scoreCustomer = 100;

  const hasData = kpi.detail.totalCompletedTasks > 0 || kpi.detail.totalInspected > 0 || kpi.detail.totalEvening > 0;
  const estimatedContribution = hasData ? 80 : 100;

  const totalScore =
    !hasData
      ? 100
      : calculateTotalScore({
          schedule: scoreSchedule,
          qc: scoreQc,
          report: scoreReport,
          customer: scoreCustomer,
          contribution: estimatedContribution,
        });

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
        contribution: null,
      },
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
      contribution: null,
    },
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
