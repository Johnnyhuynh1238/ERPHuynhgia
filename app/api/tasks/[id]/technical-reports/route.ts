import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { canReport } from "@/lib/task-centric";
import { prisma } from "@/lib/prisma";
import { getTaskProject, upsertTechnicalReport } from "@/lib/task-report-service";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const rows = await prisma.taskTechnicalReport.findMany({ where: { taskId: params.id }, orderBy: { reportDate: "desc" } });
  return NextResponse.json({ reports: rows });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user?.id || !user.role) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    const task = await getTaskProject(params.id);
    if (!task) return NextResponse.json({ message: "Task not found" }, { status: 404 });
    if (!(await canReport(user.id, user.role as any, task.projectId, "technical"))) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    const report = await upsertTechnicalReport(params.id, user.id, await req.json());
    return NextResponse.json({ report });
  } catch (e: any) {
    return NextResponse.json({ message: e.message || "Failed" }, { status: 500 });
  }
}
