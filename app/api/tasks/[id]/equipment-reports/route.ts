import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { canReport } from "@/lib/task-centric";
import { prisma } from "@/lib/prisma";
import { getTaskProject, upsertEquipmentReport } from "@/lib/task-report-service";
import { logProjectActivity } from "@/lib/project-activity-log";
export async function GET(_: Request, { params }: { params: { id: string } }) { const reports = await prisma.taskEquipmentReport.findMany({ where: { taskId: params.id }, orderBy: { reportDate: "desc" } }); return NextResponse.json({ reports }); }
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user?.id || !user.role) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    const task = await getTaskProject(params.id);
    if (!task) return NextResponse.json({ message: "Task not found" }, { status: 404 });
    if (!(await canReport(user.id, user.role as any, task.projectId, "equipment"))) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    const report = await upsertEquipmentReport(params.id, user.id, await req.json());
    const meta = await prisma.task.findUnique({ where: { id: params.id }, select: { code: true, name: true } });
    await logProjectActivity(prisma, {
      projectId: task.projectId,
      actorId: user.id,
      entity: "task_equipment_report",
      entityId: report.id,
      action: "upsert",
      summary: `Cập nhật báo cáo thiết bị task ${meta?.code} "${meta?.name}"`,
      metadata: { taskId: params.id, reportDate: report.reportDate, equipmentName: (report as any).equipmentName ?? null, hours: (report as any).hours ?? null },
    });
    return NextResponse.json({ report });
  } catch (e: any) {
    return NextResponse.json({ message: e.message || "Failed" }, { status: 500 });
  }
}
