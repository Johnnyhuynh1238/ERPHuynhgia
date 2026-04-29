import { NextResponse } from "next/server";
import { ProjectRoleType } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { getTodayDateVn } from "@/lib/task-centric";
import { prisma } from "@/lib/prisma";

const roleMap: Record<ProjectRoleType, { label: string; type: "technical" | "material" | "labor" | "equipment" }> = {
  pm_construction_manager: { label: "TPTC", type: "technical" },
  pm_engineer: { label: "Kỹ thuật", type: "technical" },
  pm_material_manager: { label: "Vật tư", type: "material" },
  pm_labor_manager: { label: "Nhân công", type: "labor" },
  pm_accountant: { label: "Kế toán", type: "equipment" },
};

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const assignments = await prisma.projectMemberAssignment.findMany({
    where: { userId: user.id },
    include: { project: { select: { id: true, code: true, name: true, tasks: { where: { isActive: true }, select: { id: true, code: true, name: true } } } } },
  });

  const today = getTodayDateVn();
  const projects = await Promise.all(assignments.reduce((acc: any[], cur) => {
    const existing = acc.find((x) => x.project.id === cur.project.id);
    if (!existing) acc.push({ project: cur.project, roles: [cur.role] }); else existing.roles.push(cur.role);
    return acc;
  }, []).map(async ({ project, roles }) => {
    const groups = await Promise.all(roles.map(async (role: ProjectRoleType) => {
      const type = roleMap[role].type;
      const tasks = await Promise.all(project.tasks.map(async (task: { id: string; code: string; name: string }) => {
        let reportedToday = false;
        if (type === "technical") reportedToday = !!(await prisma.taskTechnicalReport.findUnique({ where: { taskId_reportDate: { taskId: task.id, reportDate: today } } }));
        if (type === "material") reportedToday = !!(await prisma.taskMaterialReport.findUnique({ where: { taskId_reportDate: { taskId: task.id, reportDate: today } } }));
        if (type === "labor") reportedToday = !!(await prisma.taskLaborReport.findUnique({ where: { taskId_reportDate: { taskId: task.id, reportDate: today } } }));
        if (type === "equipment") reportedToday = !!(await prisma.taskEquipmentReport.findUnique({ where: { taskId_reportDate: { taskId: task.id, reportDate: today } } }));
        return { taskId: task.id, taskCode: task.code, taskName: task.name, reportedToday };
      }));
      return { role, label: roleMap[role].label, tasks };
    }));
    return { projectId: project.id, projectName: `${project.code} · ${project.name}`, myRoles: roles, groups };
  }));

  return NextResponse.json({ projects });
}
