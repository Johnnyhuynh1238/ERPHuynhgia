import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { canViewProposal, isProposalStaffViewer } from "@/lib/proposal-access";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const proposal = await prisma.materialProposal.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      description: true,
      status: true,
      orderStatus: true,
      parsedItems: true,
      processedNote: true,
      paymentMethod: true,
      paymentNote: true,
      createdAt: true,
      acceptedAt: true,
      orderedAt: true,
      receivedAt: true,
      paidAt: true,
      reminderDueAt: true,
      ks: { select: { id: true, fullName: true } },
      project: { select: { id: true, code: true, name: true } },
      processor: { select: { id: true, fullName: true } },
    },
  });
  if (!proposal) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (!canViewProposal(user.role, proposal.ks.id, user.id)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const isStaffView = isProposalStaffViewer(user.role);

  return NextResponse.json({
    proposal,
    viewMode: isStaffView ? "accountant" : "ks",
  });
}
