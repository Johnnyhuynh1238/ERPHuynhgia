import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
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

export default async function ReportsPage() {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    redirect("/login");
  }

  const todayYmd = getTodayYmd(new Date());
  const reportDate = getUtcDateFromVietnamYmd(todayYmd);

  const canManage = user.role === UserRole.admin || user.role === UserRole.construction_manager;

  if (canManage) {
    const [projects, morningReports, eveningReports] = await Promise.all([
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
          reporterId: true,
        },
      }),
      prisma.eveningReport.findMany({
        where: {
          reportDate,
          submittedAt: { not: null },
        },
        select: {
          projectId: true,
          reporterId: true,
        },
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

  redirect("/");
}
