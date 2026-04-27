import { redirect } from "next/navigation";
import { SubPaymentStatus, UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { ReportsOverviewClient } from "./_components/reports-overview-client";

type ReportRow = {
  key: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  reportType: "morning" | "evening";
  reportName: string;
  status: "completed" | "pending";
  targetHref: string;
};

type SubcontractorSpendingRow = {
  projectId: string;
  projectCode: string;
  projectName: string;
  subcontractorId: string;
  subcontractorCode: string;
  subcontractorName: string;
  totalPaid: number;
  paymentCount: number;
};

type TopSubcontractorRow = {
  id: string;
  code: string;
  name: string;
  avgRating: number | null;
  totalContracts: number;
  evaluationCount: number;
  willHireAgainRate: number;
};

function getTodayYmd(now: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(now);
}

function getUtcDateFromVietnamYmd(vnYmd: string) {
  return new Date(`${vnYmd}T00:00:00.000Z`);
}

async function loadSubcontractorSpending(projectId = ""): Promise<SubcontractorSpendingRow[]> {
  const rows = await prisma.subPayment.findMany({
    where: {
      status: SubPaymentStatus.paid,
      ...(projectId ? { subContract: { projectId } } : {}),
    },
    select: {
      actualAmount: true,
      expectedAmount: true,
      subContract: {
        select: {
          project: { select: { id: true, code: true, name: true } },
          subcontractor: { select: { id: true, code: true, name: true } },
        },
      },
    },
  });

  const map = new Map<string, SubcontractorSpendingRow>();
  for (const row of rows) {
    const project = row.subContract.project;
    const subcontractor = row.subContract.subcontractor;
    const key = `${project.id}__${subcontractor.id}`;

    const current =
      map.get(key) ||
      ({
        projectId: project.id,
        projectCode: project.code,
        projectName: project.name,
        subcontractorId: subcontractor.id,
        subcontractorCode: subcontractor.code,
        subcontractorName: subcontractor.name,
        totalPaid: 0,
        paymentCount: 0,
      } satisfies SubcontractorSpendingRow);

    current.totalPaid += Number(row.actualAmount ?? row.expectedAmount ?? 0);
    current.paymentCount += 1;
    map.set(key, current);
  }

  return Array.from(map.values())
    .map((item) => ({ ...item, totalPaid: Math.round(item.totalPaid * 100) / 100 }))
    .sort((a, b) => b.totalPaid - a.totalPaid)
    .slice(0, 20);
}

async function loadTopSubcontractors(limit = 10): Promise<TopSubcontractorRow[]> {
  const rows = await prisma.subcontractor.findMany({
    where: { isActive: true },
    select: {
      id: true,
      code: true,
      name: true,
      avgRating: true,
      totalContracts: true,
      contracts: {
        select: {
          evaluations: {
            select: {
              willHireAgain: true,
            },
          },
        },
      },
    },
  });

  return rows
    .map((row) => {
      const evals = row.contracts.flatMap((x) => x.evaluations);
      const evaluationCount = evals.length;
      const willHireAgainCount = evals.filter((x) => x.willHireAgain).length;
      return {
        id: row.id,
        code: row.code,
        name: row.name,
        avgRating: row.avgRating === null ? null : Number(row.avgRating),
        totalContracts: row.totalContracts,
        evaluationCount,
        willHireAgainRate: evaluationCount > 0 ? Math.round((willHireAgainCount / evaluationCount) * 100) : 0,
      };
    })
    .sort((a, b) => {
      const aRating = a.avgRating ?? -1;
      const bRating = b.avgRating ?? -1;
      if (bRating !== aRating) return bRating - aRating;
      if (b.evaluationCount !== a.evaluationCount) return b.evaluationCount - a.evaluationCount;
      return b.totalContracts - a.totalContracts;
    })
    .slice(0, limit);
}

export default async function ReportsPage() {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    redirect("/login");
  }

  const todayYmd = getTodayYmd(new Date());
  const reportDate = getUtcDateFromVietnamYmd(todayYmd);

  const canManage = user.role === UserRole.admin || user.role === UserRole.construction_manager;
  const canViewSpending = canManage || user.role === UserRole.accountant;

  if (canManage) {
    const [projects, morningReports, eveningReports, spending, topSubcontractors] = await Promise.all([
      prisma.project.findMany({
        where: {
          status: { not: "completed" },
          goLiveDate: { not: null, lte: reportDate },
        },
        select: {
          id: true,
          code: true,
          name: true,
          goLiveDate: true,
        },
        orderBy: { code: "asc" },
      }),
      prisma.morningReport.findMany({
        where: {
          reportDate,
          submittedAt: { not: null },
        },
        select: {
          projectId: true,
        },
      }),
      prisma.eveningReport.findMany({
        where: {
          reportDate,
          submittedAt: { not: null },
        },
        select: {
          projectId: true,
        },
      }),
      loadSubcontractorSpending(),
      loadTopSubcontractors(10),
    ]);

    const rows: ReportRow[] = [];

    for (const project of projects) {
      rows.push({
        key: `${project.id}-morning`,
        projectId: project.id,
        projectCode: project.code,
        projectName: project.name,
        reportType: "morning",
        reportName: "Báo cáo sáng",
        status: morningReports.some((report) => report.projectId === project.id) ? "completed" : "pending",
        targetHref: `/reports/morning/${project.id}`,
      });

      rows.push({
        key: `${project.id}-evening`,
        projectId: project.id,
        projectCode: project.code,
        projectName: project.name,
        reportType: "evening",
        reportName: "Báo cáo chiều",
        status: eveningReports.some((report) => report.projectId === project.id) ? "completed" : "pending",
        targetHref: `/reports/evening/${project.id}`,
      });
    }

    const totalReports = rows.length;
    const completedReports = rows.filter((row) => row.status === "completed").length;
    const pendingReports = totalReports - completedReports;
    const kpiPercent = totalReports > 0 ? Number(((completedReports / totalReports) * 100).toFixed(2)) : 0;

    return (
      <ReportsOverviewClient
        dateLabel={todayYmd}
        summary={{
          totalReports,
          completedReports,
          pendingReports,
          kpiPercent,
        }}
        rows={rows}
        subcontractorSpending={spending}
        topSubcontractors={topSubcontractors}
      />
    );
  }

  if (user.role === UserRole.engineer) {
    const [mainProjects, memberProjects] = await Promise.all([
      prisma.project.findMany({
        where: {
          status: { not: "completed" },
          goLiveDate: { not: null, lte: reportDate },
          mainEngineerId: user.id,
        },
        select: {
          id: true,
          code: true,
          name: true,
        },
      }),
      prisma.projectMember.findMany({
        where: {
          userId: user.id,
          roleInProject: "engineer",
          project: {
            status: { not: "completed" },
            goLiveDate: { not: null, lte: reportDate },
          },
        },
        select: {
          project: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
      }),
    ]);

    const projectMap = new Map<string, { id: string; code: string; name: string }>();
    for (const project of mainProjects) {
      projectMap.set(project.id, project);
    }
    for (const member of memberProjects) {
      projectMap.set(member.project.id, member.project);
    }

    const projects = Array.from(projectMap.values()).sort((a, b) => a.code.localeCompare(b.code, "vi"));

    const [morningReports, eveningReports] = await Promise.all([
      prisma.morningReport.findMany({
        where: {
          reportDate,
          reporterId: user.id,
          projectId: { in: projects.map((project) => project.id) },
          submittedAt: { not: null },
        },
        select: { projectId: true },
      }),
      prisma.eveningReport.findMany({
        where: {
          reportDate,
          reporterId: user.id,
          projectId: { in: projects.map((project) => project.id) },
          submittedAt: { not: null },
        },
        select: { projectId: true },
      }),
    ]);

    const rows: ReportRow[] = [];

    for (const project of projects) {
      rows.push({
        key: `${project.id}-morning`,
        projectId: project.id,
        projectCode: project.code,
        projectName: project.name,
        reportType: "morning",
        reportName: "Báo cáo sáng",
        status: morningReports.some((report) => report.projectId === project.id) ? "completed" : "pending",
        targetHref: `/reports/morning/${project.id}`,
      });

      rows.push({
        key: `${project.id}-evening`,
        projectId: project.id,
        projectCode: project.code,
        projectName: project.name,
        reportType: "evening",
        reportName: "Báo cáo chiều",
        status: eveningReports.some((report) => report.projectId === project.id) ? "completed" : "pending",
        targetHref: `/reports/evening/${project.id}`,
      });
    }

    const totalReports = rows.length;
    const completedReports = rows.filter((row) => row.status === "completed").length;
    const pendingReports = totalReports - completedReports;
    const kpiPercent = totalReports > 0 ? Number(((completedReports / totalReports) * 100).toFixed(2)) : 0;

    return (
      <ReportsOverviewClient
        dateLabel={todayYmd}
        summary={{
          totalReports,
          completedReports,
          pendingReports,
          kpiPercent,
        }}
        rows={rows}
      />
    );
  }

  if (canViewSpending) {
    const spending = await loadSubcontractorSpending();
    return (
      <ReportsOverviewClient
        dateLabel={todayYmd}
        summary={{ totalReports: 0, completedReports: 0, pendingReports: 0, kpiPercent: 0 }}
        rows={[]}
        subcontractorSpending={spending}
      />
    );
  }

  redirect("/");
}
