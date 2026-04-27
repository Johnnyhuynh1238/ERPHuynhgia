import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-helpers";
import { canUserAccessProjectSubContracts } from "@/lib/sub-contract-auth";
import { ProjectSubContractsClient } from "./project-sub-contracts-client";

export default async function ProjectSubContractsPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();

  if (!user?.id || !user.role) {
    redirect("/login");
  }

  const canView = await canUserAccessProjectSubContracts(params.id, { id: user.id, role: user.role });
  if (!canView) {
    redirect(`/projects/${params.id}?denied=1`);
  }

  const canCreate = user.role === "admin" || user.role === "construction_manager";

  return <ProjectSubContractsClient projectId={params.id} canCreate={canCreate} />;
}
