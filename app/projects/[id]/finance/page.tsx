import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { ProjectFinanceClient } from "./_components/project-finance-client";

export default async function ProjectFinancePage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) redirect("/login");
  if (user.role !== UserRole.admin) redirect("/?denied=finance");

  return (
    <ProtectedLayout>
      <ProjectFinanceClient projectId={params.id} />
    </ProtectedLayout>
  );
}
