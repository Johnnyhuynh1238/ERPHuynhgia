import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-helpers";
import { getReportProjectsForUser } from "@/lib/reporting";
import { ReportingHomeClient } from "../_components/reporting-home-client";

export default async function EveningReportHomePage() {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    redirect("/login");
  }

  const projects = await getReportProjectsForUser({ id: user.id, role: user.role });

  if (projects.length === 1) {
    redirect(`/reports/evening/${projects[0].id}`);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-orange-300">Báo cáo chiều</h1>
      <ReportingHomeClient
        projects={projects.map((project) => ({
          id: project.id,
          code: project.code,
          name: project.name,
          goLiveDate: project.goLiveDate ? project.goLiveDate.toISOString() : null,
        }))}
      />
    </div>
  );
}
