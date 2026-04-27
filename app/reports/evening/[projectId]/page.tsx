import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-helpers";
import { EveningReportPageClient } from "./_components/evening-report-page-client";

export default async function EveningReportProjectPage({
  params,
  searchParams,
}: {
  params: { projectId: string };
  searchParams?: { date?: string };
}) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    redirect("/login");
  }

  return <EveningReportPageClient projectId={params.projectId} dateInput={searchParams?.date} />;
}
