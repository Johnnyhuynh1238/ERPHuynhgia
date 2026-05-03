import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-helpers";
import { canAccessProjectReports, canViewReportsHub, getProjectForReports } from "@/lib/reports-v2";
import { ReportProjectClient } from "@/app/reports/[projectId]/_components/report-project-client";

type Props = {
  params: {
    projectId: string;
  };
};

export default async function ReportProjectPage({ params }: Props) {
  const user = await getCurrentUser();
  if (!user?.id) {
    redirect("/login");
  }

  if (!canViewReportsHub(user.role)) {
    redirect("/");
  }

  const hasAccess = await canAccessProjectReports({
    userId: user.id,
    role: user.role,
    projectId: params.projectId,
  });

  if (!hasAccess) {
    redirect("/reports");
  }

  const project = await getProjectForReports(params.projectId);
  if (!project) {
    redirect("/reports");
  }

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-4">
      <Link href="/reports" className="inline-flex rounded-lg border border-[#2f3555] bg-[#171c2f] px-3 py-1.5 text-sm text-[#d9def3]">
        ← Quay lại hub báo cáo
      </Link>
      <ReportProjectClient projectId={project.id} projectCode={project.code} projectName={project.name} />
    </main>
  );
}
