import { notFound, redirect } from "next/navigation";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { canViewProposal } from "@/lib/proposal-access";
import { ProposalDetailClient } from "./_components/proposal-detail-client";

export default async function ProposalDetailPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    redirect("/login");
  }

  const proposal = await prisma.materialProposal.findUnique({
    where: { id: params.id },
    select: { id: true, ksId: true },
  });
  if (!proposal) notFound();

  if (!canViewProposal(user.role, proposal.ksId, user.id)) {
    redirect("/proposals");
  }

  return (
    <ProtectedLayout>
      <ProposalDetailClient
        proposalId={params.id}
        currentUserId={user.id}
        currentRole={user.role}
      />
    </ProtectedLayout>
  );
}
