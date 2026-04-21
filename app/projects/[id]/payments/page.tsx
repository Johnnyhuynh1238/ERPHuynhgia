import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { ProjectPaymentsClient } from "./_components/project-payments-client";

export default async function ProjectPaymentsPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();

  if (!user?.id || !user.role) {
    redirect("/login");
  }

  if (user.role !== UserRole.admin && user.role !== UserRole.accountant) {
    redirect("/projects?denied=payments");
  }

  return <ProjectPaymentsClient projectId={params.id} />;
}
