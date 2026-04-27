import { notFound, redirect } from "next/navigation";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { canUserAccessSubContract } from "@/lib/sub-contract-auth";
import { SubContractDetailClient } from "./sub-contract-detail-client";

export default async function SubContractDetailPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();

  if (!user?.id || !user.role) {
    redirect("/login");
  }

  const access = await canUserAccessSubContract(params.id, { id: user.id, role: user.role });
  if (!access.projectId) {
    notFound();
  }

  if (!access.canAccess) {
    redirect("/projects?denied=1");
  }

  return (
    <ProtectedLayout>
      <SubContractDetailClient
        contractId={params.id}
        canWrite={["admin", "construction_manager"].includes(user.role)}
        currentRole={user.role}
      />
    </ProtectedLayout>
  );
}
