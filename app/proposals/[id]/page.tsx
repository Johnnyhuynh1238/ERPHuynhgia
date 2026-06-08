import { notFound, redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { ProposalDetailClient } from "./_components/proposal-detail-client";

const ACCOUNTANT_ROLES: string[] = [UserRole.accountant, UserRole.admin];

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

  const isAccountantView = ACCOUNTANT_ROLES.includes(user.role);
  const isOwnKs = user.role === UserRole.engineer && proposal.ksId === user.id;
  if (!isAccountantView && !isOwnKs) {
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
