import { NextResponse } from "next/server";
import { ProjectRoleType } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { getTodayDateVn } from "@/lib/task-centric";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const today = getTodayDateVn();
  const in3Days = new Date(today);
  in3Days.setUTCDate(in3Days.getUTCDate() + 3);

  const assignments = await prisma.projectMemberAssignment.findMany({ where: { userId: user.id, role: ProjectRoleType.pm_engineer }, select: { projectId: true }, distinct: ["projectId"] });
  const projectIds = assignments.map((a) => a.projectId);

  const projects = await prisma.project.findMany({
    where: { id: { in: projectIds } },
    select: {
      id: true,
      code: true,
      name: true,
      tasks: {
        where: {
          status: { notIn: ["done", "na"] },
          assignedEngineerId: user.id,
        },
        orderBy: { displayOrder: "asc" },
        select: { id: true, code: true, name: true, status: true, plannedStartDate: true, plannedEndDate: true },
      },
    },
  });

  const data = projects.map((p) => ({
    projectId: p.id,
    projectName: `${p.code} · ${p.name}`,
    groups: {
      overdue: p.tasks.filter((t) => t.plannedEndDate < today && t.status !== "done"),
      in_progress: p.tasks.filter((t) => t.status === "in_progress"),
      starting_today: p.tasks.filter((t) => t.status === "not_started" && t.plannedStartDate.getTime() === today.getTime()),
      upcoming: p.tasks.filter((t) => t.status === "not_started" && t.plannedStartDate > today && t.plannedStartDate <= in3Days),
    },
  }));

  return NextResponse.json({ projects: data });
}
