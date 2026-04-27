import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-helpers";
import { MorningReportPageClient } from "./_components/morning-report-page-client";

export default async function MorningReportProjectPage({
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

  return <MorningReportPageClient projectId={params.projectId} dateInput={searchParams?.date} />;
}
