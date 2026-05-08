import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { getReportDateVn } from "@/lib/reports-v3";

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id || user.role !== "engineer") {
    return NextResponse.json({ message: "Chỉ KS được check-in sáng" }, { status: 403 });
  }

  const reportDate = getReportDateVn();
  const projectAccessWhere = buildProjectAccessWhere({ id: user.id, role: user.role });
  const in3Days = new Date(reportDate);
  in3Days.setUTCDate(in3Days.getUTCDate() + 3);

  const tasks = await prisma.task.findMany({
    where: {
      assignedEngineerId: user.id,
      isActive: true,
      status: { notIn: ["done", "na"] },
      project: projectAccessWhere,
    },
    orderBy: [{ plannedStartDate: "asc" }, { displayOrder: "asc" }, { code: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      plannedStartDate: true,
      plannedEndDate: true,
      progressPercent: true,
      projectId: true,
      project: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
    },
  });

  const tptcAssignments = await prisma.tptcAssignment.findMany({
    where: {
      assignedToUserId: user.id,
      status: { in: ["pending", "rejected"] },
      project: projectAccessWhere,
    },
    orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      projectId: true,
      title: true,
      priority: true,
      dueAt: true,
      status: true,
      assignedByUserId: true,
      createdAt: true,
      project: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
      assigner: {
        select: {
          fullName: true,
        },
      },
    },
  });

  const taskGroups = new Map<string, { projectId: string; projectName: string; tasks: any[] }>();
  for (const task of tasks) {
    const projectName = `${task.project.code} · ${task.project.name}`;
    if (!taskGroups.has(task.projectId)) {
      taskGroups.set(task.projectId, { projectId: task.projectId, projectName, tasks: [] });
    }

    const group = taskGroups.get(task.projectId)!;
    const hasPlannedEnd = task.plannedEndDate instanceof Date;
    const hasPlannedStart = task.plannedStartDate instanceof Date;
    const isOverdue = Boolean(hasPlannedEnd && task.plannedEndDate < reportDate && task.status !== "in_progress");
    const startToday = Boolean(hasPlannedStart && task.plannedStartDate.getTime() === reportDate.getTime());
    const upcoming = Boolean(hasPlannedStart && task.plannedStartDate > reportDate && task.plannedStartDate <= in3Days);

    group.tasks.push({
      id: task.id,
      code: task.code,
      name: task.name,
      status: task.status,
      progressPercent: task.progressPercent,
      group: task.status === "in_progress" ? "in_progress" : isOverdue ? "overdue" : startToday ? "starting_today" : upcoming ? "upcoming" : "other",
      plannedStartDate: task.plannedStartDate,
      plannedEndDate: task.plannedEndDate,
    });
  }

  const tptcGroups = new Map<string, { projectId: string; projectName: string; assignments: any[] }>();
  for (const item of tptcAssignments) {
    const projectName = `${item.project.code} · ${item.project.name}`;
    if (!tptcGroups.has(item.projectId)) {
      tptcGroups.set(item.projectId, { projectId: item.projectId, projectName, assignments: [] });
    }

    tptcGroups.get(item.projectId)!.assignments.push({
      id: item.id,
      title: item.title,
      priority: item.priority,
      dueAt: item.dueAt,
      status: item.status,
      assignedAt: item.createdAt,
      assignedBy: item.assigner.fullName,
    });
  }

  return NextResponse.json({
    reportDate,
    taskProjects: Array.from(taskGroups.values()),
    tptcProjects: Array.from(tptcGroups.values()),
  });
}
