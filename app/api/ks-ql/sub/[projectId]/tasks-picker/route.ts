import { NextResponse } from "next/server";
import { TaskStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";

export const dynamic = "force-dynamic";

const ACTIVE_WINDOW_DAYS = 14;

export async function GET(req: Request, { params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const project = await prisma.project.findFirst({
    where: { id: params.projectId, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
    select: { id: true },
  });
  if (!project) {
    return NextResponse.json({ error: "project_not_accessible" }, { status: 403 });
  }

  const url = new URL(req.url);
  const showAll = url.searchParams.get("all") === "1";

  const now = new Date();
  const horizon = new Date(now.getTime() + ACTIVE_WINDOW_DAYS * 86_400_000);

  const excludedStatuses: TaskStatus[] = [
    TaskStatus.done,
    TaskStatus.completed,
    TaskStatus.inspected,
    TaskStatus.na,
  ];

  const whereClause = showAll
    ? {
        projectId: project.id,
        isActive: true,
        status: { notIn: excludedStatuses },
      }
    : {
        projectId: project.id,
        isActive: true,
        status: { notIn: excludedStatuses },
        OR: [
          { status: TaskStatus.in_progress },
          {
            status: TaskStatus.not_started,
            plannedStartDate: { lte: horizon },
          },
        ],
      };

  const tasks = await prisma.task.findMany({
    where: whereClause,
    select: {
      id: true,
      code: true,
      name: true,
      phase: true,
      status: true,
      plannedStartDate: true,
      plannedEndDate: true,
    },
    orderBy: [{ phase: "asc" }, { plannedStartDate: "asc" }],
    take: 200,
  });

  return NextResponse.json({ items: tasks, showAll });
}
