import { NextResponse } from "next/server";
import { TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireCustomerPortalApiAccess } from "@/lib/customer-portal-v2";

const completedStatuses: TaskStatus[] = [TaskStatus.done, TaskStatus.inspected, TaskStatus.internal_approved, TaskStatus.completed];

export async function GET(_request: Request, { params }: { params: { token: string } }) {
  const access = await requireCustomerPortalApiAccess(params.token);
  if (!access.ok) return NextResponse.json({ message: access.message }, { status: access.status });

  const phases = await prisma.projectPhase.findMany({
    where: { projectId: access.project.id },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    include: {
      tasks: {
        where: { isActive: true, visibleToCustomer: true },
        orderBy: [{ displayOrder: { sort: "asc", nulls: "last" } }, { code: "asc" }],
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
          progressPercent: true,
          plannedStartDate: true,
          plannedEndDate: true,
          actualStartDate: true,
          actualEndDate: true,
        },
      },
    },
  });

  return NextResponse.json({
    phases: phases.map((phase) => {
      const done = phase.tasks.filter((task) => completedStatuses.includes(task.status)).length;
      const total = phase.tasks.length;
      return { ...phase, progressPercent: total ? Math.round((done / total) * 100) : 0 };
    }),
  });
}
