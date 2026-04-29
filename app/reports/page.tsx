import Link from "next/link";
import { redirect } from "next/navigation";
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

export default async function ReportsPage() {
  const user = await getCurrentUser();
  if (!user?.id) redirect("/login");
  if (user.role === "foreman") redirect("/");

  const today = getTodayDateVn();
  const assignments = await prisma.projectMemberAssignment.findMany({
    where: { userId: user.id },
    include: { project: { select: { id: true, code: true, name: true, tasks: { where: { isActive: true }, orderBy: { displayOrder: "asc" }, select: { id: true, code: true, name: true } } } } },
  });

  const grouped = assignments.reduce<Record<string, { projectId: string; projectName: string; projectCode: string; roles: ProjectRoleType[]; tasks: { id: string; code: string; name: string }[] }>>((acc, row) => {
    const key = row.projectId;
    if (!acc[key]) acc[key] = { projectId: row.projectId, projectName: row.project.name, projectCode: row.project.code, roles: [], tasks: row.project.tasks };
    acc[key].roles.push(row.role);
    return acc;
  }, {});

  const projects = await Promise.all(Object.values(grouped).map(async (p) => {
    const rows = await Promise.all(p.roles.map(async (role) => {
      const type = roleMap[role].type;
      const tasks = await Promise.all(p.tasks.map(async (task) => {
        const where = { taskId_reportDate: { taskId: task.id, reportDate: today } } as any;
        const reportedToday = type === "technical"
          ? !!(await prisma.taskTechnicalReport.findUnique({ where }))
          : type === "material"
            ? !!(await prisma.taskMaterialReport.findUnique({ where }))
            : type === "labor"
              ? !!(await prisma.taskLaborReport.findUnique({ where }))
              : !!(await prisma.taskEquipmentReport.findUnique({ where }));
        return { ...task, reportedToday, type };
      }));
      return { role, roleLabel: roleMap[role].label, type, tasks };
    }));
    return { ...p, rows };
  }));

  return (
    <main className="mx-auto max-w-5xl space-y-4 px-4 py-4">
      <h1 className="text-lg font-semibold">Báo cáo theo task</h1>
      <div className="text-sm text-muted-foreground">{today.toISOString().slice(0, 10)}</div>

      {projects.map((project) => (
        <section key={project.projectId} className="rounded-xl border p-3 space-y-3">
          <div className="font-semibold">{project.projectCode} · {project.projectName}</div>
          {project.rows.map((group) => (
            <div key={`${project.projectId}-${group.role}`} className="rounded-lg border bg-muted/20 p-2">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <span>{group.roleLabel}</span>
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs">{group.type}</span>
              </div>
              <div className="space-y-1">
                {group.tasks.map((task) => (
                  <div key={`${group.role}-${task.id}`} className="flex items-center justify-between rounded-md border px-2 py-1 text-sm">
                    <div>{task.code} - {task.name}</div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${task.reportedToday ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{task.reportedToday ? "Đã nộp" : "Chưa nộp"}</span>
                      <Link className="text-orange-600" href={`/tasks/${task.id}?tab=reports&subTab=${group.type}`}>{task.reportedToday ? "Xem" : "Nộp"}</Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}

      <Link className="inline-flex rounded-md border px-3 py-2 text-sm" href="/reports/checkin">Check-in sáng</Link>
    </main>
  );
}
