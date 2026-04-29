import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { canReport, getTodayDateVn } from "@/lib/task-centric";
import { getTaskProject, upsertMaterialReport } from "@/lib/task-report-service";
import { prisma } from "@/lib/prisma";
export async function GET(_: Request, { params }: { params: { id: string } }) { const user = await getCurrentUser(); if (!user?.id || !user.role) return NextResponse.json({ message: "Unauthorized" }, { status: 401 }); const task = await getTaskProject(params.id); if (!task) return NextResponse.json({ message: "Task not found" }, { status: 404 }); if (!(await canReport(user.id, user.role as any, task.projectId, "material"))) return NextResponse.json({ message: "Forbidden" }, { status: 403 }); const today = getTodayDateVn(); let report = await prisma.taskMaterialReport.findUnique({ where: { taskId_reportDate: { taskId: params.id, reportDate: today } } }); if (!report) report = await upsertMaterialReport(params.id, user.id, {}, today); return NextResponse.json({ report }); }
