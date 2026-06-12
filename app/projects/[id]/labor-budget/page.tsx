import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import {
  canApproveAmendment,
  canEditLaborBudget,
  canLockLaborBudget,
  canProposeAmendment,
  canViewLaborBudget,
} from "@/lib/labor-budget";
import { LaborBudgetClient } from "./_components/labor-budget-client";

export default async function LaborBudgetPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) redirect("/login");

  if (!canViewLaborBudget(user.role)) redirect(`/projects/${params.id}`);

  const accessWhere = buildProjectAccessWhere({ id: user.id, role: user.role });
  const project = await prisma.project.findFirst({
    where: { id: params.id, ...accessWhere },
    select: { id: true, name: true },
  });

  if (!project) {
    const exists = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true } });
    if (!exists) notFound();
    redirect("/projects?denied=1");
  }

  const budgetRow = await prisma.laborBudget.findUnique({
    where: { projectId: project.id },
    include: {
      createdBy: { select: { id: true, fullName: true } },
      lockedBy: { select: { id: true, fullName: true } },
      items: { orderBy: [{ phase: "asc" }, { sortRank: "asc" }] },
      amendments: {
        orderBy: { createdAt: "desc" },
        include: {
          proposedBy: { select: { id: true, fullName: true } },
          approvedBy: { select: { id: true, fullName: true } },
          items: true,
        },
      },
    },
  });

  const budget = budgetRow
    ? {
        id: budgetRow.id,
        status: budgetRow.status,
        totalAmount: Number(budgetRow.totalAmount),
        note: budgetRow.note,
        lockedAt: budgetRow.lockedAt ? budgetRow.lockedAt.toISOString() : null,
        lockedBy: budgetRow.lockedBy,
        createdBy: budgetRow.createdBy,
        items: budgetRow.items.map((it) => ({
          id: it.id,
          phase: it.phase,
          workItem: it.workItem,
          unit: it.unit,
          quantity: Number(it.quantity),
          unitPrice: Number(it.unitPrice),
          amount: Number(it.amount),
          note: it.note,
        })),
        amendments: budgetRow.amendments.map((a) => ({
          id: a.id,
          reason: a.reason,
          deltaAmount: Number(a.deltaAmount),
          status: a.status,
          createdAt: a.createdAt.toISOString(),
          approvedAt: a.approvedAt ? a.approvedAt.toISOString() : null,
          rejectReason: a.rejectReason,
          proposedBy: a.proposedBy,
          approvedBy: a.approvedBy,
          items: a.items.map((it) => ({
            id: it.id,
            phase: it.phase,
            workItem: it.workItem,
            unit: it.unit,
            quantity: Number(it.quantity),
            unitPrice: Number(it.unitPrice),
            amount: Number(it.amount),
            note: it.note,
          })),
        })),
      }
    : null;

  return (
    <LaborBudgetClient
      projectId={project.id}
      projectName={project.name}
      initialBudget={budget}
      canEdit={canEditLaborBudget(user.role)}
      canLock={canLockLaborBudget(user.role)}
      canPropose={canProposeAmendment(user.role)}
      canApprove={canApproveAmendment(user.role)}
    />
  );
}
